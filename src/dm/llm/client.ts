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
import { modelScheduler } from './scheduler';
import { backgroundRequests } from './backgroundRequests';
import { metricNow, nextMetricId, observeRequest, recordModelMetric, type ModelRequestMetric } from './metrics';

export async function generateJson(
  config: ApiConfig,
  request: LlmJsonRequest
): Promise<LlmResult> {
  const resolved = resolveRuntimeConfig(config);
  const priority = request.priority ?? (request.label === 'Narrator' ? 'foreground' : 'background');
  if (priority === 'background' && ['factExtractor', 'caseBoardSynthesizer', 'Summarizer', 'system2Synthesizer'].includes(request.label)) {
    // The transient private key includes the connection so different players'
    // providers can never share a result. It is never logged or persisted.
    const { signal: _signal, onProgress: _progress, observation: _observation, ...content } = request;
    const key = JSON.stringify([resolved, content]);
    return backgroundRequests.run(key, request.signal, signal => performJson(resolved, { ...request, signal }, priority));
  }
  return performJson(resolved, request, priority);
}

async function performJson(resolved: ResolvedApiConfig, request: LlmJsonRequest, priority: 'foreground' | 'background'): Promise<LlmResult> {
  const maxAttempts = request.retryOnAbort === false ? 1 : 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const queuedAt = metricNow();
    const result = await modelScheduler.run(priority, request.signal, async () => {
      const metric: ModelRequestMetric = { id: nextMetricId(), label: request.label,
        protocol: resolved.protocol, model: resolved.model, queueMs: Math.round(metricNow() - queuedAt), totalMs: 0, outcome: 'error' };
      try {
        const observed = { ...request, observation: observeRequest(metric, queuedAt, request.onProgress) };
        const value = resolved.protocol === 'responses'
          ? await requestResponsesJson(resolved, observed)
          : await requestChatCompletionsJson(resolved, observed);
        metric.outcome = 'complete';
        return value;
      } finally {
        if (request.signal?.aborted) metric.outcome = 'cancelled';
        metric.totalMs = Math.round(metricNow() - queuedAt);
        recordModelMetric(metric);
      }
    });
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
