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

// ---------- Phase 9：认知记忆层（L2 / L5 / L6） ----------

/**
 * Atomic Fact 谓词集合。
 * 借鉴 Hy-Memory L2 的 SPO 三元组思想，针对跑团领域裁剪。
 */
export type FactPredicate =
  | 'stance_toward'   // 对某人/物的态度
  | 'goal'            // 目标 / 动机
  | 'knowledge'       // 知道某事
  | 'capability'      // 能力
  | 'state'           // 状态（受伤/疲惫/醉）
  | 'relationship';   // 与他人关系

/**
 * L2 原子事实：actor + predicate + (target?) + value 构成 SPO 结构，
 * 通过 supersedes 指针组成因果演化链（旧事实 -> 新事实）。
 */
export interface AtomicFact {
  /** 全局唯一 id；推荐 `f_<turn>_<idx>` */
  id: string;
  /** 创建时的回合号 */
  turn: number;
  /** 事实主体：NPC name / player id / 'world'（全局） */
  actor: string;
  predicate: FactPredicate;
  /** stance_toward / relationship 的对象；其他谓词可省略 */
  target?: string;
  /** 简短中文描述：例「敌意」「想保护女儿」「醉酒」 */
  value: string;
  /** 旧 fact id；命中合并时由 factExtractor 设置，构成因果链 */
  supersedes?: string;
  /** 抽取来源：system1（同步抽取）/ system2（异步合成） */
  source: 'system1' | 'system2';
}

/**
 * L5 NPC 心智模型：per-NPC 单视图 + 玩家特例标记。
 * coreMotivation / currentStance 由 system2 异步合成；stanceHistoryFactIds 指向 L2 链。
 */
export interface NpcMindModel {
  /** NPC name（与 KB.npcs 主键一致） */
  npcId: string;
  /** 一句话核心动机，例：「不让秘密曝光」 */
  coreMotivation: string;
  /** 对调查者整体的当前态度，例：「保持距离，警惕但合作」 */
  currentStance: string;
  /** 玩家特例：仅当 NPC 对某玩家明显不同时填入；key = player name */
  playerExceptions?: Record<string, string>;
  /** stance 演化路径，按时间顺序的 AtomicFact id 列表 */
  stanceHistoryFactIds: string[];
  /** 上次更新的回合号 */
  lastUpdatedTurn: number;
}

/**
 * L6 前瞻意图：NPC 对未来行为的预测，每轮 ttl-1，0 时移除。
 * 与 PersistedPendingConsequence 的差别：consequence 是 KP 已定的剧情，intent 是
 * NPC 自主推断，narrator 可参考但不强制兑现。
 */
export interface ProspectiveIntent {
  /** 全局唯一 id；推荐 `i_<turn>_<idx>` */
  id: string;
  /** 行动主体：NPC name 或 'world' */
  owner: string;
  /** 自然语言预测：「Eric 在下次会面时会主动提及报纸」 */
  predictedAction: string;
  /** 触发条件描述（自然语言，不强制执行）：「玩家再次见到 Eric」 */
  triggerCondition: string;
  /** 剩余轮数；每轮 -1，0 时被移除 */
  ttl: number;
  /** 创建时的回合号 */
  createdTurn: number;
}

// ---------- Episodic Retrieval：长尾事件召回层 ----------

export type EpisodicMemorySource = 'episode' | 'event' | 'fact' | 'summary';
export type EpisodicMemoryVisibility = 'player_safe' | 'dm';

/**
 * 长尾事件记忆：面向 RAG/召回的片段。它不是权威状态，只是 Narrator 的参考上下文。
 * 权威信息仍以 GameState flags / clues / pendingConsequences / atomicFacts 为准。
 */
export interface EpisodicMemoryRecord {
  /** 全局唯一 id；推荐 `em_<turn>_<hash>` */
  id: string;
  /** 片段所属回合 */
  turn: number;
  /** 片段发生场景；缺省时视为跨场景 */
  sceneId?: SceneId;
  /** 可直接注入 prompt 的短文本，建议 80-300 字 */
  text: string;
  /** 片段涉及玩家名 */
  playerNames: string[];
  /** 片段涉及 NPC 名 / 物品 id / 'world' 等实体 */
  entityIds: string[];
  /** 检索辅助标签，例如 promise / clue / stance_toward */
  tags: string[];
  /** 来源类型 */
  source: EpisodicMemorySource;
  /** 可见性；dm 片段只给 DM prompt，不直接展示给玩家 */
  visibility: EpisodicMemoryVisibility;
  /** 重要度 0..5，用于检索排序 */
  importance: number;
}

export interface RetrievedEpisodicMemory {
  record: EpisodicMemoryRecord;
  score: number;
  reasons: string[];
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
  /** L2 原子事实链（最多 500 条），phase 9 起持久化 */
  atomicFacts?: AtomicFact[];
  /** L5 NPC 心智模型（按 npcId 索引），phase 9 起持久化 */
  npcMindModels?: Record<string, NpcMindModel>;
  /** L6 前瞻意图队列（最多 30 条，按 ttl 衰减），phase 9 起持久化 */
  prospectiveIntents?: ProspectiveIntent[];
  /** 长尾事件召回片段（最多 300 条），非权威状态，仅供 prompt 召回 */
  episodicMemory?: EpisodicMemoryRecord[];
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
  /** 存档格式版本；v5 起新增 episodicMemory。 */
  version?: 1 | 2 | 3 | 4 | 5;
}
