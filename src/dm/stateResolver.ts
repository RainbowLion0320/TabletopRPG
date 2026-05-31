/**
 * State Resolver - 把 Narrator 输出 + Director 校验过的 tool_calls
 * 翻译为前端 reducer 能消费的 AiResponse + DMEvent[] 时间线。
 *
 * 关键点：
 * - 同名工具被多次调用时合并 delta（hp / san / flags / newItems）
 * - 场景切换以最后一次为准（极少出现）
 * - reveal_secret 写入 flag `secret.<id>.revealed = true`，便于 deriveRevealContext
 *   在下一轮把该 secret 视为已解锁
 */

import type { AiResponse, CheckRequest, SceneId } from '../types/game';
import type { NarratorOutput } from './narrator';
import type { DMEvent, DmToolCall } from './types';

export interface ResolveInput {
  narrator: NarratorOutput;
  acceptedCalls: DmToolCall[];
  /** 当前回合号（来自 WorkingMemory） */
  turn: number;
}

export interface ResolveOutput {
  legacyResponse: AiResponse;
  events: DMEvent[];
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
  const { narrator, acceptedCalls, turn } = input;
  const stateUpdate = emptyStateUpdate();
  const events: DMEvent[] = [];
  let check: CheckRequest | null = null;

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
        // 当前架构是单轮调用，无法把 lookup 结果回填给同一次 LLM；
        // 仅记录事件以便下次 Director 收窄。Phase 4+ 可加 tool-call loop。
        events.push({
          id: genEventId(turn, 'lookup'),
          turn,
          kind: 'lookup',
          description: `查询 ${String(call.arguments.kind)}:${String(call.arguments.id)}`,
          toolName: call.name
        });
        break;
      }
      default:
        break;
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
    stateUpdate,
    nextPrompt: narrator.nextPrompt || '',
    playerChoices: narrator.playerChoices ?? []
  };

  return { legacyResponse, events };
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
