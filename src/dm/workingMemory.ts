/**
 * 工作记忆 - 中期 DM 状态。
 *
 * 设计：
 * - 当前阶段不持久化，每轮从 GameState 派生（phase 6 会落入存档）。
 * - 暴露纯函数 deriveWorkingMemory，便于在 contextBuilder / pipeline 之间共享。
 */

import type { GameState, SceneId } from '../types/game';
import type { KnowledgeBase, NpcRuntimeState, PendingConsequence, WorkingMemory } from './types';
import { computeRevealedSecretIds, deriveRevealContext } from './knowledgeBase';

/**
 * 创建空的工作记忆，用于全新游戏起点。
 */
export function createInitialWorkingMemory(currentScene: SceneId = 'S01'): WorkingMemory {
  return {
    turnCount: 0,
    visitedScenes: [currentScene],
    revealedSecrets: [],
    inScopeNpcIds: [],
    inScopeItemIds: [],
    pendingConsequences: [],
    npcStates: {}
  };
}

/**
 * 从 GameState 派生 WorkingMemory。
 *
 * 说明：
 * - turnCount 取 conversationHistory 中 user 角色的数量近似（每轮玩家提交一次）
 * - visitedScenes 由 currentScene + clues.scene 推断
 * - revealedSecrets 通过 KB 的 reveal 条件计算
 * - inScopeNpcIds / inScopeItemIds 取当前场景常驻 NPC + 已发现物品 + 当前 activeNpc
 * - npcStates 当前阶段保持空对象，phase 4+ 由 Director / StateResolver 填充
 */
export function deriveWorkingMemory(state: GameState, kb: KnowledgeBase): WorkingMemory {
  const ctx = deriveRevealContext(state);
  const revealed = computeRevealedSecretIds(kb, ctx);

  const sceneEntry = kb.scenes[state.currentScene];
  const inScopeNpcIds = new Set<string>();
  if (state.activeNpcName) inScopeNpcIds.add(state.activeNpcName);
  sceneEntry?.public.npcs.forEach((name) => inScopeNpcIds.add(name));

  const inScopeItemIds = new Set<string>();
  // 当前场景出现且尚未发现的物品 - DM 知道存在但玩家未必发现
  sceneEntry?.public.items.forEach((id) => {
    if (!ctx.foundItemIds.has(id)) inScopeItemIds.add(id);
  });
  // 已发现物品也保留在 in-scope（用于回顾性叙述）
  ctx.foundItemIds.forEach((id) => inScopeItemIds.add(id));

  const turnCount = state.conversationHistory.filter((turn) => turn.role === 'user').length;

  return {
    turnCount,
    visitedScenes: Array.from(ctx.visitedScenes),
    revealedSecrets: Array.from(revealed),
    inScopeNpcIds: Array.from(inScopeNpcIds),
    inScopeItemIds: Array.from(inScopeItemIds),
    pendingConsequences: derivePendingConsequences(state),
    npcStates: deriveNpcStates(state, kb)
  };
}

function derivePendingConsequences(state: GameState): PendingConsequence[] {
  const list = state.pendingConsequences ?? [];
  return list.map((p) => ({
    id: p.id,
    description: p.description,
    remainingTurns: p.remainingTurns,
    triggerEvent: p.triggerEvent
  }));
}

/**
 * 从 flags 中派生 NPC 状态。
 * 现阶段约定 flags 里以 `npcState.<name>.<key>` 形式存放（mood / alertness / offstage）。
 * Director 会在后续 phase 写回这些 flags；当前主要保证读取健壮。
 */
function deriveNpcStates(state: GameState, kb: KnowledgeBase): Record<string, NpcRuntimeState> {
  const out: Record<string, NpcRuntimeState> = {};
  for (const npcName of Object.keys(kb.npcs)) {
    const moodKey = `npcState.${npcName}.mood`;
    const alertKey = `npcState.${npcName}.alertness`;
    const offKey = `npcState.${npcName}.offstage`;
    const mood = numFromFlag(state.flags[moodKey], 0);
    const alertness = numFromFlag(state.flags[alertKey], 0);
    const offstage = state.flags[offKey] === true || state.flags[offKey] === 'true';
    if (mood === 0 && alertness === 0 && !offstage) continue;
    out[npcName] = {
      mood: clampInt(mood, -3, 3),
      alertness: clampInt(alertness, 0, 3),
      offstage: offstage || undefined
    };
  }
  return out;
}

function numFromFlag(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}
