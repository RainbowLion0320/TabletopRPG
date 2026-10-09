import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogFocus } from '../../src/components/shared/useDialogFocus';

function Panel({ modal, onClose }: { modal: boolean; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(true, ref, onClose, undefined, { trapFocus: modal });
  return <section ref={ref} role="dialog" aria-label="详情"><button aria-label="关闭详情" onClick={onClose}>关闭详情</button><button>详情末项</button></section>;
}

function Harness({ modal = false, initial = false, outerClose, innerClose }: { modal?: boolean; initial?: boolean; outerClose: () => void; innerClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(true);
  const [child, setChild] = useState(initial);
  const closeOuter = () => { outerClose(); setOpen(false); };
  useDialogFocus(open, ref, closeOuter);
  return open && <section ref={ref} role="dialog" aria-label="资料">
    <button aria-label="关闭资料" onClick={closeOuter}>关闭资料</button>
    <button onClick={() => setChild(true)}>打开详情</button>
    {child && <Panel modal={modal} onClose={() => { innerClose(); setChild(false); }} />}
    <button>资料末项</button>
  </section>;
}

describe('nested dialog keyboard ownership', () => {
  it('Escape closes only a desktop detail, then its parent, restoring the opener', () => {
    const outerClose = vi.fn(); const innerClose = vi.fn();
    render(<Harness outerClose={outerClose} innerClose={innerClose} />);
    const opener = screen.getByRole('button', { name: '打开详情' }); opener.focus(); fireEvent.click(opener);
    expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledOnce(); expect(outerClose).not.toHaveBeenCalled(); expect(opener).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(outerClose).toHaveBeenCalledOnce();
  });
  it('a nonmodal panel lets Tab wrap within the outer modal and keeps an outside field focused on close', () => {
    render(<Harness outerClose={vi.fn()} innerClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '打开详情' }));
    screen.getByRole('button', { name: '资料末项' }).focus(); fireEvent.keyDown(document, { key: 'Tab' });
    const outside = screen.getByRole('button', { name: '关闭资料' }); expect(outside).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '详情' })).toBeNull(); expect(outside).toHaveFocus();
  });
  it('a phone modal keeps both Tab directions inside the detail', () => {
    render(<Harness modal outerClose={vi.fn()} innerClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '打开详情' }));
    const first = screen.getByRole('button', { name: '关闭详情' }); const last = screen.getByRole('button', { name: '详情末项' });
    last.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(first).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
  });
  it('simultaneously mounted nested dialogs still give focus and Escape to the inner dialog', () => {
    const outerClose = vi.fn(); const innerClose = vi.fn();
    render(<Harness modal initial outerClose={outerClose} innerClose={innerClose} />);
    expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(innerClose).toHaveBeenCalledOnce(); expect(outerClose).not.toHaveBeenCalled();
  });
  it.each([{ isComposing: true }, { keyCode: 229 }])('leaves composition Escape and Tab to the input method (%j)', (composition) => {
    const outerClose = vi.fn(); const innerClose = vi.fn();
    render(<Harness modal initial outerClose={outerClose} innerClose={innerClose} />);
    const last = screen.getByRole('button', { name: '详情末项' });
    last.focus();
    expect(fireEvent.keyDown(last, { key: 'Tab', ...composition })).toBe(true);
    expect(last).toHaveFocus();
    expect(fireEvent.keyDown(last, { key: 'Escape', ...composition })).toBe(true);
    expect(innerClose).not.toHaveBeenCalled();
    expect(outerClose).not.toHaveBeenCalled();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledOnce();
    expect(outerClose).not.toHaveBeenCalled();
  });
});
