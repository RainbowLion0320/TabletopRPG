import type { ResolvedApiConfig } from '../../config/aiConfig';
import { toResponsesTools } from '../tools';
import { collectTextContent, parseFunctionArguments, readJsonResponse } from './http';
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
  const body: Record<string, unknown> = {
    model: config.model,
    instructions: request.instructions,
    input: toResponsesInput(request.input),
    max_output_tokens: request.maxOutputTokens ?? 1024,
    text: {
      format: {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.schema
      }
    },
    store: false
  };

  if (request.useTools !== false && request.tools?.length) {
    body.tools = toResponsesTools(request.tools);
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${config.endpoint.replace(/\/+$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await readJsonResponse<ResponsesJson>(response, request.label);
  const rawFunctionItems = responseFunctionItems(data);
  return {
    rawText: extractResponsesText(data),
    toolCalls: parseResponsesToolCalls(rawFunctionItems),
    outputItems: rawFunctionItems.map(toOutputItem)
  };
}

function toResponsesInput(input: LlmInputItem[]): Array<Record<string, unknown>> {
  return input.map((item) => {
    if ('role' in item) return { role: item.role, content: item.content };
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
    if (typeof record.text === 'string') parts.push(record.text);
    collectTextContent(record.content, parts);
  }
  return parts.join('\n');
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
