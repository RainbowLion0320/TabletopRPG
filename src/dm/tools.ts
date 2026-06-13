/**
 * DM Agent 工具契约。
 *
 * 这些 schema 同时用于：
 * 1. 拼装 OpenAI Responses function tools，发给模型；
 * 2. 接收模型回包后的 function_call items 校验，违规调用直接丢弃。
 *
 * 重要：状态权威方在前端。AI 永远不能直接改 HP / scene / flags，
 * 只能 propose_*；Director 校验、StateResolver 落地。
 */

import type { DmToolCall, DmToolName } from './types';

// ---------- OpenAI function calling schema ----------

/** OpenAI Responses function tool schema. */
export interface OpenAiTool {
  type: 'function';
  function: {
    name: DmToolName;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface OpenAiResponseTool {
  type: 'function';
  name: DmToolName;
  description: string;
  parameters: OpenAiTool['function']['parameters'];
}

export function toResponsesTools(tools: OpenAiTool[]): OpenAiResponseTool[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
}

export const DM_TOOLS: OpenAiTool[] = [
  {
    type: 'function',
    function: {
      name: 'request_check',
      description:
        '请求前端为指定玩家执行一次技能检定。骰子由前端摇，AI 不得自行判定结果。',
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: '技能名，例如 “聆听” “心理学”' },
          difficulty: {
            type: 'string',
            enum: ['普通', '困难', '极难'],
            description: '难度等级'
          },
          player: { type: 'string', description: '被检定玩家的角色名' },
          reason: { type: 'string', description: '触发该检定的简短理由' }
        },
        required: ['skill', 'difficulty', 'player'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_state_update',
      description:
        '提议修改游戏状态。前端会再校验一次后落地。所有字段都是可选 delta。',
      parameters: {
        type: 'object',
        properties: {
          hp: {
            type: 'object',
            description: '玩家名 → HP 变动（负数为伤害，正数为治疗）',
            additionalProperties: { type: 'number' }
          },
          san: {
            type: 'object',
            description: '玩家名 → SAN 变动',
            additionalProperties: { type: 'number' }
          },
          flags: {
            type: 'object',
            description: '剧情标志 key→value，会浅合并到 state.flags',
            additionalProperties: true
          },
          newItems: {
            type: 'array',
            description: '本轮被发现/获得的线索 id 列表（必须是 KB 中已知 id）',
            items: { type: 'string' }
          },
          sceneChange: {
            type: ['string', 'null'],
            description: '若本轮发生场景切换，目标场景 id；否则 null'
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reveal_secret',
      description:
        '宣布某个 KP 内幕已被玩家发现。仅在玩家行为足以触发解锁条件时调用；否则交由系统按条件自动解锁。',
      parameters: {
        type: 'object',
        properties: {
          secretId: { type: 'string', description: 'KB.secrets 中的 secret id' },
          reason: { type: 'string', description: '玩家如何触发了该解锁' }
        },
        required: ['secretId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_entity',
      description:
        '查询 KB 中某个实体（场景 / NPC / 物品）的当前可见信息（公开面 + 已解锁 secrets）。模型无法直接读取整本 KB，需要细节时通过该工具问。',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['scene', 'npc', 'item'],
            description: '要查询的实体类型'
          },
          id: { type: 'string', description: '实体 id（场景 id / NPC 名 / 物品 id）' }
        },
        required: ['kind', 'id'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_scene_change',
      description:
        '提议切换场景。目标必须是当前场景的邻接场景；Director 会校验后落地。',
      parameters: {
        type: 'object',
        properties: {
          targetSceneId: { type: 'string', description: '目标场景 id' },
          reason: { type: 'string', description: '为什么切换' }
        },
        required: ['targetSceneId'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_consequence',
      description:
        '注册一个延迟触发的后果（例如“3 轮后暴徒赶到”）。每个调用产生一条 pending 项，每轮 remainingTurns 自动 -1，为 0 时会被 Narrator 在下一轮上下文看到。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '唯一标识（同 id 重复提交会被覆盖）' },
          description: { type: 'string', description: 'KP 视角的后果描述' },
          remainingTurns: {
            type: 'integer',
            description: '剩余轮数（1-10）'
          },
          triggerEvent: { type: 'string', description: '触发时的事件描述，清晰一句话' }
        },
        required: ['id', 'description', 'remainingTurns', 'triggerEvent'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_npc_mind',
      description:
        '仅在 NPC 心智发生明显变化、且在本轮叙事里有明确依据时调用：更新某 NPC 的动机 / 对调查者的整体立场 / 玩家特例。不允许凭空制造；默认 system2 会定期自动合成，仅在需要立即刷新时使用。',
      parameters: {
        type: 'object',
        properties: {
          npcId: { type: 'string', description: 'NPC 全名，必须在 KB.npcs 中存在' },
          coreMotivation: { type: 'string', description: '一句话核心动机（可选）' },
          currentStance: { type: 'string', description: '对调查者整体的当前立场（可选）' },
          playerExceptions: {
            type: 'object',
            description: '玩家名 → 不同于整体立场的描述（可选；不传则保留原有）',
            additionalProperties: { type: 'string' }
          }
        },
        required: ['npcId'],
        additionalProperties: false
      }
    }
  }
];

// ---------- 解析与校验 ----------

interface OpenAiResponseFunctionCallPayload {
  id?: string;
  callId?: string;
  call_id?: string;
  type?: string;
  name?: string;
  arguments?: string | Record<string, unknown>;
}

const TOOL_NAME_SET = new Set<DmToolName>([
  'request_check',
  'propose_state_update',
  'reveal_secret',
  'lookup_entity',
  'propose_scene_change',
  'schedule_consequence',
  'update_npc_mind'
]);
export function parseResponseToolCalls(raw: unknown): DmToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: DmToolCall[] = [];
  for (const item of raw as OpenAiResponseFunctionCallPayload[]) {
    if (!item || typeof item !== 'object') continue;
    if (item.type !== undefined && item.type !== 'function_call') continue;
    const name = item.name;
    if (!name || !TOOL_NAME_SET.has(name as DmToolName)) continue;
    const args = parseToolArguments(item.arguments);
    if (!args) continue;
    out.push({
      name: name as DmToolName,
      arguments: args,
      callId: item.callId ?? item.call_id ?? item.id
    });
  }
  return out;
}

function parseToolArguments(rawArgs: string | Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (rawArgs === undefined || rawArgs === null) return {};
  if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) return rawArgs;
  if (typeof rawArgs !== 'string') return null;
  const trimmed = rawArgs.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- 单调用形状校验（用于 Director / StateResolver 入口） ----------

export interface ToolValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateToolCallShape(call: DmToolCall): ToolValidationResult {
  switch (call.name) {
    case 'request_check':
      return validateRequestCheck(call.arguments);
    case 'propose_state_update':
      return validateProposeStateUpdate(call.arguments);
    case 'reveal_secret':
      return validateRevealSecret(call.arguments);
    case 'lookup_entity':
      return validateLookupEntity(call.arguments);
    case 'propose_scene_change':
      return validateProposeSceneChange(call.arguments);
    case 'schedule_consequence':
      return validateScheduleConsequence(call.arguments);
    case 'update_npc_mind':
      return validateUpdateNpcMind(call.arguments);
    default:
      return { ok: false, reason: `未知工具：${(call as { name: string }).name}` };
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateRequestCheck(args: Record<string, unknown>): ToolValidationResult {
  if (!isString(args.skill)) return { ok: false, reason: 'skill 必须是非空字符串' };
  if (!['普通', '困难', '极难'].includes(String(args.difficulty))) {
    return { ok: false, reason: 'difficulty 必须是 普通/困难/极难 之一' };
  }
  if (!isString(args.player)) return { ok: false, reason: 'player 必须是非空字符串' };
  if (args.reason !== undefined && typeof args.reason !== 'string') {
    return { ok: false, reason: 'reason 必须是字符串' };
  }
  return { ok: true };
}

function validateProposeStateUpdate(args: Record<string, unknown>): ToolValidationResult {
  for (const key of ['hp', 'san'] as const) {
    if (args[key] === undefined) continue;
    const value = args[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, reason: `${key} 必须是对象` };
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!isFiniteNumber(v)) {
        return { ok: false, reason: `${key}.${k} 必须是有限数字` };
      }
    }
  }
  if (args.flags !== undefined) {
    if (typeof args.flags !== 'object' || args.flags === null || Array.isArray(args.flags)) {
      return { ok: false, reason: 'flags 必须是对象' };
    }
  }
  if (args.newItems !== undefined) {
    if (!Array.isArray(args.newItems) || args.newItems.some((it) => typeof it !== 'string')) {
      return { ok: false, reason: 'newItems 必须是字符串数组' };
    }
  }
  if (
    args.sceneChange !== undefined &&
    args.sceneChange !== null &&
    typeof args.sceneChange !== 'string'
  ) {
    return { ok: false, reason: 'sceneChange 必须是字符串或 null' };
  }
  return { ok: true };
}

function validateRevealSecret(args: Record<string, unknown>): ToolValidationResult {
  if (!isString(args.secretId)) return { ok: false, reason: 'secretId 必须是非空字符串' };
  if (args.reason !== undefined && typeof args.reason !== 'string') {
    return { ok: false, reason: 'reason 必须是字符串' };
  }
  return { ok: true };
}

function validateLookupEntity(args: Record<string, unknown>): ToolValidationResult {
  if (!['scene', 'npc', 'item'].includes(String(args.kind))) {
    return { ok: false, reason: 'kind 必须是 scene/npc/item' };
  }
  if (!isString(args.id)) return { ok: false, reason: 'id 必须是非空字符串' };
  return { ok: true };
}

function validateProposeSceneChange(args: Record<string, unknown>): ToolValidationResult {
  if (!isString(args.targetSceneId)) {
    return { ok: false, reason: 'targetSceneId 必须是非空字符串' };
  }
  if (args.reason !== undefined && typeof args.reason !== 'string') {
    return { ok: false, reason: 'reason 必须是字符串' };
  }
  return { ok: true };
}

function validateScheduleConsequence(args: Record<string, unknown>): ToolValidationResult {
  if (!isString(args.id)) return { ok: false, reason: 'id 必须是非空字符串' };
  if (!isString(args.description)) return { ok: false, reason: 'description 必须是非空字符串' };
  if (!isString(args.triggerEvent)) return { ok: false, reason: 'triggerEvent 必须是非空字符串' };
  const turns = args.remainingTurns;
  if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 1 || turns > 10) {
    return { ok: false, reason: 'remainingTurns 必须是 1–10 的整数' };
  }
  return { ok: true };
}

function validateUpdateNpcMind(args: Record<string, unknown>): ToolValidationResult {
  if (!isString(args.npcId)) return { ok: false, reason: 'npcId 必须是非空字符串' };
  const hasMotivation = args.coreMotivation !== undefined;
  const hasStance = args.currentStance !== undefined;
  const hasExceptions = args.playerExceptions !== undefined;
  if (hasMotivation && typeof args.coreMotivation !== 'string') {
    return { ok: false, reason: 'coreMotivation 必须是字符串' };
  }
  if (hasStance && typeof args.currentStance !== 'string') {
    return { ok: false, reason: 'currentStance 必须是字符串' };
  }
  if (hasExceptions) {
    const ex = args.playerExceptions;
    if (typeof ex !== 'object' || ex === null || Array.isArray(ex)) {
      return { ok: false, reason: 'playerExceptions 必须是对象' };
    }
    for (const [, v] of Object.entries(ex as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        return { ok: false, reason: 'playerExceptions 的值必须是字符串' };
      }
    }
  }
  if (!hasMotivation && !hasStance && !hasExceptions) {
    return { ok: false, reason: '至少提供 coreMotivation/currentStance/playerExceptions 中一项' };
  }
  return { ok: true };
}
