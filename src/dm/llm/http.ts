import { AiResponseFormatError } from './errors';

export async function readJsonResponse<T extends object>(
  response: Response,
  label: string
): Promise<T> {
  const text = await response.text();
  let data: T & { error?: { message?: string } };
  try {
    data = text ? JSON.parse(text) as T & { error?: { message?: string } } : {} as T;
  } catch {
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    throw new AiResponseFormatError(`${label} response is not JSON: ${text.slice(0, 120)}`);
  }
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  }
  return data;
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
