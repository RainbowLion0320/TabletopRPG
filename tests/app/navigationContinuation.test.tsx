import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { AndroidApp } from '../../src/android/AndroidApp';
import { writeMobileSession, type MobileSession } from '../../src/android/session';

vi.mock('../../src/audio/AudioDirector', () => ({ AudioDirector: () => null }));
vi.mock('../../src/android/native', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/android/native')>(), isNativeAndroid: () => false
}));
vi.mock('../../src/android/session', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/android/session')>(), writeMobileSession: vi.fn()
}));
const write = vi.mocked(writeMobileSession);
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo');
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }); });
afterAll(() => {
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
});

beforeEach(() => {
  localStorage.clear(); vi.stubEnv('VITE_AI_API_KEY', ''); write.mockReset();
  write.mockImplementation(async (state, roll) => ({ version: 1, savedAt: 1234, state, roll }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { localStorage.clear(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function startSolo() {
  fireEvent.click(screen.getByRole('button', { name: '开始游戏', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: '进入游戏', exact: true }));
  return screen.getByRole('textbox', { name: '亨利·格雷的行动' });
}
function navigate(label: string) {
  fireEvent.click(screen.getByRole('button', { name: '菜单', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
}

describe('current investigation navigation', () => {
  it('returns to the unsaved web investigation with its draft and without creating a manual save', () => {
    render(<App />); const input = startSolo(); fireEvent.change(input, { target: { value: '先记录信上的日期。\n再查看门廊。' } });
    navigate('返回首页');
    const resume = screen.getByRole('button', { name: '继续游戏', exact: true });
    expect(resume).toBeEnabled(); expect(resume).toHaveClass('primary-btn'); expect(resume).toHaveFocus();
    expect(screen.getByRole('region', { name: '继续调查摘要' })).toHaveTextContent('当前调查');
    fireEvent.click(resume);
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('先记录信上的日期。\n再查看门廊。');
    expect(localStorage.getItem('trpg-saves-v2')).toBeNull(); expect(write).not.toHaveBeenCalled();
  });
  it('keeps the web investigation when selection is cancelled and replaces it only on actually starting a new one', () => {
    render(<App />); fireEvent.change(startSolo(), { target: { value: '旧调查的行动草稿。' } });
    navigate('重新开始'); fireEvent.click(screen.getByRole('button', { name: '返回', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('旧调查的行动草稿。');
    navigate('重新开始'); fireEvent.click(screen.getByRole('button', { name: '进入游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('');
    fireEvent.change(screen.getByRole('textbox', { name: '亨利·格雷的行动' }), { target: { value: '新的调查。' } });
    navigate('返回首页'); fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('新的调查。');
  });
  it('keeps the current Android draft reachable while automatic persistence remains pending', () => {
    write.mockImplementation(() => new Promise(() => {}));
    render(<AndroidApp />); fireEvent.change(startSolo(), { target: { value: '等待写入的当前草稿。' } });
    navigate('返回首页'); fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('等待写入的当前草稿。');
  });
  it('does not fall back to an older Android session when disk writing fails', async () => {
    write.mockRejectedValue(new Error('Disk full'));
    render(<AndroidApp />); fireEvent.change(startSolo(), { target: { value: '写入失败仍在继续的调查。' } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('自动保存失败'));
    navigate('返回首页'); fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('写入失败仍在继续的调查。');
  });
  it('ignores old Android write completions and failures after a newer navigation checkpoint', async () => {
    const pending: Array<{ value: MobileSession; resolve: (value: MobileSession) => void; reject: (reason: Error) => void }> = [];
    write.mockImplementation((state, roll) => new Promise((resolve, reject) => { pending.push({ value: { version: 1, savedAt: 1234, state, roll }, resolve, reject }); }));
    render(<AndroidApp />); const input = startSolo();
    fireEvent.change(input, { target: { value: '先前的草稿。' } }); fireEvent.change(input, { target: { value: '最新的草稿。' } });
    navigate('返回首页'); const newest = pending.at(-1)!;
    await act(async () => { pending[0].reject(new Error('Old write failed')); newest.resolve(newest.value); });
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { pending[1].resolve(pending[1].value); });
    fireEvent.click(screen.getByRole('button', { name: '继续游戏', exact: true }));
    expect(screen.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('最新的草稿。');
  });
});
