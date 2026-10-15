import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface FocusTarget { element: HTMLElement; text: string; reading?: boolean }
export interface CueRect { x: number; y: number; width: number; height: number }
interface CueBounds extends CueRect { right: number; bottom: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Fit a one-line bubble beside its control, within the current usable viewport. */
export function positionOnboardingBubble(target: CueRect, viewport: CueBounds, size: { width: number; height: number }) {
  const gap = 14;
  const above = target.y - gap - size.height;
  const below = target.y + target.height + gap;
  const side = above >= viewport.y ? 'above' : 'below';
  const x = clamp(target.x + target.width / 2 - size.width / 2, viewport.x, viewport.right - size.width);
  const y = clamp(side === 'above' ? above : below, viewport.y, viewport.bottom - size.height);
  return { x, y, side, arrow: clamp(target.x + target.width / 2 - x, 16, size.width - 16) };
}

export function useOnboardingFocus(resolve: () => FocusTarget | null, bubbleRef: RefObject<HTMLElement>) {
  const revealedReply = useRef<HTMLElement | null>(null);
  const [focus, setFocus] = useState<(FocusTarget & {
    rect: CueRect; bubble: ReturnType<typeof positionOnboardingBubble>; hand: { x: number; y: number };
  }) | null>(null);
  useLayoutEffect(() => {
    let frame = 0, trackingUntil = 0;
    let revealed: HTMLElement | null = null;
    let observedTarget: HTMLElement | null = null;
    const measure = () => {
      const target = resolve();
      if (!target || document.activeElement?.matches('.dock-input:not([readonly])')) { setFocus(null); return; }
      const element = target.element;
      if (observedTarget !== element) {
        if (observedTarget) resize?.unobserve(observedTarget);
        resize?.observe(element); observedTarget = element;
      }
      const box = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      // The probe resolves CSS env() and native safe-area variables to pixel values.
      const insets = getComputedStyle(probe);
      const bounds = { x: left + (parseFloat(insets.paddingLeft) || 10), y: top + (parseFloat(insets.paddingTop) || 10),
        right: left + width - (parseFloat(insets.paddingRight) || 10), bottom: top + height - (parseFloat(insets.paddingBottom) || 10), width, height };
      let x = Math.max(box.left, left), y = Math.max(box.top, top);
      let right = Math.min(box.right, left + width), bottom = Math.min(box.bottom, top + height);
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden') { setFocus(null); return; }
        if (/hidden|auto|scroll|clip/.test(style.overflowX)) { x = Math.max(x, rect.left); right = Math.min(right, rect.right); }
        if (/hidden|auto|scroll|clip/.test(style.overflowY)) { y = Math.max(y, rect.top); bottom = Math.min(bottom, rect.bottom); }
      }
      if (revealed !== element) {
        revealed = element;
        if (target.reading && revealedReply.current !== element) {
          revealedReply.current = element;
          const panel = element.closest<HTMLElement>('.narrative-scroll');
          panel?.scrollTo({ top: element.offsetTop, behavior: 'auto' });
          if (document.activeElement === document.body || document.activeElement?.matches('.dock-submit')) panel?.focus({ preventScroll: true });
          schedule(); return;
        }
        // Reveal a clue below the fold once, then let the player scroll freely.
        if (element.matches('.case-board-mobile-card') && (bottom - y < box.height - 1)) {
          element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          schedule(); return;
        }
      }
      if (right - x < 24 || bottom - y < 24) { setFocus(null); return; }
      const rect = { x, y, width: right - x, height: bottom - y };
      const hit = document.elementFromPoint?.(x + rect.width / 2, y + rect.height / 2);
      // Yield to unrelated dialogs (for example sound settings), never point through them.
      if (hit && !element.contains(hit)) { setFocus(null); return; }
      const bubble = positionOnboardingBubble(rect, bounds, {
        width: bubbleRef.current?.offsetWidth || 192, height: bubbleRef.current?.offsetHeight || 44
      });
      const hand = { x: clamp(rect.x + rect.width - 24, bounds.x + 12, bounds.right - 28),
        y: clamp(rect.y + rect.height / 2, bounds.y + 8, bounds.bottom - 44) };
      setFocus(previous => previous?.element === element && previous.text === target.text
        && JSON.stringify([previous.rect, previous.bubble, previous.hand]) === JSON.stringify([rect, bubble, hand])
        ? previous : { ...target, rect, bubble, hand });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); if (performance.now() < trackingUntil) schedule(); });
    };
    const trackMotion = (event?: Event) => {
      if (event?.target instanceof Element && event.target.closest('.onboarding-focus-layer')) return;
      trackingUntil = performance.now() + 400; schedule();
    };
    const probe = document.createElement('div');
    probe.className = 'onboarding-insets'; probe.setAttribute('aria-hidden', 'true'); document.body.append(probe);
    const observer = new MutationObserver(records => {
      if (records.some(record => record.target instanceof Element && !record.target.closest('.onboarding-focus-layer, .onboarding-insets'))) schedule();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'style', 'aria-selected', 'aria-hidden', 'inert', 'data-ui-phase'] });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resize?.observe(document.documentElement);
    window.addEventListener('resize', trackMotion);
    document.addEventListener('scroll', schedule, true);
    document.addEventListener('focusin', schedule, true);
    document.addEventListener('focusout', schedule, true);
    document.addEventListener('animationstart', trackMotion, true);
    document.addEventListener('transitionrun', trackMotion, true);
    document.fonts?.addEventListener('loadingdone', trackMotion);
    window.visualViewport?.addEventListener('resize', trackMotion);
    window.visualViewport?.addEventListener('scroll', schedule);
    measure(); trackMotion();
    return () => {
      observer.disconnect(); resize?.disconnect(); probe.remove(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', trackMotion); document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('focusin', schedule, true); document.removeEventListener('focusout', schedule, true);
      document.removeEventListener('animationstart', trackMotion, true); document.removeEventListener('transitionrun', trackMotion, true);
      document.fonts?.removeEventListener('loadingdone', trackMotion);
      window.visualViewport?.removeEventListener('resize', trackMotion); window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [resolve, bubbleRef]);
  return focus;
}
