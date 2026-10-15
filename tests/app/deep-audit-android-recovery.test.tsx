import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AndroidApp } from '../../src/android/AndroidApp';
import { createNativeStorage, type NativeStore } from '../../src/android/native';
import { parseMobileSession, SESSION_KEY } from '../../src/android/session';
import { flushGameStorage, installGameStorage } from '../../src/platform/storage';
import * as platformStorage from '../../src/platform/storage';
import { createInvestigatorFromPreset, presets } from '../../src/data/presets';
import { makeState } from '../dm/fixtures';
import { runDmTurn } from '../../src/dm/pipeline';
import { gameReducer } from '../../src/state/gameReducer';
import { guidedDeclaration } from '../../src/services/onboarding';
import { evaluateD100 } from '../../src/services/dice';
import type { GameState } from '../../src/types/game';

const { nativeListeners } = vi.hoisted(() => ({ nativeListeners: new Map<string, (event: { isActive: boolean }) => void>() }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (event: string, handler: (event: { isActive: boolean }) => void) => {
    nativeListeners.set(event, handler); return { remove: () => nativeListeners.delete(event) };
  }), exitApp: vi.fn()
} }));
vi.mock('../../src/android/native', async original => ({
  ...await original<typeof import('../../src/android/native')>(), isNativeAndroid: () => true
}));
vi.mock('../../src/audio/AudioDirector', () => ({ AudioDirector: () => null }));
vi.mock('../../src/dm/pipeline', () => ({ runDmTurn: vi.fn() }));

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});
beforeEach(() => {
  installGameStorage(localStorage); localStorage.clear(); vi.stubEnv('VITE_AI_API_KEY', '');
  localStorage.setItem('trpg-opening-v1', 'seen'); vi.mocked(runDmTurn).mockClear(); nativeListeners.clear();
});
afterEach(async () => {
  await act(async () => { await flushGameStorage().catch(() => undefined); cleanup(); });
  await flushGameStorage().catch(() => undefined); installGameStorage(localStorage);
  localStorage.clear(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe('offline Android continuation', () => {
  it('lets a first-time player enter the authored guide without opening connection settings', async () => {
    render(<AndroidApp />);
    fireEvent.click(screen.getByRole('button', { name: '开始游戏', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '进入游戏', exact: true }));
    await act(async () => { await flushGameStorage(); });
    expect(screen.queryByRole('dialog', { name: 'AI DM 配置', exact: true })).toBeNull();
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toBeInTheDocument();
    expect(runDmTurn).not.toHaveBeenCalled();
  });

  it('lets a saved investigation be read offline and requests settings only when a new model turn is submitted', async () => {
    const player = createInvestigatorFromPreset(presets[0]);
    const state = makeState({ players: [player] });
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, savedAt: 1234, state, roll: null }));
    render(<AndroidApp />);
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    await act(async () => { await flushGameStorage(); });
    expect(screen.queryByRole('dialog', { name: 'AI DM 配置', exact: true })).toBeNull();
    const input = screen.getByRole('textbox', { name: `${player.name}的行动` });
    fireEvent.change(input, { target: { value: '先询问失踪的经过' } });
    fireEvent.click(screen.getByRole('button', { name: '提交', exact: true }));
    await act(async () => { await flushGameStorage(); });
    expect(screen.getByRole('dialog', { name: 'AI DM 配置', exact: true })).toBeInTheDocument();
    expect(input).toHaveValue('先询问失踪的经过');
    expect(runDmTurn).not.toHaveBeenCalled();
  });

  it('restores and confirms an already locked guide die without interrupting it with settings', async () => {
    const player = createInvestigatorFromPreset(presets[0]);
    let state: GameState = gameReducer(makeState(), { type: 'start', players: [player], onboarding: true });
    for (let turn = 0; turn < 2; turn++) {
      const actions = [{ player: player.name, action: guidedDeclaration(state, player.id)! }];
      state = gameReducer(state, { type: 'beginOnboardingTurn', actions });
      state = gameReducer(state, { type: 'resolveOnboardingTurn', actions });
      state = gameReducer(state, { type: 'continueOnboardingReading', messageId: state.onboarding!.readingMessageId! });
    }
    expect(state.pendingCheck).not.toBeNull();
    const check = state.pendingCheck!;
    const roll = { check, result: evaluateD100(check, 14), phase: 'revealed' };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, savedAt: 1234, state, roll }));
    render(<AndroidApp />);
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    await act(async () => { await flushGameStorage(); });
    expect(screen.queryByRole('dialog', { name: 'AI DM 配置', exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认结果', exact: true }));
    await act(async () => { await flushGameStorage(); });
    expect(screen.getByRole('main')).toHaveAttribute('data-onboarding-reading', 'true');
    expect(screen.getByRole('region', { name: '剧情记录' })).toHaveTextContent('找到一张旧合影');
    expect(screen.queryByRole('dialog', { name: 'AI DM 配置', exact: true })).toBeNull();
    expect(runDmTurn).not.toHaveBeenCalled();
  });
});

describe('native save recovery notices', () => {
  async function nativeInvestigation(partialRecovery = false) {
    const player = createInvestigatorFromPreset(presets[0]);
    const state = makeState({ players: [player] });
    const raw = JSON.stringify({ version: 1, savedAt: 1234, state, roll: null });
    const disk = new Map([[SESSION_KEY, raw]]);
    let failing = true;
    const write: NativeStore['write'] = async ({ key, value }) => {
      if (failing) throw new Error('temporary storage failure');
      if (value === null) disk.delete(key); else disk.set(key, value);
    };
    installGameStorage(createNativeStorage({
      [SESSION_KEY]: raw, 'trpg-opening-v1': 'seen', 'trpg-onboarding-v1': 'seen',
      'trpg-api': JSON.stringify({ apiKey: 'test-only', provider: 'custom', protocol: 'chat-completions', endpoint: 'https://unit.test/v1', model: 'qa-model' })
    }, { readAll: async () => ({ values: {} }), write }));
    render(<AndroidApp partialRecovery={partialRecovery} />);
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    await act(async () => { await flushGameStorage().catch(() => undefined); });
    return { player, disk, recover: () => { failing = false; } };
  }

  it('removes the automatic-save failure notice when the latest checkpoint is durable again', async () => {
    const { player, disk, recover } = await nativeInvestigation();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('自动保存失败'));
    recover();
    fireEvent.change(screen.getByRole('textbox', { name: `${player.name}的行动` }), { target: { value: '存储恢复后的新草稿' } });
    await waitFor(() => expect(parseMobileSession(disk.get(SESSION_KEY)!)?.state.declarations[player.id]).toBe('存储恢复后的新草稿'));
    await act(async () => { await flushGameStorage(); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the record-recovery notice after the temporary save problem has recovered', async () => {
    const { player, disk, recover } = await nativeInvestigation(true);
    expect(screen.getByRole('alert')).toHaveTextContent('部分本机记录暂时无法读取');
    recover();
    fireEvent.change(screen.getByRole('textbox', { name: `${player.name}的行动` }), { target: { value: '有效调查仍可保存' } });
    await waitFor(() => expect(parseMobileSession(disk.get(SESSION_KEY)!)?.state.declarations[player.id]).toBe('有效调查仍可保存'));
    await act(async () => { await flushGameStorage(); });
    expect(screen.getByRole('alert')).toHaveTextContent('部分本机记录暂时无法读取');
    fireEvent.click(screen.getByRole('button', { name: '知道了', exact: true }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears a failed-save notice when a later background flush successfully retries the dirty checkpoint', async () => {
    const { recover } = await nativeInvestigation();
    expect(screen.getByRole('alert')).toHaveTextContent('自动保存失败');
    recover();
    await act(async () => {
      nativeListeners.get('appStateChange')!({ isActive: false });
      await flushGameStorage();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a stale background-flush failure after a newer checkpoint was saved', async () => {
    const player = createInvestigatorFromPreset(presets[0]);
    const state = makeState({ players: [player] });
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, savedAt: 1234, state, roll: null }));
    render(<AndroidApp />);
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    await act(async () => { await flushGameStorage(); });
    let rejectOld!: (reason: Error) => void;
    vi.spyOn(platformStorage, 'flushGameStorage').mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectOld = reject; }));
    act(() => nativeListeners.get('appStateChange')!({ isActive: false }));
    fireEvent.change(screen.getByRole('textbox', { name: `${player.name}的行动` }), { target: { value: '更新后的调查' } });
    await waitFor(() => expect(parseMobileSession(localStorage.getItem(SESSION_KEY))?.state.declarations[player.id]).toBe('更新后的调查'));
    await act(async () => { await flushGameStorage(); rejectOld(new Error('old failed write')); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
