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

import type { ApiConfig, GameState, ProspectiveIntent, SceneId } from '../types/game';
import { AiResponseFormatError, type PlayerAction } from '../services/aiDm';
import { countCompletedGameTurns, getDmRequestTurn } from '../services/turns';
import { storyData } from '../data/storyData';
import { caseBoard as caseBoardDefinition } from '../data/scenarios/wuzhongxiaoshi';
import {
  getAvailableStoryEvents,
  getAvailableSceneExits,
  getActiveScenarioBeat,
  getScenarioProgressForState,
  getVisibleScenarioObjectives,
  npcIdFromName,
  processScenarioTurn
} from '../scenario/engine';
import { buildDmContext } from './contextBuilder';
import {
  computeRevealedSecretIds,
  deriveRevealContext,
  getActiveKnowledgeBase,
  getItemSnapshot,
  getNpcSnapshot,
  getSceneSnapshot
} from './knowledgeBase';
import { callNarrator, NarratorError, NarratorSemanticError } from './narrator';
import { allowedTools, validateToolCalls } from './director';
import { resolveDmTurn } from './stateResolver';
import { maybeConsolidateMemory, SUMMARIZE_TRIGGER_PAIRS } from './summarizer';
import { classifyIntent } from './intentClassifier';
import { synthesizeCaseBoardPatch } from './caseBoardSynthesizer';
import { getVisibleCaseBoard } from './caseBoard';
import { buildFactCaseBoardPatch, mergeCaseBoardPatches } from './caseBoardModel';
import { extractFactsFromTurn } from './memory/factExtractor';
import { synthesizeSystem2 } from './memory/system2Synthesizer';
import {
  buildEpisodicMemoryQuery,
  buildEpisodicMemoryRecord,
  searchEpisodicMemory,
  shouldRetrieveEpisodicMemory
} from './memory/episodicMemory';
import { pushTrace, updateTrace } from './debugTrace';
import {
  buildRequiredCheck,
  buildPostMoveContinuationActions,
  inferStoryEventsFromActions,
  inferNarrativeConsequences,
  inferSceneChangeFromActions,
  sanitizePlayerChoices,
  validateNarratorSemantics
} from './turnGuards';
import { DEFAULT_MEMORY_OPTIONS } from './types';
import { defaultActiveNpcForScene, resolveActiveNpcForScene } from '../state/sceneFocus';
import type {
  DmBackgroundUpdate,
  DmMemoryUpdate,
  DmMindUpdate,
  DmTurnInput,
  DmTurnOutput,
  DmTurnTiming
} from './types';

const RECENT_TURN_WINDOW_PAIRS = 8; // 8 对 user/assistant = 16 条消息

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function elapsedMs(start: number): number {
  return Math.round(nowMs() - start);
}

function devWarn(message: string, err: unknown): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(message, err instanceof Error ? err.message : err);
  }
}

function pickSpotlightPlayer(actions: PlayerAction[]): string | null {
  if (actions.length === 1) return actions[0].player;
  return null;
}

function buildSemanticFallbackChoices(
  state: GameState,
  kb: ReturnType<typeof getActiveKnowledgeBase>,
  sceneId: SceneId,
  activeNpcName: string | null,
  progress = getScenarioProgressForState(state)
): Record<string, string[]> {
  const exits = getAvailableSceneExits(progress, sceneId);
  const destinations = exits.flatMap((exit) => {
    const scene = kb.scenes[exit.sceneId]?.public;
    return scene ? [`前往${scene.name}继续调查`] : [];
  });
  const activeBeat = getActiveScenarioBeat(progress, sceneId);
  const authoredActions = getVisibleScenarioObjectives(progress)
    .filter((objective) =>
      progress.objectiveStates[objective.id] === 'active'
      && objective.beatId === activeBeat?.id
    )
    .map((objective) => objective.playerText);
  const localAction = activeNpcName
    ? `请${activeNpcName}只核对已经确认的事实`
    : '继续观察当前环境';
  return Object.fromEntries(state.players.map((player, index) => {
    const orderedDestinations = destinations.length
      ? [...destinations.slice(index), ...destinations.slice(0, index)]
      : [];
    return [player.name, [
      ...authoredActions,
      localAction,
      ...(authoredActions.length ? [] : orderedDestinations),
      '整理已经发现的线索，决定下一步行动'
    ].filter((choice, choiceIndex, all) => all.indexOf(choice) === choiceIndex).slice(0, 3)];
  }));
}

function getCompletedTurnCount(state: GameState): number {
  return countCompletedGameTurns(state.conversationHistory);
}

function getCurrentTurn(state: GameState): number {
  return getDmRequestTurn(state.conversationHistory);
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

type DmContextForTurn = ReturnType<typeof buildDmContext>;
type NarratorTurnResult = Awaited<ReturnType<typeof callNarrator>>;
type ResolvedDmTurn = ReturnType<typeof resolveDmTurn>;

interface BackgroundUpdateParams {
  config: ApiConfig;
  input: DmTurnInput;
  kb: ReturnType<typeof getActiveKnowledgeBase>;
  currentTurn: number;
  ctx: DmContextForTurn;
  narrator: NarratorTurnResult;
  resolved: ResolvedDmTurn;
  traceId?: string;
  foregroundTimings: DmTurnTiming;
}

async function runDmBackgroundUpdate(params: BackgroundUpdateParams): Promise<DmBackgroundUpdate> {
  const backgroundStart = nowMs();
  const timings: DmTurnTiming = {};
  const {
    config,
    input,
    kb,
    currentTurn,
    ctx,
    narrator,
    resolved,
    traceId,
    foregroundTimings
  } = params;
  const turn = ctx.dynamic.workingMemory.turnCount + 1;
  const narrative = resolved.legacyResponse.narrative ?? narrator.narrative;

  const memoryPromise = (async (): Promise<DmMemoryUpdate | undefined> => {
    const start = nowMs();
    try {
      const consolidation = await maybeConsolidateMemory(config, input.state, {
        signal: input.signal
      });
      return consolidation ?? undefined;
    } catch (err) {
      devWarn('[pipeline] memory consolidation failed (background):', err);
      return undefined;
    } finally {
      timings.summary = elapsedMs(start);
    }
  })();

  const s2Triggered = shouldRunSystem2(input.state);
  const system2Promise = (async (): Promise<{
    mindUpdates?: DmMindUpdate[];
    intents?: ProspectiveIntent[];
    error?: string;
  }> => {
    if (!s2Triggered) {
      timings.system2 = 0;
      return {};
    }

    const start = nowMs();
    try {
      const result = await synthesizeSystem2(config, {
        turn: currentTurn,
        recentFacts: (input.state.atomicFacts ?? []).slice(-60),
        existingMindModels: input.state.npcMindModels ?? {},
        npcCandidates: collectRecentNpcCandidates(input.state, kb),
        playerNames: input.state.players.map((p) => p.name),
        summary: input.state.longTermMemorySummary ?? '',
        defaultIntentTtl: DEFAULT_MEMORY_OPTIONS.defaultIntentTtl,
        signal: input.signal
      });
      const mindUpdates = result.mindModelUpdates.map((u) => ({
        npcId: u.npcId,
        partial: {
          coreMotivation: u.coreMotivation,
          currentStance: u.currentStance,
          ...(u.playerExceptions ? { playerExceptions: u.playerExceptions } : {}),
          lastUpdatedTurn: currentTurn
        }
      }));
      return {
        ...(mindUpdates.length ? { mindUpdates } : {}),
        ...(result.prospectiveIntents.length ? { intents: result.prospectiveIntents } : {})
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      devWarn('[pipeline] system2 synthesis failed (background):', error);
      return { error };
    } finally {
      timings.system2 = elapsedMs(start);
    }
  })();

  const narrativeMemoryPromise = (async (): Promise<{
    factsToAppend?: DmBackgroundUpdate['factsToAppend'];
    caseBoardPatch?: DmBackgroundUpdate['caseBoardPatch'];
    episodicMemoriesToAdd?: DmBackgroundUpdate['episodicMemoriesToAdd'];
  }> => {
    let factsToAppend: DmBackgroundUpdate['factsToAppend'];
    const factsStart = nowMs();
    try {
      if (DEFAULT_MEMORY_OPTIONS.enableSystem1) {
        const extracted = await extractFactsFromTurn(config, {
          turn,
          narrative,
          playerActions: input.actions.map((a) => ({ player: a.player, action: a.action })),
          inScopeNpcs: ctx.dynamic.workingMemory.inScopeNpcIds,
          playerNames: input.state.players.map((p) => p.name),
          existingFacts: input.state.atomicFacts ?? [],
          signal: input.signal
        });
        if (extracted.length) factsToAppend = extracted;
      }
    } finally {
      timings.facts = elapsedMs(factsStart);
    }

    const caseBoardStart = nowMs();
    const newClueIds = resolved.legacyResponse.stateUpdate?.newItems ?? [];
    const clueById = new Map(input.state.clues.map((clue) => [clue.id, clue]));
    for (const clueId of newClueIds) {
      const clue = storyData.items[clueId];
      if (clue) clueById.set(clue.id, { ...clue, found: true });
    }
    const projectedScene = resolved.legacyResponse.stateUpdate?.sceneChange ?? input.state.currentScene;
    const projectedActiveNpc = resolveActiveNpcForScene({
      previousScene: input.state.currentScene,
      nextScene: projectedScene,
      previousActiveNpc: input.state.activeNpcName,
      requestedActiveNpc: resolved.legacyResponse.activeNpc,
      requestedActiveNpcProvided: Object.prototype.hasOwnProperty.call(resolved.legacyResponse, 'activeNpc')
    });
    const projectedState: GameState = {
      ...input.state,
      currentScene: projectedScene,
      activeNpcId: npcIdFromName(projectedActiveNpc),
      activeNpcName: projectedActiveNpc,
      clues: Array.from(clueById.values()),
      atomicFacts: [...(input.state.atomicFacts ?? []), ...(factsToAppend ?? [])],
      eventLog: [...(input.state.eventLog ?? []), ...(resolved.events ?? [])]
    };
    const visibleBoard = getVisibleCaseBoard(caseBoardDefinition, projectedState);
    const visibleNodes = [
      ...visibleBoard.nodes.map((node) => ({ id: node.id, type: node.type, title: node.title })),
      ...(projectedState.caseBoard?.nodes ?? [])
        .filter((node) => node.status === 'active')
        .map((node) => ({ id: node.id, type: node.type, title: node.title }))
    ];
    const currentSceneNodeId = visibleBoard.nodes.find((node) =>
      node.type === 'scene' && node.refId === projectedState.currentScene
    )?.id ?? '';
    const aiCaseBoardPatch = await synthesizeCaseBoardPatch(config, {
      turn: currentTurn,
      narrative,
      playerActions: input.actions.map((a) => ({ player: a.player, action: a.action })),
      facts: projectedState.atomicFacts ?? [],
      newFacts: factsToAppend ?? [],
      events: projectedState.eventLog ?? [],
      clues: projectedState.clues,
      newClueIds,
      existingBoard: projectedState.caseBoard ?? { nodes: [], edges: [], insights: [], lastUpdatedTurn: 0 },
      visibleNodes,
      currentSceneNodeId,
      signal: input.signal
    });
    const caseBoardPatch = mergeCaseBoardPatches(
      buildFactCaseBoardPatch(projectedState, factsToAppend ?? []),
      aiCaseBoardPatch
    );
    timings.caseBoard = elapsedMs(caseBoardStart);

    const episode = buildEpisodicMemoryRecord({
      turn,
      sceneId: projectedScene,
      actions: input.actions,
      narrative,
      events: resolved.events ?? [],
      facts: factsToAppend ?? [],
      activeNpcName: projectedActiveNpc
    });

    return {
      factsToAppend,
      caseBoardPatch,
      episodicMemoriesToAdd: episode ? [episode] : undefined
    };
  })();

  try {
    const [memoryUpdate, system2, narrativeMemory] = await Promise.all([
      memoryPromise,
      system2Promise,
      narrativeMemoryPromise
    ]);
    const mindUpdates = [
      ...(system2.mindUpdates ?? []),
      ...(resolved.mindUpdates ?? [])
    ];
    timings.totalBackground = elapsedMs(backgroundStart);
    const result: DmBackgroundUpdate = {
      memoryUpdate,
      factsToAppend: narrativeMemory.factsToAppend,
      caseBoardPatch: narrativeMemory.caseBoardPatch,
      mindUpdates: mindUpdates.length ? mindUpdates : undefined,
      prospectiveIntentsToAdd: system2.intents,
      episodicMemoriesToAdd: narrativeMemory.episodicMemoriesToAdd,
      timings
    };

    if (import.meta.env.DEV && traceId) {
      updateTrace(traceId, {
        memoryUpdate: memoryUpdate
          ? { summary: memoryUpdate.summary, summarizedUntilIndex: memoryUpdate.summarizedUntilIndex }
          : undefined,
        s1ExtractedFacts: narrativeMemory.factsToAppend,
        caseBoardPatch: narrativeMemory.caseBoardPatch,
        s2Synthesized: {
          triggered: s2Triggered,
          ...(system2.error ? { error: system2.error } : {}),
          ...(system2.mindUpdates ? { mindUpdates: system2.mindUpdates } : {}),
          ...(system2.intents ? { intents: system2.intents } : {})
        },
        timings: { ...foregroundTimings, ...timings }
      });
    }

    return result;
  } catch (err) {
    devWarn('[pipeline] background update failed:', err);
    timings.totalBackground = elapsedMs(backgroundStart);
    if (import.meta.env.DEV && traceId) {
      updateTrace(traceId, { timings: { ...foregroundTimings, ...timings } });
    }
    return { timings };
  }
}

export async function runDmTurn(
  config: ApiConfig,
  input: DmTurnInput
): Promise<DmTurnOutput> {
  const foregroundStart = nowMs();
  const timings: DmTurnTiming = {};
  const kb = getActiveKnowledgeBase();
  const currentTurn = getCurrentTurn(input.state);

  // 0) 意图分类（规则版）
  const intent = classifyIntent(input.actions);
  const directorCtx = { state: input.state, kb };
  const allowed = allowedTools(directorCtx, { intent, mode: input.state.exploreMode });
  const inferredSceneCall = allowed.includes('propose_scene_change')
    ? inferSceneChangeFromActions(input.actions, input.state, kb)
    : null;
  const inferredStoryCalls = inferStoryEventsFromActions(input.actions, input.state, kb);
  const requiredCheck = buildRequiredCheck(input.actions, input.state);
  if (requiredCheck) {
    const targetSceneId = inferredSceneCall
      ? String(inferredSceneCall.arguments.targetSceneId) as SceneId
      : null;
    const movementPrefix = targetSceneId
      ? `你们已抵达${kb.scenes[targetSceneId].public.name}。`
      : '';
    const narrative = `${movementPrefix}${requiredCheck.player}接下来的行动存在明确失败风险，需要先进行${requiredCheck.skill}检定。`;
    const activeNpc = targetSceneId ? null : input.state.activeNpcName;
    const narrator = {
      raw: JSON.stringify({
        narrative,
        activeNpc,
        nextPrompt: '请掷骰结算检定。',
        playerChoices: {},
        keywords: []
      }),
      narrative,
      activeNpc,
      nextPrompt: '请掷骰结算检定。',
      playerChoices: {},
      keywords: [],
      toolCalls: [],
      usedFunctionCalling: false
    };
    const resolved = resolveDmTurn({
      narrator,
      acceptedCalls: [
        ...(inferredSceneCall ? [inferredSceneCall] : []),
        { name: 'request_check', arguments: { ...requiredCheck } }
      ],
      turn: currentTurn,
      pendingBefore: input.state.pendingConsequences ?? []
    });
    resolved.legacyResponse.check = {
      ...requiredCheck,
      continuationActions: targetSceneId
        ? buildPostMoveContinuationActions(input.actions, input.state, targetSceneId, kb)
        : input.actions.map((action) => ({ ...action }))
    };
    timings.totalForeground = elapsedMs(foregroundStart);
    return {
      raw: narrator.raw,
      legacyResponse: resolved.legacyResponse,
      events: resolved.events,
      decayIntents: true,
      timings
    };
  }
  const progressBefore = getScenarioProgressForState(input.state);
  const availableEvents = new Map(
    getAvailableStoryEvents(progressBefore, input.state.currentScene).map((event) => [event.id, event])
  );
  const checkEvent = inferredStoryCalls.flatMap((call) => {
    const event = availableEvents.get(String(call.arguments.eventId ?? ''));
    return event?.effects.some((effect) => 'requestCheck' in effect) ? [event] : [];
  })[0];
  if (checkEvent) {
    const activeNpc = defaultActiveNpcForScene(input.state.currentScene);
    const narrator = {
      raw: JSON.stringify({
        narrative: checkEvent.narrativeCue,
        activeNpc,
        nextPrompt: '请掷骰结算检定。',
        playerChoices: {}
      }),
      narrative: checkEvent.narrativeCue,
      activeNpc,
      nextPrompt: '请掷骰结算检定。',
      playerChoices: {},
      keywords: [],
      toolCalls: [],
      usedFunctionCalling: false
    };
    const resolved = resolveDmTurn({
      narrator,
      acceptedCalls: inferredStoryCalls,
      turn: currentTurn,
      pendingBefore: input.state.pendingConsequences ?? []
    });
    timings.totalForeground = elapsedMs(foregroundStart);
    return {
      raw: narrator.raw,
      legacyResponse: resolved.legacyResponse,
      events: resolved.events,
      decayIntents: true,
      timings
    };
  }
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

  // 1) 当前轮只使用既有 summary；新 summary 在后台生成，供下一轮使用
  const effectiveSummary = input.state.longTermMemorySummary ?? '';
  const effectiveHistory = input.state.conversationHistory;
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
  const settlesFinaleRoute = inferredStoryCalls.some((call) =>
    call.arguments.eventId === 'EV_CHOOSE_NEGOTIATION'
    || call.arguments.eventId === 'EV_CHOOSE_COMBAT'
  );
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
  const narratorStart = nowMs();
  try {
    narrator = await callNarrator(config, {
      ctx,
      actions: input.actions,
      mode: input.state.exploreMode,
      history,
      allowedToolNames: allowed,
      lookupResolver,
      validateOutput: (output, toolCalls) => validateNarratorSemantics(
        output,
        [inferredSceneCall, ...inferredStoryCalls, ...toolCalls].filter((call): call is NonNullable<typeof call> => Boolean(call)),
        input.state,
        kb
      ),
      signal: input.signal
    });
  } catch (err) {
    if (err instanceof NarratorSemanticError) {
      const projectedScene = inferredSceneCall
        ? String(inferredSceneCall.arguments.targetSceneId) as SceneId
        : input.state.currentScene;
      const sceneName = kb.scenes[projectedScene]?.public.name ?? projectedScene;
      const changedScene = projectedScene !== input.state.currentScene;
      const projectedStoryEventIds = inferredStoryCalls.map((call) => String(call.arguments.eventId ?? ''));
      const projectedTransition = processScenarioTurn(progressBefore, {
        currentScene: projectedScene,
        previousScene: changedScene ? input.state.currentScene : undefined,
        storyEventIds: projectedStoryEventIds,
        turn: currentTurn,
        completeTurn: false,
        actorName: input.actions[input.actions.length - 1]?.player
      });
      const activeNpcName = inferredStoryCalls.length
        ? defaultActiveNpcForScene(projectedScene)
        : resolveActiveNpcForScene({
            previousScene: input.state.currentScene,
            nextScene: projectedScene,
            previousActiveNpc: input.state.activeNpcName,
            requestedActiveNpc: changedScene ? null : input.state.activeNpcName,
            requestedActiveNpcProvided: true
          });
      const eventNarrative = projectedStoryEventIds.flatMap((id) =>
        availableEvents.get(id)?.narrativeCue ?? []
      ).join(' ');
      const projectedRoute = projectedTransition.progress.variables.finaleRoute;
      const diceResultText = input.actions.map((action) => action.action).join('\n');
      const checkSucceeded = /【检定结果】[\s\S]*结果[：:]\s*(?:成功|普通成功|困难成功|极难成功|大成功)/.test(diceResultText);
      const checkFailed = /【检定结果】[\s\S]*结果[：:]\s*(?:失败|大失败)/.test(diceResultText);
      const finaleNarrative = projectedScene === 'S05' && projectedRoute === 'combat'
        ? checkSucceeded
          ? '攻击已经结算并奏效，一名深潜者失去战斗能力；其余深潜者仍在阻止你们接近埃里克。'
          : checkFailed
            ? '这次攻击未能使深潜者失去战斗能力；甲板冲突仍在继续，扶桑花号正准备离港。'
            : '甲板冲突仍在继续，调查员必须尽快攻击仍在抵抗的深潜者并救出埃里克。'
        : projectedScene === 'S05' && projectedRoute === 'negotiation'
          ? checkSucceeded
            ? '这次交涉检定已经成功结算；调查员继续依据已经听懂的诉求完成交涉。'
            : checkFailed
              ? '这次交涉检定未能奏效；调查员仍须依据当前有效目标继续处理交涉。'
              : '交涉仍在继续，调查员需要先听懂对方诉求，再说服其释放埃里克。'
          : '';
      const narrative = eventNarrative || finaleNarrative || (changedScene
        ? `你们已经抵达${sceneName}。声明中的其他新信息无法由现有证据确认，只能依据已经确认的线索继续调查。`
        : activeNpcName
          ? `${activeNpcName}没有提供更多可核实的信息。你们仍在${sceneName}，只能依据已经确认的线索继续调查。`
          : `声明中的新信息无法由现有证据确认。你们仍在${sceneName}，可以换一种调查方式或核对已知线索。`);
      const playerChoices = buildSemanticFallbackChoices(
        input.state,
        kb,
        projectedScene,
        activeNpcName,
        projectedTransition.progress
      );
      const nextPrompt = finaleNarrative
        ? projectedRoute === 'combat'
          ? '下一轮如何攻击仍在抵抗的深潜者？'
          : '下一步如何继续交涉？'
        : '下一步要从哪条已确认线索着手？';
      narrator = {
        raw: JSON.stringify({ narrative, activeNpc: activeNpcName, nextPrompt, playerChoices }),
        narrative,
        activeNpc: activeNpcName,
        nextPrompt,
        playerChoices,
        keywords: [],
        toolCalls: [],
        usedFunctionCalling: false
      };
    } else if (err instanceof NarratorError) {
      throw new AiResponseFormatError(err.message);
    } else {
      throw err;
    }
  }
  timings.narrator = elapsedMs(narratorStart);

  // 4) 出口护栏：逐个语义校验工具调用，同时检查是否越出 allowed 集
  const candidateCalls = [
    ...(inferredSceneCall ? [inferredSceneCall] : []),
    ...inferredStoryCalls,
    ...narrator.toolCalls.filter((call) =>
      call.name !== 'propose_scene_change'
      && !(settlesFinaleRoute && call.name === 'request_check')
      && !(call.name === 'propose_story_event' && inferredStoryCalls.some((inferred) =>
        inferred.arguments.eventId === call.arguments.eventId
      ))
    )
  ];
  const directorResult = validateToolCalls(candidateCalls, directorCtx, allowed);

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
  const targetScene = resolved.legacyResponse.stateUpdate?.sceneChange ?? input.state.currentScene;
  const knownItems = new Set([
    ...input.state.clues.map((clue) => clue.id),
    ...(resolved.legacyResponse.stateUpdate?.newItems ?? [])
  ]);
  const acceptedStoryEventIds = resolved.legacyResponse.stateUpdate?.storyEventIds ?? [];
  const finaleRoute = acceptedStoryEventIds.includes('EV_CHOOSE_COMBAT')
    ? 'combat'
    : acceptedStoryEventIds.includes('EV_CHOOSE_NEGOTIATION')
      ? 'negotiation'
      : getScenarioProgressForState(input.state).variables.finaleRoute;
  resolved.legacyResponse = inferNarrativeConsequences({
    ...resolved.legacyResponse,
    stateUpdate: {
      ...resolved.legacyResponse.stateUpdate,
      newItems: resolved.legacyResponse.stateUpdate?.newItems ?? []
    },
    playerChoices: sanitizePlayerChoices(narrator.playerChoices, knownItems, kb, targetScene, finaleRoute)
  }, input.actions, input.state);

  timings.totalForeground = elapsedMs(foregroundStart);
  const traceId = import.meta.env.DEV
    ? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    : undefined;
  const backgroundUpdate = runDmBackgroundUpdate({
    config,
    input,
    kb,
    currentTurn,
    ctx,
    narrator,
    resolved,
    traceId,
    foregroundTimings: timings
  });

  // 6) DEV 追踪：让右下角 DmDebugDrawer 看到这一轮经过的所有阶段
  if (import.meta.env.DEV) {
    pushTrace({
      id: traceId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      turn: ctx.dynamic.workingMemory.turnCount + 1,
      actions: input.actions.map((a) => ({ player: a.player, action: a.action, scene: a.scene })),
      ctx,
      narratorRaw: narrator.raw,
      usedFunctionCalling: narrator.usedFunctionCalling,
      toolCalls: narrator.toolCalls,
      acceptedCalls: directorResult.accepted,
      rejectedCalls: directorResult.rejected,
      s2Synthesized: {
        triggered: shouldRunSystem2(input.state)
      },
      timings
    });
  }

  return {
    raw: narrator.raw,
    legacyResponse: resolved.legacyResponse,
    events: resolved.events,
    decayIntents: true,
    timings,
    backgroundUpdate
  };
}
