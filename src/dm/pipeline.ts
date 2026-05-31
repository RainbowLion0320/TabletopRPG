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

import type { ApiConfig } from '../types/game';
import type { PlayerAction } from '../services/aiDm';
import { buildDmContext } from './contextBuilder';
import { getActiveKnowledgeBase } from './knowledgeBase';
import { callNarrator } from './narrator';
import { validateToolCalls } from './director';
import { resolveDmTurn } from './stateResolver';
import { maybeConsolidateMemory } from './summarizer';
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
      relevantSkills: [] // 后续可由 intent classifier 推断
    },
    { summary: effectiveSummary }
  );

  const history = effectiveHistory
    .slice(-RECENT_TURN_WINDOW_PAIRS * 2)
    .map((turn) => ({ role: turn.role, content: turn.content }));

  // 3) 调主 LLM
  const narrator = await callNarrator(config, {
    ctx,
    actions: input.actions,
    mode: input.state.exploreMode,
    history
  });

  // 4) 出口护栏：逐个语义校验工具调用
  const directorResult = validateToolCalls(narrator.toolCalls, { state: input.state, kb });

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
    turn: ctx.dynamic.workingMemory.turnCount + 1
  });

  return {
    raw: narrator.raw,
    legacyResponse: resolved.legacyResponse,
    events: resolved.events,
    memoryUpdate
  };
}
