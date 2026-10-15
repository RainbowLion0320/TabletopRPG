import type { OpenAiTool } from '../tools';
import type { RequestObservation } from './metrics';

export interface LlmTextInputMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmFunctionCallItem {
  type: 'function_call';
  id?: string;
  callId?: string;
  name: string;
  arguments: string;
  /** Provider reasoning retained privately for chat tool continuations. */
  reasoning?: string;
}

export interface LlmFunctionOutputItem {
  type: 'function_call_output';
  callId: string;
  output: string;
}

/** Opaque reasoning item used only within the current Responses tool exchange. */
export interface LlmReasoningItem {
  type: 'reasoning';
  data: Record<string, unknown>;
}

export type LlmInputItem =
  | LlmTextInputMessage
  | LlmFunctionCallItem
  | LlmFunctionOutputItem
  | LlmReasoningItem;

export interface LlmToolCall {
  id?: string;
  callId?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmJsonRequest {
  label: string;
  instructions: string;
  /** Dynamic authoritative context, kept after the cacheable instructions. */
  context?: string;
  input: LlmInputItem[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  tools?: OpenAiTool<string>[];
  useTools?: boolean;
  /** Defaults to true. Authored turns can fail fast into deterministic narration. */
  retryOnAbort?: boolean;
  priority?: 'foreground' | 'background';
  onProgress?: (phase: LlmProgress) => void;
  /** Populated by the shared client, never serialized into model requests. */
  observation?: RequestObservation;
  signal?: AbortSignal;
}

export type LlmProgress = 'connected' | 'reasoning' | 'receiving';

export interface LlmResult {
  rawText: string;
  toolCalls: LlmToolCall[];
  outputItems: LlmInputItem[];
  /** Provider termination status, used to distinguish complete JSON from interrupted partial output. */
  finishReason: string | null;
}
