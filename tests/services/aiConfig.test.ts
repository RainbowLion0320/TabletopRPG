import { describe, expect, it } from 'vitest';
import { getApiConfigValidationError, getApiConfigValidationIssue, normalizeApiConfig, resolveApiConfig } from '../../src/config/aiConfig';
import type { ApiConfig, AiProtocol, AiProvider } from '../../src/types/game';

describe('AI configuration field diagnostics', () => {
  const valid: ApiConfig = { provider: 'custom', protocol: 'responses', apiKey: 'test-key', endpoint: 'https://service.example/v1', model: 'test-model' };
  const connections = (['openai', 'mimo', 'custom'] as AiProvider[]).flatMap(provider =>
    (['responses', 'chat-completions'] as AiProtocol[]).map(protocol => ({ provider, protocol })));

  it.each(connections)('retains required fields and defaults for $provider / $protocol', ({ provider, protocol }) => {
    const config = { ...valid, provider, protocol };
    expect(getApiConfigValidationIssue(config)).toBeNull();
    expect(resolveApiConfig(config)).toEqual(normalizeApiConfig(config));
    expect(getApiConfigValidationIssue({ ...config, apiKey: '' })?.field).toBe('apiKey');
    expect(getApiConfigValidationIssue({ ...config, endpoint: '' })?.field ?? null).toBe(provider === 'openai' ? null : 'endpoint');
    expect(getApiConfigValidationIssue({ ...config, model: '' })?.field ?? null).toBe(provider === 'openai' ? null : 'model');
    const issue = getApiConfigValidationIssue({ ...config, apiKey: '' });
    expect(getApiConfigValidationError({ ...config, apiKey: '' })).toBe(issue?.message);
  });

  it.each(['https://person:secret@service.example/v1', 'https://service.example/v1?token=example', 'https://service.example/v1#route', 'file:///service/v1'])('keeps invalid service URLs rejected at their field: %s', endpoint => {
    const config = { ...valid, endpoint };
    expect(getApiConfigValidationIssue(config)).toMatchObject({ field: 'endpoint' });
    expect(() => resolveApiConfig(config)).toThrow(/服务地址/);
  });

  it.each(['apiKey', 'endpoint', 'model'] as const)('attributes an internal newline to %s without changing accepted trimming', field => {
    expect(getApiConfigValidationIssue({ ...valid, [field]: `first\nsecond` })).toMatchObject({ field, message: expect.stringContaining('换行符') });
    expect(getApiConfigValidationIssue({ ...valid, [field]: ` ${valid[field]}\n` })).toBeNull();
  });
});
