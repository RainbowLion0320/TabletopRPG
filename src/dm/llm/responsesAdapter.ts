import type { ResolvedApiConfig } from '../../config/aiConfig';
import { toResponsesTools } from '../tools';
import { collectTextContent, parseFunctionArguments, requestJsonResponse } from './http';
import type {
  LlmFunctionCallItem,
  LlmInputItem,
  LlmJsonRequest,
  LlmResult,
  LlmToolCall
} from './types';

interface ResponsesJson {
  output_text?: unknown;
  output?: unknown;
  status?: unknown;
  incomplete_details?: unknown;
  error?: { message?: string };
}

interface ResponseFunctionCallItem extends Record<string, unknown> {
  type: 'function_call';
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
}

export async function requestResponsesJson(
  config: ResolvedApiConfig,
  request: LlmJsonRequest
): Promise<LlmResult> {
  const mimo = config.provider === 'mimo';
  const hasTools = request.useTools !== false && Boolean(request.tools?.length);
  const body: Record<string, unknown> = {
    model: config.model,
    instructions: mimo ? `${request.instructions}\n返回正文时输出符合以下 schema 的 JSON 对象；需要工具时使用工具通道。\n${JSON.stringify(request.schema)}` : request.instructions,
    input: toResponsesInput(request.input),
    max_output_tokens: (request.maxOutputTokens ?? 1024) + (mimo ? 4096 : 0),
    text: {
      format: mimo ? { type: hasTools ? 'text' : 'json_object' } : {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.schema
      }
    },
    store: false
  };
  if (mimo) body.reasoning = { effort: 'high' };

  if (request.useTools !== false && request.tools?.length) {
    body.tools = toResponsesTools(request.tools);
    body.tool_choice = 'auto';
  }

  const data = await requestJsonResponse<ResponsesJson>(`${config.endpoint.replace(/\/+$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body),
    signal: request.signal
  }, request.label);
  const rawFunctionItems = responseFunctionItems(data);
  return {
    rawText: extractResponsesText(data),
    toolCalls: parseResponsesToolCalls(rawFunctionItems),
    outputItems: continuationItems(data),
    finishReason: responseFinishReason(data)
  };
}

function responseFinishReason(data: ResponsesJson): string | null {
  if (data.status !== 'incomplete') return typeof data.status === 'string' ? data.status : null;
  if (!data.incomplete_details || typeof data.incomplete_details !== 'object') return 'incomplete';
  const reason = (data.incomplete_details as Record<string, unknown>).reason;
  return typeof reason === 'string' && reason.trim() ? reason : 'incomplete';
}

function toResponsesInput(input: LlmInputItem[]): Array<Record<string, unknown>> {
  return input.map((item) => {
    if ('role' in item) return { role: item.role, content: item.content };
    if (item.type === 'reasoning') return item.data;
    if (item.type === 'function_call_output') {
      return {
        type: 'function_call_output',
        call_id: item.callId,
        output: item.output
      };
    }
    return {
      type: 'function_call',
      id: item.id,
      call_id: item.callId,
      name: item.name,
      arguments: item.arguments
    };
  });
}

function extractResponsesText(data: ResponsesJson): string {
  if (typeof data.output_text === 'string') return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.type === 'reasoning') continue;
    if (typeof record.text === 'string') parts.push(record.text);
    collectTextContent(record.content, parts);
  }
  return parts.join('\n');
}

function continuationItems(data: ResponsesJson): LlmInputItem[] {
  const output = Array.isArray(data.output) ? data.output : [];
  return output.flatMap((item): LlmInputItem[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (record.type === 'reasoning') return [{ type: 'reasoning', data: record }];
    if (record.type === 'function_call') return [toOutputItem(record as ResponseFunctionCallItem)];
    return [];
  });
}

function responseFunctionItems(data: ResponsesJson): ResponseFunctionCallItem[] {
  const output = Array.isArray(data.output) ? data.output : [];
  return output.filter((item): item is ResponseFunctionCallItem => {
    if (!item || typeof item !== 'object') return false;
    return (item as Record<string, unknown>).type === 'function_call';
  });
}

function parseResponsesToolCalls(items: ResponseFunctionCallItem[]): LlmToolCall[] {
  const out: LlmToolCall[] = [];
  for (const item of items) {
    if (!item.name) continue;
    const args = parseFunctionArguments(item.arguments);
    if (!args) continue;
    out.push({
      id: item.id,
      callId: item.call_id ?? item.id,
      name: item.name,
      arguments: args
    });
  }
  return out;
}

function toOutputItem(item: ResponseFunctionCallItem): LlmFunctionCallItem {
  return {
    type: 'function_call',
    id: item.id,
    callId: item.call_id ?? item.id,
    name: item.name ?? '',
    arguments: item.arguments ?? ''
  };
}
