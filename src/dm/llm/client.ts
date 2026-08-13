import type { ApiConfig } from '../../types/game';
import {
  getApiConfigValidationError,
  normalizeApiConfig,
  type ResolvedApiConfig
} from '../../config/aiConfig';
import { AiProviderConfigError } from './errors';
import { requestChatCompletionsJson } from './chatCompletionsAdapter';
import { requestResponsesJson } from './responsesAdapter';
import type { LlmJsonRequest, LlmResult } from './types';

export async function generateJson(
  config: ApiConfig,
  request: LlmJsonRequest
): Promise<LlmResult> {
  const resolved = resolveRuntimeConfig(config);
  const maxAttempts = request.retryOnAbort === false ? 1 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = resolved.protocol === 'responses'
      ? await requestResponsesJson(resolved, request)
      : await requestChatCompletionsJson(resolved, request);
    if (result.finishReason !== 'abort' || attempt === maxAttempts - 1) return result;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[llm] ${request.label} provider aborted partial output; retrying once`);
    }
  }
  throw new Error(`${request.label} generation ended unexpectedly`);
}

function resolveRuntimeConfig(config: ApiConfig): ResolvedApiConfig {
  const normalized = normalizeApiConfig(config);
  const error = getApiConfigValidationError(normalized);
  if (error) throw new AiProviderConfigError(error);
  return normalized as ResolvedApiConfig;
}
