/**
 * Director - DM Agent 的规则护栏。
 *
 * 责任：
 * - 入口护栏：根据当前 ctx 计算允许的工具集（暂时允许全部 5 个，后续可按 intent 收窄）
 * - 出口护栏：把 Narrator 返回的 tool_calls 逐个做语义校验
 *   · propose_scene_change 目标必须邻接当前场景
 *   · propose_state_update.sceneChange 同样需要邻接
 *   · propose_state_update.newItems 必须是 KB 已知物品
 *   · reveal_secret 必须是 KB 中存在的 secret id
 *   · request_check.player 必须是当前玩家阵营成员
 */

import type { GameState, SceneId } from '../types/game';
import { getReachableScenes } from './knowledgeBase';
import type { KnowledgeBase, DmToolCall, DmToolName } from './types';
import { validateToolCallShape } from './tools';

export interface DirectorRejection {
  call: DmToolCall;
  reason: string;
}

export interface DirectorResult {
  accepted: DmToolCall[];
  rejected: DirectorRejection[];
}

export interface DirectorContext {
  state: GameState;
  kb: KnowledgeBase;
}

const ALL_TOOL_NAMES: DmToolName[] = [
  'request_check',
  'propose_state_update',
  'reveal_secret',
  'lookup_entity',
  'propose_scene_change'
];

/**
 * 计算本轮允许使用的工具集。
 * 当前阶段：全部允许；保留接口便于后续按 intent / mode 收窄。
 */
export function allowedTools(_ctx: DirectorContext): DmToolName[] {
  return [...ALL_TOOL_NAMES];
}

/**
 * 出口护栏：逐个语义校验 tool_calls。
 */
export function validateToolCalls(
  calls: DmToolCall[],
  ctx: DirectorContext
): DirectorResult {
  const accepted: DmToolCall[] = [];
  const rejected: DirectorRejection[] = [];

  for (const call of calls) {
    const shape = validateToolCallShape(call);
    if (!shape.ok) {
      rejected.push({ call, reason: shape.reason ?? '形态校验失败' });
      continue;
    }
    const semantic = validateSemantics(call, ctx);
    if (!semantic.ok) {
      rejected.push({ call, reason: semantic.reason ?? '语义校验失败' });
      continue;
    }
    accepted.push(call);
  }

  return { accepted, rejected };
}

interface SemanticResult {
  ok: boolean;
  reason?: string;
}

function validateSemantics(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  switch (call.name) {
    case 'request_check':
      return validateCheckPlayer(call, ctx);
    case 'propose_state_update':
      return validateStateUpdate(call, ctx);
    case 'reveal_secret':
      return validateReveal(call, ctx);
    case 'propose_scene_change':
      return validateSceneChange(call, ctx);
    case 'lookup_entity':
      return validateLookup(call, ctx);
    default:
      return { ok: false, reason: `未知工具：${call.name as string}` };
  }
}

function validateCheckPlayer(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  const player = String(call.arguments.player ?? '');
  const exists = ctx.state.players.some((p) => p.name === player);
  if (!exists) return { ok: false, reason: `request_check.player 不在玩家阵营：${player}` };
  return { ok: true };
}

function validateSceneChange(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  const target = String(call.arguments.targetSceneId ?? '');
  if (!ctx.kb.scenes[target as SceneId]) {
    return { ok: false, reason: `propose_scene_change.targetSceneId 不存在：${target}` };
  }
  if (target === ctx.state.currentScene) return { ok: true };
  const reachable = getReachableScenes(ctx.kb, ctx.state.currentScene);
  if (!reachable.includes(target as SceneId)) {
    return { ok: false, reason: `${target} 不是 ${ctx.state.currentScene} 的邻接场景` };
  }
  return { ok: true };
}

function validateReveal(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  const id = String(call.arguments.secretId ?? '');
  if (!ctx.kb.secrets[id]) {
    return { ok: false, reason: `reveal_secret.secretId 未定义：${id}` };
  }
  return { ok: true };
}

function validateLookup(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  const kind = String(call.arguments.kind ?? '');
  const entityId = String(call.arguments.id ?? '');
  switch (kind) {
    case 'scene':
      if (!ctx.kb.scenes[entityId as SceneId]) {
        return { ok: false, reason: `场景不存在：${entityId}` };
      }
      return { ok: true };
    case 'npc':
      if (!ctx.kb.npcs[entityId]) {
        return { ok: false, reason: `NPC 不存在：${entityId}` };
      }
      return { ok: true };
    case 'item':
      if (!ctx.kb.items[entityId]) {
        return { ok: false, reason: `物品不存在：${entityId}` };
      }
      return { ok: true };
    default:
      return { ok: false, reason: `lookup_entity.kind 非法：${kind}` };
  }
}

function validateStateUpdate(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  const args = call.arguments;
  for (const key of ['hp', 'san'] as const) {
    const map = args[key];
    if (!map) continue;
    for (const playerName of Object.keys(map as Record<string, unknown>)) {
      const exists = ctx.state.players.some((p) => p.name === playerName);
      if (!exists) {
        return { ok: false, reason: `${key}.${playerName} 不在玩家阵营` };
      }
    }
  }
  if (Array.isArray(args.newItems)) {
    for (const id of args.newItems as string[]) {
      if (!ctx.kb.items[id]) {
        return { ok: false, reason: `newItems 中的物品 id 未在 KB 中：${id}` };
      }
    }
  }
  if (typeof args.sceneChange === 'string' && args.sceneChange) {
    if (!ctx.kb.scenes[args.sceneChange as SceneId]) {
      return { ok: false, reason: `sceneChange 场景未定义：${args.sceneChange}` };
    }
    if (args.sceneChange !== ctx.state.currentScene) {
      const reachable = getReachableScenes(ctx.kb, ctx.state.currentScene);
      if (!reachable.includes(args.sceneChange as SceneId)) {
        return {
          ok: false,
          reason: `sceneChange ${args.sceneChange} 不邻接当前 ${ctx.state.currentScene}`
        };
      }
    }
  }
  return { ok: true };
}
