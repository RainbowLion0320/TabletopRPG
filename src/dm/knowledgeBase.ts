/**
 * 知识库查询助手。
 *
 * 提供：
 * - 解锁 secret 计算（基于 flags / 已访问场景 / 已发现物品）
 * - 实体快照构造（公开面 + 已解锁 secret content）
 * - 场景邻接查询
 *
 * 这些函数是纯函数；不持有状态、不与 React 耦合。
 */

import type { GameState, SceneId } from '../types/game';
import { wuzhongxiaoshi } from '../data/scenarios/wuzhongxiaoshi';
import type {
  ItemPublic,
  KnowledgeBase,
  NpcPublic,
  ScenePublic,
  SecretDefinition,
  SecretRevealCondition
} from './types';

/** 当前激活的模组 KB。后续可按 gameState.scenarioId 选择。 */
export function getActiveKnowledgeBase(): KnowledgeBase {
  return wuzhongxiaoshi;
}

export interface RevealContext {
  /** 玩家阵营当前所在场景（注意：split 模式各人可能不同） */
  currentScene: SceneId;
  /** 历史上访问过的场景集合 */
  visitedScenes: ReadonlySet<SceneId>;
  /** 玩家已发现的物品 id 集合 */
  foundItemIds: ReadonlySet<string>;
  /** flag 表（来自 GameState.flags） */
  flags: Record<string, unknown>;
}

/**
 * 从 GameState 构造 RevealContext。
 * 由于当前 GameState 还没有 visitedScenes 字段（phase 6 才持久化），
 * 这里以 currentScene + clues 中携带的 scene 推断已访问场景。
 */
export function deriveRevealContext(state: GameState): RevealContext {
  const visited = new Set<SceneId>([state.currentScene]);
  state.clues.forEach((clue) => visited.add(clue.scene));
  // S01 永远视为已访问（开局所在）
  visited.add('S01');

  const foundItemIds = new Set(state.clues.map((clue) => clue.id));
  return {
    currentScene: state.currentScene,
    visitedScenes: visited,
    foundItemIds,
    flags: state.flags ?? {}
  };
}

function matchCondition(condition: SecretRevealCondition, ctx: RevealContext): boolean {
  switch (condition.type) {
    case 'always':
      return true;
    case 'flag': {
      const value = ctx.flags[condition.key];
      if (condition.equals === undefined) return Boolean(value);
      return value === condition.equals;
    }
    case 'sceneVisited':
      return ctx.visitedScenes.has(condition.sceneId);
    case 'itemFound':
      return ctx.foundItemIds.has(condition.itemId);
    default:
      return false;
  }
}

/**
 * 单个 secret 是否应当解锁。
 * 解锁逻辑：revealOn 列表中任一条件满足即解锁（OR 语义）。
 * 空列表视为永不解锁。
 */
export function isSecretRevealed(secret: SecretDefinition, ctx: RevealContext): boolean {
  if (!secret.revealOn?.length) return false;
  return secret.revealOn.some((cond) => matchCondition(cond, ctx));
}

/** 计算所有已解锁的 secret id 集合。 */
export function computeRevealedSecretIds(kb: KnowledgeBase, ctx: RevealContext): Set<string> {
  const out = new Set<string>();
  for (const secret of Object.values(kb.secrets)) {
    if (isSecretRevealed(secret, ctx)) out.add(secret.id);
  }
  return out;
}

/** 取实体关联的、已解锁的 secret 内容文本数组。 */
function pickRevealedSecretsFor(
  kb: KnowledgeBase,
  secretIds: string[] | undefined,
  revealed: ReadonlySet<string>
): string[] {
  if (!secretIds?.length) return [];
  const out: string[] = [];
  for (const id of secretIds) {
    if (!revealed.has(id)) continue;
    const sec = kb.secrets[id];
    if (sec) out.push(sec.content);
  }
  return out;
}

export interface SceneSnapshot {
  public: ScenePublic;
  /** 已解锁的相关 secret content，已脱敏可发给 Narrator */
  knownSecrets: string[];
}

export interface NpcSnapshot {
  public: NpcPublic;
  knownSecrets: string[];
}

export interface ItemSnapshot {
  public: ItemPublic;
  knownSecrets: string[];
}

export function getSceneSnapshot(
  kb: KnowledgeBase,
  sceneId: SceneId,
  revealed: ReadonlySet<string>
): SceneSnapshot | null {
  const layered = kb.scenes[sceneId];
  if (!layered) return null;
  return {
    public: layered.public,
    knownSecrets: pickRevealedSecretsFor(kb, layered.secretIds, revealed)
  };
}

export function getNpcSnapshot(
  kb: KnowledgeBase,
  name: string,
  revealed: ReadonlySet<string>
): NpcSnapshot | null {
  const layered = kb.npcs[name];
  if (!layered) return null;
  return {
    public: layered.public,
    knownSecrets: pickRevealedSecretsFor(kb, layered.secretIds, revealed)
  };
}

export function getItemSnapshot(
  kb: KnowledgeBase,
  itemId: string,
  revealed: ReadonlySet<string>
): ItemSnapshot | null {
  const layered = kb.items[itemId];
  if (!layered) return null;
  return {
    public: layered.public,
    knownSecrets: pickRevealedSecretsFor(kb, layered.secretIds, revealed)
  };
}

/** 当前场景的可达邻接场景 id 列表（不含自己）。 */
export function getReachableScenes(kb: KnowledgeBase, sceneId: SceneId): SceneId[] {
  return kb.sceneGraph[sceneId] ?? [];
}
