import type { AiResponse, CheckRequest, DiceResult, GameState, Investigator, NarrativeMessage, SceneId, StoryItem } from '../types/game';
import { storyData } from '../data/storyData';

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
    currentHp: Math.max(0, player.currentHp + (hp[player.name] ?? 0)),
    currentSan: Math.max(0, player.currentSan + (san[player.name] ?? 0))
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
      return action.state;
    case 'setThinking':
      return { ...state, isThinking: action.value };
    case 'setExploreMode':
      return addMessage({ ...state, exploreMode: action.mode }, {
        type: 'system',
        text: action.mode === 'split' ? '切换为「分头探索」模式。' : '切换为「一起行动」模式。'
      });
    case 'setCurrentSplitPlayer':
      return { ...state, currentSplitPlayer: action.index };
    case 'setPlayerScene':
      return {
        ...state,
        playerLocations: { ...state.playerLocations, [state.players[action.playerIndex]?.id]: action.sceneId }
      };
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
      const response = action.response;
      const sceneChange = response.stateUpdate?.sceneChange ?? null;
      const currentScene = sceneChange ?? state.currentScene;
      let nextState: GameState = {
        ...state,
        players: updatePlayerStats(state.players, response),
        flags: { ...state.flags, ...(response.stateUpdate?.flags ?? {}) },
        clues: appendNewClues(state.clues, response.stateUpdate?.newItems),
        currentScene,
        activeNpcName: response.activeNpc ?? storyData.scenes[currentScene].npcs[0] ?? null,
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
