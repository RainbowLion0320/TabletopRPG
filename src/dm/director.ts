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

import type { ExploreMode, GameState, SceneId } from '../types/game';
import { getReachableScenes } from './knowledgeBase';
import type { ClassifiedIntent } from './intentClassifier';
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

export interface AllowedToolsOptions {
  intent: ClassifiedIntent;
  mode: ExploreMode;
}

const BASELINE_TOOLS: DmToolName[] = [
  'request_check',
  'propose_state_update',
  'reveal_secret',
  'lookup_entity',
  'schedule_consequence'
];

/**
 * 计算本轮允许使用的工具集。
 *
 * 规则：
 * - request_check / propose_state_update / reveal_secret / lookup_entity 始终可用；
 * - propose_scene_change 仅在 together 模式 且 本轮意图为 move/combat 时允许：
 *     · split 模式下场景由玩家在 UI 里逐个选择，AI 不应主动推动；
 *     · together 模式下只有玩家明说"走/跟/逃/追"时才合理切场。
 * - update_npc_mind 仅在 social/info 或 combat 意图时允许（需要与 NPC 互动）；
 *     其他场景下不暴露该工具，避免 Narrator 越位调用。
 */
export function allowedTools(
  _ctx: DirectorContext,
  options: AllowedToolsOptions
): DmToolName[] {
  const allowed: DmToolName[] = [...BASELINE_TOOLS];
  if (
    options.mode === 'together' &&
    (options.intent.intentKind === 'move' || options.intent.intentKind === 'combat')
  ) {
    allowed.push('propose_scene_change');
  }
  const intentKind = options.intent.intentKind;
  if (intentKind === 'social' || intentKind === 'research' || intentKind === 'combat') {
    allowed.push('update_npc_mind');
  }
  return allowed;
}

/**
 * 出口护栏：逐个语义校验 tool_calls。
 *
 * @param calls Narrator 原始调用
 * @param ctx   设计上下文
 * @param allowed 本轮允许的工具名集（来自 allowedTools）；不传则放行 BASELINE + propose_scene_change
 */
export function validateToolCalls(
  calls: DmToolCall[],
  ctx: DirectorContext,
  allowed?: DmToolName[]
): DirectorResult {
  const allowedSet = new Set<DmToolName>(
    allowed ?? [...BASELINE_TOOLS, 'propose_scene_change']
  );
  const accepted: DmToolCall[] = [];
  const rejected: DirectorRejection[] = [];

  for (const call of calls) {
    if (!allowedSet.has(call.name)) {
      rejected.push({ call, reason: `工具 ${call.name} 本轮不在允许集` });
      continue;
    }
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
    case 'schedule_consequence':
      return { ok: true };
    case 'update_npc_mind':
      return validateMindUpdate(call, ctx);
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

function validateMindUpdate(call: DmToolCall, ctx: DirectorContext): SemanticResult {
  const npcId = String(call.arguments.npcId ?? '');
  if (!ctx.kb.npcs[npcId]) {
    return { ok: false, reason: `update_npc_mind.npcId 未在 KB 中：${npcId}` };
  }
  const exceptions = call.arguments.playerExceptions;
  if (exceptions && typeof exceptions === 'object' && !Array.isArray(exceptions)) {
    for (const playerName of Object.keys(exceptions as Record<string, unknown>)) {
      const exists = ctx.state.players.some((p) => p.name === playerName);
      if (!exists) {
        return { ok: false, reason: `playerExceptions.${playerName} 不在玩家阵营` };
      }
    }
  }
  return { ok: true };
}
