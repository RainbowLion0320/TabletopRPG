import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AndroidApp } from '../../src/android/AndroidApp';
import { createNativeStorage, type NativeStore } from '../../src/android/native';
import { parseMobileSession, SESSION_KEY } from '../../src/android/session';
import { flushGameStorage, installGameStorage } from '../../src/platform/storage';
import { readSaveLibrary } from '../../src/services/storage';
import { createInvestigatorFromPreset, presets } from '../../src/data/presets';
import { makeState } from '../dm/fixtures';

const { nativeListeners } = vi.hoisted(() => ({ nativeListeners: new Map<string, (event: { isActive: boolean }) => void>() }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (event: string, handler: (event: { isActive: boolean }) => void) => {
    nativeListeners.set(event, handler); return { remove: () => nativeListeners.delete(event) };
  }), exitApp: vi.fn().mockResolvedValue(undefined)
} }));
vi.mock('../../src/android/native', async original => ({
  ...await original<typeof import('../../src/android/native')>(), isNativeAndroid: () => true
}));
vi.mock('../../src/audio/AudioDirector', () => ({ AudioDirector: () => null }));
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});
beforeEach(() => {
  vi.useFakeTimers(); nativeListeners.clear(); localStorage.clear(); vi.stubEnv('VITE_AI_API_KEY', '');
});
afterEach(async () => {
  cleanup(); await flushGameStorage(); installGameStorage(localStorage);
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

async function restoredGame(party = 1, history = 0) {
  const players = presets.slice(0, party).map(preset => createInvestigatorFromPreset(preset));
  const state = makeState({ players });
  state.messages = Array.from({ length: history }, (_, index) => ({
    id: `history-${index}`, type: 'dm', text: `伊莎贝拉·摩勒请亨利·格雷调查父亲失踪的经过。先记录求助信日期，再查看门廊和窗边痕迹。记录 ${index + 1}。`
  }));
  const raw = JSON.stringify({ version: 1, savedAt: 1234, state, roll: null });
  const disk = new Map([[SESSION_KEY, raw]]);
  const write = vi.fn<NativeStore['write']>(async ({ key, value }) => {
    if (value === null) disk.delete(key); else disk.set(key, value);
  });
  installGameStorage(createNativeStorage({ [SESSION_KEY]: raw, 'trpg-api': JSON.stringify({
    apiKey: 'unit-test-key', provider: 'custom', protocol: 'chat-completions', endpoint: 'https://unit.test/v1', model: 'qa-model'
  }) }, { readAll: async () => ({ values: {} }), write }));
  const view = render(<AndroidApp />);
  fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
  await act(async () => { await flushGameStorage(); }); write.mockClear();
  return { view, players, raw, disk, write, input: screen.getByRole('textbox', { name: `${players[0].name}的行动` }) };
}
function navigate(label: string) {
  fireEvent.click(screen.getByRole('button', { name: '菜单', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
}

describe('automatic Android action persistence', () => {
  it('coalesces rapid typing instead of serializing and writing the entire long history per character', async () => {
    const { players, raw, disk, write, input } = await restoredGame(1, 200);
    const draft = '先记录信的日期，然后观察门锁和窗台。';
    for (let length = 1; length <= draft.length; length++) {
      fireEvent.change(input, { target: { value: draft.slice(0, length) } });
      await act(async () => { await vi.advanceTimersByTimeAsync(40); });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(500); await flushGameStorage(); });
    const writes = write.mock.calls.filter(([entry]) => entry.key === SESSION_KEY);
    expect(writes.length).toBeLessThan(draft.length / 2);
    expect(writes.reduce((bytes, [entry]) => bytes + (entry.value?.length ?? 0), 0)).toBeLessThan(raw.length * 5);
    const saved = parseMobileSession(disk.get(SESSION_KEY)!);
    expect(saved?.state.declarations[players[0].id]).toBe(draft);
    expect(saved?.state.messages).toHaveLength(200);
    expect(saved?.state.messages[199].text).toContain('记录 200。');
  });

  it('immediately flushes the last multiline edit when the native app enters the background', async () => {
    const { players, disk, input } = await restoredGame();
    fireEvent.change(input, { target: { value: '先记录日期\n再查看窗台' } });
    await act(async () => { nativeListeners.get('appStateChange')!({ isActive: false }); await flushGameStorage(); });
    expect(parseMobileSession(disk.get(SESSION_KEY)!)?.state.declarations[players[0].id]).toBe('先记录日期\n再查看窗台');
  });

  for (const label of ['返回首页', '重新开始']) it(`keeps the latest draft durable and reachable when choosing ${label}`, async () => {
    const { players, disk, input } = await restoredGame();
    fireEvent.change(input, { target: { value: '还没停下打字就离开\n仍然保留这一行' } });
    navigate(label); await act(async () => { await flushGameStorage(); });
    expect(parseMobileSession(disk.get(SESSION_KEY)!)?.state.declarations[players[0].id]).toContain('仍然保留这一行');
    if (label === '重新开始') fireEvent.click(screen.getByRole('button', { name: '返回', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: `${players[0].name}的行动` })).toHaveValue('还没停下打字就离开\n仍然保留这一行');
  });

  it('persists changing investigators and the submitted declaration without waiting for typing', async () => {
    const { players, disk, input } = await restoredGame(2);
    fireEvent.change(input, { target: { value: '调查门廊' } });
    fireEvent.click(screen.getByRole('button', { name: '下一位', exact: true }));
    await act(async () => { await flushGameStorage(); });
    const saved = parseMobileSession(disk.get(SESSION_KEY)!);
    expect(saved?.state.currentActorIndex).toBe(1);
    expect(saved?.state.declarations[players[0].id]).toBe('调查门廊');
    expect(saved?.state.messages.at(-1)).toMatchObject({ type: 'player', text: '调查门廊', playerName: players[0].name });
  });

  it('commits the current automatic checkpoint along with an explicit manual save', async () => {
    const { players, disk, input } = await restoredGame();
    fireEvent.change(input, { target: { value: '点击保存前刚输入的最后一句' } });
    navigate('保存游戏'); await act(async () => { await flushGameStorage(); });
    expect(readSaveLibrary().saves[0].gameState.declarations[players[0].id]).toBe('点击保存前刚输入的最后一句');
    expect(parseMobileSession(disk.get(SESSION_KEY)!)?.state.declarations[players[0].id]).toBe('点击保存前刚输入的最后一句');
  });

  it('flushes a pending draft when the game component is removed', async () => {
    const { players, disk, input, view } = await restoredGame();
    fireEvent.change(input, { target: { value: '卸载前的最后一笔' } }); view.unmount();
    await flushGameStorage();
    expect(parseMobileSession(disk.get(SESSION_KEY)!)?.state.declarations[players[0].id]).toBe('卸载前的最后一笔');
  });
});
