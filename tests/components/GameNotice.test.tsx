import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameNotice } from '../../src/components/shared/GameNotice';
import { OVERLAY_EXIT_MS } from '../../src/components/shared/useOverlayPresence';
import { useToast } from '../../src/app/useToast';

describe('passive feedback visibility and lifetime', () => {
  let reduced: boolean, background: boolean, mediaEvents: EventTarget;
  beforeEach(() => {
    vi.useFakeTimers(); reduced = false; background = false; mediaEvents = new EventTarget();
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => background);
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduced; },
      addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
      removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents)
    }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('keeps one live region, changes only its current message and releases expired text from accessibility immediately', () => {
    const form = (message: string) => <><textarea aria-label="行动" defaultValue={'先记录日期\n再询问委托人'} /><GameNotice message={message} /></>;
    const { rerender } = render(form('')), status = screen.getByRole('status'), input = screen.getByRole('textbox'); input.focus();
    expect(status).toBeEmptyDOMElement(); expect(status).toHaveAttribute('aria-live', 'polite'); expect(status).toHaveAttribute('aria-atomic', 'true');
    rerender(form('已保存')); const visual = status.querySelector('.toast')!;
    expect(screen.getByRole('status')).toBe(status); expect(screen.getAllByRole('status')).toHaveLength(1);
    rerender(form('未能保存，请检查设备存储空间后重试。'));
    expect(status.querySelector('.toast')).toBe(visual); expect(status).not.toHaveTextContent('已保存'); expect(status).toHaveTextContent('未能保存');
    rerender(form(''));
    expect(visual).toHaveAttribute('data-ui-phase', 'closing'); expect(visual).toHaveAttribute('aria-hidden', 'true'); expect(visual).toHaveAttribute('inert');
    expect(status).not.toHaveAttribute('aria-hidden'); expect(input).toHaveFocus(); expect(input).toHaveValue('先记录日期\n再询问委托人');
    act(() => vi.advanceTimersByTime(OVERLAY_EXIT_MS)); expect(status).toBeEmptyDOMElement(); expect(input).toHaveFocus();
  });

  it('continues a retained visual with the newest message and cancels its old retirement timer', () => {
    const { rerender } = render(<GameNotice message="已保存" />), status = screen.getByRole('status'), visual = status.querySelector('.toast')!;
    rerender(<GameNotice message="" />); act(() => vi.advanceTimersByTime(80)); rerender(<GameNotice message="AI 设置已保存" />);
    expect(status.querySelector('.toast')).toBe(visual); expect(visual).toHaveAttribute('data-ui-phase', 'open'); expect(visual).not.toHaveAttribute('aria-hidden'); expect(visual).not.toHaveAttribute('inert');
    expect(visual).toHaveTextContent('AI 设置已保存'); expect(visual).not.toHaveAttribute('data-ui-enter');
    act(() => vi.advanceTimersByTime(OVERLAY_EXIT_MS)); expect(status.querySelector('.toast')).toBe(visual);
    rerender(<GameNotice message="" />); expect(visual).toHaveTextContent('AI 设置已保存');
    act(() => vi.advanceTimersByTime(OVERLAY_EXIT_MS)); expect(status).toBeEmptyDOMElement();
  });

  it('retains the original short and long logical timeouts when feedback is repeated or replaced', () => {
    const long = '未能保存，请检查设备存储空间后重试。';
    function Harness() { const { toast, notify } = useToast(); return <><button onClick={() => notify('已保存')}>短反馈</button><button onClick={() => notify(long)}>长反馈</button><GameNotice message={toast} /></>; }
    render(<Harness />); fireEvent.click(screen.getByText('短反馈')); act(() => vi.advanceTimersByTime(1000)); fireEvent.click(screen.getByText('短反馈'));
    act(() => vi.advanceTimersByTime(1799)); expect(document.querySelector('.toast')).toHaveAttribute('data-ui-phase', 'open');
    act(() => vi.advanceTimersByTime(1)); expect(document.querySelector('.toast')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByText('长反馈')); act(() => vi.advanceTimersByTime(3999)); expect(document.querySelector('.toast')).toHaveTextContent(long); expect(document.querySelector('.toast')).not.toHaveAttribute('aria-hidden');
    act(() => vi.advanceTimersByTime(1)); expect(document.querySelector('.toast')).toHaveAttribute('aria-hidden', 'true');
    act(() => vi.advanceTimersByTime(OVERLAY_EXIT_MS)); expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each(['reduced motion', 'background'])('removes only the visual immediately when closing with %s', mode => {
    const { rerender } = render(<GameNotice message="已保存" />), status = screen.getByRole('status');
    if (mode === 'reduced motion') reduced = true; else background = true;
    rerender(<GameNotice message="" />); expect(status).toBeEmptyDOMElement(); expect(screen.getByRole('status')).toBe(status);
  });

  it.each(['reduced motion', 'background'])('settles a departing message immediately when switching to %s', mode => {
    const { rerender } = render(<GameNotice message="已保存" />), status = screen.getByRole('status'); rerender(<GameNotice message="" />);
    expect(status.querySelector('.toast')).not.toBeNull();
    act(() => { if (mode === 'reduced motion') { reduced = true; mediaEvents.dispatchEvent(new Event('change')); } else { background = true; document.dispatchEvent(new Event('visibilitychange')); } });
    expect(status).toBeEmptyDOMElement(); expect(screen.getByRole('status')).toBe(status);
  });
});
