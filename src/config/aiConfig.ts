import type { AiProvider, AiProtocol, ApiConfig } from '../types/game';

export const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o';

export interface ResolvedApiConfig extends ApiConfig {
  endpoint: string;
  model: string;
}

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
  const normalized = normalizeApiConfig(config);
  if (!normalized.apiKey) return '请输入 API Key。';
  if ([normalized.apiKey, normalized.endpoint, normalized.model].some((value) => /[\r\n]/.test(value ?? ''))) {
    return 'API 配置不能包含换行符。';
  }
  if (normalized.provider !== 'openai' && !normalized.endpoint) {
    return 'MiMo/custom provider 必须配置 endpoint，例如 https://你的网关域名/v1。';
  }
  if (normalized.protocol === 'chat-completions' && !normalized.endpoint) {
    return 'chat-compatible 协议必须配置 endpoint，例如 https://你的网关域名/v1。';
  }
  if (normalized.provider === 'custom' && !normalized.model) {
    return 'custom provider 必须配置 model，请填写网关提供的模型名。';
  }
  if (normalized.protocol === 'chat-completions' && !normalized.model) {
    return 'chat-compatible 协议必须配置 model，请填写网关提供的模型名。';
  }
  if (!normalized.model) return '请填写模型名。';
  try {
    const url = new URL(normalized.endpoint ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return 'Endpoint 需要是 HTTP(S) 服务地址，不含账号、查询参数或片段。';
    }
  } catch {
    return 'Endpoint 需要是完整的 HTTP(S) 服务地址。';
  }
  return null;
}
