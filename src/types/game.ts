export type SceneId = 'S01' | 'S02' | 'S03' | 'S04' | 'S05';

export type ExploreMode = 'together' | 'split';

export type MessageRole = 'dm' | 'player' | 'system';

export interface Attributes {
  STR: number;
  CON: number;
  SIZ: number;
  DEX: number;
  APP: number;
  INT: number;
  POW: number;
  EDU: number;
  Luck: number;
}

export interface SkillValue {
  base: number;
  added: number;
  isJob?: boolean;
}

export interface Investigator {
  id: string;
  name: string;
  portrait?: string;
  gender: string;
  age: number;
  hometown: string;
  job: string;
  role?: string;
  attrs: Attributes;
  hp: number;
  mp: number;
  san: number;
  luck: number;
  currentHp: number;
  currentMp: number;
  currentSan: number;
  skills: Record<string, SkillValue>;
  background?: {
    importantPerson?: string;
    belief?: string;
    meaningfulItem?: string;
    trait?: string;
    story?: string;
  };
}

export interface JobDefinition {
  id: string;
  name: string;
  stars: number;
  desc: string;
  skills: string[];
  eduMult: number;
}

export interface PresetInvestigator {
  id: string;
  name: string;
  portrait: string;
  role: string;
  job: string;
  gender: string;
  age: number;
  hometown: string;
  attrs: Attributes;
  skills: Record<string, number>;
  desc: string;
  background: NonNullable<Investigator['background']>;
}

export interface SkillDefinition {
  name: string;
  base: number | 'EDU' | 'DEX×2';
  group: 'observe' | 'social' | 'know' | 'combat' | 'action' | 'special';
}

export interface SceneDefinition {
  id: SceneId;
  name: string;
  desc: string;
  image: string;
  npcs: string[];
  items: string[];
}

export interface NpcDefinition {
  role: string;
  attitude: '友好' | '中立' | '警惕' | '敌对' | '未知';
  hp: number;
  portrait?: string;
  notes: string;
}

export interface StoryItem {
  id: string;
  name: string;
  scene: SceneId;
  desc: string;
  found?: boolean;
}

export interface StoryData {
  title: string;
  era: string;
  scenes: Record<SceneId, SceneDefinition>;
  npcs: Record<string, NpcDefinition>;
  items: Record<string, StoryItem>;
}

export interface NarrativeMessage {
  id: string;
  type: MessageRole;
  text: string;
  playerName?: string;
  npcName?: string | null;
}

export interface CheckRequest {
  skill: string;
  difficulty: '普通' | '困难' | '极难';
  player: string;
  reason?: string;
  threshold?: number;
  skillVal?: number;
}

export interface DiceResult {
  roll: number;
  level: 'crit' | 'hard' | 'success' | 'fail' | 'fumble';
  label: string;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface PersistedDMEvent {
  id: string;
  turn: number;
  /** 事件分类：scene_change / check / state_update / secret_reveal / consequence / narrative / lookup / schedule */
  kind: string;
  description: string;
  /** 触发该事件的工具调用名（若有） */
  toolName?: string;
}

export interface PersistedPendingConsequence {
  id: string;
  description: string;
  /** 还剩多少轮触发；0 表示本轮触发 */
  remainingTurns: number;
  /** 触发后的事件描述 */
  triggerEvent: string;
  /** 创建时的回合号 */
  scheduledAtTurn: number;
}

export interface GameState {
  players: Investigator[];
  exploreMode: ExploreMode;
  currentSplitPlayer: number;
  /**
   * In together mode, the index of the player whose action input is currently visible.
   * Players act sequentially; advances on "下一位" and resets to 0 after submission.
   */
  currentActorIndex: number;
  playerLocations: Record<string, SceneId>;
  declarations: Record<string, string>;
  pendingCheck: CheckRequest | null;
  currentScene: SceneId;
  activeNpcName: string | null;
  clues: StoryItem[];
  flags: Record<string, unknown>;
  actionLog: Array<{ time: string; text: string }>;
  conversationHistory: ConversationTurn[];
  messages: NarrativeMessage[];
  suggestions: string[];
  isThinking: boolean;
  /** 长期记忆总结，由 summarizer 维护；phase 5 起启用 */
  longTermMemorySummary?: string;
  /** 已被总结进 summary 的 conversationHistory 上界（下标，不含） */
  summarizedUntilIndex?: number;
  /** DM 事件时间线（最多 200 条），phase 8 起持久化 */
  eventLog?: PersistedDMEvent[];
  /** 未结算后果队列，每轮 -1 直到为 0 触发；phase 8 起持久化 */
  pendingConsequences?: PersistedPendingConsequence[];
}

export interface AiResponse {
  narrative?: string;
  activeNpc?: string | null;
  check?: CheckRequest | null;
  stateUpdate?: {
    hp?: Record<string, number>;
    san?: Record<string, number>;
    flags?: Record<string, unknown>;
    newItems?: string[];
    sceneChange?: SceneId | null;
    /** 本轮新调度的后果（仅 phase 8+ 管线使用） */
    scheduledConsequences?: PersistedPendingConsequence[];
    /** 本轮被触发的 pending id（仅 phase 8+ 管线使用） */
    triggeredConsequenceIds?: string[];
  };
  nextPrompt?: string;
  playerChoices?: string[];
}

export interface ApiConfig {
  provider: 'openai' | 'anthropic' | 'mimo' | 'custom';
  apiKey: string;
  endpoint?: string;
  model?: string;
}

export interface SaveSlot {
  id: number;
  savedAt: string;
  scene: string;
  players: string;
  gameState: GameState;
  /** 存档格式版本；v3 起新增 eventLog / pendingConsequences。 */
  version?: 1 | 2 | 3;
}
