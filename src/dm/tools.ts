/**
 * DM Agent 工具契约。
 *
 * 这些 schema 同时用于：
 * 1. 拼装 OpenAI function calling 的 `tools` 字段，发给模型；
 * 2. 接收模型回包后的 tool_calls 校验，违规调用直接丢弃。
 *
 * 重要：状态权威方在前端。AI 永远不能直接改 HP / scene / flags，
 * 只能 propose_*；Director 校验、StateResolver 落地。
 */

import type { DmToolCall, DmToolName } from './types';

// ---------- OpenAI function calling schema ----------

/** OpenAI 兼容的 tools 数组（用于 chat.completions 请求 body） */
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
  }
];

// ---------- 解析与校验 ----------

interface OpenAiToolCallPayload {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

const TOOL_NAME_SET = new Set<DmToolName>([
  'request_check',
  'propose_state_update',
  'reveal_secret',
  'lookup_entity',
  'propose_scene_change'
]);

/**
 * 把 OpenAI 兼容回包里的 tool_calls 数组解析成内部 DmToolCall[]。
 * 不合法的项静默丢弃；返回值已经是"形态合法"的工具调用。
 *
 * @param raw chat.completions 中 message.tool_calls 字段（任意模型可能给 null/undefined/数组）
 */
export function parseToolCalls(raw: unknown): DmToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: DmToolCall[] = [];
  for (const item of raw as OpenAiToolCallPayload[]) {
    if (!item || typeof item !== 'object') continue;
    if (item.type && item.type !== 'function') continue;
    const name = item.function?.name;
    if (!name || !TOOL_NAME_SET.has(name as DmToolName)) continue;
    const args = parseToolArguments(item.function?.arguments);
    if (!args) continue;
    out.push({
      name: name as DmToolName,
      arguments: args,
      callId: item.id
    });
  }
  return out;
}

function parseToolArguments(rawArgs: string | undefined): Record<string, unknown> | null {
  if (rawArgs === undefined || rawArgs === null) return {};
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
