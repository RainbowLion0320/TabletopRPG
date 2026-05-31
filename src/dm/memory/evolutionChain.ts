/**
 * 演化链查询 - 纯函数工具，零 LLM 调用。
 *
 * AtomicFact 通过 supersedes 字段构成单向链：
 *   旧事实 fA  <-- supersedes  -- 新事实 fB  <-- supersedes -- 最新 fC
 * 查询时按时间倒序展示（fC 在前，fA 在后）。
 *
 * 也提供 NPC stance 链过滤、合并候选查找两种常用查询。
 */

import type { AtomicFact, FactPredicate } from '../../types/game';

/**
 * 沿 supersedes 反向遍历到链尾，返回从该 fact 开始的整条链（含自身）。
 * 顺序：[起点, 起点.supersedes, 起点.supersedes.supersedes, ...]
 *
 * - 若 factId 不存在 → 空数组
 * - 自动检测环（任何 fact 出现两次时停止），保证不会无限循环
 */
export function getChain(facts: readonly AtomicFact[], factId: string): AtomicFact[] {
  if (!factId) return [];
  const byId = new Map<string, AtomicFact>();
  for (const f of facts) byId.set(f.id, f);

  const chain: AtomicFact[] = [];
  const seen = new Set<string>();
  let cursor: AtomicFact | undefined = byId.get(factId);
  while (cursor && !seen.has(cursor.id)) {
    chain.push(cursor);
    seen.add(cursor.id);
    if (!cursor.supersedes) break;
    cursor = byId.get(cursor.supersedes);
  }
  return chain;
}

/**
 * 提取某 NPC 的 stance 演化序列。
 *
 * - 仅保留 actor === npcId 且 predicate === 'stance_toward' 的 fact
 * - 若提供 playerId，则进一步过滤 target === playerId（精准 vs 整体）
 *   特殊：playerId 给定但 fact.target 为空时，视为「对玩家整体」也保留
 * - 返回按 turn 升序排列（最早 → 最晚），便于 UI 展示「演化轨迹」
 */
export function getStanceChain(
  facts: readonly AtomicFact[],
  npcId: string,
  playerId?: string
): AtomicFact[] {
  if (!npcId) return [];
  const filtered = facts.filter((f) => {
    if (f.actor !== npcId) return false;
    if (f.predicate !== 'stance_toward') return false;
    if (!playerId) return true;
    // 给定 playerId：优先精确匹配，target 缺省的 fact 视为「整体态度」也保留
    return !f.target || f.target === playerId;
  });
  return [...filtered].sort((a, b) => a.turn - b.turn);
}

/**
 * 合并候选查找：在现有 facts 中寻找最新的、与 candidate 同 (actor, predicate, target?) 的 fact。
 *
 * 用于 factExtractor 写入新 fact 之前判断是否构成「演化」：
 *   旧 fact 命中 → 新 fact.supersedes = 旧 fact.id
 *
 * - 比较口径：actor 完全一致 + predicate 完全一致 + target 完全一致（含都为 undefined）
 * - 若多条命中，返回 turn 最大的一条（即最新）
 * - 完全相同 value 不视为演化（应在调用方做 dedupe）
 */
export function findSupersedeTarget(
  facts: readonly AtomicFact[],
  candidate: SupersedeCandidate
): AtomicFact | null {
  const targetEq = (a?: string, b?: string) => (a ?? '') === (b ?? '');
  let latest: AtomicFact | null = null;
  for (const f of facts) {
    if (f.actor !== candidate.actor) continue;
    if (f.predicate !== candidate.predicate) continue;
    if (!targetEq(f.target, candidate.target)) continue;
    if (!latest || f.turn > latest.turn) latest = f;
  }
  return latest;
}

export interface SupersedeCandidate {
  actor: string;
  predicate: FactPredicate;
  target?: string;
}
