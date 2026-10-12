import { useRef, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayPresence, OVERLAY_EXIT_MS } from '../../src/components/shared/useOverlayPresence';
import { useDialogFocus } from '../../src/components/shared/useDialogFocus';

function Panel({ value, onClose, children }: { value: string | null; onClose: () => void; children?: ReactNode }) {
  const motion = useOverlayPresence(value);
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(Boolean(value), ref, onClose, undefined, { getFallbackFocus: () => document.querySelector('textarea') });
  return motion.present ? <section {...motion.layerProps} ref={ref} role={value ? 'dialog' : undefined} aria-label={motion.value!}>
    <button aria-label={`关闭${motion.value}`} onClick={onClose}>关闭</button>
    <p>{motion.value}</p>{children}
  </section> : null;
}

function Harness({ nested = false }: { nested?: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  return <>
    <button onClick={() => setValue('记录甲')}>打开记录甲</button>
    <button onClick={() => setValue('记录乙')}>打开记录乙</button>
    <textarea aria-label="行动" />
    <Panel value={value} onClose={() => setValue(null)}>
      {nested && <Panel value="关系详情" onClose={() => {}} />}
    </Panel>
  </>;
}

describe('overlay close lifetime and keyboard ownership', () => {
  let reduced: boolean;
  let background: boolean;
  let mediaEvents: EventTarget;
  beforeEach(() => {
    vi.useFakeTimers();
    reduced = false; background = false; mediaEvents = new EventTarget();
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => background);
    vi.stubGlobal('matchMedia', () => ({
      get matches() { return reduced; },
      addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
      removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents)
    }));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  function open(name = '打开记录甲') {
    const opener = screen.getByRole('button', { name });
    opener.focus(); fireEvent.click(opener); return opener;
  }

  it('keeps the outgoing record visible while focus and dialog ownership return immediately', () => {
    render(<Harness />); const opener = open();
    fireEvent.keyDown(document, { key: 'Escape' });
    const retiring = document.querySelector('[data-ui-phase="closing"]')!;
    expect(retiring).toHaveAttribute('inert');
    expect(retiring).toHaveAttribute('aria-hidden', 'true');
    expect(retiring).toHaveTextContent('记录甲');
    expect(screen.queryByRole('dialog')).toBeNull(); expect(opener).toHaveFocus();
    const action = screen.getByRole('textbox', { name: '行动' });
    action.focus(); fireEvent.change(action, { target: { value: '继续调查' } });
    act(() => { vi.advanceTimersByTime(OVERLAY_EXIT_MS); });
    expect(document.querySelector('[data-ui-phase="closing"]')).toBeNull();
    expect(action).toHaveFocus(); expect(action).toHaveValue('继续调查');
  });

  it('cancels an old close when reopened and retains the latest payload on the next close', () => {
    render(<Harness />); open(); fireEvent.keyDown(document, { key: 'Escape' });
    act(() => { vi.advanceTimersByTime(80); }); open('打开记录乙');
    act(() => { vi.advanceTimersByTime(OVERLAY_EXIT_MS); });
    expect(screen.getByRole('dialog', { name: '记录乙' })).toHaveTextContent('记录乙');
    expect(screen.getByRole('button', { name: '关闭记录乙' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-ui-phase="closing"]')).toHaveTextContent('记录乙');
    act(() => { vi.advanceTimersByTime(OVERLAY_EXIT_MS); });
    expect(document.querySelector('section')).toBeNull();
  });

  it('returns to a visible action control when a resized layout hides the original opener', () => {
    render(<Harness />); const opener = open(); opener.style.display = 'none';
    fireEvent.keyDown(document, { key: 'Escape' });
    const action = screen.getByRole('textbox', { name: '行动' }); expect(action).toHaveFocus();
    act(() => { vi.advanceTimersByTime(OVERLAY_EXIT_MS); }); expect(action).toHaveFocus();
  });

  it('closing a parent releases an inert descendant immediately and later retirement cannot steal focus', () => {
    render(<Harness nested />); const opener = open();
    expect(screen.getByRole('button', { name: '关闭关系详情' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '关闭记录甲' }));
    expect(opener).toHaveFocus(); expect(screen.queryByRole('dialog')).toBeNull();
    const action = screen.getByRole('textbox', { name: '行动' }); action.focus();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(action).toHaveFocus();
    act(() => { vi.advanceTimersByTime(OVERLAY_EXIT_MS); }); expect(action).toHaveFocus();
  });

  it.each(['reduced motion', 'background', 'no media-query API'])('closes immediately with %s', (mode) => {
    render(<Harness />); const opener = open();
    if (mode === 'reduced motion') reduced = true;
    if (mode === 'background') background = true;
    if (mode === 'no media-query API') vi.stubGlobal('matchMedia', undefined);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('section')).toBeNull(); expect(opener).toHaveFocus();
  });

  it.each(['reduced motion', 'background'])('retires an already closing visual when switching to %s', (mode) => {
    render(<Harness />); open(); fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('section')).not.toBeNull();
    act(() => {
      if (mode === 'reduced motion') { reduced = true; mediaEvents.dispatchEvent(new Event('change')); }
      else { background = true; document.dispatchEvent(new Event('visibilitychange')); }
    });
    expect(document.querySelector('section')).toBeNull();
  });
});
