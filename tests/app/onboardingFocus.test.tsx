import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { positionOnboardingBubble } from '../../src/components/game/onboardingFocus';
import { attachDialogCompanion, useDialogFocus } from '../../src/components/shared/useDialogFocus';

describe('anchored onboarding', () => {
  it.each([
    { target: { x: 14, y: 510, width: 250, height: 44 }, side: 'above' },
    { target: { x: 260, y: 42, width: 44, height: 44 }, side: 'below' },
    { target: { x: 6, y: 400, width: 44, height: 44 }, side: 'above' }
  ])('keeps the cue clear of a $side target and inside a narrow safe viewport', ({ target, side }) => {
    const bounds = { x: 12, y: 40, width: 320, height: 568, right: 308, bottom: 548 };
    const size = { width: 180, height: 46 };
    const bubble = positionOnboardingBubble(target, bounds, size);
    expect(bubble.side).toBe(side);
    expect(bubble.x).toBeGreaterThanOrEqual(bounds.x);
    expect(bubble.x + size.width).toBeLessThanOrEqual(bounds.right);
    expect(bubble.y).toBeGreaterThanOrEqual(bounds.y);
    expect(bubble.y + size.height).toBeLessThanOrEqual(bounds.bottom);
    expect(side === 'above' ? bubble.y + size.height < target.y : bubble.y > target.y + target.height).toBe(true);
  });

  it('keeps a portal cue in its owning dialog keyboard loop and releases it when removed', () => {
    const close = vi.fn();
    function Dialog({ guided }: { guided: boolean }) {
      const owner = useRef<HTMLDivElement>(null), cue = useRef<HTMLElement>(null);
      useDialogFocus(true, owner, close);
      useLayoutEffect(() => {
        if (guided && owner.current && cue.current) return attachDialogCompanion(owner.current, cue.current);
      }, [guided]);
      return <><div ref={owner} role="dialog"><button>返回</button><button>保存</button></div>
        {guided && createPortal(<aside ref={cue}><button>跳过</button></aside>, document.body)}</>;
    }
    const view = render(<Dialog guided />);
    const first = screen.getByRole('button', { name: '返回' }), last = screen.getByRole('button', { name: '跳过' });
    first.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' }); expect(first).toHaveFocus();
    last.focus(); fireEvent.keyDown(document, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
    view.rerender(<Dialog guided={false} />);
    first.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: '保存' })).toHaveFocus();
  });
});
