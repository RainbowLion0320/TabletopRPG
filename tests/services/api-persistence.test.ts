import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiConfig } from '../../src/types/game';
import { createNativeStorage, type NativeStore } from '../../src/android/native';
import { flushGameStorage, installGameStorage } from '../../src/platform/storage';
import { getEnvDefaultApiConfig, persistApiConfig, readApiConfig } from '../../src/services/storage';
import { useGameController } from '../../src/app/useGameController';
import { runDmTurn } from '../../src/dm/pipeline';
import { makeInvestigator } from '../dm/fixtures';

vi.mock('../../src/dm/pipeline', () => ({ runDmTurn: vi.fn() }));

const API_KEY = 'trpg-api';
const connectionA: ApiConfig = { provider: 'custom', protocol: 'chat-completions', endpoint: 'https://qa-a.example.invalid/v1', apiKey: 'qa-only-a', model: 'qa-model-a' };
const connectionB: ApiConfig = { provider: 'custom', protocol: 'responses', endpoint: 'https://qa-b.example.invalid/v1', apiKey: 'qa-only-b', model: 'qa-model-b' };

afterEach(() => { installGameStorage(localStorage); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function nativeFixture(initial: Record<string, string>) {
  const disk = new Map(Object.entries(initial)); let failing = true;
  const native: NativeStore = { readAll: vi.fn(), write: vi.fn(async ({ key, value }) => {
    if (failing) throw new Error('controlled native write failure');
    if (value === null) disk.delete(key); else disk.set(key, value);
  }) };
  const cache = createNativeStorage(initial, native); installGameStorage(cache);
  return { cache, disk, native, recover: () => { failing = false; } };
}

async function expectActionConnection(config: ApiConfig) {
  const dm = vi.mocked(runDmTurn); dm.mockReset(); dm.mockResolvedValue({ raw: '{"narrative":"调查继续。"}', legacyResponse: { narrative: '调查继续。' } });
  const { result, unmount } = renderHook(useGameController);
  try {
    act(() => result.current.startGame([makeInvestigator({ id: 'qa-reader', name: '亨利' })]));
    act(() => result.current.setDeclaration('qa-reader', '核对门廊资料'));
    act(() => result.current.submitAction());
    await waitFor(() => expect(dm).toHaveBeenCalledOnce());
    expect(dm.mock.calls[0][0]).toEqual(config);
    await waitFor(() => expect(result.current.state.isThinking).toBe(false));
  } finally { unmount(); }
}

describe('API connection persistence failure', () => {
  it('keeps the confirmed connection after failure and later lifecycle flush, then accepts an explicit retry', async () => {
    vi.stubEnv('DEV', false); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const previous = JSON.stringify({ ...connectionA, legacyMetadata: 'preserve raw record' }, null, 2);
    const pendingB = { ...connectionB, endpoint: ` ${connectionB.endpoint} `, model: ` ${connectionB.model} ` };
    const { cache, disk, recover } = nativeFixture({ [API_KEY]: previous, 'trpg-other': 'unchanged' });
    await expect(persistApiConfig(pendingB)).rejects.toThrow('保存失败');
    const immediateConfig = readApiConfig(), immediateRaw = cache.getItem(API_KEY);
    recover(); await flushGameStorage();
    expect({ immediateConfig, immediateRaw, durable: disk.get(API_KEY), unrelated: disk.get('trpg-other') })
      .toEqual({ immediateConfig: connectionA, immediateRaw: previous, durable: previous, unrelated: 'unchanged' });
    await expectActionConnection(connectionA);

    await expect(persistApiConfig(pendingB)).resolves.toBe(false);
    expect(readApiConfig()).toEqual(connectionB);
    expect(JSON.parse(disk.get(API_KEY)!)).toEqual(connectionB);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('removes a failed first override so bundled defaults still apply after storage recovers', async () => {
    vi.stubEnv('DEV', false); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); vi.stubEnv('VITE_AI_PROVIDER', 'mimo'); vi.stubEnv('VITE_AI_PROTOCOL', 'responses');
    vi.stubEnv('VITE_AI_ENDPOINT', 'https://bundled.example.invalid/v1'); vi.stubEnv('VITE_AI_MODEL', 'mimo-v2.6-pro'); vi.stubEnv('VITE_AI_API_KEY', 'bundled-qa-only');
    const bundled = getEnvDefaultApiConfig(), { cache, disk, recover } = nativeFixture({ 'trpg-other': 'unchanged' });
    await expect(persistApiConfig(connectionB)).rejects.toThrow('保存失败');
    const immediateConfig = readApiConfig(), immediateRaw = cache.getItem(API_KEY);
    recover(); await flushGameStorage();
    expect({ immediateConfig, immediateRaw, durableOverride: disk.has(API_KEY), current: readApiConfig(), unrelated: disk.get('trpg-other') })
      .toEqual({ immediateConfig: bundled, immediateRaw: null, durableOverride: false, current: bundled, unrelated: 'unchanged' });
    await expectActionConnection(bundled);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['unreachable', 'not-ok'] as const)('keeps a browser save as a soft success when the dev env writer is %s', async (failure) => {
    vi.stubEnv('DEV', true); installGameStorage(localStorage); localStorage.setItem(API_KEY, JSON.stringify(connectionA));
    const fetch = vi.fn(failure === 'unreachable'
      ? async () => { throw new Error('local dev server unavailable'); }
      : async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(persistApiConfig(connectionB)).resolves.toBe(false);
    expect(readApiConfig()).toEqual(connectionB);
    expect(JSON.parse(localStorage.getItem(API_KEY)!)).toEqual(connectionB);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/__api_config', expect.objectContaining({ method: 'POST', body: JSON.stringify(connectionB) }));
  });
});
