import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnvDefaultApiConfig, readApiConfig } from '../../src/services/storage';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe('AI API config storage', () => {
  it('reads provider, protocol, endpoint, key, and model from VITE_AI env defaults', () => {
    vi.stubEnv('VITE_AI_PROVIDER', 'custom');
    vi.stubEnv('VITE_AI_PROTOCOL', 'chat-completions');
    vi.stubEnv('VITE_AI_ENDPOINT', 'https://gateway.example/v1');
    vi.stubEnv('VITE_AI_API_KEY', 'env-key');
    vi.stubEnv('VITE_AI_MODEL', 'gateway-model');

    expect(getEnvDefaultApiConfig()).toEqual({
      provider: 'custom',
      protocol: 'chat-completions',
      endpoint: 'https://gateway.example/v1',
      apiKey: 'env-key',
      model: 'gateway-model'
    });
  });

  it('preserves explicit localStorage provider, protocol, endpoint, and model fields', () => {
    localStorage.setItem('trpg-api', JSON.stringify({
      provider: 'mimo',
      protocol: 'chat-completions',
      endpoint: 'https://mimo.example/v1',
      apiKey: 'saved-key',
      model: 'mimo-v2.5'
    }));

    expect(readApiConfig()).toEqual({
      provider: 'mimo',
      protocol: 'chat-completions',
      endpoint: 'https://mimo.example/v1',
      apiKey: 'saved-key',
      model: 'mimo-v2.5'
    });
  });

  it('normalizes legacy saved configs to OpenAI Responses defaults', () => {
    localStorage.setItem('trpg-api', JSON.stringify({
      provider: 'openai',
      apiKey: 'legacy-key',
      model: ''
    }));

    expect(readApiConfig()).toEqual({
      provider: 'openai',
      protocol: 'responses',
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'legacy-key',
      model: 'gpt-4o'
    });
  });
});
