import { describe, expect, it } from 'vitest';
import { AI_ENV_KEYS, isLocalConfigRequest, mergeEnvValues, updateEnvLocalContent } from '../vite.config';

describe('Vite AI env writer helpers', () => {
  it('rejects cross-origin and simple form requests to the local configuration writer', () => {
    expect(isLocalConfigRequest({ 'content-type': 'text/plain', host: '127.0.0.1:5273' })).toBe(false);
    expect(isLocalConfigRequest({ 'content-type': 'application/json', host: '127.0.0.1:5273', origin: 'https://example.com' })).toBe(false);
    expect(isLocalConfigRequest({ 'content-type': 'application/json', host: '127.0.0.1:5273', origin: 'http://127.0.0.1:5273' })).toBe(true);
    expect(isLocalConfigRequest({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' })).toBe(false);
  });

  it('preserves unrelated comments and quoted values when replacing managed settings', () => {
    const existing = '# Keep this comment\nOTHER="contains # hash"\nVITE_AI_MODEL=old\n';
    expect(updateEnvLocalContent(existing, { VITE_AI_MODEL: 'new', VITE_AI_API_KEY: 'sk-$literal#key' }))
      .toBe('# Keep this comment\nOTHER="contains # hash"\nVITE_AI_API_KEY="sk-\\$literal#key"\nVITE_AI_MODEL="new"\n');
    expect(() => updateEnvLocalContent(existing, { VITE_AI_MODEL: 'new\nINJECTED=true' })).toThrow(/single-line/);
  });
  it('manages the complete AI provider config key set', () => {
    expect(AI_ENV_KEYS).toEqual([
      'VITE_AI_PROVIDER',
      'VITE_AI_PROTOCOL',
      'VITE_AI_ENDPOINT',
      'VITE_AI_API_KEY',
      'VITE_AI_MODEL'
    ]);
  });

  it('merges provider, protocol, endpoint, key, and model without dropping unrelated env vars', () => {
    const merged = mergeEnvValues(
      {
        VITE_AI_API_KEY: 'old-key',
        VITE_AI_MODEL: 'old-model',
        OTHER_FLAG: 'keep-me'
      },
      {
        VITE_AI_PROVIDER: 'mimo',
        VITE_AI_PROTOCOL: 'chat-completions',
        VITE_AI_ENDPOINT: 'https://mimo.example/v1',
        VITE_AI_API_KEY: 'new-key',
        VITE_AI_MODEL: 'mimo-v2.5'
      }
    );

    expect(merged).toEqual({
      VITE_AI_PROVIDER: 'mimo',
      VITE_AI_PROTOCOL: 'chat-completions',
      VITE_AI_ENDPOINT: 'https://mimo.example/v1',
      VITE_AI_API_KEY: 'new-key',
      VITE_AI_MODEL: 'mimo-v2.5',
      OTHER_FLAG: 'keep-me'
    });
  });

  it('removes managed keys whose incoming value is empty', () => {
    const merged = mergeEnvValues(
      {
        VITE_AI_ENDPOINT: 'https://old.example/v1',
        VITE_AI_MODEL: 'old-model',
        OTHER_FLAG: 'keep-me'
      },
      {
        VITE_AI_ENDPOINT: '',
        VITE_AI_MODEL: ''
      }
    );

    expect(merged).toEqual({ OTHER_FLAG: 'keep-me' });
  });
});
