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
  if (resolved.protocol === 'responses') {
    return requestResponsesJson(resolved, request);
  }
  return requestChatCompletionsJson(resolved, request);
}

function resolveRuntimeConfig(config: ApiConfig): ResolvedApiConfig {
  const normalized = normalizeApiConfig(config);
  const error = getApiConfigValidationError(normalized);
  if (error) throw new AiProviderConfigError(error);
  return normalized as ResolvedApiConfig;
}
