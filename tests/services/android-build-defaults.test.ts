import { describe, expect, it } from 'vitest';
import { getAndroidAiDefines } from '../../src/config/androidBuildDefaults';

describe('APK-only MiMo defaults', () => {
  it('uses the Token Plan endpoint and latest Pro while ignoring web defaults', () => {
    const defines = getAndroidAiDefines('build', { APIKEY_MIMO: 'tp-test-only', VITE_AI_API_KEY: 'unrelated-web-key' });
    expect(JSON.parse(defines['import.meta.env.VITE_AI_PROVIDER'])).toBe('mimo');
    expect(JSON.parse(defines['import.meta.env.VITE_AI_PROTOCOL'])).toBe('responses');
    expect(JSON.parse(defines['import.meta.env.VITE_AI_ENDPOINT'])).toBe('https://token-plan-cn.xiaomimimo.com/v1');
    expect(JSON.parse(defines['import.meta.env.VITE_AI_MODEL'])).toBe('mimo-v2.6-pro');
    expect(JSON.parse(defines['import.meta.env.VITE_AI_API_KEY'])).toBe('tp-test-only');
  });
  it('never carries a real shell key into development previews or keyless builds', () => {
    for (const defines of [getAndroidAiDefines('serve', { APIKEY_MIMO: 'tp-test-only' }), getAndroidAiDefines('build', {})]) {
      expect(Object.values(defines)).toEqual(Array(5).fill('""'));
    }
  });
  it('rejects pay-as-you-go keys and unrelated addresses without printing the credential', () => {
    expect(() => getAndroidAiDefines('build', { APIKEY_MIMO: 'sk-test-only' })).toThrow('single-line MiMo Token Plan');
    expect(() => getAndroidAiDefines('build', { APIKEY_MIMO: 'tp-test-only', MIMO_TOKEN_PLAN_ENDPOINT: 'https://gateway.example/v1' })).toThrow('official MiMo Token Plan');
  });
});
