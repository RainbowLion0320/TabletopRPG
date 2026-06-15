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

import type { ApiConfig, GameState, NpcMindModel, ProspectiveIntent, SceneId } from '../types/game';
import { AiResponseFormatError, type PlayerAction } from '../services/aiDm';
import { buildDmContext } from './contextBuilder';
import {
  computeRevealedSecretIds,
  deriveRevealContext,
  getActiveKnowledgeBase,
  getItemSnapshot,
  getNpcSnapshot,
  getSceneSnapshot
} from './knowledgeBase';
import { callNarrator, NarratorError } from './narrator';
import { allowedTools, validateToolCalls } from './director';
import { resolveDmTurn } from './stateResolver';
import { maybeConsolidateMemory, SUMMARIZE_TRIGGER_PAIRS } from './summarizer';
import { classifyIntent } from './intentClassifier';
import { synthesizeCaseBoardPatch } from './caseBoardSynthesizer';
import { extractFactsFromTurn } from './memory/factExtractor';
import { synthesizeSystem2 } from './memory/system2Synthesizer';
import {
  buildEpisodicMemoryQuery,
  buildEpisodicMemoryRecord,
  searchEpisodicMemory,
  shouldRetrieveEpisodicMemory
} from './memory/episodicMemory';
import { pushTrace } from './debugTrace';
import { DEFAULT_MEMORY_OPTIONS } from './types';
import type { DmTurnInput, DmTurnOutput } from './types';

const RECENT_TURN_WINDOW_PAIRS = 8; // 8 对 user/assistant = 16 条消息

function pickSpotlightPlayer(actions: PlayerAction[]): string | null {
  if (actions.length === 1) return actions[0].player;
  return null;
}

function getCompletedTurnCount(state: GameState): number {
  return state.conversationHistory.filter((turn) => turn.role === 'user').length;
}

function getCurrentTurn(state: GameState): number {
  return getCompletedTurnCount(state) + 1;
}

function getUnsummarizedPairCount(state: GameState): number {
  const summarizedUntil = state.summarizedUntilIndex ?? 0;
  const unsummarizedLen = Math.max(0, state.conversationHistory.length - summarizedUntil);
  return Math.floor(unsummarizedLen / 2);
}

function shouldRunSystem2(state: GameState): boolean {
  if (!DEFAULT_MEMORY_OPTIONS.enableSystem2) return false;
  return getUnsummarizedPairCount(state) >= SUMMARIZE_TRIGGER_PAIRS;
}

function collectRecentNpcCandidates(
  state: GameState,
  kb: ReturnType<typeof getActiveKnowledgeBase>
): string[] {
  const out = new Set<string>();
  const add = (name: string | null | undefined) => {
    if (name && kb.npcs[name]) out.add(name);
  };

  add(state.activeNpcName);
  kb.scenes[state.currentScene]?.public.npcs.forEach(add);
  for (const fact of (state.atomicFacts ?? []).slice(-60)) {
    add(fact.actor);
    add(fact.target);
  }
  for (const npcId of Object.keys(state.npcMindModels ?? {})) add(npcId);
  return Array.from(out).slice(0, 12);
}

function collectRetrievalEntityIds(
  state: GameState,
  kb: ReturnType<typeof getActiveKnowledgeBase>
): string[] {
  const out = new Set<string>();
  if (state.activeNpcName) out.add(state.activeNpcName);
  kb.scenes[state.currentScene]?.public.npcs.forEach((name) => out.add(name));
  return Array.from(out);
}

export async function runDmTurn(
  config: ApiConfig,
  input: DmTurnInput
): Promise<DmTurnOutput> {
  const kb = getActiveKnowledgeBase();
  const currentTurn = getCurrentTurn(input.state);

  // 0) 意图分类（规则版）
  const intent = classifyIntent(input.actions);
  const retrievedMemories = DEFAULT_MEMORY_OPTIONS.enableEpisodicRetrieval
    && shouldRetrieveEpisodicMemory(intent.intentKind, input.actions)
    ? searchEpisodicMemory(input.state.episodicMemory ?? [], {
        query: buildEpisodicMemoryQuery(input.actions),
        sceneId: input.state.currentScene,
        entityIds: collectRetrievalEntityIds(input.state, kb),
        playerNames: input.actions.map((a) => a.player),
        maxTurnExclusive: currentTurn + 1,
        limit: DEFAULT_MEMORY_OPTIONS.episodicRetrievalLimit,
        includeDmOnly: true
      })
    : [];

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

  // 1b) System2 异步合成：与 summarizer 同频触发，串行调用
  let s2MindUpdates: Array<{ npcId: string; partial: Partial<NpcMindModel> }> | undefined;
  let s2Intents: ProspectiveIntent[] | undefined;
  let s2Triggered = false;
  let s2Error: string | undefined;
  if (shouldRunSystem2(input.state)) {
    s2Triggered = true;
    try {
      const result = await synthesizeSystem2(config, {
        turn: currentTurn,
        recentFacts: (input.state.atomicFacts ?? []).slice(-60),
        existingMindModels: input.state.npcMindModels ?? {},
        npcCandidates: collectRecentNpcCandidates(input.state, kb),
        playerNames: input.state.players.map((p) => p.name),
        summary: effectiveSummary,
        defaultIntentTtl: DEFAULT_MEMORY_OPTIONS.defaultIntentTtl
      });
      if (result.mindModelUpdates.length) {
        s2MindUpdates = result.mindModelUpdates.map((u) => ({
          npcId: u.npcId,
          partial: {
            coreMotivation: u.coreMotivation,
            currentStance: u.currentStance,
            ...(u.playerExceptions ? { playerExceptions: u.playerExceptions } : {}),
            lastUpdatedTurn: currentTurn
          }
        }));
      }
      if (result.prospectiveIntents.length) s2Intents = result.prospectiveIntents;
    } catch (err) {
      s2Error = err instanceof Error ? err.message : String(err);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[pipeline] system2 synthesis failed (keeping old mind models):', s2Error);
      }
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
    { summary: effectiveSummary, retrievedMemories }
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

  let narrator: Awaited<ReturnType<typeof callNarrator>>;
  try {
    narrator = await callNarrator(config, {
      ctx,
      actions: input.actions,
      mode: input.state.exploreMode,
      history,
      allowedToolNames: allowed,
      lookupResolver
    });
  } catch (err) {
    if (err instanceof NarratorError) {
      throw new AiResponseFormatError(err.message);
    }
    throw err;
  }

  // 4) 出口护栏：逐个语义校验工具调用，同时检查是否越出 allowed 集
  const directorResult = validateToolCalls(narrator.toolCalls, directorCtx, allowed);

  if (import.meta.env.DEV && directorResult.rejected.length) {
    // eslint-disable-next-line no-console
    console.warn(
      '[pipeline] director rejected function calls:',
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

  // 5b) System1 同步事实抽取：主叙事完成后记录本轮新增/变化事实。
  let factsToAppend: DmTurnOutput['factsToAppend'];
  if (DEFAULT_MEMORY_OPTIONS.enableSystem1) {
    const extracted = await extractFactsFromTurn(config, {
      turn: ctx.dynamic.workingMemory.turnCount + 1,
      narrative: resolved.legacyResponse.narrative ?? narrator.narrative,
      playerActions: input.actions.map((a) => ({ player: a.player, action: a.action })),
      inScopeNpcs: ctx.dynamic.workingMemory.inScopeNpcIds,
      playerNames: input.state.players.map((p) => p.name),
      existingFacts: input.state.atomicFacts ?? []
    });
    if (extracted.length) factsToAppend = extracted;
  }

  const caseBoardPatch = await synthesizeCaseBoardPatch(config, {
    turn: currentTurn,
    narrative: resolved.legacyResponse.narrative ?? narrator.narrative,
    playerActions: input.actions.map((a) => ({ player: a.player, action: a.action })),
    facts: [...(input.state.atomicFacts ?? []), ...(factsToAppend ?? [])],
    events: [...(input.state.eventLog ?? []), ...(resolved.events ?? [])],
    clues: input.state.clues,
    existingBoard: input.state.caseBoard ?? { nodes: [], edges: [], lastUpdatedTurn: 0 }
  });

  const mindUpdates = [
    ...(s2MindUpdates ?? []),
    ...(resolved.mindUpdates ?? [])
  ];

  const episode = buildEpisodicMemoryRecord({
    turn: ctx.dynamic.workingMemory.turnCount + 1,
    sceneId: input.state.currentScene,
    actions: input.actions,
    narrative: resolved.legacyResponse.narrative ?? narrator.narrative,
    events: resolved.events ?? [],
    facts: factsToAppend ?? [],
    activeNpcName: resolved.legacyResponse.activeNpc ?? narrator.activeNpc ?? input.state.activeNpcName
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
        : undefined,
      s1ExtractedFacts: factsToAppend,
      caseBoardPatch,
      s2Synthesized: {
        triggered: s2Triggered,
        ...(s2Error ? { error: s2Error } : {}),
        ...(s2MindUpdates ? { mindUpdates: s2MindUpdates } : {}),
        ...(s2Intents ? { intents: s2Intents } : {})
      }
    });
  }

  return {
    raw: narrator.raw,
    legacyResponse: resolved.legacyResponse,
    events: resolved.events,
    memoryUpdate,
    factsToAppend,
    caseBoardPatch,
    mindUpdates: mindUpdates.length ? mindUpdates : undefined,
    prospectiveIntentsToAdd: s2Intents,
    episodicMemoriesToAdd: episode ? [episode] : undefined,
    decayIntents: true
  };
}
