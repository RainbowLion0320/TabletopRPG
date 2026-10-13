import { useLayoutEffect, useRef, type RefObject } from 'react';

const PANEL_SELECTOR = '.modal-card, .save-manager-card, .entity-detail-card, .investigator-sheet, .android-exit-card, .dice-roll-card';

/** Seed a new visual once; native transitions continue from the current picture on reversal. */
export function useOverlayEntry(present: boolean, ref: RefObject<HTMLElement>) {
  const enteredRoot = useRef<HTMLElement | null>(null);

  // Check the actual root on each commit, including a replaced portal while still present.
  useLayoutEffect(() => {
    if (!present) { enteredRoot.current = null; return; }
    const root = ref.current?.closest<HTMLElement>('[data-ui-phase]');
    if (!root || root === enteredRoot.current) return;
    enteredRoot.current = root;
    if (document.hidden || document.documentElement.classList.contains('ui-motion-paused')
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    root.setAttribute('data-ui-enter', '');
    try {
      // Resolve both painted layers before removing their initial, transition-free styles.
      const layers = [root, ...Array.from(root.children).filter((child) => child.matches(PANEL_SELECTOR))];
      for (const layer of layers) {
        const style = window.getComputedStyle(layer);
        void style.opacity;
        void style.transform;
      }
    } finally {
      root.removeAttribute('data-ui-enter');
    }
    // No cleanup reset: StrictMode replay and same-DOM close/reopen must not reseed.
  });
}
