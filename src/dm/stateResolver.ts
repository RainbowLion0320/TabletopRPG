/**
 * State Resolver - 把 Narrator 输出 + Director 校验过的 function calls
 * 翻译为前端 reducer 能消费的 AiResponse + DMEvent[] 时间线。
 *
 * 关键点：
 * - 同名工具被多次调用时合并 delta（hp / san / flags / newItems）
 * - 场景切换以最后一次为准（极少出现）
 * - reveal_secret 写入 flag `secret.<id>.revealed = true`，便于 deriveRevealContext
 *   在下一轮把该 secret 视为已解锁
 */

import type { AiResponse, CheckRequest, NpcMindModel, PersistedPendingConsequence, SceneId } from '../types/game';
import type { NarratorOutput } from './narrator';
import type { DMEvent, DmToolCall } from './types';

export interface ResolveInput {
  narrator: NarratorOutput;
  acceptedCalls: DmToolCall[];
  /** 当前回合号（来自 WorkingMemory） */
  turn: number;
  /** 本轮开始前的 pendingConsequences 快照（未衰减），可选 */
  pendingBefore?: PersistedPendingConsequence[];
}

export interface ResolveOutput {
  legacyResponse: AiResponse;
  events: DMEvent[];
  /** Phase 9：Narrator 调用 update_npc_mind 产生的增量心智更新，交由 controller dispatch */
  mindUpdates?: Array<{ npcId: string; partial: Partial<NpcMindModel> }>;
}

interface MutableStateUpdate {
  hp: Record<string, number>;
  san: Record<string, number>;
  flags: Record<string, unknown>;
  newItems: string[];
  sceneChange: SceneId | null;
}

function emptyStateUpdate(): MutableStateUpdate {
  return { hp: {}, san: {}, flags: {}, newItems: [], sceneChange: null };
}

function mergeNumberMap(target: Record<string, number>, src: unknown) {
  if (typeof src !== 'object' || src === null || Array.isArray(src)) return;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      target[k] = (target[k] ?? 0) + v;
    }
  }
}

function uniqPushAll(target: string[], src: unknown) {
  if (!Array.isArray(src)) return;
  for (const item of src) {
    if (typeof item === 'string' && !target.includes(item)) target.push(item);
  }
}

let eventCounter = 0;
function genEventId(turn: number, kind: string): string {
  eventCounter = (eventCounter + 1) % 100000;
  return `evt-${turn}-${kind}-${eventCounter}`;
}

export function resolveDmTurn(input: ResolveInput): ResolveOutput {
  const { narrator, acceptedCalls, turn, pendingBefore } = input;
  const stateUpdate = emptyStateUpdate();
  const events: DMEvent[] = [];
  let check: CheckRequest | null = null;
  const scheduledConsequences: PersistedPendingConsequence[] = [];
  const triggeredConsequenceIds: string[] = [];
  const mindUpdates: Array<{ npcId: string; partial: Partial<NpcMindModel> }> = [];

  for (const call of acceptedCalls) {
    switch (call.name) {
      case 'request_check': {
        const args = call.arguments as Record<string, unknown>;
        // 多个 request_check 时取第一个；其余忽略并记录事件
        if (!check) {
          check = {
            skill: String(args.skill),
            difficulty: args.difficulty as CheckRequest['difficulty'],
            player: String(args.player),
            reason: typeof args.reason === 'string' ? args.reason : undefined
          };
        }
        events.push({
          id: genEventId(turn, 'check'),
          turn,
          kind: 'check',
          description: `${args.player} ${args.skill}（${args.difficulty}）${
            typeof args.reason === 'string' ? `· ${args.reason}` : ''
          }`,
          toolName: call.name
        });
        break;
      }
      case 'propose_state_update': {
        const args = call.arguments as Record<string, unknown>;
        mergeNumberMap(stateUpdate.hp, args.hp);
        mergeNumberMap(stateUpdate.san, args.san);
        if (args.flags && typeof args.flags === 'object' && !Array.isArray(args.flags)) {
          Object.assign(stateUpdate.flags, args.flags);
        }
        uniqPushAll(stateUpdate.newItems, args.newItems);
        if (typeof args.sceneChange === 'string' && args.sceneChange) {
          stateUpdate.sceneChange = args.sceneChange as SceneId;
        }
        events.push({
          id: genEventId(turn, 'state'),
          turn,
          kind: 'state_update',
          description: summarizeStateUpdate(args),
          toolName: call.name
        });
        break;
      }
      case 'reveal_secret': {
        const args = call.arguments as Record<string, unknown>;
        const secretId = String(args.secretId);
        stateUpdate.flags[`secret.${secretId}.revealed`] = true;
        events.push({
          id: genEventId(turn, 'reveal'),
          turn,
          kind: 'secret_reveal',
          description: `揭示 ${secretId}${
            typeof args.reason === 'string' ? `（${args.reason}）` : ''
          }`,
          toolName: call.name
        });
        break;
      }
      case 'propose_scene_change': {
        const args = call.arguments as Record<string, unknown>;
        const target = String(args.targetSceneId);
        stateUpdate.sceneChange = target as SceneId;
        events.push({
          id: genEventId(turn, 'scene'),
          turn,
          kind: 'scene_change',
          description: `切换到 ${target}${
            typeof args.reason === 'string' ? `（${args.reason}）` : ''
          }`,
          toolName: call.name
        });
        break;
      }
      case 'lookup_entity': {
        // 仅记录事件；Narrator 内部已由 tool-call loop 回填过一轮。
        events.push({
          id: genEventId(turn, 'lookup'),
          turn,
          kind: 'lookup',
          description: `查询 ${String(call.arguments.kind)}:${String(call.arguments.id)}`,
          toolName: call.name
        });
        break;
      }
      case 'schedule_consequence': {
        const args = call.arguments as Record<string, unknown>;
        const id = String(args.id);
        const description = String(args.description);
        const triggerEvent = String(args.triggerEvent);
        const remainingTurns = Math.max(
          1,
          Math.min(10, Math.floor(Number(args.remainingTurns) || 1))
        );
        // 同 id 覆盖：先移除本轮已有同 id
        const dupIdx = scheduledConsequences.findIndex((p) => p.id === id);
        if (dupIdx >= 0) scheduledConsequences.splice(dupIdx, 1);
        scheduledConsequences.push({
          id,
          description,
          remainingTurns,
          triggerEvent,
          scheduledAtTurn: turn
        });
        events.push({
          id: genEventId(turn, 'schedule'),
          turn,
          kind: 'schedule',
          description: `调度后果 ${id}：${description}（T-${remainingTurns}）`,
          toolName: call.name
        });
        break;
      }
      case 'update_npc_mind': {
        const args = call.arguments as Record<string, unknown>;
        const npcId = String(args.npcId);
        const partial: Partial<NpcMindModel> = {
          lastUpdatedTurn: turn
        };
        if (typeof args.coreMotivation === 'string') {
          partial.coreMotivation = args.coreMotivation;
        }
        if (typeof args.currentStance === 'string') {
          partial.currentStance = args.currentStance;
        }
        if (
          args.playerExceptions && typeof args.playerExceptions === 'object'
          && !Array.isArray(args.playerExceptions)
        ) {
          const ex: Record<string, string> = {};
          for (const [k, v] of Object.entries(args.playerExceptions as Record<string, unknown>)) {
            if (typeof v === 'string' && v.trim()) ex[k] = v.trim();
          }
          if (Object.keys(ex).length) partial.playerExceptions = ex;
        }
        // 同一轮同 npcId 多次调用时以后一次为准（覆盖 partial）
        const dup = mindUpdates.findIndex((m) => m.npcId === npcId);
        if (dup >= 0) {
          mindUpdates[dup] = { npcId, partial: { ...mindUpdates[dup].partial, ...partial } };
        } else {
          mindUpdates.push({ npcId, partial });
        }
        events.push({
          id: genEventId(turn, 'mind'),
          turn,
          kind: 'mind_update',
          description: `刷新 ${npcId} 心智${
            partial.coreMotivation ? `：动机=${partial.coreMotivation}` : ''
          }${
            partial.currentStance ? `；立场=${partial.currentStance}` : ''
          }`,
          toolName: call.name
        });
        break;
      }
      default:
        break;
    }
  }

  // 处理现有 pendingConsequences：衰减一轮，<=0 的计为本轮触发。
  // 仅输出 triggered id；reducer 负责在存档中迁移 / 移除。
  if (pendingBefore && pendingBefore.length) {
    for (const item of pendingBefore) {
      const next = item.remainingTurns - 1;
      if (next <= 0) {
        triggeredConsequenceIds.push(item.id);
        events.push({
          id: genEventId(turn, 'cons'),
          turn,
          kind: 'consequence',
          description: `后果触发：${item.triggerEvent}`,
          toolName: 'schedule_consequence'
        });
      }
    }
  }

  // 始终至少记录一条 narrative 事件，便于 longTermMemory.eventLog 串起来
  if (narrator.narrative) {
    events.push({
      id: genEventId(turn, 'narr'),
      turn,
      kind: 'narrative',
      description: narrator.narrative.slice(0, 80)
    });
  }

  const legacyResponse: AiResponse = {
    narrative: narrator.narrative,
    activeNpc: narrator.activeNpc,
    check,
    stateUpdate: {
      ...stateUpdate,
      scheduledConsequences,
      triggeredConsequenceIds
    },
    nextPrompt: narrator.nextPrompt || '',
    playerChoices: narrator.playerChoices ?? []
  };

  return { legacyResponse, events, mindUpdates: mindUpdates.length ? mindUpdates : undefined };
}

function summarizeStateUpdate(args: Record<string, unknown>): string {
  const parts: string[] = [];
  if (args.hp && Object.keys(args.hp as Record<string, unknown>).length) {
    parts.push(`hp:${JSON.stringify(args.hp)}`);
  }
  if (args.san && Object.keys(args.san as Record<string, unknown>).length) {
    parts.push(`san:${JSON.stringify(args.san)}`);
  }
  if (args.flags && Object.keys(args.flags as Record<string, unknown>).length) {
    parts.push(`flags:${JSON.stringify(args.flags)}`);
  }
  if (Array.isArray(args.newItems) && args.newItems.length) {
    parts.push(`items:${JSON.stringify(args.newItems)}`);
  }
  if (typeof args.sceneChange === 'string' && args.sceneChange) {
    parts.push(`scene→${args.sceneChange}`);
  }
  return parts.join(' | ') || '（空 delta）';
}
