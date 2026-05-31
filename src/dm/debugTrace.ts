/**
 * DM Agent DEV 追踪（Phase 7）。
 *
 * 仅在 import.meta.env.DEV 下被 pipeline 写入，提供右下角 DmDebugDrawer 订阅。
 * 不持久化、不进存档；进程内最近 N 轮内存环。
 */

import type { DmContext } from './contextBuilder';
import type { DmToolCall } from './types';

export interface DmTraceRejection {
  call: DmToolCall;
  reason: string;
}

export interface DmTrace {
  id: string;
  /** 写入时间戳（ms） */
  timestamp: number;
  /** 当前回合（来自 workingMemory.turnCount + 1） */
  turn: number;
  /** 玩家本轮宣言（顺序与 actions 一致） */
  actions: Array<{ player: string; action: string; scene?: string }>;
  /** 喂给 Narrator 的上下文（已脱敏） */
  ctx: DmContext;
  /** Narrator 原始返回 */
  narratorRaw: string;
  /** Narrator 是否原生返回了 tool_calls 字段（false 表示走 JSON 兜底） */
  usedFunctionCalling: boolean;
  /** Narrator 解析出的全部工具调用（未经 Director 校验） */
  toolCalls: DmToolCall[];
  /** Director 通过的工具调用 */
  acceptedCalls: DmToolCall[];
  /** Director 拒绝的工具调用及原因 */
  rejectedCalls: DmTraceRejection[];
  /** 本轮是否触发了长期记忆压缩 */
  memoryUpdate?: { summary: string; summarizedUntilIndex: number };
}

const MAX_TRACES = 20;
const traces: DmTrace[] = [];
const listeners = new Set<() => void>();

export function pushTrace(trace: DmTrace): void {
  traces.unshift(trace);
  if (traces.length > MAX_TRACES) traces.length = MAX_TRACES;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore listener errors */
    }
  });
}

export function getTraces(): readonly DmTrace[] {
  return traces;
}

export function subscribeTraces(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearTraces(): void {
  traces.length = 0;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
