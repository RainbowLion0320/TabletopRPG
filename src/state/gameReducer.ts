import type { AiResponse, Attributes, CheckRequest, DiceResult, GameState, Investigator, NarrativeMessage, SceneId, SkillValue, StoryItem } from '../types/game';
import { storyData } from '../data/storyData';
import { allSkills } from '../data/skills';

export type GameAction =
  | { type: 'start'; players: Investigator[] }
  | { type: 'restore'; state: GameState }
  | { type: 'setThinking'; value: boolean }
  | { type: 'setExploreMode'; mode: GameState['exploreMode'] }
  | { type: 'setCurrentSplitPlayer'; index: number }
  | { type: 'setPlayerScene'; playerIndex: number; sceneId: SceneId }
  | { type: 'setDeclaration'; playerId: string; text: string }
  | { type: 'clearDeclarations' }
  | { type: 'appendMessage'; message: Omit<NarrativeMessage, 'id'> }
  | { type: 'appendHistory'; role: 'user' | 'assistant'; content: string }
  | { type: 'applyAiResponse'; response: AiResponse; raw: string }
  | { type: 'setPendingCheck'; check: CheckRequest | null }
  | { type: 'applyDiceResult'; result: DiceResult }
  | { type: 'setSuggestions'; suggestions: string[] }
  | { type: 'addLog'; text: string };

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

const defaultAttrs: Attributes = {
  STR: 50,
  CON: 50,
  SIZ: 50,
  DEX: 50,
  APP: 50,
  INT: 50,
  POW: 50,
  EDU: 50,
  Luck: 50
};

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

function baseSkillValue(base: number | 'EDU' | 'DEX×2', attrs: Attributes) {
  if (base === 'EDU') return attrs.EDU;
  if (base === 'DEX×2') return attrs.DEX * 2;
  return base;
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
    const base = baseSkillValue(skill.base, attrs);
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
  const hp = Math.max(1, Math.floor(numberValue(value.hp, Math.floor((attrs.CON + attrs.SIZ) / 10))));
  const mp = Math.max(0, Math.floor(numberValue(value.mp, Math.floor(attrs.POW / 5))));
  const san = Math.max(0, Math.floor(numberValue(value.san, attrs.POW)));
  const name = stringValue(value.name, `调查员${index + 1}`);
  const idValue = stringValue(value.id, `player-${index + 1}`);

  return {
    id: idValue,
    name,
    gender: stringValue(value.gender, '未知'),
    age: Math.max(0, Math.floor(numberValue(value.age, 30))),
    hometown: stringValue(value.hometown, '伦敦'),
    job: stringValue(value.job, '调查员'),
    role: typeof value.role === 'string' ? value.role : undefined,
    attrs,
    hp,
    mp,
    san,
    luck: numberValue(value.luck, attrs.Luck),
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
  }).slice(-32);
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
      sceneChange
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
    isThinking: false
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
    isThinking: false
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
      return { ...state, declarations: {} };
    case 'appendMessage':
      return addMessage(state, action.message);
    case 'appendHistory':
      return { ...state, conversationHistory: [...state.conversationHistory, { role: action.role, content: action.content }].slice(-32) };
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
      let nextState: GameState = {
        ...state,
        players: updatePlayerStats(state.players, response),
        flags: { ...state.flags, ...(response.stateUpdate?.flags ?? {}) },
        clues: appendNewClues(state.clues, response.stateUpdate?.newItems),
        currentScene,
        activeNpcName: resolveActiveNpcName(response, currentScene, state.activeNpcName),
        pendingCheck: response.check ?? null,
        suggestions: response.playerChoices ?? state.suggestions,
        conversationHistory: [...state.conversationHistory, { role: 'assistant' as const, content: action.raw }].slice(-32),
        isThinking: false
      };
      if (response.narrative) {
        nextState = addMessage(nextState, { type: 'dm', text: response.narrative, npcName: response.activeNpc ?? null });
      }
      if (!response.check && response.nextPrompt) {
        nextState = addMessage(nextState, { type: 'system', text: response.nextPrompt });
      }
      return addLog(nextState, response.narrative?.slice(0, 60) || 'AI DM 响应');
    }
    default:
      return state;
  }
}
