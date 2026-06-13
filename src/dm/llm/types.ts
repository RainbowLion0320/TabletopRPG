import type { OpenAiTool } from '../tools';

export interface LlmTextInputMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmFunctionCallItem {
  type: 'function_call';
  id?: string;
  callId?: string;
  name: string;
  arguments: string;
}

export interface LlmFunctionOutputItem {
  type: 'function_call_output';
  callId: string;
  output: string;
}

export type LlmInputItem =
  | LlmTextInputMessage
  | LlmFunctionCallItem
  | LlmFunctionOutputItem;

export interface LlmToolCall {
  id?: string;
  callId?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmJsonRequest {
  label: string;
  instructions: string;
  input: LlmInputItem[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  tools?: OpenAiTool[];
  useTools?: boolean;
}

export interface LlmResult {
  rawText: string;
  toolCalls: LlmToolCall[];
  outputItems: LlmInputItem[];
}
