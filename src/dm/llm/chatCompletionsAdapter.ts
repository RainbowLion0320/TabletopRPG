import type { ResolvedApiConfig } from '../../config/aiConfig';
import { AiProtocolError } from './errors';
import { collectTextContent, parseFunctionArguments, readJsonResponse } from './http';
import type {
  LlmFunctionCallItem,
  LlmFunctionOutputItem,
  LlmInputItem,
  LlmJsonRequest,
  LlmResult,
  LlmTextInputMessage,
  LlmToolCall
} from './types';

interface ChatCompletionJson {
  choices?: unknown;
  error?: { message?: string };
}

interface ChatToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export async function requestChatCompletionsJson(
  config: ResolvedApiConfig,
  request: LlmJsonRequest
): Promise<LlmResult> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: toChatMessages(request.instructions, request.input),
    max_tokens: request.maxOutputTokens ?? 1024,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: request.schemaName,
        strict: true,
        schema: request.schema
      }
    }
  };

  if (request.useTools !== false && request.tools?.length) {
    body.tools = request.tools;
    body.tool_choice = 'auto';
  }

  let data: ChatCompletionJson;
  try {
    const response = await fetch(`${config.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });
    data = await readJsonResponse<ChatCompletionJson>(response, request.label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (request.useTools !== false && request.tools?.length && /tool|function/i.test(message)) {
      throw new AiProtocolError(
        `当前协议/模型不支持工具调用：请切换 Responses，或使用支持 tools 的 chat-compatible endpoint。原始错误：${message}`
      );
    }
    throw error;
  }

  const message = firstAssistantMessage(data);
  const toolCalls = parseChatToolCalls(message?.tool_calls);
  return {
    rawText: extractChatText(message?.content),
    toolCalls,
    outputItems: toolCalls.map(toOutputItem)
  };
}

function toChatMessages(
  instructions: string,
  input: LlmInputItem[]
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: instructions }];
  let pendingToolCalls: Array<Record<string, unknown>> = [];

  const flushToolCalls = () => {
    if (!pendingToolCalls.length) return;
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: pendingToolCalls
    });
    pendingToolCalls = [];
  };

  for (const item of input) {
    if ('role' in item) {
      flushToolCalls();
      messages.push({ role: item.role, content: item.content });
      continue;
    }
    if (item.type === 'function_call') {
      pendingToolCalls.push(toChatToolCall(item));
      continue;
    }
    flushToolCalls();
    messages.push(toChatToolOutput(item));
  }
  flushToolCalls();
  return messages;
}

function toChatToolCall(item: LlmFunctionCallItem): Record<string, unknown> {
  return {
    id: item.callId ?? item.id,
    type: 'function',
    function: {
      name: item.name,
      arguments: item.arguments
    }
  };
}

function toChatToolOutput(item: LlmFunctionOutputItem): Record<string, unknown> {
  return {
    role: 'tool',
    tool_call_id: item.callId,
    content: item.output
  };
}

function firstAssistantMessage(data: ChatCompletionJson): Record<string, unknown> | null {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const message = (choice as Record<string, unknown>).message;
    if (message && typeof message === 'object') return message as Record<string, unknown>;
  }
  return null;
}

function extractChatText(content: unknown): string {
  const parts: string[] = [];
  collectTextContent(content, parts);
  return parts.join('\n');
}

function parseChatToolCalls(raw: unknown): LlmToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: LlmToolCall[] = [];
  for (const call of raw as ChatToolCall[]) {
    if (!call || typeof call !== 'object') continue;
    if (call.type !== undefined && call.type !== 'function') continue;
    const name = call.function?.name;
    if (!name) continue;
    const args = parseFunctionArguments(call.function?.arguments);
    if (!args) continue;
    out.push({
      id: call.id,
      callId: call.id,
      name,
      arguments: args
    });
  }
  return out;
}

function toOutputItem(call: LlmToolCall): LlmFunctionCallItem {
  return {
    type: 'function_call',
    id: call.id,
    callId: call.callId ?? call.id,
    name: call.name,
    arguments: JSON.stringify(call.arguments)
  };
}
