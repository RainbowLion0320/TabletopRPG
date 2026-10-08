import { describe, expect, it, vi } from 'vitest';
import { createNativeStorage, createNativeTransport, type NativeHttp, type NativeStore } from '../../src/android/native';
import { parseMobileSession } from '../../src/android/session';
import { evaluateD100, prepareCheck } from '../../src/services/dice';
import { makeInvestigator, makeState } from '../dm/fixtures';
import { createInvestigatorFromPreset, presets } from '../../src/data/presets';

describe('Android encrypted storage queue', () => {
  it('coalesces pending writes and persists removal without resurrecting old data', async () => {
    const disk = new Map<string, string>();
    const native: NativeStore = { readAll: async () => ({ values: {} }), write: vi.fn(async ({ key, value }) => {
      await Promise.resolve(); if (value === null) disk.delete(key); else disk.set(key, value);
    }) };
    const store = createNativeStorage({}, native);
    store.setItem('trpg-api', 'first'); store.setItem('trpg-api', 'latest');
    await store.flush?.(); expect(disk.get('trpg-api')).toBe('latest');
    store.setItem('trpg-api', 'stale'); store.removeItem('trpg-api');
    await store.flush?.(); expect(disk.has('trpg-api')).toBe(false);
  });
  it('reports disk failures, retains dirty data and retries without losing the current session', async () => {
    let failing = true;
    const write = vi.fn(async () => { if (failing) throw new Error('Disk full'); });
    const store = createNativeStorage({}, { readAll: async () => ({ values: {} }), write });
    store.setItem('trpg-session', 'locked-100');
    await expect(store.flush?.()).rejects.toThrow('保存失败');
    expect(store.getItem('trpg-session')).toBe('locked-100');
    failing = false; await store.flush?.();
    expect(write).toHaveBeenLastCalledWith({ key: 'trpg-session', value: 'locked-100' });
  });
});

describe('Android transport cancellation', () => {
  it('cancels the native call and ignores its late reply', async () => {
    let reply!: (value: { status: number; body: string }) => void;
    const native: NativeHttp = { request: vi.fn(() => new Promise(resolve => { reply = resolve; })), cancel: vi.fn(async () => {}) };
    const abort = new AbortController();
    const result = createNativeTransport(native)('https://unit.test', { method: 'POST', signal: abort.signal, body: '{}' });
    abort.abort(); await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.cancel).toHaveBeenCalledOnce(); reply({ status: 200, body: '{}' });
    await Promise.resolve();
  });
  it('does not start a pre-aborted request and preserves HTTP failure status for the adapters', async () => {
    const native: NativeHttp = { request: vi.fn(async () => ({ status: 401, body: '{"error":"unauthorized"}' })), cancel: vi.fn() };
    const send = createNativeTransport(native);
    const abort = new AbortController(); abort.abort();
    await expect(send('https://unit.test', { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(native.request).not.toHaveBeenCalled();
    const result = await send('https://unit.test', {});
    expect(result.status).toBe(401); expect(await result.json()).toEqual({ error: 'unauthorized' });
  });
});

describe('Android process recovery', () => {
  it('restores updated preset artwork while preserving a locked check and multiline declaration', () => {
    const players = presets.map((preset, index) => ({ ...createInvestigatorFromPreset(preset), portrait: `/assets/${String(index + 1).padStart(16, '0')}-oldBuild.webp` }));
    const state = makeState({ players, declarations: { inspector: '先查看门廊\n再询问失踪经过' } });
    state.pendingCheck = prepareCheck({ player: players[0].name, skill: '侦查', difficulty: '普通' }, players);
    const roll = { check: state.pendingCheck, result: evaluateD100(state.pendingCheck, 100), phase: 'revealed' };
    const restored = parseMobileSession(JSON.stringify({ version: 1, savedAt: 1234, state, roll }));
    expect(restored?.state.players.map(player => player.portrait)).toEqual(presets.map(preset => preset.portrait));
    expect(restored?.state.declarations).toEqual(state.declarations);
    expect(restored?.state.pendingCheck).toMatchObject(state.pendingCheck);
    expect(restored?.roll?.result).toEqual(roll.result);
  });

  it('corrects legacy Dodge without changing an already locked successful roll', () => {
    const player = makeInvestigator({ name: '调查员' });
    player.skills['闪避'] = { base: 120, added: 0 };
    const state = makeState({ players: [player] });
    state.pendingCheck = prepareCheck({ player: player.name, skill: '闪避', difficulty: '普通' }, state.players);
    const roll = { check: state.pendingCheck, result: evaluateD100(state.pendingCheck, 80), phase: 'revealed' };
    const restored = parseMobileSession(JSON.stringify({ version: 1, savedAt: 1234, state, roll }));
    expect(restored?.state.players[0].skills['闪避'].base).toBe(30);
    expect(restored?.state.pendingCheck?.threshold).toBe(120);
    expect(restored?.roll?.result).toEqual(roll.result);
    const future = prepareCheck({ player: player.name, skill: '闪避', difficulty: '普通' }, restored!.state.players);
    expect(future.threshold).toBe(30);
    expect(evaluateD100(future, 80).level).toBe('fail');
  });
  for (const size of [1, 2, 4]) it(`restores ${size} players and a locked fumble without drawing a new roll`, () => {
    const state = makeState({ players: Array.from({ length: size }, (_, i) => makeInvestigator({ name: `调查员${i}` })) });
    state.pendingCheck = prepareCheck({ player: state.players[0].name, skill: '侦查', difficulty: '普通' }, state.players);
    state.isThinking = true;
    const roll = { check: state.pendingCheck, result: evaluateD100(state.pendingCheck, 100), phase: 'rolling' };
    // Hydration may allocate message ids; a fresh dice roll here would become 51, not 100.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const restored = parseMobileSession(JSON.stringify({ version: 1, savedAt: 1234, state, roll }));
    expect(restored?.state.players).toHaveLength(size);
    expect(restored?.state.isThinking).toBe(false);
    expect(restored?.roll?.result.roll).toBe(100);
    expect(restored?.roll?.phase).toBe('revealed');
    random.mockRestore();
  });
  it('does not silently turn a corrupt locked roll into an opportunity to reroll', () => {
    const state = makeState();
    expect(() => parseMobileSession(JSON.stringify({ version: 1, savedAt: 1234, state, roll: { result: { roll: 100 } } }))).toThrow('已锁定');
  });
});
