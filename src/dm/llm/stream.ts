import { AiConnectionError, AiHttpError, AiResponseFormatError } from './errors';
import type { RequestObservation } from './metrics';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }

/** Only complete provider results leave this function; partial prose never reaches game state. */
export async function readModelStream(response: Response, protocol: 'responses' | 'chat-completions', observation?: RequestObservation): Promise<RecordValue> {
  if (!response.body) throw new AiConnectionError(new Error('Empty model stream'));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', bytes = 0, terminal = false, ended = false, doneMarker = false;
  let result: RecordValue = {};
  const items = new Map<number, RecordValue>();
  const chat: RecordValue = { role: 'assistant', content: '', reasoning_content: '' };
  const chatCalls = new Map<number, RecordValue>();
  let finishReason: unknown = null;
  const event = (data: string) => {
    if (data === '[DONE]') { terminal = true; doneMarker = true; return; }
    let value: RecordValue;
    try { value = record(JSON.parse(data)); } catch { throw new AiResponseFormatError('Model stream contains invalid JSON'); }
    if (value.error) throw new AiHttpError(response.status, String(record(value.error).message ?? 'Model stream error'));
    observation?.usage(value.usage);
    if (protocol === 'responses') {
      const type = String(value.type ?? '');
      if (type.includes('reasoning') && typeof value.delta === 'string') observation?.progress('reasoning');
      else if (type.endsWith('.delta') && typeof value.delta === 'string') observation?.progress('receiving');
      else observation?.progress('connected');
      const index = typeof value.output_index === 'number' ? value.output_index : 0;
      if (type === 'response.output_item.added' || type === 'response.output_item.done') items.set(index, record(value.item));
      if (type === 'response.function_call_arguments.delta') {
        const item = items.get(index) ?? { type: 'function_call' };
        item.arguments = String(item.arguments ?? '') + String(value.delta ?? ''); items.set(index, item);
      }
      if (type === 'response.function_call_arguments.done') {
        const item = items.get(index) ?? { type: 'function_call' };
        if (typeof value.arguments === 'string') item.arguments = value.arguments;
        items.set(index, item);
      }
      if (type === 'response.output_text.delta') {
        const item = items.get(index) ?? { type: 'message', role: 'assistant' };
        const content = Array.isArray(item.content) ? item.content.map(record) : [];
        const part = typeof value.content_index === 'number' ? value.content_index : 0;
        content[part] ??= { type: 'output_text', text: '' };
        content[part].text = String(content[part].text ?? '') + String(value.delta ?? '');
        item.content = content; items.set(index, item);
      }
      if (['response.completed', 'response.incomplete', 'response.failed'].includes(type)) {
        result = record(value.response);
        if (type === 'response.failed') throw new AiConnectionError(new Error('Model stream failed'));
        result.status ??= type === 'response.incomplete' ? 'incomplete' : 'completed';
        const finalItems = Array.isArray(result.output) ? result.output.map(record) : [];
        // Some compatible gateways omit already-emitted tool/reasoning items
        // from the terminal snapshot. Retain those exchanges by their wire id.
        for (const [, item] of [...items.entries()].sort(([a], [b]) => a - b)) {
          const existing = finalItems.some(candidate => item.id && candidate.id === item.id
            || item.call_id && candidate.call_id === item.call_id);
          if (!existing && (item.type === 'function_call' || item.type === 'reasoning'
            || !finalItems.some(candidate => candidate.type === 'message'))) finalItems.push(item);
        }
        result.output = finalItems;
        observation?.usage(result.usage);
        terminal = true;
      }
    } else {
      const choices = Array.isArray(value.choices) ? value.choices.map(record) : [];
      const choice = choices.find(candidate => candidate.index === 0 || candidate.index === undefined);
      if (!choice) return;
      const delta = record(choice.delta);
      if (typeof delta.reasoning_content === 'string') {
        chat.reasoning_content = String(chat.reasoning_content) + delta.reasoning_content;
        observation?.progress('reasoning');
      }
      if (typeof delta.content === 'string') {
        chat.content = String(chat.content) + delta.content;
        observation?.progress('receiving');
      }
      if (Array.isArray(delta.tool_calls)) for (const raw of delta.tool_calls) {
        const call = record(raw), index = typeof call.index === 'number' ? call.index : 0;
        const previous = chatCalls.get(index) ?? { type: 'function', function: { name: '', arguments: '' } };
        const fn = record(previous.function), addition = record(call.function);
        if (call.id) previous.id = call.id;
        fn.name = String(fn.name ?? '') + String(addition.name ?? '');
        fn.arguments = String(fn.arguments ?? '') + String(addition.arguments ?? '');
        previous.function = fn; chatCalls.set(index, previous);
        observation?.progress('receiving');
      }
      if (choice.finish_reason) { finishReason = choice.finish_reason; terminal = true; }
      result = { choices: [{ message: { ...chat, tool_calls: [...chatCalls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call) }, finish_reason: finishReason }] };
    }
  };
  const drain = (final = false) => {
    // SSE accepts CRLF, LF and CR line endings, and multi-line data fields.
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r(?!$)/g, '\n');
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
      if (data) event(data);
    }
    if (final && buffer.trim()) { buffer += '\n\n'; drain(); }
  };
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) { ended = true; break; }
      bytes += part.value.byteLength;
      if (bytes > 4_000_000) throw new AiResponseFormatError('Model response exceeds limit');
      buffer += decoder.decode(part.value, { stream: true }); drain();
      if (doneMarker || protocol === 'responses' && terminal) break;
    }
    buffer += decoder.decode(); drain(true);
    if (!terminal) throw new AiConnectionError(new Error('Model stream ended before completion'));
    return result;
  } finally {
    if (!ended) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
