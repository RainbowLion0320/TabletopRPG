import { AiConnectionError, AiHttpError, AiResponseFormatError } from './errors';
import { modelFetch } from './transport';
import { readModelStream } from './stream';
import type { RequestObservation } from './metrics';

export async function requestJsonResponse<T extends object>(
  url: string,
  init: RequestInit,
  label: string,
  options?: { protocol: 'responses' | 'chat-completions'; observation?: RequestObservation }
): Promise<T> {
  let response: Response;
  try {
    response = await modelFetch(url, init);
  } catch (error) {
    throwConnectionError(error, init.signal);
  }
  options?.observation?.headers();
  const data = response.ok && response.headers.get('content-type')?.includes('text/event-stream') && options
    ? await readModelStream(response, options.protocol, options.observation) as T
    : await readJsonResponse<T>(response, label, init.signal);
  const info = data as T & { usage?: unknown; error?: { message?: string } };
  options?.observation?.usage(info.usage);
  if (info.error) throw new AiHttpError(response.status, info.error.message);
  options?.observation?.progress('receiving');
  return data;
}

function throwConnectionError(error: unknown, signal?: AbortSignal | null): never {
  if (signal?.aborted || (typeof error === 'object' && error !== null
    && 'name' in error && error.name === 'AbortError')) throw error;
  throw new AiConnectionError(error);
}

export async function readJsonResponse<T extends object>(
  response: Response,
  label: string,
  signal?: AbortSignal | null
): Promise<T> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throwConnectionError(error, signal);
  }
  let data: T & { error?: { message?: string } };
  try {
    data = text ? JSON.parse(text) as T & { error?: { message?: string } } : {} as T;
  } catch {
    if (!response.ok) throw new AiHttpError(response.status);
    throw new AiResponseFormatError(`${label} response is not JSON: ${text.slice(0, 120)}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    if (!response.ok) throw new AiHttpError(response.status);
    throw new AiResponseFormatError(`${label} response must be a JSON object`);
  }
  if (!response.ok || data.error) {
    throw new AiHttpError(response.status, describeProviderError(data.error));
  }
  return data;
}

/**
 * Gateways disagree on the error envelope: some nest a JSON string inside `error`,
 * some send an object. Either way the player needs the provider's own reason, not
 * a bare status, because it decides whether swapping a field can rescue the turn.
 */
export function describeProviderError(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      const nested = JSON.parse(trimmed) as { error?: unknown; message?: unknown; message_zh?: unknown };
      const inner = nested?.error as { message?: unknown; message_zh?: unknown } | undefined;
      const text = inner?.message_zh ?? inner?.message ?? nested?.message_zh ?? nested?.message;
      return typeof text === 'string' && text.trim() ? text : trimmed.slice(0, 200);
    } catch {
      return trimmed.slice(0, 200);
    }
  }
  if (raw && typeof raw === 'object') {
    const record = raw as { message_zh?: unknown; message?: unknown };
    const text = record.message_zh ?? record.message;
    if (typeof text === 'string' && text.trim()) return text;
  }
  return undefined;
}

export function parseFunctionArguments(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
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

export function collectTextContent(content: unknown, parts: string[]): void {
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
