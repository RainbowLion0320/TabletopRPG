import type { ResolvedApiConfig } from '../../config/aiConfig';
import { AiHttpError, AiProtocolError } from './errors';
import { isRelaxedGateway, rememberRelaxedGateway } from './gatewayCapabilities';
import { collectTextContent, parseFunctionArguments, requestJsonResponse } from './http';
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
  const mimo = config.provider === 'mimo';
  const hasTools = request.useTools !== false && Boolean(request.tools?.length);
  const url = `${config.endpoint.replace(/\/+$/, '')}/chat/completions`;
  const gatewayKey = `${url}|${config.model}`;

  // MiMo needs the schema in the prompt; other gateways may also refuse strict
  // structured output, so the same relaxed shape doubles as the fallback below.
  const buildBody = (relaxed: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: toChatMessages(relaxed ? `${request.instructions}\n返回正文时输出符合以下 schema 的 JSON 对象；需要工具时使用工具通道。\n${JSON.stringify(request.schema)}` : request.instructions,
        request.context ? [{ role: 'system', content: request.context }, ...request.input] : request.input),
      [mimo ? 'max_completion_tokens' : 'max_tokens']: (request.maxOutputTokens ?? 1024) + (mimo ? 4096 : 0),
      response_format: relaxed ? { type: hasTools ? 'text' : 'json_object' } : {
        type: 'json_schema',
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.schema
        }
      }
    };
    if (mimo && request.label === 'Narrator') { body.stream = true; body.stream_options = { include_usage: true }; }
    if (request.useTools !== false && request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = 'auto';
    }
    return body;
  };

  const send = (relaxed: boolean) => requestJsonResponse<ChatCompletionJson>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(buildBody(relaxed)),
    signal: request.signal
  }, request.label, { protocol: 'chat-completions', observation: request.observation });

  let data: ChatCompletionJson;
  try {
    data = await send(mimo || isRelaxedGateway(gatewayKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A gateway can reject strict structured output while still answering a plain
    // JSON object. One relaxed retry keeps the turn alive instead of losing it.
    if (!mimo && error instanceof AiHttpError && [400, 422].includes(error.status)
      && /response.?format|output format|输出格式|结构化/i.test(message)) {
      data = await send(true);
      rememberRelaxedGateway(gatewayKey);
    } else if (error instanceof AiHttpError && [400, 422].includes(error.status)
      && request.useTools !== false && request.tools?.length && /tool|function/i.test(message)) {
      throw new AiProtocolError(
        `当前协议/模型不支持工具调用：请切换 Responses，或使用支持 tools 的 chat-compatible endpoint。原始错误：${message}`
      );
    } else {
      throw error;
    }
  }

  const message = firstAssistantMessage(data);
  const toolCalls = parseChatToolCalls(message?.tool_calls);
  return {
    rawText: extractChatText(message?.content),
    toolCalls,
    outputItems: toolCalls.map(call => ({ ...toOutputItem(call), ...(typeof message?.reasoning_content === 'string' ? { reasoning: message.reasoning_content } : {}) })),
    finishReason: firstFinishReason(data)
  };
}

function firstFinishReason(data: ChatCompletionJson): string | null {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== 'object') continue;
    const reason = (choice as Record<string, unknown>).finish_reason;
    if (typeof reason === 'string' && reason.trim()) return reason;
  }
  return null;
}

function toChatMessages(
  instructions: string,
  input: LlmInputItem[]
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [{ role: 'system', content: instructions }];
  let pendingToolCalls: Array<Record<string, unknown>> = [];
  let pendingReasoning: string | undefined;

  const flushToolCalls = () => {
    if (!pendingToolCalls.length) return;
    messages.push({
      role: 'assistant',
      content: '',
      tool_calls: pendingToolCalls,
      ...(pendingReasoning !== undefined ? { reasoning_content: pendingReasoning } : {})
    });
    pendingToolCalls = [];
    pendingReasoning = undefined;
  };

  for (const item of input) {
    if ('role' in item) {
      flushToolCalls();
      messages.push({ role: item.role, content: item.content });
      continue;
    }
    if (item.type === 'function_call') {
      pendingToolCalls.push(toChatToolCall(item));
      if (item.reasoning !== undefined) pendingReasoning = item.reasoning;
      continue;
    }
    if (item.type === 'reasoning') continue;
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
