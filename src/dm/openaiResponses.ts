import type { ApiConfig } from '../types/game';

export interface ResponseInputMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ResponseFunctionCallItem extends Record<string, unknown> {
  type: 'function_call';
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

export interface ResponseFunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export type ResponseInputItem =
  | ResponseInputMessage
  | ResponseFunctionCallItem
  | ResponseFunctionCallOutputItem
  | Record<string, unknown>;

export interface OpenAiResponsesJson {
  output_text?: unknown;
  output?: unknown;
  error?: { message?: string };
  choices?: unknown;
}

function collectTextContent(content: unknown, parts: string[]): void {
  if (typeof content === 'string') {
    parts.push(content);
    return;
  }
  if (!Array.isArray(content)) return;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const text = (part as Record<string, unknown>).text;
    if (typeof text === 'string') parts.push(text);
  }
}

export function responsesEndpoint(config: ApiConfig): string {
  return (config.endpoint?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

export function responsesModel(config: ApiConfig): string {
  return config.model?.trim() || 'gpt-4o';
}

export function historyToResponseInput(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): ResponseInputMessage[] {
  return history
    .filter((turn) => turn.content.trim())
    .map((turn) => ({ role: turn.role, content: turn.content }));
}

export function jsonSchemaTextFormat(
  name: string,
  schema: Record<string, unknown>,
  strict = true
) {
  return {
    format: {
      type: 'json_schema',
      name,
      strict,
      schema
    }
  };
}

export async function readResponsesJson(
  response: Response,
  label: string
): Promise<OpenAiResponsesJson> {
  const text = await response.text();
  let data: OpenAiResponsesJson;
  try {
    data = text ? JSON.parse(text) as OpenAiResponsesJson : {};
  } catch {
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    throw new Error(`${label} response is not JSON: ${text.slice(0, 120)}`);
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  }
  return data;
}

export function extractResponseText(data: OpenAiResponsesJson): string {
  if (typeof data.output_text === 'string') return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text === 'string') {
      parts.push(record.text);
    }
    collectTextContent(record.content, parts);
  }
  if (parts.length) return parts.join('\n');

  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const record = choice as Record<string, unknown>;
    collectTextContent(record.text, parts);
    const message = record.message;
    if (!message || typeof message !== 'object') continue;
    collectTextContent((message as Record<string, unknown>).content, parts);
  }
  return parts.join('\n');
}

export function responseFunctionCallItems(data: OpenAiResponsesJson): ResponseFunctionCallItem[] {
  const output = Array.isArray(data.output) ? data.output : [];
  return output.filter((item): item is ResponseFunctionCallItem => {
    if (!item || typeof item !== 'object') return false;
    return (item as Record<string, unknown>).type === 'function_call';
  });
}
