import type { LlmProgress } from './types';

/** Metadata only: never retain credentials, endpoints, prose or private reasoning. */
export interface ModelRequestMetric {
  id: number;
  label: string;
  protocol: string;
  model: string;
  queueMs: number;
  totalMs: number;
  headersMs?: number;
  firstEventMs?: number;
  firstReasoningMs?: number;
  firstContentMs?: number;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  outcome: 'complete' | 'error' | 'cancelled';
}
const metrics: ModelRequestMetric[] = [];
let sequence = 0;
export const metricNow = () => performance.now();
export function nextMetricId() { return ++sequence; }
export function recordModelMetric(metric: ModelRequestMetric) {
  metrics.push(metric);
  if (metrics.length > 100) metrics.shift();
}
export function getModelMetrics(): readonly ModelRequestMetric[] { return metrics.map(metric => ({ ...metric })); }
export function clearModelMetrics() { metrics.length = 0; }
export interface RequestObservation {
  headers: () => void;
  progress: (phase: LlmProgress) => void;
  usage: (value: unknown) => void;
}
export function observeRequest(metric: ModelRequestMetric, start: number, progress?: (phase: LlmProgress) => void): RequestObservation {
  const elapsed = () => Math.round(metricNow() - start);
  let highestPhase = -1;
  return {
    headers: () => { metric.headersMs ??= elapsed(); },
    progress: phase => {
      metric.firstEventMs ??= elapsed();
      if (phase === 'reasoning') metric.firstReasoningMs ??= elapsed();
      if (phase === 'receiving') metric.firstContentMs ??= elapsed();
      // Observers cannot turn a valid model response into an error.
      const rank = ['connected', 'reasoning', 'receiving'].indexOf(phase);
      if (rank <= highestPhase) return;
      highestPhase = rank;
      try { progress?.(phase); } catch { /* cosmetic observer */ }
    },
    usage: value => {
      if (!value || typeof value !== 'object') return;
      const usage = value as Record<string, unknown>;
      const input = usage.input_tokens_details ?? usage.prompt_tokens_details;
      const output = usage.output_tokens_details ?? usage.completion_tokens_details;
      const copy = (key: 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'reasoningTokens', candidate: unknown) => {
        if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) metric[key] = candidate;
      };
      copy('inputTokens', usage.input_tokens ?? usage.prompt_tokens);
      copy('outputTokens', usage.output_tokens ?? usage.completion_tokens);
      if (input && typeof input === 'object') copy('cachedTokens', (input as Record<string, unknown>).cached_tokens);
      if (output && typeof output === 'object') copy('reasoningTokens', (output as Record<string, unknown>).reasoning_tokens);
    }
  };
}
