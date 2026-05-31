/**
 * Context Builder - 纯函数：把 GameState + KnowledgeBase + 本轮意图
 * 装配为分层的 DmContext，供 Narrator 拼接 system / user 消息。
 *
 * 关键约束：
 * - 只输出已解锁的 secret 内容（基于 reveal 条件），永远不泄底。
 * - 玩家卡分两档：被检定者完整技能 + 其余仅 name/job/hp/san。
 * - 历史窗口固定 N 轮原文 + 长期总结字符串占位（Phase 5 填）。
 */

import type {
  ConversationTurn,
  ExploreMode,
  GameState,
  Investigator,
  SceneId
} from '../types/game';
import type {
  ItemSnapshot,
  NpcSnapshot,
  RevealContext,
  SceneSnapshot
} from './knowledgeBase';
import {
  computeRevealedSecretIds,
  deriveRevealContext,
  getItemSnapshot,
  getNpcSnapshot,
  getReachableScenes,
  getSceneSnapshot
} from './knowledgeBase';
import type { KnowledgeBase, ScenarioRule, WorkingMemory } from './types';
import { deriveWorkingMemory } from './workingMemory';

// ---------- 上下文契约 ----------

export interface DmContextIntent {
  /** 行动模式（together / split） */
  mode: ExploreMode;
  /** 本轮预期被检定的玩家名；若不确定可留空 */
  checkPlayer?: string | null;
  /** 与本轮相关的技能名集合（用于玩家卡精简） */
  relevantSkills?: string[];
}

export interface PlayerCardLite {
  name: string;
  job: string;
  hp: string;
  san: string;
}

export interface PlayerCardFull extends PlayerCardLite {
  attrs: Investigator['attrs'];
  /** 仅相关技能；对象形式 name → 总值 */
  relevantSkills: Record<string, number>;
  background?: Investigator['background'];
}

export interface DmContextStatic {
  scenarioId: string;
  scenarioTitle: string;
  era: string;
  rules: ScenarioRule[];
}

export interface DmContextDynamic {
  currentScene: SceneSnapshot;
  reachableScenes: Array<{ id: SceneId; name: string }>;
  /** 当前场景在场（已解锁公开面 + 已解锁 secrets） */
  npcs: NpcSnapshot[];
  /** 仅当前场景关联的物品；已发现物品在前 */
  items: ItemSnapshot[];
  /** 玩家定位 name → 场景名（脱敏） */
  playerLocations: Record<string, string>;
  /** 已发现的线索名列表 */
  knownClueNames: string[];
  /** 本轮使用的 working memory 快照 */
  workingMemory: WorkingMemory;
  /** 主要被检定者的完整玩家卡；其它玩家精简卡 */
  spotlightPlayer: PlayerCardFull | null;
  otherPlayers: PlayerCardLite[];
}

export interface DmContext {
  static: DmContextStatic;
  dynamic: DmContextDynamic;
  /** 近 N 轮原文（已截断） */
  recentTurns: ConversationTurn[];
  /** 长期记忆总结，phase 5 注入 */
  summary: string;
}

// ---------- 工具函数 ----------

const RECENT_TURN_WINDOW = 16;

function toLitePlayerCard(p: Investigator): PlayerCardLite {
  return {
    name: p.name,
    job: p.job,
    hp: `${p.currentHp}/${p.hp}`,
    san: `${p.currentSan}/${p.san}`
  };
}

function toFullPlayerCard(p: Investigator, relevantSkills: string[]): PlayerCardFull {
  const skills: Record<string, number> = {};
  for (const skill of relevantSkills) {
    const val = p.skills[skill];
    if (val) skills[skill] = val.base + val.added;
  }
  return {
    ...toLitePlayerCard(p),
    attrs: p.attrs,
    relevantSkills: skills,
    background: p.background
  };
}

function buildPlayerLocations(state: GameState, kb: KnowledgeBase): Record<string, string> {
  const out: Record<string, string> = {};
  const fallback = kb.scenes[state.currentScene]?.public.name ?? state.currentScene;
  for (const player of state.players) {
    const sceneId = state.playerLocations[player.id] ?? state.currentScene;
    out[player.name] = kb.scenes[sceneId]?.public.name ?? fallback;
  }
  return out;
}

function buildSceneItems(
  kb: KnowledgeBase,
  sceneId: SceneId,
  ctx: RevealContext,
  revealed: ReadonlySet<string>
): ItemSnapshot[] {
  const sceneEntry = kb.scenes[sceneId];
  if (!sceneEntry) return [];
  const ids = sceneEntry.public.items;
  const out: ItemSnapshot[] = [];
  // 已发现优先排序
  const found = ids.filter((id) => ctx.foundItemIds.has(id));
  const undiscovered = ids.filter((id) => !ctx.foundItemIds.has(id));
  for (const id of [...found, ...undiscovered]) {
    const snap = getItemSnapshot(kb, id, revealed);
    if (snap) out.push(snap);
  }
  return out;
}

function buildSceneNpcs(
  kb: KnowledgeBase,
  sceneId: SceneId,
  activeNpcName: string | null,
  revealed: ReadonlySet<string>
): NpcSnapshot[] {
  const sceneEntry = kb.scenes[sceneId];
  if (!sceneEntry) return [];
  const names = new Set<string>(sceneEntry.public.npcs);
  if (activeNpcName) names.add(activeNpcName);
  const out: NpcSnapshot[] = [];
  for (const name of names) {
    const snap = getNpcSnapshot(kb, name, revealed);
    if (snap) out.push(snap);
  }
  return out;
}

function buildReachableScenes(
  kb: KnowledgeBase,
  sceneId: SceneId
): Array<{ id: SceneId; name: string }> {
  return getReachableScenes(kb, sceneId).map((id) => ({
    id,
    name: kb.scenes[id]?.public.name ?? id
  }));
}

// ---------- 主入口 ----------

export interface BuildDmContextOptions {
  /** 用于注入长期记忆总结，默认空 */
  summary?: string;
  /** 自定义历史窗口大小（轮数 × 2 条消息） */
  recentTurnWindow?: number;
}

/**
 * 主入口：构造一轮 DmContext。
 * 纯函数；不读外部 state、不发起网络请求。
 */
export function buildDmContext(
  state: GameState,
  kb: KnowledgeBase,
  intent: DmContextIntent,
  options: BuildDmContextOptions = {}
): DmContext {
  const ctx = deriveRevealContext(state);
  const revealed = computeRevealedSecretIds(kb, ctx);
  const wm = deriveWorkingMemory(state, kb);

  const currentScene = getSceneSnapshot(kb, state.currentScene, revealed);
  if (!currentScene) {
    throw new Error(`[contextBuilder] 未在 KB 中找到场景：${state.currentScene}`);
  }

  // 玩家卡：spotlight = 被检定者；其他人精简
  const relevantSkills = intent.relevantSkills ?? [];
  let spotlight: PlayerCardFull | null = null;
  const others: PlayerCardLite[] = [];
  for (const player of state.players) {
    if (intent.checkPlayer && player.name === intent.checkPlayer) {
      spotlight = toFullPlayerCard(player, relevantSkills);
    } else {
      others.push(toLitePlayerCard(player));
    }
  }

  const window = options.recentTurnWindow ?? RECENT_TURN_WINDOW;
  const recentTurns =
    window > 0 ? state.conversationHistory.slice(-window) : state.conversationHistory.slice();

  return {
    static: {
      scenarioId: kb.scenarioId,
      scenarioTitle: kb.title,
      era: kb.era,
      rules: kb.rules
    },
    dynamic: {
      currentScene,
      reachableScenes: buildReachableScenes(kb, state.currentScene),
      npcs: buildSceneNpcs(kb, state.currentScene, state.activeNpcName, revealed),
      items: buildSceneItems(kb, state.currentScene, ctx, revealed),
      playerLocations: buildPlayerLocations(state, kb),
      knownClueNames: state.clues.map((clue) => clue.name),
      workingMemory: wm,
      spotlightPlayer: spotlight,
      otherPlayers: others
    },
    recentTurns,
    summary: options.summary ?? ''
  };
}
