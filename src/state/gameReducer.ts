import type { AiResponse, AtomicFact, Attributes, CaseBoardCertainty, CaseBoardInsight, CaseBoardPatch, CaseBoardState, CheckRequest, DiceResult, DynamicCaseBoardEdge, DynamicCaseBoardNode, EpisodicMemoryRecord, EpisodicMemorySource, EpisodicMemoryVisibility, FactPredicate, GameState, Investigator, NarrativeMessage, NpcMindModel, PersistedDMEvent, PersistedPendingConsequence, ProspectiveIntent, ScenarioProgress, SceneId, SkillValue, StoryItem } from '../types/game';
import { storyData } from '../data/storyData';
import {
  createScenarioProgress,
  getScenarioDefinition,
  getScenarioProgressForState,
  hydrateScenarioProgress,
  npcIdFromName,
  npcNameFromId,
  processScenarioTurn
} from '../scenario/engine';
import { normalizeNarrativeKeywordHints } from '../services/narrativeKeywords';
import { prepareCheck } from '../services/dice';
import { countCompletedGameTurns } from '../services/turns';
import {
  buildFinaleSuggestions,
  finaleSuggestionsNeedReplacement
} from '../services/finaleChoices';
import { allSkills } from '../data/skills';
import { deriveInvestigatorStats, gameRules, resolveSkillBase } from '../data/gameRules';
import {
  buildFactCaseBoardPatch,
  normalizeCaseBoardText,
  semanticEdgeKey,
  semanticNodeKey,
  visibleCaseBoardNodeIds
} from '../dm/caseBoardModel';
import { defaultActiveNpcForScene, resolveActiveNpcForScene } from './sceneFocus';

export type GameAction =
  | { type: 'start'; players: Investigator[] }
  | { type: 'restore'; state: GameState }
  | { type: 'setThinking'; value: boolean }
  | { type: 'setExploreMode'; mode: GameState['exploreMode'] }
  | { type: 'setCurrentSplitPlayer'; index: number }
  | { type: 'setCurrentActor'; index: number }
  | { type: 'setPlayerScene'; playerIndex: number; sceneId: SceneId }
  | { type: 'setDeclaration'; playerId: string; text: string }
  | { type: 'clearDeclarations' }
  | { type: 'advanceActor' }
  | { type: 'appendMessage'; message: Omit<NarrativeMessage, 'id'> }
  | { type: 'appendHistory'; role: 'user' | 'assistant'; content: string }
  | { type: 'applyAiResponse'; response: AiResponse; raw: string; actorName?: string }
  | { type: 'setPendingCheck'; check: CheckRequest | null }
  | { type: 'applyDiceResult'; result: DiceResult }
  | { type: 'setSuggestions'; suggestions: string[] }
  | { type: 'addLog'; text: string }
  | { type: 'appendEvents'; events: PersistedDMEvent[] }
  | {
      type: 'consolidateMemory';
      summary: string;
      summarizedUntilIndex: number;
      remainingHistory: GameState['conversationHistory'];
      sourceHistoryLength?: number;
    }
  | { type: 'appendFacts'; facts: AtomicFact[] }
  | { type: 'updateNpcMindModel'; npcId: string; partial: Partial<NpcMindModel> }
  | { type: 'addProspectiveIntents'; intents: ProspectiveIntent[] }
  | { type: 'appendEpisodicMemory'; records: EpisodicMemoryRecord[] }
  | { type: 'applyCaseBoardPatch'; patch: CaseBoardPatch }
  | { type: 'consumeProspectiveIntent'; id: string }
  | { type: 'decayProspectiveIntents' };

const scenarioDefinition = getScenarioDefinition();
const initialMessage = scenarioDefinition.presentation.openingNarrative;
const ACTION_LOG_LIMIT = 500;
let messageIdSequence = 0;

function id() {
  messageIdSequence = (messageIdSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now()}-${messageIdSequence.toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function time() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function defaultEquipment(id: string, name: string): string[] {
  if (id === 'constable' || name === '罗伯特·肖') return ['警用警棍', '警用左轮手枪'];
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const defaultAttrs: Attributes = gameRules.defaultAttributes;

function normalizeAttrs(value: unknown): Attributes {
  const source = isRecord(value) ? value : {};
  return {
    STR: numberValue(source.STR, defaultAttrs.STR),
    CON: numberValue(source.CON, defaultAttrs.CON),
    SIZ: numberValue(source.SIZ, defaultAttrs.SIZ),
    DEX: numberValue(source.DEX, defaultAttrs.DEX),
    APP: numberValue(source.APP, defaultAttrs.APP),
    INT: numberValue(source.INT, defaultAttrs.INT),
    POW: numberValue(source.POW, defaultAttrs.POW),
    EDU: numberValue(source.EDU, defaultAttrs.EDU),
    Luck: numberValue(source.Luck, defaultAttrs.Luck)
  };
}

function normalizeSkillValue(value: unknown, fallbackBase: number): SkillValue {
  if (isRecord(value)) {
    const base = numberValue(value.base, fallbackBase);
    const added = Math.max(0, numberValue(value.added, 0));
    return { base, added, isJob: value.isJob === true };
  }
  const total = numberValue(value, fallbackBase);
  return { base: fallbackBase, added: Math.max(0, total - fallbackBase) };
}

function normalizeSkills(value: unknown, attrs: Attributes) {
  const source = isRecord(value) ? value : {};
  const skills: Record<string, SkillValue> = {};

  allSkills.forEach((skill) => {
    const base = resolveSkillBase(skill.base, attrs);
    skills[skill.name] = normalizeSkillValue(source[skill.name], base);
  });

  Object.entries(source).forEach(([name, skillValue]) => {
    if (!skills[name]) {
      skills[name] = normalizeSkillValue(skillValue, 0);
    }
  });

  return skills;
}

function normalizeInvestigator(value: unknown, index: number): Investigator | null {
  if (!isRecord(value)) return null;

  const attrs = normalizeAttrs(value.attrs);
  const derived = deriveInvestigatorStats(attrs);
  const hp = Math.max(gameRules.derivedStats.hp.min, Math.floor(numberValue(value.hp, derived.hp)));
  const mp = Math.max(gameRules.derivedStats.mp.min, Math.floor(numberValue(value.mp, derived.mp)));
  const san = Math.max(gameRules.derivedStats.san.min, Math.floor(numberValue(value.san, derived.san)));
  const name = stringValue(value.name, `调查员${index + 1}`);
  const idValue = stringValue(value.id, `player-${index + 1}`);

  return {
    id: idValue,
    name,
    portrait: typeof value.portrait === 'string' ? value.portrait : undefined,
    gender: stringValue(value.gender, '未知'),
    age: Math.max(0, Math.floor(numberValue(value.age, 30))),
    hometown: stringValue(value.hometown, '伦敦'),
    job: stringValue(value.job, '调查员'),
    role: typeof value.role === 'string' ? value.role : undefined,
    attrs,
    hp,
    mp,
    san,
    luck: numberValue(value.luck, derived.luck),
    currentHp: clamp(Math.floor(numberValue(value.currentHp, hp)), 0, hp),
    currentMp: clamp(Math.floor(numberValue(value.currentMp, mp)), 0, mp),
    currentSan: clamp(Math.floor(numberValue(value.currentSan, san)), 0, san),
    skills: normalizeSkills(value.skills, attrs),
    equipment: Array.isArray(value.equipment)
      ? value.equipment.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : defaultEquipment(idValue, name),
    background: isRecord(value.background) ? {
      importantPerson: typeof value.background.importantPerson === 'string' ? value.background.importantPerson : undefined,
      belief: typeof value.background.belief === 'string' ? value.background.belief : undefined,
      meaningfulItem: typeof value.background.meaningfulItem === 'string' ? value.background.meaningfulItem : undefined,
      trait: typeof value.background.trait === 'string' ? value.background.trait : undefined,
      story: typeof value.background.story === 'string' ? value.background.story : undefined
    } : undefined
  };
}

function normalizeSceneId(value: unknown, fallback: SceneId = 'S01'): SceneId {
  const text = stringValue(value);
  if (text in storyData.scenes) return text as SceneId;

  const byName = Object.values(storyData.scenes).find((scene) => scene.name === text);
  return byName?.id ?? fallback;
}

function normalizeDifficulty(value: unknown): CheckRequest['difficulty'] {
  const text = stringValue(value);
  if (text.includes('极')) return '极难';
  if (text.includes('困')) return '困难';
  return '普通';
}

function normalizeCheck(value: unknown, players: Investigator[]): CheckRequest | null {
  if (!isRecord(value)) return null;
  const firstPlayer = players[0]?.name ?? '调查员';
  const requestedPlayer = stringValue(value.player, firstPlayer);
  const player = players.find((item) => item.name === requestedPlayer)?.name ?? firstPlayer;
  const continuationActions = Array.isArray(value.continuationActions)
    ? value.continuationActions.flatMap((item) => {
        if (!isRecord(item)) return [];
        const actionPlayer = stringValue(item.player);
        const actionText = stringValue(item.action);
        if (!actionPlayer || !actionText) return [];
        return [{
          player: actionPlayer,
          action: actionText,
          scene: typeof item.scene === 'string' ? item.scene : undefined
        }];
      })
    : undefined;

  return {
    skill: stringValue(value.skill, '侦查'),
    difficulty: normalizeDifficulty(value.difficulty),
    player,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    scenarioCheckId: typeof value.scenarioCheckId === 'string' ? value.scenarioCheckId : undefined,
    threshold: typeof value.threshold === 'number' ? value.threshold : undefined,
    skillVal: typeof value.skillVal === 'number' ? value.skillVal : undefined,
    continuationActions: continuationActions?.length ? continuationActions : undefined
  };
}

function restoreAuthoredPendingCheck(
  check: CheckRequest | null,
  players: Investigator[],
  currentScene: SceneId,
  progress: GameState['scenarioProgress']
): CheckRequest | null {
  if (!check) return null;
  const bypassedFinaleListen = currentScene === 'S05'
    && progress?.variables.finaleRoute === 'negotiation'
    && progress.objectiveStates.O08 === 'active'
    && !check.scenarioCheckId
    && check.skill === '说服';
  const bypassedBookletAnalysis = currentScene === 'S01'
    && progress?.clueStates.I04 === 'discovered'
    && !check.scenarioCheckId
    && check.continuationActions?.some((action) =>
      /(?:加热|烘烤|显字|隐写|解读|解码).{0,16}(?:小册子|夹页)|(?:小册子|夹页).{0,16}(?:加热|烘烤|显字|隐写|解读|解码)/.test(action.action)
    );
  if (bypassedBookletAnalysis) return null;
  if (!bypassedFinaleListen) return prepareCheck(check, players);
  return prepareCheck({
    ...check,
    scenarioCheckId: 'CHECK_LISTEN',
    skill: '聆听',
    difficulty: '普通',
    reason: '从非人声调中辨认其真正诉求'
  }, players);
}

function normalizeConversationHistory(value: unknown): GameState['conversationHistory'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const role: GameState['conversationHistory'][number]['role'] | null =
      item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    const content = typeof item.content === 'string' ? item.content : '';
    return role && content ? [{ role, content }] : [];
  });
}

function narrativeMessageFromHistoryContent(content: string) {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { narrative?: unknown; keywords?: unknown };
      if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) {
        return {
          text: parsed.narrative,
          keywords: normalizeNarrativeKeywordHints(parsed.keywords, parsed.narrative)
        };
      }
    }
  } catch {
    // Keep the raw content if the assistant turn was not strict JSON.
  }
  return { text: content, keywords: [] };
}

function normalizeMessages(value: unknown, history: GameState['conversationHistory'], players: Investigator[], fallback: NarrativeMessage[]) {
  if (Array.isArray(value)) {
    const messages = value.flatMap((item) => {
      if (!isRecord(item)) return [];
      const text = typeof item.text === 'string' ? item.text : '';
      if (!text) return [];
      const type: NarrativeMessage['type'] = item.type === 'player' || item.type === 'system' ? item.type : 'dm';
      if (type === 'system' && /^推进提示[：:]/.test(text.trim())) return [];
      const keywords = type === 'dm'
        ? normalizeNarrativeKeywordHints(item.keywords, text)
        : [];
      return [{
        id: stringValue(item.id, id()),
        type,
        text,
        playerName: typeof item.playerName === 'string' ? item.playerName : undefined,
        npcName: typeof item.npcName === 'string' ? item.npcName : null,
        keywords: keywords.length ? keywords : undefined
      }];
    });
    if (messages.length) return messages;
  }

  if (history.length) {
    return history.map((turn): NarrativeMessage => {
      const parsed = turn.role === 'assistant'
        ? narrativeMessageFromHistoryContent(turn.content)
        : { text: turn.content, keywords: [] };
      return {
        id: id(),
        type: turn.role === 'assistant' ? 'dm' : 'player',
        text: parsed.text,
        playerName: turn.role === 'user' ? players[0]?.name : undefined,
        npcName: null,
        keywords: parsed.keywords.length ? parsed.keywords : undefined
      };
    });
  }

  return fallback;
}

const WITHDRAWN_PHARMACY_STATE_MARKERS = [
  '调查员离开后，他秘密派出暴徒',
  '后厅油布包中的地图笔记标出了泰晤士港扶桑花号的位置',
  '蒙特利尔派来的三名暴徒封住退路',
  '战斗阶段开始'
];

function referencesWithdrawnPharmacyState(text: string): boolean {
  return WITHDRAWN_PHARMACY_STATE_MARKERS.some((marker) => text.includes(marker));
}

function pharmacyInvestigationSuggestions(players: Investigator[]): Record<string, string[]> {
  const suggestions = [
    '搜查后厅油布包，寻找并检查潮湿的地图笔记',
    '检查柜台附近是否留下雪茄或其他痕迹',
    '观察浓雾与后门附近的撤离痕迹'
  ];
  return Object.fromEntries(players.map((player) => [player.id, [...suggestions]]));
}

function finaleRemainingOpponents(progress: ScenarioProgress): number {
  const total = scenarioDefinition.world.encounters.find((item) => item.id === 'ENC01')?.count ?? 0;
  return Math.max(0, total - (progress.encounters.ENC01?.defeated ?? 0));
}

function containsPharmacyInvestigationSuggestion(suggestionsByPlayerId: Record<string, string[]>): boolean {
  return Object.values(suggestionsByPlayerId).some((suggestions) => suggestions.some((suggestion) =>
    /后厅油布包|柜台附近.*雪茄|后门附近.*撤离痕迹/.test(suggestion)
  ));
}

function containsInvalidFinaleSuggestion(
  suggestionsByPlayerId: Record<string, string[]>,
  route: unknown,
  players: Investigator[],
  progress: ScenarioProgress
): boolean {
  return finaleSuggestionsNeedReplacement(
    players,
    suggestionsByPlayerId,
    route,
    finaleRemainingOpponents(progress)
  );
}

function normalizeActionLog(value: unknown, fallback: GameState['actionLog']) {
  if (!Array.isArray(value)) return fallback;
  const logs = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const text = typeof item.text === 'string' ? item.text : '';
    if (!text) return [];
    return [{ time: stringValue(item.time, time()), text }];
  });
  return logs.length ? logs.slice(0, ACTION_LOG_LIMIT) : fallback;
}

function normalizeClues(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const idValue = typeof item === 'string' ? item : isRecord(item) ? item.id : null;
    const clue = typeof idValue === 'string' ? storyData.items[idValue] : null;
    if (!clue || seen.has(clue.id)) return [];
    seen.add(clue.id);
    return [{ ...clue, found: true }];
  });
}

function normalizePlayerLocations(value: unknown, players: Investigator[], fallback: SceneId) {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(players.map((player) => [
    player.id,
    normalizeSceneId(source[player.id] ?? fallback)
  ])) as Record<string, SceneId>;
}

function normalizeDeclarations(value: unknown, players: Investigator[]) {
  const source = isRecord(value) ? value : {};
  const declarations: Record<string, string> = {};
  players.forEach((player) => {
    const rawDeclaration = source[player.id];
    const declaration = typeof rawDeclaration === 'string' ? rawDeclaration : '';
    if (declaration) declarations[player.id] = declaration;
  });
  return declarations;
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const list = value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : []);
  return list.length ? list.slice(0, 5) : fallback;
}

const INITIAL_SUGGESTION_SETS = [
  ['侦查门廊与窗边痕迹', '比对求助信细节', '检查书房桌面'],
  ['安抚并询问伊莎贝拉', '观察屋内异常动静', '询问父亲失踪前行踪'],
  ['检查门锁与脚印', '搜索可疑信件', '留意街道浓雾'],
  ['询问邻居目击情况', '整理已知线索', '检查照片与名片']
] as const;

function defaultSuggestionsForPlayers(players: Investigator[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  players.forEach((player, index) => {
    out[player.id] = [...INITIAL_SUGGESTION_SETS[index % INITIAL_SUGGESTION_SETS.length]];
  });
  return out;
}

function firstSuggestionListByPlayerOrder(
  suggestionsByPlayerId: Record<string, string[]>,
  players: Investigator[],
  fallback: string[]
): string[] {
  for (const player of players) {
    const list = suggestionsByPlayerId[player.id];
    if (list?.length) return list;
  }
  return fallback;
}

function normalizeSuggestionsByPlayerId(
  value: unknown,
  players: Investigator[],
  fallbackByPlayerId: Record<string, string[]>,
  fallbackGlobal: string[]
): Record<string, string[]> {
  if (Array.isArray(value)) {
    const list = normalizeStringList(value, fallbackGlobal);
    return Object.fromEntries(players.map((player) => [player.id, list]));
  }

  const source = isRecord(value) ? value : {};
  const out: Record<string, string[]> = {};
  for (const player of players) {
    const raw = source[player.id] ?? source[player.name];
    const fallback = fallbackByPlayerId[player.id] ?? fallbackGlobal;
    out[player.id] = normalizeStringList(raw, fallback);
  }
  return out;
}

function normalizeStatUpdate(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([name, delta]) => {
    const numeric = numberValue(delta, Number.NaN);
    return Number.isFinite(numeric) ? [[name, numeric]] : [];
  }));
}

function normalizeNewItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    const text = stringValue(item);
    const clue = storyData.items[text] ?? Object.values(storyData.items).find((candidate) => candidate.name === text);
    if (!clue || seen.has(clue.id)) return [];
    seen.add(clue.id);
    return [clue.id];
  });
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeNpcName(value: unknown) {
  const text = stringValue(value);
  return text && storyData.npcs[text] ? text : null;
}

function resolveActiveNpcAfterResponse(
  response: AiResponse,
  previousScene: SceneId,
  nextScene: SceneId,
  previousActiveNpc: string | null
) {
  const explicitlyCleared = hasOwn(response, 'activeNpc') && response.activeNpc === null;
  const previousNpc = previousActiveNpc ? storyData.npcs[previousActiveNpc] : null;
  const stillMentionsPreviousNpc = previousNpc && [
    previousActiveNpc,
    ...(previousNpc.aliases ?? [])
  ].some((term) => term && response.narrative?.includes(term));

  return resolveActiveNpcForScene({
    previousScene,
    nextScene,
    previousActiveNpc,
    requestedActiveNpc: explicitlyCleared && previousScene === nextScene && stillMentionsPreviousNpc
      ? previousActiveNpc
      : response.activeNpc,
    requestedActiveNpcProvided: hasOwn(response, 'activeNpc')
  });
}

function moveFocusedPlayers(state: GameState, sceneId: SceneId): Record<string, SceneId> {
  if (state.exploreMode === 'split') {
    const player = state.players[state.currentSplitPlayer];
    return player
      ? { ...state.playerLocations, [player.id]: sceneId }
      : state.playerLocations;
  }
  return Object.fromEntries(state.players.map((player) => [player.id, sceneId])) as Record<string, SceneId>;
}

function normalizeEventLog(value: unknown): PersistedDMEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const idVal = stringValue(item.id);
    const turn = numberValue(item.turn, 0);
    const kind = stringValue(item.kind);
    const desc = typeof item.description === 'string' ? item.description : '';
    if (!idVal || !kind || !desc) return [];
    return [{
      id: idVal,
      turn: Math.max(0, Math.floor(turn)),
      kind,
      description: desc,
      toolName: typeof item.toolName === 'string' ? item.toolName : undefined
    }];
  }).slice(-200);
}

function normalizePendingConsequences(value: unknown): PersistedPendingConsequence[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PersistedPendingConsequence[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const idVal = stringValue(item.id);
    if (!idVal || seen.has(idVal)) continue;
    const description = typeof item.description === 'string' ? item.description : '';
    const triggerEvent = typeof item.triggerEvent === 'string' ? item.triggerEvent : '';
    const remaining = numberValue(item.remainingTurns, Number.NaN);
    const scheduledAt = numberValue(item.scheduledAtTurn, 0);
    if (!description || !triggerEvent || !Number.isFinite(remaining)) continue;
    seen.add(idVal);
    out.push({
      id: idVal,
      description,
      triggerEvent,
      remainingTurns: clamp(Math.floor(remaining), 0, 50),
      scheduledAtTurn: Math.max(0, Math.floor(scheduledAt))
    });
  }
  return out;
}

function normalizeScheduledConsequences(value: unknown): PersistedPendingConsequence[] {
  if (!Array.isArray(value)) return [];
  const out: PersistedPendingConsequence[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const idVal = stringValue(item.id);
    const description = typeof item.description === 'string' ? item.description : '';
    const triggerEvent = typeof item.triggerEvent === 'string' ? item.triggerEvent : '';
    const remaining = numberValue(item.remainingTurns, Number.NaN);
    const scheduledAt = numberValue(item.scheduledAtTurn, 0);
    if (!idVal || !description || !triggerEvent || !Number.isFinite(remaining)) continue;
    out.push({
      id: idVal,
      description,
      triggerEvent,
      remainingTurns: clamp(Math.floor(remaining), 0, 50),
      scheduledAtTurn: Math.max(0, Math.floor(scheduledAt))
    });
  }
  return out;
}

// ---------- Phase 9：认知记忆层 normalizers ----------

const FACT_PREDICATES: ReadonlySet<FactPredicate> = new Set<FactPredicate>([
  'stance_toward', 'goal', 'knowledge', 'capability', 'state', 'relationship'
]);
const FACT_CAP = 500;
const INTENT_CAP = 30;
const EPISODIC_MEMORY_CAP = 300;
const CASE_BOARD_NODE_CAP = 30;
const CASE_BOARD_EDGE_CAP = 60;
const CASE_BOARD_INSIGHT_CAP = 120;
const EPISODIC_SOURCES: ReadonlySet<EpisodicMemorySource> = new Set([
  'episode', 'event', 'fact', 'summary'
]);
const EPISODIC_VISIBILITIES: ReadonlySet<EpisodicMemoryVisibility> = new Set([
  'player_safe', 'dm'
]);

function isFactPredicate(value: unknown): value is FactPredicate {
  return typeof value === 'string' && FACT_PREDICATES.has(value as FactPredicate);
}

function normalizeAtomicFact(value: unknown): AtomicFact | null {
  if (!isRecord(value)) return null;
  const idVal = stringValue(value.id);
  const actor = stringValue(value.actor);
  const factValue = stringValue(value.value);
  if (!idVal || !actor || !factValue || !isFactPredicate(value.predicate)) return null;
  const turn = Math.max(0, Math.floor(numberValue(value.turn, 0)));
  const source: AtomicFact['source'] = value.source === 'system2' ? 'system2' : 'system1';
  const fact: AtomicFact = {
    id: idVal,
    turn,
    actor,
    predicate: value.predicate,
    value: factValue,
    source
  };
  const target = stringValue(value.target);
  if (target) fact.target = target;
  const supersedes = stringValue(value.supersedes);
  if (supersedes) fact.supersedes = supersedes;
  return fact;
}

function normalizeAtomicFacts(value: unknown): AtomicFact[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: AtomicFact[] = [];
  for (const item of value) {
    const fact = normalizeAtomicFact(item);
    if (!fact || seen.has(fact.id)) continue;
    seen.add(fact.id);
    out.push(fact);
  }
  return out.slice(-FACT_CAP);
}

function normalizeNpcMindModel(value: unknown): NpcMindModel | null {
  if (!isRecord(value)) return null;
  const npcId = stringValue(value.npcId);
  if (!npcId) return null;
  const stanceHistory = Array.isArray(value.stanceHistoryFactIds)
    ? value.stanceHistoryFactIds.flatMap((entry) => {
        const text = stringValue(entry);
        return text ? [text] : [];
      })
    : [];
  const exceptionsSrc = isRecord(value.playerExceptions) ? value.playerExceptions : null;
  const exceptions = exceptionsSrc
    ? Object.fromEntries(
        Object.entries(exceptionsSrc).flatMap(([k, v]) => {
          const text = typeof v === 'string' ? v.trim() : '';
          return k && text ? [[k, text] as const] : [];
        })
      )
    : undefined;
  const model: NpcMindModel = {
    npcId,
    coreMotivation: stringValue(value.coreMotivation),
    currentStance: stringValue(value.currentStance),
    stanceHistoryFactIds: stanceHistory,
    lastUpdatedTurn: Math.max(0, Math.floor(numberValue(value.lastUpdatedTurn, 0)))
  };
  if (exceptions && Object.keys(exceptions).length) {
    model.playerExceptions = exceptions;
  }
  return model;
}

function normalizeNpcMindModels(value: unknown): Record<string, NpcMindModel> {
  if (!isRecord(value)) return {};
  const out: Record<string, NpcMindModel> = {};
  for (const [key, raw] of Object.entries(value)) {
    const model = normalizeNpcMindModel(raw);
    if (!model) continue;
    // 以记录 key 为主（与 GameState 索引一致），同时容忍旧存档嵌套 npcId 错误
    out[key] = { ...model, npcId: key };
  }
  return out;
}

function normalizeProspectiveIntent(value: unknown): ProspectiveIntent | null {
  if (!isRecord(value)) return null;
  const idVal = stringValue(value.id);
  const owner = stringValue(value.owner);
  const predicted = stringValue(value.predictedAction);
  const trigger = stringValue(value.triggerCondition);
  if (!idVal || !owner || !predicted || !trigger) return null;
  return {
    id: idVal,
    owner,
    predictedAction: predicted,
    triggerCondition: trigger,
    ttl: clamp(Math.floor(numberValue(value.ttl, 0)), 0, 50),
    createdTurn: Math.max(0, Math.floor(numberValue(value.createdTurn, 0)))
  };
}

function normalizeProspectiveIntents(value: unknown): ProspectiveIntent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ProspectiveIntent[] = [];
  for (const item of value) {
    const intent = normalizeProspectiveIntent(item);
    if (!intent || seen.has(intent.id)) continue;
    seen.add(intent.id);
    out.push(intent);
  }
  return out.slice(-INTENT_CAP);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = stringValue(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeEpisodicMemoryRecord(value: unknown): EpisodicMemoryRecord | null {
  if (!isRecord(value)) return null;
  const idVal = stringValue(value.id);
  const text = stringValue(value.text);
  if (!idVal || !text) return null;
  const turn = Math.max(0, Math.floor(numberValue(value.turn, 0)));
  const sceneId = stringValue(value.sceneId);
  const source = EPISODIC_SOURCES.has(value.source as EpisodicMemorySource)
    ? value.source as EpisodicMemorySource
    : 'episode';
  const visibility = EPISODIC_VISIBILITIES.has(value.visibility as EpisodicMemoryVisibility)
    ? value.visibility as EpisodicMemoryVisibility
    : 'dm';
  const record: EpisodicMemoryRecord = {
    id: idVal,
    turn,
    text,
    playerNames: normalizeStringArray(value.playerNames),
    entityIds: normalizeStringArray(value.entityIds),
    tags: normalizeStringArray(value.tags).slice(0, 12),
    source,
    visibility,
    importance: clamp(numberValue(value.importance, 1), 0, 5)
  };
  if (sceneId in storyData.scenes) record.sceneId = sceneId as SceneId;
  return record;
}

function normalizeEpisodicMemory(value: unknown): EpisodicMemoryRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: EpisodicMemoryRecord[] = [];
  for (const item of value) {
    const record = normalizeEpisodicMemoryRecord(item);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out.slice(-EPISODIC_MEMORY_CAP);
}

function normalizeCaseBoardStringArray(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, 24);
}

function normalizeCaseBoardCertainty(value: unknown): CaseBoardCertainty {
  return value === 'confirmed' ? 'confirmed' : 'hypothesis';
}

function isDynamicNodeType(value: unknown): value is DynamicCaseBoardNode['type'] {
  return value === 'npc' || value === 'item' || value === 'scene'
    || value === 'theory' || value === 'event';
}

function normalizeDynamicCaseBoardNode(value: unknown): DynamicCaseBoardNode | null {
  if (!isRecord(value)) return null;
  const idVal = stringValue(value.id);
  const title = stringValue(value.title).slice(0, 60);
  if (!idVal || !title || !isDynamicNodeType(value.type)) return null;
  const createdTurn = Math.max(0, Math.floor(numberValue(value.createdTurn, 0)));
  const updatedTurn = Math.max(createdTurn, Math.floor(numberValue(value.updatedTurn, createdTurn)));
  const node: DynamicCaseBoardNode = {
    id: idVal,
    semanticKey: stringValue(value.semanticKey, `${value.type}:${normalizeCaseBoardText(title)}`),
    type: value.type,
    title,
    importance: clamp(Math.floor(numberValue(value.importance, value.type === 'theory' ? 4 : 3)), 1, 5) as DynamicCaseBoardNode['importance'],
    source: value.source === 'scenario' ? 'scenario' : 'ai',
    certainty: normalizeCaseBoardCertainty(value.certainty),
    sourceFactIds: normalizeCaseBoardStringArray(value.sourceFactIds),
    sourceEventIds: normalizeCaseBoardStringArray(value.sourceEventIds),
    sourceClueIds: normalizeCaseBoardStringArray(value.sourceClueIds),
    createdTurn,
    updatedTurn,
    status: value.status === 'archived' ? 'archived' : 'active'
  };
  const refId = stringValue(value.refId);
  if (refId) node.refId = refId;
  const subtitle = stringValue(value.subtitle).slice(0, 80);
  if (subtitle) node.subtitle = subtitle;
  const detail = stringValue(value.detail).slice(0, 240);
  if (detail) node.detail = detail;
  return node;
}

function normalizeDynamicCaseBoardEdge(value: unknown): DynamicCaseBoardEdge | null {
  if (!isRecord(value)) return null;
  const idVal = stringValue(value.id);
  const from = stringValue(value.from);
  const to = stringValue(value.to);
  if (!idVal || !from || !to) return null;
  const tone: DynamicCaseBoardEdge['tone'] =
    value.tone === 'danger' || value.tone === 'route' || value.tone === 'evidence'
      ? value.tone
      : 'suspicion';
  const createdTurn = Math.max(0, Math.floor(numberValue(value.createdTurn, 0)));
  const updatedTurn = Math.max(createdTurn, Math.floor(numberValue(value.updatedTurn, createdTurn)));
  const edge: DynamicCaseBoardEdge = {
    id: idVal,
    relationKey: stringValue(value.relationKey, `${from}->${to}:${tone}`),
    from,
    to,
    tone,
    source: value.source === 'scenario' ? 'scenario' : 'ai',
    certainty: normalizeCaseBoardCertainty(value.certainty),
    sourceFactIds: normalizeCaseBoardStringArray(value.sourceFactIds),
    sourceEventIds: normalizeCaseBoardStringArray(value.sourceEventIds),
    sourceClueIds: normalizeCaseBoardStringArray(value.sourceClueIds),
    createdTurn,
    updatedTurn,
    status: value.status === 'archived' ? 'archived' : 'active'
  };
  const label = stringValue(value.label).slice(0, 40);
  if (label) edge.label = label;
  return edge;
}

function normalizeCaseBoardInsight(value: unknown): CaseBoardInsight | null {
  if (!isRecord(value)) return null;
  const idVal = stringValue(value.id);
  const ownerNodeId = stringValue(value.ownerNodeId);
  const slotKey = stringValue(value.slotKey);
  const text = stringValue(value.text).slice(0, 160);
  const kind = value.kind;
  if (!idVal || !ownerNodeId || !slotKey || !text
    || !['observation', 'testimony', 'motive', 'attitude', 'status'].includes(String(kind))) {
    return null;
  }
  const createdTurn = Math.max(0, Math.floor(numberValue(value.createdTurn, 0)));
  const updatedTurn = Math.max(createdTurn, Math.floor(numberValue(value.updatedTurn, createdTurn)));
  const insight: CaseBoardInsight = {
    id: idVal,
    ownerNodeId,
    slotKey,
    kind: kind as CaseBoardInsight['kind'],
    text,
    certainty: normalizeCaseBoardCertainty(value.certainty),
    sourceFactIds: normalizeCaseBoardStringArray(value.sourceFactIds),
    sourceEventIds: normalizeCaseBoardStringArray(value.sourceEventIds),
    sourceClueIds: normalizeCaseBoardStringArray(value.sourceClueIds),
    createdTurn,
    updatedTurn,
    status: value.status === 'archived' ? 'archived' : 'active'
  };
  const detail = stringValue(value.detail).slice(0, 240);
  if (detail) insight.detail = detail;
  return insight;
}

function normalizeCaseBoardState(value: unknown): GameState['caseBoard'] {
  if (!isRecord(value)) return { nodes: [], edges: [], insights: [], lastUpdatedTurn: 0 };
  const nodes = Array.isArray(value.nodes)
    ? value.nodes.flatMap((item) => {
        const node = normalizeDynamicCaseBoardNode(item);
        return node ? [node] : [];
      })
    : [];
  const edges = Array.isArray(value.edges)
    ? value.edges.flatMap((item) => {
        const edge = normalizeDynamicCaseBoardEdge(item);
        return edge ? [edge] : [];
      })
    : [];
  const insights = Array.isArray(value.insights)
    ? value.insights.flatMap((item) => {
        const insight = normalizeCaseBoardInsight(item);
        return insight ? [insight] : [];
      })
    : [];
  const lastUpdatedTurn = Math.max(0, Math.floor(numberValue(value.lastUpdatedTurn, 0)));
  return { nodes, edges, insights, lastUpdatedTurn };
}

function mergeUniqueStrings(a: string[], b: string[]): string[] {
  return normalizeStringArray([...a, ...b]);
}

function strongerCertainty(a: CaseBoardCertainty, b: CaseBoardCertainty): CaseBoardCertainty {
  return a === 'confirmed' || b === 'confirmed' ? 'confirmed' : 'hypothesis';
}

function hasVisibleAnchor(
  sourceFactIds: string[],
  sourceEventIds: string[],
  sourceClueIds: string[],
  state: GameState
): boolean {
  const factIds = new Set((state.atomicFacts ?? []).map((fact) => fact.id));
  const eventIds = new Set((state.eventLog ?? []).map((event) => event.id));
  const clueIds = new Set(state.clues.map((clue) => clue.id));
  return sourceFactIds.some((idVal) => factIds.has(idVal))
    || sourceEventIds.some((idVal) => eventIds.has(idVal))
    || sourceClueIds.some((idVal) => clueIds.has(idVal));
}

function referencesUnrevealedSecret(text: string, state: GameState): boolean {
  for (const match of text.matchAll(/secret\.([A-Za-z0-9_.-]+?)(?:\.revealed)?\b/g)) {
    const secretKey = match[1];
    if (!state.flags[`secret.${secretKey}.revealed`]) return true;
  }
  return false;
}

function isSafeDynamicNode(node: DynamicCaseBoardNode, state: GameState): boolean {
  if (!hasVisibleAnchor(node.sourceFactIds, node.sourceEventIds, node.sourceClueIds, state)) {
    return false;
  }
  return !referencesUnrevealedSecret(
    [node.title, node.subtitle, node.detail].filter(Boolean).join(' '),
    state
  );
}

function isSafeDynamicEdge(edge: DynamicCaseBoardEdge, state: GameState): boolean {
  if (!hasVisibleAnchor(edge.sourceFactIds, edge.sourceEventIds, edge.sourceClueIds, state)) return false;
  return !referencesUnrevealedSecret([edge.label, edge.from, edge.to].filter(Boolean).join(' '), state);
}

function isSafeCaseBoardInsight(insight: CaseBoardInsight, state: GameState): boolean {
  if (!hasVisibleAnchor(
    insight.sourceFactIds,
    insight.sourceEventIds,
    insight.sourceClueIds,
    state
  )) return false;
  return !referencesUnrevealedSecret([insight.text, insight.detail].filter(Boolean).join(' '), state);
}

function archiveOverflow<T extends { status: 'active' | 'archived'; certainty: CaseBoardCertainty; createdTurn: number; updatedTurn: number }>(
  items: T[],
  cap: number
): T[] {
  const active = items.filter((item) => item.status === 'active');
  if (active.length <= cap) return items;
  const overflow = active.length - cap;
  const archiveSet = new Set<T>();
  const candidates = [...active].sort((a, b) => {
    if (a.certainty !== b.certainty) return a.certainty === 'hypothesis' ? -1 : 1;
    return a.createdTurn - b.createdTurn || a.updatedTurn - b.updatedTurn;
  });
  candidates.slice(0, overflow).forEach((item) => archiveSet.add(item));
  return items.map((item) => archiveSet.has(item) ? { ...item, status: 'archived' } : item);
}

function applyCaseBoardPatch(state: GameState, patch: CaseBoardPatch): GameState {
  const current = state.caseBoard ?? { nodes: [], edges: [], insights: [], lastUpdatedTurn: 0 };
  const incomingNodes = (Array.isArray(patch.nodes) ? patch.nodes : [])
    .flatMap((item) => {
      const node = normalizeDynamicCaseBoardNode(item);
      return node && isSafeDynamicNode(node, state) ? [node] : [];
    });
  const nodeIdRedirect = new Map<string, string>();
  const nodeByKey = new Map<string, DynamicCaseBoardNode>();
  for (const node of current.nodes) {
    nodeByKey.set(semanticNodeKey(node), node);
    nodeIdRedirect.set(node.id, node.id);
  }
  for (const fresh of incomingNodes) {
    const key = semanticNodeKey(fresh);
    const existing = nodeByKey.get(key);
    if (!existing) {
      nodeByKey.set(key, fresh);
      nodeIdRedirect.set(fresh.id, fresh.id);
      continue;
    }
    nodeIdRedirect.set(fresh.id, existing.id);
    nodeByKey.set(key, {
      ...existing,
      subtitle: fresh.subtitle ?? existing.subtitle,
      detail: fresh.detail ?? existing.detail,
      refId: fresh.refId ?? existing.refId,
      importance: Math.max(existing.importance, fresh.importance) as DynamicCaseBoardNode['importance'],
      certainty: strongerCertainty(existing.certainty, fresh.certainty),
      sourceFactIds: mergeUniqueStrings(existing.sourceFactIds, fresh.sourceFactIds),
      sourceEventIds: mergeUniqueStrings(existing.sourceEventIds, fresh.sourceEventIds),
      sourceClueIds: mergeUniqueStrings(existing.sourceClueIds, fresh.sourceClueIds),
      createdTurn: Math.min(existing.createdTurn, fresh.createdTurn),
      updatedTurn: Math.max(existing.updatedTurn, fresh.updatedTurn),
      status: existing.status === 'archived' && fresh.status !== 'active' ? 'archived' : 'active'
    });
  }

  const visibleNodeIds = visibleCaseBoardNodeIds({
    ...state,
    caseBoard: { ...current, nodes: Array.from(nodeByKey.values()) }
  });
  const incomingEdges = (Array.isArray(patch.edges) ? patch.edges : [])
    .flatMap((item) => {
      const edge = normalizeDynamicCaseBoardEdge(item);
      if (!edge) return [];
      const redirected = {
        ...edge,
        from: nodeIdRedirect.get(edge.from) ?? edge.from,
        to: nodeIdRedirect.get(edge.to) ?? edge.to
      };
      return isSafeDynamicEdge(redirected, state) ? [redirected] : [];
    })
    .filter((edge) => edge.from && edge.to);
  const edgeByKey = new Map<string, DynamicCaseBoardEdge>();
  for (const edge of current.edges) {
    edgeByKey.set(semanticEdgeKey(edge), edge);
  }
  for (const fresh of incomingEdges) {
    if (!visibleNodeIds.has(fresh.from) || !visibleNodeIds.has(fresh.to)) continue;
    const key = semanticEdgeKey(fresh);
    const existing = edgeByKey.get(key);
    if (!existing) {
      edgeByKey.set(key, fresh);
      continue;
    }
    edgeByKey.set(key, {
      ...existing,
      label: fresh.label ?? existing.label,
      certainty: strongerCertainty(existing.certainty, fresh.certainty),
      sourceFactIds: mergeUniqueStrings(existing.sourceFactIds, fresh.sourceFactIds),
      sourceEventIds: mergeUniqueStrings(existing.sourceEventIds, fresh.sourceEventIds),
      sourceClueIds: mergeUniqueStrings(existing.sourceClueIds, fresh.sourceClueIds),
      createdTurn: Math.min(existing.createdTurn, fresh.createdTurn),
      updatedTurn: Math.max(existing.updatedTurn, fresh.updatedTurn),
      status: existing.status === 'archived' && fresh.status !== 'active' ? 'archived' : 'active'
    });
  }

  const incomingInsights = (Array.isArray(patch.insights) ? patch.insights : [])
    .flatMap((item) => {
      const insight = normalizeCaseBoardInsight(item);
      if (!insight || !visibleNodeIds.has(nodeIdRedirect.get(insight.ownerNodeId) ?? insight.ownerNodeId)) return [];
      const redirected = {
        ...insight,
        ownerNodeId: nodeIdRedirect.get(insight.ownerNodeId) ?? insight.ownerNodeId
      };
      return isSafeCaseBoardInsight(redirected, state) ? [redirected] : [];
    });
  const insightBySlot = new Map<string, CaseBoardInsight>();
  for (const insight of current.insights ?? []) insightBySlot.set(insight.slotKey, insight);
  for (const fresh of incomingInsights) {
    const existing = insightBySlot.get(fresh.slotKey);
    if (!existing) {
      insightBySlot.set(fresh.slotKey, fresh);
      continue;
    }
    insightBySlot.set(fresh.slotKey, {
      ...existing,
      ownerNodeId: fresh.ownerNodeId,
      kind: fresh.kind,
      text: fresh.text,
      detail: fresh.detail ?? existing.detail,
      certainty: strongerCertainty(existing.certainty, fresh.certainty),
      sourceFactIds: mergeUniqueStrings(existing.sourceFactIds, fresh.sourceFactIds),
      sourceEventIds: mergeUniqueStrings(existing.sourceEventIds, fresh.sourceEventIds),
      sourceClueIds: mergeUniqueStrings(existing.sourceClueIds, fresh.sourceClueIds),
      createdTurn: Math.min(existing.createdTurn, fresh.createdTurn),
      updatedTurn: Math.max(existing.updatedTurn, fresh.updatedTurn),
      status: 'active'
    });
  }

  const edgeValues = Array.from(edgeByKey.values());
  const degree = new Map<string, number>();
  edgeValues.filter((edge) => edge.status === 'active').forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  });
  const connectedNodes = Array.from(nodeByKey.values()).map((node) => {
    if (node.status === 'archived' || node.refId) return node;
    const requiredDegree = node.type === 'theory' ? 2 : 1;
    return (degree.get(node.id) ?? 0) >= requiredDegree
      ? node
      : { ...node, status: 'archived' as const };
  });
  const nodes = archiveOverflow(connectedNodes, CASE_BOARD_NODE_CAP);
  const boardWithMergedNodes: CaseBoardState = {
    nodes,
    edges: edgeValues,
    insights: Array.from(insightBySlot.values()),
    lastUpdatedTurn: current.lastUpdatedTurn
  };
  const activeEndpointIds = visibleCaseBoardNodeIds({ ...state, caseBoard: boardWithMergedNodes });
  const edges = archiveOverflow(edgeValues.map((edge) =>
    activeEndpointIds.has(edge.from) && activeEndpointIds.has(edge.to)
      ? edge
      : { ...edge, status: 'archived' as const }
  ), CASE_BOARD_EDGE_CAP);
  const insights = archiveOverflow(Array.from(insightBySlot.values()), CASE_BOARD_INSIGHT_CAP);
  const lastUpdatedTurn = Math.max(
    current.lastUpdatedTurn,
    ...incomingNodes.map((node) => node.updatedTurn),
    ...incomingEdges.map((edge) => edge.updatedTurn),
    ...incomingInsights.map((insight) => insight.updatedTurn),
    0
  );
  return { ...state, caseBoard: { nodes, edges, insights, lastUpdatedTurn } };
}

function migrateLegacyCaseBoard(state: GameState): GameState {
  const board = state.caseBoard;
  if (!board) return state;
  const factById = new Map((state.atomicFacts ?? []).map((fact) => [fact.id, fact]));
  const convertedFacts = new Map<string, AtomicFact>();
  const retainedNodes = board.nodes.filter((node) => {
    const facts = node.sourceFactIds.flatMap((factId) => {
      const fact = factById.get(factId);
      return fact ? [fact] : [];
    });
    const canFold = facts.length > 0 && facts.every((fact) => fact.actor !== 'world');
    if (!canFold) return true;
    facts.forEach((fact) => convertedFacts.set(fact.id, fact));
    return false;
  });
  const baseState: GameState = {
    ...state,
    caseBoard: {
      nodes: retainedNodes,
      edges: board.edges,
      insights: [],
      lastUpdatedTurn: board.lastUpdatedTurn
    }
  };
  const visibleIds = visibleCaseBoardNodeIds(baseState);
  baseState.caseBoard = {
    ...baseState.caseBoard!,
    edges: board.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
  };
  return applyCaseBoardPatch(
    baseState,
    buildFactCaseBoardPatch(baseState, Array.from(convertedFacts.values()))
  );
}

function mergeStanceFactsIntoMindModels(
  prevModels: Record<string, NpcMindModel>,
  facts: readonly AtomicFact[],
  retainedFactIds: ReadonlySet<string>
): Record<string, NpcMindModel> {
  let nextModels = prevModels;
  const ensureMutable = () => {
    if (nextModels === prevModels) nextModels = { ...prevModels };
  };

  for (const fact of facts) {
    if (fact.predicate !== 'stance_toward') continue;
    if (!storyData.npcs[fact.actor]) continue;
    if (!retainedFactIds.has(fact.id)) continue;

    const existing = nextModels[fact.actor];
    const previousHistory = existing?.stanceHistoryFactIds ?? [];
    const prunedHistory = previousHistory.filter((idVal) => retainedFactIds.has(idVal));
    const stanceHistoryFactIds = prunedHistory.includes(fact.id)
      ? prunedHistory
      : [...prunedHistory, fact.id];

    ensureMutable();
    const merged: NpcMindModel = {
      npcId: fact.actor,
      coreMotivation: existing?.coreMotivation ?? '',
      currentStance: existing?.currentStance ?? '',
      stanceHistoryFactIds,
      lastUpdatedTurn: Math.max(existing?.lastUpdatedTurn ?? 0, fact.turn)
    };
    if (existing?.playerExceptions && Object.keys(existing.playerExceptions).length) {
      merged.playerExceptions = { ...existing.playerExceptions };
    }
    nextModels[fact.actor] = merged;
  }

  return nextModels;
}

function normalizeTriggeredIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const text = stringValue(item);
    if (text) out.push(text);
  }
  return out;
}

function normalizeAiResponse(value: AiResponse, state: GameState): AiResponse {
  const response = isRecord(value) ? value : {};
  const stateUpdate = isRecord(response.stateUpdate) ? response.stateUpdate : {};
  const sceneChange = hasOwn(stateUpdate, 'sceneChange') && stateUpdate.sceneChange
    ? normalizeSceneId(stateUpdate.sceneChange, state.currentScene)
    : null;
  const fallbackByPlayerId = state.suggestionsByPlayerId ?? {};
  const playerChoices = normalizeSuggestionsByPlayerId(
    response.playerChoices,
    state.players,
    fallbackByPlayerId,
    state.suggestions
  );

  const normalizedCheck = normalizeCheck(response.check, state.players);
  const normalized: AiResponse = {
    narrative: typeof response.narrative === 'string' ? response.narrative : undefined,
    check: normalizedCheck ? prepareCheck(normalizedCheck, state.players) : null,
    stateUpdate: {
      hp: normalizeStatUpdate(stateUpdate.hp),
      san: normalizeStatUpdate(stateUpdate.san),
      flags: isRecord(stateUpdate.flags) ? stateUpdate.flags : {},
      newItems: normalizeNewItems(stateUpdate.newItems),
      sceneChange,
      scheduledConsequences: normalizeScheduledConsequences(stateUpdate.scheduledConsequences),
      triggeredConsequenceIds: normalizeTriggeredIds(stateUpdate.triggeredConsequenceIds)
      ,storyEventIds: normalizeTriggeredIds(stateUpdate.storyEventIds)
    },
    nextPrompt: typeof response.nextPrompt === 'string' ? response.nextPrompt : undefined,
    playerChoices,
    keywords: normalizeNarrativeKeywordHints(response.keywords, typeof response.narrative === 'string' ? response.narrative : '')
  };

  if (hasOwn(response, 'activeNpc')) {
    normalized.activeNpc = normalizeNpcName(response.activeNpc);
  }

  return normalized;
}

export function createInitialGameState(players: Investigator[]): GameState {
  const startScene = scenarioDefinition.manifest.startSceneId;
  const activeNpcName = defaultActiveNpcForScene(startScene);
  const locations = Object.fromEntries(players.map((player) => [player.id, startScene]));
  const suggestionsByPlayerId = defaultSuggestionsForPlayers(players);
  const suggestions = firstSuggestionListByPlayerOrder(
    suggestionsByPlayerId,
    players,
    scenarioDefinition.presentation.initialSuggestions
  );
  return {
    players,
    exploreMode: 'together',
    currentSplitPlayer: 0,
    currentActorIndex: 0,
    playerLocations: locations,
    declarations: {},
    pendingCheck: null,
    currentScene: startScene,
    activeNpcId: npcIdFromName(activeNpcName),
    activeNpcName,
    clues: [],
    flags: {},
    actionLog: [{ time: time(), text: '游戏开始 · 摩勒住宅' }],
    conversationHistory: [],
    messages: [{ id: id(), type: 'dm', text: initialMessage, npcName: null }],
    suggestions,
    suggestionsByPlayerId,
    isThinking: false,
    longTermMemorySummary: '',
    summarizedUntilIndex: 0,
    eventLog: [],
    pendingConsequences: [],
    atomicFacts: [],
    npcMindModels: {},
    prospectiveIntents: [],
    episodicMemory: [],
    caseBoard: { nodes: [], edges: [], insights: [], lastUpdatedTurn: 0 },
    scenarioProgress: createScenarioProgress()
  };
}

export function hydrateGameState(value: unknown): GameState {
  const source = isRecord(value) ? value : {};
  const rawPlayers = Array.isArray(source.players) && source.players.length ? source.players : [];
  const players = rawPlayers
    .map((player, index) => normalizeInvestigator(player, index))
    .filter((player): player is Investigator => Boolean(player));
  const base = createInitialGameState(players);
  const persistedScene = normalizeSceneId(source.currentScene, base.currentScene);
  const exploreMode = source.exploreMode === 'split' ? 'split' : 'together';
  const currentSplitPlayer = players.length
    ? clamp(Math.floor(numberValue(source.currentSplitPlayer, 0)), 0, players.length - 1)
    : 0;
  const persistedLocations = normalizePlayerLocations(source.playerLocations, players, persistedScene);
  const splitPlayer = players[currentSplitPlayer];
  const currentScene = exploreMode === 'split' && splitPlayer
    ? persistedLocations[splitPlayer.id] ?? persistedScene
    : persistedScene;
  const playerLocations = exploreMode === 'together'
    ? Object.fromEntries(players.map((player) => [player.id, currentScene])) as Record<string, SceneId>
    : persistedLocations;
  const rawHistory = normalizeConversationHistory(source.conversationHistory);
  const rawSuggestionsByPlayerId = normalizeSuggestionsByPlayerId(
    source.suggestionsByPlayerId ?? source.suggestions,
    players,
    base.suggestionsByPlayerId,
    base.suggestions
  );
  const rawSuggestions = normalizeStringList(
    source.suggestions,
    firstSuggestionListByPlayerOrder(rawSuggestionsByPlayerId, players, base.suggestions)
  );
  const atomicFacts = normalizeAtomicFacts(source.atomicFacts);
  const rawCaseBoard = isRecord(source.caseBoard) ? source.caseBoard : null;
  const needsCaseBoardV7Migration = Boolean(rawCaseBoard && !Array.isArray(rawCaseBoard.insights));
  const normalizedClues = normalizeClues(source.clues);
  const scenarioProgress = hydrateScenarioProgress(source.scenarioProgress, {
    currentScene,
    clueIds: normalizedClues.map((clue) => clue.id),
    flags: isRecord(source.flags) ? source.flags : {},
    turn: countCompletedGameTurns(rawHistory)
  });
  const withdrewAutomaticPharmacyMap = currentScene === 'S04'
    && scenarioProgress.clueStates.I07 === 'unknown'
    && !scenarioProgress.visitedSceneIds.includes('S05')
    && scenarioProgress.variables.finaleRoute === 'undecided'
    && scenarioProgress.migrationLog.some((entry) =>
      entry.includes('撤回旧版进入药店时自动授予的地图')
    );
  const history = withdrewAutomaticPharmacyMap
    ? rawHistory.filter((turn) => turn.role !== 'assistant' || !referencesWithdrawnPharmacyState(turn.content))
    : rawHistory;
  const normalizedMessages = normalizeMessages(source.messages, history, players, base.messages);
  const messages = withdrewAutomaticPharmacyMap
    ? normalizedMessages.filter((message) =>
        message.type === 'player' || !referencesWithdrawnPharmacyState(message.text)
      )
    : normalizedMessages;
  const staleFinaleSuggestions = currentScene === 'S05'
    && (
      containsPharmacyInvestigationSuggestion(rawSuggestionsByPlayerId)
      || containsInvalidFinaleSuggestion(
        rawSuggestionsByPlayerId,
        scenarioProgress.variables.finaleRoute,
        players,
        scenarioProgress
      )
    );
  const suggestionsByPlayerId = withdrewAutomaticPharmacyMap
    ? pharmacyInvestigationSuggestions(players)
    : staleFinaleSuggestions
      ? buildFinaleSuggestions(
          players,
          scenarioProgress.variables.finaleRoute,
          finaleRemainingOpponents(scenarioProgress)
        )
      : rawSuggestionsByPlayerId;
  const suggestions = withdrewAutomaticPharmacyMap || staleFinaleSuggestions
    ? firstSuggestionListByPlayerOrder(suggestionsByPlayerId, players, base.suggestions)
    : rawSuggestions;
  const persistedNpcName = typeof source.activeNpcId === 'string'
    ? npcNameFromId(source.activeNpcId)
    : normalizeNpcName(source.activeNpcName);
  const activeNpcName = scenarioProgress.endingId
    ? null
    : persistedNpcName && storyData.scenes[currentScene].npcs.includes(persistedNpcName)
      ? persistedNpcName
      : storyData.scenes[currentScene].npcs[0] ?? null;

  const hydrated: GameState = {
    ...base,
    exploreMode,
    currentSplitPlayer,
    currentActorIndex: players.length
      ? clamp(Math.floor(numberValue(source.currentActorIndex, 0)), 0, players.length - 1)
      : 0,
    playerLocations,
    declarations: normalizeDeclarations(source.declarations, players),
    pendingCheck: (() => {
      const check = normalizeCheck(source.pendingCheck, players);
      return restoreAuthoredPendingCheck(check, players, currentScene, scenarioProgress);
    })(),
    currentScene,
    activeNpcId: npcIdFromName(activeNpcName),
    activeNpcName,
    clues: normalizedClues.filter((clue) => scenarioProgress.clueStates[clue.id] !== 'unknown'),
    flags: isRecord(source.flags) ? source.flags : {},
    actionLog: normalizeActionLog(source.actionLog, base.actionLog).filter((entry) =>
      !withdrewAutomaticPharmacyMap || !entry.text.includes('EV_S04_MAP')
    ),
    conversationHistory: history,
    messages,
    suggestions,
    suggestionsByPlayerId,
    isThinking: false,
    longTermMemorySummary: withdrewAutomaticPharmacyMap
      ? ''
      : typeof source.longTermMemorySummary === 'string' ? source.longTermMemorySummary : '',
    summarizedUntilIndex: withdrewAutomaticPharmacyMap
      ? 0
      : Math.max(0, Math.floor(numberValue(source.summarizedUntilIndex, 0))),
    eventLog: normalizeEventLog(source.eventLog),
    pendingConsequences: normalizePendingConsequences(source.pendingConsequences),
    atomicFacts,
    npcMindModels: normalizeNpcMindModels(source.npcMindModels),
    prospectiveIntents: withdrewAutomaticPharmacyMap
      ? []
      : normalizeProspectiveIntents(source.prospectiveIntents),
    episodicMemory: normalizeEpisodicMemory(source.episodicMemory).filter((memory) =>
      !withdrewAutomaticPharmacyMap || !referencesWithdrawnPharmacyState(JSON.stringify(memory))
    ),
    caseBoard: normalizeCaseBoardState(source.caseBoard),
    scenarioProgress
  };
  return needsCaseBoardV7Migration ? migrateLegacyCaseBoard(hydrated) : hydrated;
}

function addMessage(state: GameState, message: Omit<NarrativeMessage, 'id'>): GameState {
  return { ...state, messages: [...state.messages, { ...message, id: id() }] };
}

function addLog(state: GameState, text: string): GameState {
  return {
    ...state,
    actionLog: [{ time: time(), text }, ...state.actionLog].slice(0, ACTION_LOG_LIMIT)
  };
}

function updatePlayerStats(players: Investigator[], response: AiResponse) {
  const hp = response.stateUpdate?.hp ?? {};
  const san = response.stateUpdate?.san ?? {};
  return players.map((player) => ({
    ...player,
    currentHp: clamp(player.currentHp + (hp[player.name] ?? 0), 0, player.hp),
    currentSan: clamp(player.currentSan + (san[player.name] ?? 0), 0, player.san)
  }));
}

function appendNewClues(clues: StoryItem[], ids: string[] | undefined) {
  if (!ids?.length) return clues;
  const seen = new Set(clues.map((item) => item.id));
  const incoming = ids
    .map((itemId) => storyData.items[itemId])
    .filter((item): item is StoryItem => Boolean(item) && !seen.has(item.id))
    .map((item) => ({ ...item, found: true }));
  return [...clues, ...incoming];
}

function applyScenarioTransition(
  state: GameState,
  transition: ReturnType<typeof processScenarioTurn>,
  actorName?: string,
  narratorText = ''
): GameState {
  const discoveredIds = Object.entries(transition.progress.clueStates)
    .filter(([, status]) => status === 'discovered' || status === 'analyzed')
    .map(([clueId]) => clueId);
  const rewardFlags = { ...state.flags };
  for (const delta of transition.deltas) {
    if (delta.field === 'money' || delta.field === 'mythos') {
      const key = `scenario.reward.${delta.field}`;
      rewardFlags[key] = numberValue(rewardFlags[key], 0) + delta.value;
    }
  }
  const players = state.players.map((player) => {
    let hp = player.currentHp;
    let san = player.currentSan;
    for (const delta of transition.deltas) {
      if (delta.field !== 'hp' && delta.field !== 'san') continue;
      if (delta.target === 'actor' && actorName && player.name !== actorName) continue;
      if (delta.target === 'actor' && !actorName) continue;
      if (delta.field === 'hp') hp = clamp(hp + delta.value, 0, player.hp);
      if (delta.field === 'san') san = clamp(san + delta.value, 0, player.san);
    }
    return { ...player, currentHp: hp, currentSan: san };
  });
  let next: GameState = {
    ...state,
    players,
    flags: rewardFlags,
    clues: appendNewClues(state.clues, discoveredIds),
    scenarioProgress: transition.progress,
    activeNpcId: transition.progress.endingId ? null : state.activeNpcId,
    activeNpcName: transition.progress.endingId ? null : state.activeNpcName,
    pendingCheck: (() => {
      const transitioned = transition.requestedCheck
        ? prepareCheck(transition.requestedCheck, state.players)
        : null;
      if (
        transitioned?.scenarioCheckId
        && state.pendingCheck?.scenarioCheckId === transitioned.scenarioCheckId
      ) {
        return prepareCheck(state.pendingCheck, state.players);
      }
      return transitioned ?? state.pendingCheck;
    })()
  };
  const normalizedNarratorText = narratorText.replace(/\s/g, '');
  for (const cue of transition.narrativeCues) {
    if (normalizedNarratorText.includes(cue.replace(/\s/g, ''))) continue;
    next = addMessage(next, { type: 'system', text: cue });
  }
  for (const eventId of transition.firedEventIds) next = addLog(next, `剧情事件：${eventId}`);
  return next;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start':
      return createInitialGameState(action.players);
    case 'restore':
      return hydrateGameState(action.state);
    case 'setThinking':
      return { ...state, isThinking: action.value };
    case 'setExploreMode': {
      const focusedPlayer = state.players[state.currentSplitPlayer];
      const currentScene = action.mode === 'split' && focusedPlayer
        ? state.playerLocations[focusedPlayer.id] ?? state.currentScene
        : state.currentScene;
      const playerLocations = action.mode === 'together'
        ? Object.fromEntries(state.players.map((player) => [player.id, currentScene])) as Record<string, SceneId>
        : state.playerLocations;
      const activeNpcName = resolveActiveNpcForScene({
        previousScene: state.currentScene,
        nextScene: currentScene,
        previousActiveNpc: state.activeNpcName,
        requestedActiveNpcProvided: false
      });
      return addMessage({
        ...state,
        exploreMode: action.mode,
        currentScene,
        playerLocations,
        activeNpcId: npcIdFromName(activeNpcName),
        activeNpcName
      }, {
        type: 'system',
        text: action.mode === 'split' ? '切换为「分头探索」模式。' : '切换为「一起行动」模式。'
      });
    }
    case 'setCurrentActor':
      if (state.exploreMode === 'together') return state;
      return { ...state, currentActorIndex: state.players.length ? clamp(action.index, 0, state.players.length - 1) : 0 };
    case 'setCurrentSplitPlayer': {
      const currentSplitPlayer = state.players.length ? clamp(action.index, 0, state.players.length - 1) : 0;
      if (state.exploreMode !== 'split') return { ...state, currentSplitPlayer };
      const player = state.players[currentSplitPlayer];
      const currentScene = player ? state.playerLocations[player.id] ?? state.currentScene : state.currentScene;
      const activeNpcName = resolveActiveNpcForScene({
        previousScene: state.currentScene,
        nextScene: currentScene,
        previousActiveNpc: state.activeNpcName,
        requestedActiveNpcProvided: false
      });
      return {
        ...state,
        currentSplitPlayer,
        currentScene,
        activeNpcId: npcIdFromName(activeNpcName),
        activeNpcName
      };
    }
    case 'setPlayerScene': {
      const player = state.players[action.playerIndex];
      if (!player) return state;
      const changesFocusedScene = state.exploreMode === 'split' && action.playerIndex === state.currentSplitPlayer;
      const activeNpcName = changesFocusedScene
        ? resolveActiveNpcForScene({
            previousScene: state.currentScene,
            nextScene: action.sceneId,
            previousActiveNpc: state.activeNpcName,
            requestedActiveNpcProvided: false
          })
        : state.activeNpcName;
      return {
        ...state,
        playerLocations: { ...state.playerLocations, [player.id]: action.sceneId },
        ...(changesFocusedScene
          ? {
              currentScene: action.sceneId,
              activeNpcId: npcIdFromName(activeNpcName),
              activeNpcName
            }
          : {})
      };
    }
    case 'setDeclaration':
      return { ...state, declarations: { ...state.declarations, [action.playerId]: action.text } };
    case 'clearDeclarations':
      return { ...state, declarations: {}, currentActorIndex: 0 };
    case 'advanceActor':
      return {
        ...state,
        currentActorIndex: state.players.length
          ? clamp(state.currentActorIndex + 1, 0, state.players.length - 1)
          : 0
      };
    case 'appendMessage':
      return addMessage(state, action.message);
    case 'appendHistory':
      return { ...state, conversationHistory: [...state.conversationHistory, { role: action.role, content: action.content }] };
    case 'setPendingCheck':
      return { ...state, pendingCheck: action.check };
    case 'setSuggestions':
      return { ...state, suggestions: action.suggestions };
    case 'addLog':
      return addLog(state, action.text);
    case 'applyDiceResult': {
      let next = addMessage(addLog({ ...state, pendingCheck: null }, `检定结果：${action.result.roll} · ${action.result.label}`), {
        type: 'system',
        text: `检定结果：${action.result.label}`
      });
      if (state.pendingCheck?.scenarioCheckId) {
        next = applyScenarioTransition(next, processScenarioTurn(getScenarioProgressForState(state), {
          currentScene: state.currentScene,
          turn: countCompletedGameTurns(state.conversationHistory),
          completeTurn: false,
          actorName: state.pendingCheck.player,
          checkResult: { id: state.pendingCheck.scenarioCheckId, outcome: action.result.level }
        }), state.pendingCheck.player);
      }
      return next;
    }
    case 'applyAiResponse': {
      const response = normalizeAiResponse(action.response, state);
      const sceneChange = response.stateUpdate?.sceneChange ?? null;
      const currentScene = sceneChange ?? state.currentScene;

      // 后果队列维护：
      // 1) 本轮被触发的 id 从现有 pending 中移除
      // 2) 其余 pending 衰减一轮（仅当 AI 返回了 triggeredConsequenceIds 才衰减，避免重复）
      // 3) 本轮新调度的 追加到末尾（同 id 覆盖）
      const triggeredIds = new Set(response.stateUpdate?.triggeredConsequenceIds ?? []);
      const scheduledNew = response.stateUpdate?.scheduledConsequences ?? [];
      const prevPending = state.pendingConsequences ?? [];
      const decayed: PersistedPendingConsequence[] = [];
      for (const item of prevPending) {
        if (triggeredIds.has(item.id)) continue;
        decayed.push({ ...item, remainingTurns: Math.max(0, item.remainingTurns - 1) });
      }
      const merged = [...decayed];
      for (const fresh of scheduledNew) {
        const idx = merged.findIndex((p) => p.id === fresh.id);
        if (idx >= 0) merged[idx] = fresh;
        else merged.push(fresh);
      }
      const suggestionsByPlayerId = normalizeSuggestionsByPlayerId(
        response.playerChoices,
        state.players,
        state.suggestionsByPlayerId,
        state.suggestions
      );

      let nextState: GameState = {
        ...state,
        players: updatePlayerStats(state.players, response),
        flags: {
          ...state.flags,
          ...(response.stateUpdate?.flags ?? {}),
          ...(sceneChange ? { [`sceneVisited.${currentScene}`]: true } : {})
        },
        clues: appendNewClues(state.clues, response.stateUpdate?.newItems),
        currentScene,
        playerLocations: sceneChange ? moveFocusedPlayers(state, currentScene) : state.playerLocations,
        activeNpcName: resolveActiveNpcAfterResponse(
          response,
          state.currentScene,
          currentScene,
          state.activeNpcName
        ),
        pendingCheck: response.check ?? null,
        suggestionsByPlayerId,
        suggestions: firstSuggestionListByPlayerOrder(suggestionsByPlayerId, state.players, state.suggestions),
        conversationHistory: [...state.conversationHistory, { role: 'assistant' as const, content: action.raw }],
        isThinking: false,
        currentActorIndex: 0,
        pendingConsequences: merged
      };
      nextState.activeNpcId = npcIdFromName(nextState.activeNpcName);
      const scenarioTransition = processScenarioTurn(getScenarioProgressForState(state), {
        currentScene,
        previousScene: sceneChange ? state.currentScene : undefined,
        storyEventIds: response.stateUpdate?.storyEventIds,
        turn: countCompletedGameTurns(state.conversationHistory),
        completeTurn: !response.check,
        actorName: action.actorName ?? state.players[state.currentActorIndex]?.name
      });
      nextState = applyScenarioTransition(
        nextState,
        scenarioTransition,
        action.actorName ?? state.players[state.currentActorIndex]?.name,
        response.narrative
      );
      const settledEnding = !getScenarioProgressForState(state).endingId
        && nextState.scenarioProgress?.endingId
        ? scenarioDefinition.progression.endings.find(
            (ending) => ending.id === nextState.scenarioProgress?.endingId
          ) ?? null
        : null;
      const settledFinaleRoute = nextState.scenarioProgress?.variables.finaleRoute;
      const previousFinaleRoute = getScenarioProgressForState(state).variables.finaleRoute;
      const invalidFinaleSuggestions = nextState.currentScene === 'S05'
        && containsInvalidFinaleSuggestion(
          nextState.suggestionsByPlayerId,
          settledFinaleRoute,
          nextState.players,
          getScenarioProgressForState(nextState)
        );
      if (
        nextState.currentScene === 'S05'
        && (((settledFinaleRoute === 'combat' || settledFinaleRoute === 'negotiation')
          && previousFinaleRoute !== settledFinaleRoute)
          || invalidFinaleSuggestions)
      ) {
        const settledProgress = getScenarioProgressForState(nextState);
        const routeSuggestions = buildFinaleSuggestions(
          nextState.players,
          settledFinaleRoute,
          finaleRemainingOpponents(settledProgress)
        );
        nextState = {
          ...nextState,
          suggestionsByPlayerId: routeSuggestions,
          suggestions: firstSuggestionListByPlayerOrder(routeSuggestions, nextState.players, nextState.suggestions)
        };
      }
      if (response.narrative && !settledEnding) {
        nextState = addMessage(nextState, {
          type: 'dm',
          text: response.narrative,
          npcName: response.activeNpc ?? null,
          keywords: response.keywords?.length ? response.keywords : undefined
        });
      }
      return addLog(
        nextState,
        settledEnding
          ? `${settledEnding.title}：${settledEnding.summary}`
          : response.narrative?.slice(0, 60) || 'AI DM 响应'
      );
    }
    case 'appendEvents': {
      if (!action.events.length) return state;
      const prev = state.eventLog ?? [];
      const next = [...prev, ...action.events].slice(-200);
      return { ...state, eventLog: next };
    }
    case 'consolidateMemory': {
      const suffix = typeof action.sourceHistoryLength === 'number'
        && state.conversationHistory.length > action.sourceHistoryLength
        ? state.conversationHistory.slice(action.sourceHistoryLength)
        : [];
      return {
        ...state,
        longTermMemorySummary: action.summary,
        summarizedUntilIndex: action.summarizedUntilIndex,
        conversationHistory: [...action.remainingHistory, ...suffix]
      };
    }
    case 'appendFacts': {
      if (!action.facts.length) return state;
      const prev = state.atomicFacts ?? [];
      const seen = new Set(prev.map((f) => f.id));
      const incoming: AtomicFact[] = [];
      for (const fact of action.facts) {
        if (!fact || !fact.id || seen.has(fact.id)) continue;
        seen.add(fact.id);
        incoming.push(fact);
      }
      if (!incoming.length) return state;
      const next = [...prev, ...incoming].slice(-FACT_CAP);
      const retainedFactIds = new Set(next.map((f) => f.id));
      const npcMindModels = mergeStanceFactsIntoMindModels(
        state.npcMindModels ?? {},
        incoming,
        retainedFactIds
      );
      return { ...state, atomicFacts: next, npcMindModels };
    }
    case 'updateNpcMindModel': {
      const prev = state.npcMindModels ?? {};
      const existing = prev[action.npcId];
      const merged: NpcMindModel = {
        npcId: action.npcId,
        coreMotivation: action.partial.coreMotivation ?? existing?.coreMotivation ?? '',
        currentStance: action.partial.currentStance ?? existing?.currentStance ?? '',
        stanceHistoryFactIds:
          action.partial.stanceHistoryFactIds ?? existing?.stanceHistoryFactIds ?? [],
        lastUpdatedTurn:
          action.partial.lastUpdatedTurn ?? existing?.lastUpdatedTurn ?? 0
      };
      const exceptions = action.partial.playerExceptions ?? existing?.playerExceptions;
      if (exceptions && Object.keys(exceptions).length) {
        merged.playerExceptions = { ...exceptions };
      }
      return { ...state, npcMindModels: { ...prev, [action.npcId]: merged } };
    }
    case 'addProspectiveIntents': {
      if (!action.intents.length) return state;
      const prev = state.prospectiveIntents ?? [];
      const seen = new Set(prev.map((intent) => intent.id));
      const incoming: ProspectiveIntent[] = [];
      for (const intent of action.intents) {
        if (!intent || !intent.id || seen.has(intent.id)) continue;
        seen.add(intent.id);
        incoming.push(intent);
      }
      if (!incoming.length) return state;
      const next = [...prev, ...incoming].slice(-INTENT_CAP);
      return { ...state, prospectiveIntents: next };
    }
    case 'appendEpisodicMemory': {
      if (!action.records.length) return state;
      const prev = state.episodicMemory ?? [];
      const seen = new Set(prev.map((record) => record.id));
      const incoming: EpisodicMemoryRecord[] = [];
      for (const record of action.records) {
        if (!record || !record.id || !record.text || seen.has(record.id)) continue;
        seen.add(record.id);
        incoming.push(record);
      }
      if (!incoming.length) return state;
      return { ...state, episodicMemory: [...prev, ...incoming].slice(-EPISODIC_MEMORY_CAP) };
    }
    case 'applyCaseBoardPatch':
      return applyCaseBoardPatch(state, action.patch);
    case 'consumeProspectiveIntent': {
      const prev = state.prospectiveIntents ?? [];
      const next = prev.filter((intent) => intent.id !== action.id);
      if (next.length === prev.length) return state;
      return { ...state, prospectiveIntents: next };
    }
    case 'decayProspectiveIntents': {
      const prev = state.prospectiveIntents ?? [];
      if (!prev.length) return state;
      const next = prev
        .map((intent) => ({ ...intent, ttl: intent.ttl - 1 }))
        .filter((intent) => intent.ttl > 0);
      if (next.length === prev.length && next.every((n, i) => n.ttl === prev[i].ttl)) {
        return state;
      }
      return { ...state, prospectiveIntents: next };
    }
    default:
      return state;
  }
}
