import type { AiResponse, AtomicFact, Attributes, CheckRequest, DiceResult, EpisodicMemoryRecord, EpisodicMemorySource, EpisodicMemoryVisibility, FactPredicate, GameState, Investigator, NarrativeMessage, NpcMindModel, PersistedDMEvent, PersistedPendingConsequence, ProspectiveIntent, SceneId, SkillValue, StoryItem } from '../types/game';
import { storyData } from '../data/storyData';
import { allSkills } from '../data/skills';
import { deriveInvestigatorStats, gameRules, resolveSkillBase } from '../data/gameRules';

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
  | { type: 'applyAiResponse'; response: AiResponse; raw: string }
  | { type: 'setPendingCheck'; check: CheckRequest | null }
  | { type: 'applyDiceResult'; result: DiceResult }
  | { type: 'setSuggestions'; suggestions: string[] }
  | { type: 'addLog'; text: string }
  | { type: 'appendEvents'; events: PersistedDMEvent[] }
  | { type: 'consolidateMemory'; summary: string; summarizedUntilIndex: number; remainingHistory: GameState['conversationHistory'] }
  | { type: 'appendFacts'; facts: AtomicFact[] }
  | { type: 'updateNpcMindModel'; npcId: string; partial: Partial<NpcMindModel> }
  | { type: 'addProspectiveIntents'; intents: ProspectiveIntent[] }
  | { type: 'appendEpisodicMemory'; records: EpisodicMemoryRecord[] }
  | { type: 'consumeProspectiveIntent'; id: string }
  | { type: 'decayProspectiveIntents' };

const initialMessage = `${storyData.era}。\n\n雨夜的伦敦裹在浓雾之中，煤气灯的光晕在水汽里渗散开来。你们站在纽伦上街101号的门廊下，手中握着伊莎贝拉·摩勒小姐的求助信。\n\n信中写道：「我父亲埃里克·摩勒于三日前失踪，警察局毫无进展。若您能找到他，必有重谢。」`;

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function time() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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

  return {
    skill: stringValue(value.skill, '侦查'),
    difficulty: normalizeDifficulty(value.difficulty),
    player,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    threshold: typeof value.threshold === 'number' ? value.threshold : undefined,
    skillVal: typeof value.skillVal === 'number' ? value.skillVal : undefined
  };
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

function narrativeFromHistoryContent(content: string) {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { narrative?: unknown };
      if (typeof parsed.narrative === 'string' && parsed.narrative.trim()) return parsed.narrative;
    }
  } catch {
    // Keep the raw content if the assistant turn was not strict JSON.
  }
  return content;
}

function normalizeMessages(value: unknown, history: GameState['conversationHistory'], players: Investigator[], fallback: NarrativeMessage[]) {
  if (Array.isArray(value)) {
    const messages = value.flatMap((item) => {
      if (!isRecord(item)) return [];
      const text = typeof item.text === 'string' ? item.text : '';
      if (!text) return [];
      const type: NarrativeMessage['type'] = item.type === 'player' || item.type === 'system' ? item.type : 'dm';
      return [{
        id: stringValue(item.id, id()),
        type,
        text,
        playerName: typeof item.playerName === 'string' ? item.playerName : undefined,
        npcName: typeof item.npcName === 'string' ? item.npcName : null
      }];
    });
    if (messages.length) return messages;
  }

  if (history.length) {
    return history.map((turn): NarrativeMessage => ({
      id: id(),
      type: turn.role === 'assistant' ? 'dm' : 'player',
      text: turn.role === 'assistant' ? narrativeFromHistoryContent(turn.content) : turn.content,
      playerName: turn.role === 'user' ? players[0]?.name : undefined,
      npcName: null
    }));
  }

  return fallback;
}

function normalizeActionLog(value: unknown, fallback: GameState['actionLog']) {
  if (!Array.isArray(value)) return fallback;
  const logs = value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const text = typeof item.text === 'string' ? item.text : '';
    if (!text) return [];
    return [{ time: stringValue(item.time, time()), text }];
  });
  return logs.length ? logs.slice(0, 40) : fallback;
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

function resolveActiveNpcName(response: AiResponse, currentScene: SceneId, previous: string | null) {
  if (hasOwn(response, 'activeNpc')) return normalizeNpcName(response.activeNpc);
  return previous && storyData.npcs[previous] ? previous : storyData.scenes[currentScene].npcs[0] ?? null;
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

  const normalized: AiResponse = {
    narrative: typeof response.narrative === 'string' ? response.narrative : undefined,
    check: normalizeCheck(response.check, state.players),
    stateUpdate: {
      hp: normalizeStatUpdate(stateUpdate.hp),
      san: normalizeStatUpdate(stateUpdate.san),
      flags: isRecord(stateUpdate.flags) ? stateUpdate.flags : {},
      newItems: normalizeNewItems(stateUpdate.newItems),
      sceneChange,
      scheduledConsequences: normalizeScheduledConsequences(stateUpdate.scheduledConsequences),
      triggeredConsequenceIds: normalizeTriggeredIds(stateUpdate.triggeredConsequenceIds)
    },
    nextPrompt: typeof response.nextPrompt === 'string' ? response.nextPrompt : undefined,
    playerChoices: normalizeStringList(response.playerChoices, state.suggestions)
  };

  if (hasOwn(response, 'activeNpc')) {
    normalized.activeNpc = normalizeNpcName(response.activeNpc);
  }

  return normalized;
}

export function createInitialGameState(players: Investigator[]): GameState {
  const locations = Object.fromEntries(players.map((player) => [player.id, 'S01' as SceneId]));
  return {
    players,
    exploreMode: 'together',
    currentSplitPlayer: 0,
    currentActorIndex: 0,
    playerLocations: locations,
    declarations: {},
    pendingCheck: null,
    currentScene: 'S01',
    activeNpcName: '伊莎贝拉·摩勒',
    clues: [],
    flags: {},
    actionLog: [{ time: time(), text: '游戏开始 · 摩勒住宅' }],
    conversationHistory: [],
    messages: [{ id: id(), type: 'dm', text: initialMessage, npcName: null }],
    suggestions: ['侦查周围', '询问伊莎贝拉', '检查书房'],
    isThinking: false,
    longTermMemorySummary: '',
    summarizedUntilIndex: 0,
    eventLog: [],
    pendingConsequences: [],
    atomicFacts: [],
    npcMindModels: {},
    prospectiveIntents: [],
    episodicMemory: []
  };
}

export function hydrateGameState(value: unknown): GameState {
  const source = isRecord(value) ? value : {};
  const rawPlayers = Array.isArray(source.players) && source.players.length ? source.players : [];
  const players = rawPlayers
    .map((player, index) => normalizeInvestigator(player, index))
    .filter((player): player is Investigator => Boolean(player));
  const base = createInitialGameState(players);
  const currentScene = normalizeSceneId(source.currentScene, base.currentScene);
  const history = normalizeConversationHistory(source.conversationHistory);

  return {
    ...base,
    exploreMode: source.exploreMode === 'split' ? 'split' : 'together',
    currentSplitPlayer: players.length
      ? clamp(Math.floor(numberValue(source.currentSplitPlayer, 0)), 0, players.length - 1)
      : 0,
    currentActorIndex: players.length
      ? clamp(Math.floor(numberValue(source.currentActorIndex, 0)), 0, players.length - 1)
      : 0,
    playerLocations: normalizePlayerLocations(source.playerLocations, players, currentScene),
    declarations: normalizeDeclarations(source.declarations, players),
    pendingCheck: normalizeCheck(source.pendingCheck, players),
    currentScene,
    activeNpcName: normalizeNpcName(source.activeNpcName) ?? storyData.scenes[currentScene].npcs[0] ?? null,
    clues: normalizeClues(source.clues),
    flags: isRecord(source.flags) ? source.flags : {},
    actionLog: normalizeActionLog(source.actionLog, base.actionLog),
    conversationHistory: history,
    messages: normalizeMessages(source.messages, history, players, base.messages),
    suggestions: normalizeStringList(source.suggestions, base.suggestions),
    isThinking: false,
    longTermMemorySummary:
      typeof source.longTermMemorySummary === 'string' ? source.longTermMemorySummary : '',
    summarizedUntilIndex: Math.max(0, Math.floor(numberValue(source.summarizedUntilIndex, 0))),
    eventLog: normalizeEventLog(source.eventLog),
    pendingConsequences: normalizePendingConsequences(source.pendingConsequences),
    atomicFacts: normalizeAtomicFacts(source.atomicFacts),
    npcMindModels: normalizeNpcMindModels(source.npcMindModels),
    prospectiveIntents: normalizeProspectiveIntents(source.prospectiveIntents),
    episodicMemory: normalizeEpisodicMemory(source.episodicMemory)
  };
}

function addMessage(state: GameState, message: Omit<NarrativeMessage, 'id'>): GameState {
  return { ...state, messages: [...state.messages, { ...message, id: id() }] };
}

function addLog(state: GameState, text: string): GameState {
  return { ...state, actionLog: [{ time: time(), text }, ...state.actionLog].slice(0, 40) };
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

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'start':
      return createInitialGameState(action.players);
    case 'restore':
      return hydrateGameState(action.state);
    case 'setThinking':
      return { ...state, isThinking: action.value };
    case 'setExploreMode':
      return addMessage({ ...state, exploreMode: action.mode }, {
        type: 'system',
        text: action.mode === 'split' ? '切换为「分头探索」模式。' : '切换为「一起行动」模式。'
      });
    case 'setCurrentActor':
      if (state.exploreMode === 'together') return state;
      return { ...state, currentActorIndex: state.players.length ? clamp(action.index, 0, state.players.length - 1) : 0 };
    case 'setCurrentSplitPlayer':
      return { ...state, currentSplitPlayer: state.players.length ? clamp(action.index, 0, state.players.length - 1) : 0 };
    case 'setPlayerScene': {
      const player = state.players[action.playerIndex];
      if (!player) return state;
      return {
        ...state,
        playerLocations: { ...state.playerLocations, [player.id]: action.sceneId }
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
    case 'applyDiceResult':
      return addMessage(addLog(state, `检定结果：${action.result.roll} · ${action.result.label}`), {
        type: 'system',
        text: `检定结果：${action.result.label}`
      });
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

      let nextState: GameState = {
        ...state,
        players: updatePlayerStats(state.players, response),
        flags: { ...state.flags, ...(response.stateUpdate?.flags ?? {}) },
        clues: appendNewClues(state.clues, response.stateUpdate?.newItems),
        currentScene,
        activeNpcName: resolveActiveNpcName(response, currentScene, state.activeNpcName),
        pendingCheck: response.check ?? null,
        suggestions: response.playerChoices ?? state.suggestions,
        conversationHistory: [...state.conversationHistory, { role: 'assistant' as const, content: action.raw }],
        isThinking: false,
        currentActorIndex: 0,
        pendingConsequences: merged
      };
      if (response.narrative) {
        nextState = addMessage(nextState, { type: 'dm', text: response.narrative, npcName: response.activeNpc ?? null });
      }
      return addLog(nextState, response.narrative?.slice(0, 60) || 'AI DM 响应');
    }
    case 'appendEvents': {
      if (!action.events.length) return state;
      const prev = state.eventLog ?? [];
      const next = [...prev, ...action.events].slice(-200);
      return { ...state, eventLog: next };
    }
    case 'consolidateMemory': {
      return {
        ...state,
        longTermMemorySummary: action.summary,
        summarizedUntilIndex: action.summarizedUntilIndex,
        conversationHistory: action.remainingHistory
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
