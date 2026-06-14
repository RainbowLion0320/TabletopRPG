/**
 * DM Agent 引擎 - 核心类型定义。
 *
 * 设计原则：
 * - AI 永远不能直接修改游戏状态。所有状态变更必须经 Director 校验后由 StateResolver 落地。
 * - 知识库分两层：public（玩家可见）+ dm（KP 内幕，按 secretId 索引）。
 * - 上下文是按需组装的，不再"一锅炖"。
 */

import type { GameState, SceneId } from '../types/game';

// ---------- 知识库（Phase 1 填充） ----------

export interface SecretDefinition {
  id: string;
  /** KP 视角的真相文本，AI 在解锁后才能看到 */
  content: string;
  /** 解锁条件：满足任一条件即解锁 */
  revealOn: SecretRevealCondition[];
}

export type SecretRevealCondition =
  | { type: 'flag'; key: string; equals?: unknown }
  | { type: 'sceneVisited'; sceneId: SceneId }
  | { type: 'itemFound'; itemId: string }
  | { type: 'always' };

/** 实体的"两层"视图：公开面 + 关联的 secret id 列表 */
export interface LayeredEntity<TPublic> {
  public: TPublic;
  /** 该实体相关的 KP 内幕条目；运行时按解锁条件过滤 */
  secretIds?: string[];
}

export interface ScenarioRule {
  id: string;
  /** 规则触发时机：preCheck=检定前、postAction=动作后、sceneEnter=进入场景 */
  trigger: 'preCheck' | 'postAction' | 'sceneEnter';
  /** 适用条件描述（供 Director 实现，非自动执行） */
  description: string;
}

export interface KnowledgeBase {
  scenarioId: string;
  title: string;
  era: string;
  scenes: Record<SceneId, LayeredEntity<ScenePublic>>;
  npcs: Record<string, LayeredEntity<NpcPublic>>;
  items: Record<string, LayeredEntity<ItemPublic>>;
  secrets: Record<string, SecretDefinition>;
  rules: ScenarioRule[];
  /** 场景邻接图，用于 Director 校验非法跳转 */
  sceneGraph: Record<SceneId, SceneId[]>;
}

export interface ScenePublic {
  id: SceneId;
  name: string;
  /** 当前场景所属剧情章节，用于玩家 UI 显示进度 */
  chapterTitle: string;
  desc: string;
  image: string;
  /** 该场景常驻可见 NPC 名 */
  npcs: string[];
  /** 该场景可调查的物品 id（具体描述按 secret 解锁规则） */
  items: string[];
}

export interface NpcPublic {
  name: string;
  role: string;
  attitude: '友好' | '中立' | '警惕' | '敌对' | '未知';
  /** 玩家初次见面的外观/印象，无任何剧透 */
  appearance: string;
  hp: number;
  portrait?: string;
}

export interface ItemPublic {
  id: string;
  name: string;
  scene: SceneId;
  /** 玩家拿到/看到该物时的外观描述，不含解谜答案 */
  appearance: string;
}

// ---------- 工作记忆（Phase 2 填充） ----------

export interface WorkingMemory {
  /** 全局回合计数；与 conversationHistory 不耦合 */
  turnCount: number;
  /** 已访问过的场景集合（用于 reveal 条件判断 + 邻接放宽） */
  visitedScenes: SceneId[];
  /** 已解锁的 secret id；新增项追加，不删除 */
  revealedSecrets: string[];
  /** 当前在场实体快照（每轮由 ContextBuilder 计算） */
  inScopeNpcIds: string[];
  inScopeItemIds: string[];
  /** 未结算后果：例如"暴徒倒计时还差2轮" */
  pendingConsequences: PendingConsequence[];
  /** NPC 中期状态：好感、警觉度等数值；不暴露给玩家 UI，但喂给 Narrator */
  npcStates: Record<string, NpcRuntimeState>;
  /** Phase 9：在场 NPC 当前可见的前瞻意图（owner 在场 + ttl>0） */
  prospectiveIntents?: import('../types/game').ProspectiveIntent[];
}

export interface PendingConsequence {
  id: string;
  description: string;
  /** 还剩多少轮触发；0 表示本轮触发 */
  remainingTurns: number;
  /** 触发后产生的事件描述（由 Director 实现） */
  triggerEvent: string;
}

export interface NpcRuntimeState {
  /** 心情值：-3..+3，0 中立 */
  mood: number;
  /** 警觉度：0..3 */
  alertness: number;
  /** 是否已离场 */
  offstage?: boolean;
}

// ---------- 长期记忆（Phase 5 填充） ----------

export interface LongTermMemory {
  /** KP 视角的剧情总结，每 N 轮由 summarizer 更新 */
  summary: string;
  /** 重要事件时间线 */
  eventLog: DMEvent[];
  /** 已被总结进 summary 的 conversation index 上界，避免重复总结 */
  summarizedUntilIndex: number;
}

export interface DMEvent {
  id: string;
  turn: number;
  /** 事件分类：scene_change / check / state_update / secret_reveal / consequence / narrative */
  kind: string;
  description: string;
  /** 触发该事件的工具调用名（若有） */
  toolName?: string;
}

// ---------- 工具契约（Phase 3 填充） ----------

export type DmToolName =
  | 'request_check'
  | 'propose_state_update'
  | 'reveal_secret'
  | 'lookup_entity'
  | 'propose_scene_change'
  | 'schedule_consequence'
  | 'update_npc_mind';

export interface DmToolCall {
  name: DmToolName;
  arguments: Record<string, unknown>;
  /** LLM 提供的调用 id，用于回传结果 */
  callId?: string;
}

// ---------- 管线 IO（Phase 0 占位） ----------

export interface DmTurnInput {
  /** 完整游戏状态（只读） */
  state: GameState;
  /** 本轮玩家行动声明 */
  actions: Array<{ player: string; action: string; scene?: string }>;
}

export interface DmTurnOutput {
  /** Narrator 原始返回文本（用于 conversationHistory + debug） */
  raw: string;
  /** 旧契约回归对象，便于现阶段直接复用 reducer.applyAiResponse */
  legacyResponse?: import('../types/game').AiResponse;
  /** 新契约下的事件序列；v2 启用时使用 */
  events?: DMEvent[];
  /** 本轮产生的长期记忆更新；controller 应优先 dispatch consolidateMemory */
  memoryUpdate?: {
    summary: string;
    summarizedUntilIndex: number;
    remainingHistory: import('../types/game').ConversationTurn[];
  };
  /** Phase 9：System1 抽出待写入的 atomic facts（已设置 supersedes 链） */
  factsToAppend?: import('../types/game').AtomicFact[];
  /** Phase 9：Narrator 工具调用 + System2 合成产生的 NPC 心智增量 */
  mindUpdates?: Array<{
    npcId: string;
    partial: Partial<import('../types/game').NpcMindModel>;
  }>;
  /** Phase 9：System2 合成出的新增前瞻意图（已分配 id 与 ttl） */
  prospectiveIntentsToAdd?: import('../types/game').ProspectiveIntent[];
  /** 长尾事件召回层：本轮完成后追加的 episodic memory 片段 */
  episodicMemoriesToAdd?: import('../types/game').EpisodicMemoryRecord[];
  /** Phase 9：本轮是否需要执行 ttl 衰减（每轮 true） */
  decayIntents?: boolean;
}

// ---------- Feature Flag ----------
// （phase 6 已移除：v2 是唯一管线）

// ---------- Phase 9：认知记忆层（L2 / L5 / L6） ----------

/**
 * 记忆引擎参数。便于在 pipeline / contextBuilder 之间共享上限和开关。
 * 默认值由各模块负责，但同一处常量集中维护。
 */
export interface MemoryEngineOptions {
  /** 是否启用 System1 同步事实抽取（默认 true）；关闭时跳过每轮 LLM 调用 */
  enableSystem1?: boolean;
  /** 是否启用 System2 异步合成（默认 true）；关闭时不更新 mindModel / intent */
  enableSystem2?: boolean;
  /** atomicFacts 最大条数（默认 500） */
  factCap?: number;
  /** prospectiveIntents 最大条数（默认 30） */
  intentCap?: number;
  /** 单条 prospectiveIntent 默认 ttl（默认 6 轮） */
  defaultIntentTtl?: number;
  /** ContextBuilder 注入近 N 条 fact 给 narrator（默认 6） */
  contextRecentFactWindow?: number;
  /** 是否启用本地 episodic retrieval（默认 true） */
  enableEpisodicRetrieval?: boolean;
  /** 每轮注入的 episodic memory 上限（默认 5） */
  episodicRetrievalLimit?: number;
  /** episodicMemory 最大条数（默认 300） */
  episodicMemoryCap?: number;
}

/** 全局默认值；运行时可被 ApiConfig / 环境变量覆盖 */
export const DEFAULT_MEMORY_OPTIONS: Required<MemoryEngineOptions> = {
  enableSystem1: true,
  enableSystem2: true,
  factCap: 500,
  intentCap: 30,
  defaultIntentTtl: 6,
  contextRecentFactWindow: 6,
  enableEpisodicRetrieval: true,
  episodicRetrievalLimit: 5,
  episodicMemoryCap: 300
};
