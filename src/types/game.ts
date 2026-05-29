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

export interface GameState {
  players: Investigator[];
  exploreMode: ExploreMode;
  currentSplitPlayer: number;
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
}
