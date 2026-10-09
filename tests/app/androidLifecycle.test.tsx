import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App as NativeApp } from '@capacitor/app';
import { AndroidApp } from '../../src/android/AndroidApp';
import { SESSION_KEY } from '../../src/android/session';
import { flushGameStorage } from '../../src/platform/storage';
import { saveGameState } from '../../src/services/storage';
import { makeState } from '../dm/fixtures';

const { listeners } = vi.hoisted(() => ({ listeners: new Map<string, () => void>() }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (event: string, handler: () => void) => {
    listeners.set(event, handler);
    return { remove: () => listeners.delete(event) };
  }),
  exitApp: vi.fn().mockResolvedValue(undefined)
} }));
vi.mock('../../src/android/native', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/android/native')>(), isNativeAndroid: () => true
}));
vi.mock('../../src/platform/storage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/platform/storage')>(), flushGameStorage: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../../src/audio/AudioDirector', () => ({ AudioDirector: () => null }));
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

beforeEach(() => {
  localStorage.clear(); listeners.clear(); vi.clearAllMocks();
  vi.stubEnv('VITE_AI_API_KEY', '');
  vi.mocked(flushGameStorage).mockResolvedValue(undefined);
  vi.mocked(NativeApp.exitApp).mockResolvedValue(undefined);
});
afterEach(() => { localStorage.clear(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function back() { act(() => listeners.get('backButton')!()); }

describe('Android recovery and exit', () => {
  for (const available of ['manual', 'automatic']) it(`retains the valid ${available} continuation when another encrypted record was unreadable`, () => {
    localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'test-key', provider: 'openai', protocol: 'responses' }));
    const manual = makeState(); manual.declarations = { [manual.players[0].id]: '从有效手动记录继续调查。' };
    saveGameState(manual);
    const state = available === 'automatic' ? { ...manual, declarations: { [manual.players[0].id]: '从当前自动记录继续调查。' } } : manual;
    if (available === 'automatic') localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), state, roll: null }));
    const records = localStorage.getItem('trpg-saves-v2');
    expect(records).not.toBeNull();
    render(<AndroidApp partialRecovery />);
    expect(screen.getByRole('alert')).toHaveTextContent('部分本机记录暂时无法读取');
    expect(localStorage.getItem('trpg-saves-v2')).toBe(records);
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: `${state.players[0].name}的行动` })).toHaveValue(state.declarations[state.players[0].id]);
  });
  it('keeps corrupt automatic data private and intact, while manual continuation still works', () => {
    const corrupt = 'NOT_JSON_INTERNAL_PRIVATE_HINT';
    localStorage.setItem(SESSION_KEY, corrupt);
    localStorage.setItem('trpg-api', JSON.stringify({ apiKey: 'test-key', provider: 'openai', protocol: 'responses' }));
    const state = makeState(); state.declarations = { [state.players[0].id]: '从手动记录继续调查。' };
    saveGameState(state);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<AndroidApp />);
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('自动续玩记录暂时无法读取');
    expect(notice).not.toHaveTextContent(/NOT_JSON|Unexpected|SyntaxError|INTERNAL|position|JSON/);
    expect(localStorage.getItem(SESSION_KEY)).toBe(corrupt);
    fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: `${state.players[0].name}的行动` })).toHaveValue('从手动记录继续调查。');
  });

  it('waits for one persistence operation before exiting and guards repeated taps and Back', async () => {
    let settle!: () => void;
    vi.mocked(flushGameStorage).mockImplementationOnce(() => new Promise<void>(resolve => { settle = resolve; }));
    render(<AndroidApp />); back();
    const exit = screen.getByRole('button', { name: '退出游戏', exact: true });
    fireEvent.click(exit); fireEvent.click(exit); back();
    expect(flushGameStorage).toHaveBeenCalledOnce();
    expect(NativeApp.exitApp).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('退出游戏？');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    expect(exit).toBeDisabled();
    await act(async () => settle());
    expect(NativeApp.exitApp).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a failed exit actionable, retains data, and permits retry or cancellation', async () => {
    vi.mocked(flushGameStorage).mockRejectedValueOnce(new Error('INTERNAL_DISK_FAILURE'));
    localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, savedAt: 1234, state: makeState(), roll: null }));
    const saved = localStorage.getItem(SESSION_KEY);
    render(<AndroidApp />); back();
    fireEvent.click(screen.getByRole('button', { name: '退出游戏', exact: true }));
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('alert')));
    expect(screen.getByRole('alert')).toHaveTextContent('保存尚未完成');
    expect(screen.getByRole('alert')).not.toHaveTextContent('INTERNAL_DISK_FAILURE');
    expect(localStorage.getItem(SESSION_KEY)).toBe(saved);
    expect(screen.getByRole('button', { name: '退出游戏', exact: true })).toBeEnabled();
    expect(NativeApp.exitApp).not.toHaveBeenCalled();
    back(); expect(screen.queryByRole('dialog')).toBeNull();
    back(); expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '退出游戏', exact: true }));
    await waitFor(() => expect(NativeApp.exitApp).toHaveBeenCalledOnce());
    expect(flushGameStorage).toHaveBeenCalledTimes(2);
  });
});
