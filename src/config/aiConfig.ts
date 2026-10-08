import type { AiProvider, AiProtocol, ApiConfig } from '../types/game';

export const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export interface ResolvedApiConfig extends ApiConfig {
  endpoint: string;
  model: string;
}

export type ApiConfigField = 'apiKey' | 'endpoint' | 'model';
export interface ApiConfigValidationIssue { field: ApiConfigField; message: string }

export function isAiProvider(value: unknown): value is AiProvider {
  return value === 'openai' || value === 'mimo' || value === 'custom';
}

export function isAiProtocol(value: unknown): value is AiProtocol {
  return value === 'responses' || value === 'chat-completions';
}

export function defaultProtocolForProvider(provider: AiProvider): AiProtocol {
  return provider === 'openai' ? 'responses' : 'chat-completions';
}

export function defaultEndpointForProvider(provider: AiProvider): string {
  return provider === 'openai' ? DEFAULT_OPENAI_ENDPOINT : '';
}

export function defaultModelForProvider(provider: AiProvider): string {
  return provider === 'openai' ? DEFAULT_OPENAI_MODEL : '';
}

export function normalizeApiConfig(input: Partial<ApiConfig> | null | undefined): ApiConfig {
  const provider = isAiProvider(input?.provider) ? input.provider : 'openai';
  const protocol = isAiProtocol(input?.protocol)
    ? input.protocol
    : defaultProtocolForProvider(provider);
  const endpoint = (typeof input?.endpoint === 'string' ? input.endpoint.trim() : '') || defaultEndpointForProvider(provider);
  const model = (typeof input?.model === 'string' ? input.model.trim() : '') || defaultModelForProvider(provider);
  return {
    provider,
    protocol,
    endpoint,
    apiKey: typeof input?.apiKey === 'string' ? input.apiKey.trim() : '',
    model
  };
}

export function resolveApiConfig(config: ApiConfig): ResolvedApiConfig {
  const normalized = normalizeApiConfig(config);
  const error = getApiConfigValidationError(normalized);
  if (error) throw new Error(error);
  return normalized as ResolvedApiConfig;
}

export function getApiConfigValidationError(config: ApiConfig): string | null {
  return getApiConfigValidationIssue(config)?.message ?? null;
}

export function getApiConfigValidationIssue(config: ApiConfig): ApiConfigValidationIssue | null {
  const normalized = normalizeApiConfig(config);
  if (!normalized.apiKey) return { field: 'apiKey', message: '请输入 API Key。' };
  for (const [field, label] of [['apiKey', 'API Key'], ['endpoint', '服务地址'], ['model', '模型名']] as const) {
    if (/[\r\n]/.test(normalized[field] ?? '')) return { field, message: `${label}不能包含换行符。` };
  }
  if (!normalized.endpoint) {
    return { field: 'endpoint', message: '请填写服务地址。' };
  }
  if (!normalized.model) return { field: 'model', message: '请填写模型名。' };
  try {
    const url = new URL(normalized.endpoint ?? '');
    if (!['http:', 'https:'].includes(url.protocol)) return { field: 'endpoint', message: '服务地址需以 http:// 或 https:// 开头。' };
    if (url.username || url.password || url.search || url.hash) return { field: 'endpoint', message: '服务地址不能含账号、查询参数或片段。' };
  } catch {
    return { field: 'endpoint', message: '请输入完整的 HTTP(S) 服务地址。' };
  }
  return null;
}
