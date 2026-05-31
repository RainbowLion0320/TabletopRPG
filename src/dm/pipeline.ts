/**
 * DM 引擎管线编排器（v2 唯一路径）。
 *
 * 流水线：
 *   maybeConsolidateMemory → ContextBuilder → Narrator(function calling)
 *   → Director（语义校验）→ StateResolver → DmTurnOutput
 *
 * 特点：
 * - 状态权威方在前端：AI 只能 propose_*，Director 校验后 StateResolver 落地。
 * - 长期记忆走总结流，不引入向量库；超窗口的旧轮自动压缩。
 * - 工具不可用时由 Narrator 自动降级到带 schema 的 json_object 响应。
 */

import type { ApiConfig, SceneId } from '../types/game';
import type { PlayerAction } from '../services/aiDm';
import { buildDmContext } from './contextBuilder';
import {
  computeRevealedSecretIds,
  deriveRevealContext,
  getActiveKnowledgeBase,
  getItemSnapshot,
  getNpcSnapshot,
  getSceneSnapshot
} from './knowledgeBase';
import { callNarrator } from './narrator';
import { allowedTools, validateToolCalls } from './director';
import { resolveDmTurn } from './stateResolver';
import { maybeConsolidateMemory } from './summarizer';
import { classifyIntent } from './intentClassifier';
import { pushTrace } from './debugTrace';
import type { DmTurnInput, DmTurnOutput } from './types';

const RECENT_TURN_WINDOW_PAIRS = 8; // 8 对 user/assistant = 16 条消息

function pickSpotlightPlayer(actions: PlayerAction[]): string | null {
  if (actions.length === 1) return actions[0].player;
  return null;
}

export async function runDmTurn(
  config: ApiConfig,
  input: DmTurnInput
): Promise<DmTurnOutput> {
  const kb = getActiveKnowledgeBase();

  // 0) 意图分类（规则版）
  const intent = classifyIntent(input.actions);

  // 1) 入口检查：是否需要合并旧轮为总结
  let memoryUpdate: DmTurnOutput['memoryUpdate'];
  let effectiveSummary = input.state.longTermMemorySummary ?? '';
  let effectiveHistory = input.state.conversationHistory;
  try {
    const consolidation = await maybeConsolidateMemory(config, input.state);
    if (consolidation) {
      memoryUpdate = consolidation;
      effectiveSummary = consolidation.summary;
      effectiveHistory = consolidation.remainingHistory;
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[pipeline] memory consolidation failed (continuing without):',
        err instanceof Error ? err.message : err
      );
    }
  }

  // 2) 拼装本轮上下文（已脱敏，仅含已解锁内幕）
  const ctx = buildDmContext(
    input.state,
    kb,
    {
      mode: input.state.exploreMode,
      checkPlayer: pickSpotlightPlayer(input.actions),
      relevantSkills: intent.relevantSkills
    },
    { summary: effectiveSummary }
  );

  const history = effectiveHistory
    .slice(-RECENT_TURN_WINDOW_PAIRS * 2)
    .map((turn) => ({ role: turn.role, content: turn.content }));

  // 3) 计算本轮允许工具集 + lookup 解析器，调主 LLM
  const directorCtx = { state: input.state, kb };
  const allowed = allowedTools(directorCtx, { intent, mode: input.state.exploreMode });
  const revealCtx = deriveRevealContext(input.state);
  const revealedSet = computeRevealedSecretIds(kb, revealCtx);

  const lookupResolver = (kind: string, id: string): string => {
    if (kind === 'scene') {
      const snap = getSceneSnapshot(kb, id as SceneId, revealedSet);
      if (!snap) return '';
      const lines = [
        `场景 ${snap.public.id} 「${snap.public.name}」`,
        `公开描述：${snap.public.desc}`,
        `常驻 NPC：${snap.public.npcs.join('、') || '（无）'}`,
        `可调查物品 id：${snap.public.items.join('、') || '（无）'}`
      ];
      if (snap.knownSecrets.length) {
        lines.push('已解锁 KP 内幕：');
        snap.knownSecrets.forEach((s) => lines.push(`  · ${s}`));
      }
      return lines.join('\n');
    }
    if (kind === 'npc') {
      const snap = getNpcSnapshot(kb, id, revealedSet);
      if (!snap) return '';
      const lines = [
        `${snap.public.name}（${snap.public.role}，态度：${snap.public.attitude}，HP：${snap.public.hp}）`,
        `外观：${snap.public.appearance}`
      ];
      if (snap.knownSecrets.length) {
        lines.push('已知内幕：');
        snap.knownSecrets.forEach((s) => lines.push(`  · ${s}`));
      }
      return lines.join('\n');
    }
    if (kind === 'item') {
      const snap = getItemSnapshot(kb, id, revealedSet);
      if (!snap) return '';
      const lines = [
        `${snap.public.id} 「${snap.public.name}」`,
        `所在场景：${snap.public.scene}`,
        `外观：${snap.public.appearance}`
      ];
      if (snap.knownSecrets.length) {
        lines.push('已知内幕：');
        snap.knownSecrets.forEach((s) => lines.push(`  · ${s}`));
      }
      return lines.join('\n');
    }
    return '';
  };

  const narrator = await callNarrator(config, {
    ctx,
    actions: input.actions,
    mode: input.state.exploreMode,
    history,
    allowedToolNames: allowed,
    lookupResolver
  });

  // 4) 出口护栏：逐个语义校验工具调用，同时检查是否越出 allowed 集
  const directorResult = validateToolCalls(narrator.toolCalls, directorCtx, allowed);

  if (import.meta.env.DEV && directorResult.rejected.length) {
    // eslint-disable-next-line no-console
    console.warn(
      '[pipeline] director rejected tool_calls:',
      directorResult.rejected.map((r) => `${r.call.name}: ${r.reason}`)
    );
  }

  // 5) 翻译为 reducer 可消费的 AiResponse + 事件序列
  const resolved = resolveDmTurn({
    narrator,
    acceptedCalls: directorResult.accepted,
    turn: ctx.dynamic.workingMemory.turnCount + 1,
    pendingBefore: input.state.pendingConsequences ?? []
  });

  // 6) DEV 追踪：让右下角 DmDebugDrawer 看到这一轮经过的所有阶段
  if (import.meta.env.DEV) {
    pushTrace({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      turn: ctx.dynamic.workingMemory.turnCount + 1,
      actions: input.actions.map((a) => ({ player: a.player, action: a.action, scene: a.scene })),
      ctx,
      narratorRaw: narrator.raw,
      usedFunctionCalling: narrator.usedFunctionCalling,
      toolCalls: narrator.toolCalls,
      acceptedCalls: directorResult.accepted,
      rejectedCalls: directorResult.rejected,
      memoryUpdate: memoryUpdate
        ? { summary: memoryUpdate.summary, summarizedUntilIndex: memoryUpdate.summarizedUntilIndex }
        : undefined
    });
  }

  return {
    raw: narrator.raw,
    legacyResponse: resolved.legacyResponse,
    events: resolved.events,
    memoryUpdate
  };
}
