import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Reveal changed reading content in place: retain DOM, focus and scroll positions. */
export function useReadingMotion(ref: RefObject<HTMLElement>, page: string | boolean, enabled = true) {
  const continuation = useRef<{ element: HTMLElement; opacity: string; transform: string } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const previous = continuation.current;
    continuation.current = null;
    if (!enabled || !element?.animate || document.hidden) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;
    const from = previous?.element === element
      ? { opacity: previous.opacity, transform: previous.transform }
      : { opacity: .45, transform: 'translateY(3px)' };
    const animation = element.animate([from, { opacity: 1, transform: 'none' }], {
      duration: 190, easing: 'cubic-bezier(.2,.7,.2,1)'
    });
    const stop = () => {
      if (document.hidden || preference.matches) {
        continuation.current = null;
        animation.cancel();
      }
    };
    document.addEventListener('visibilitychange', stop);
    preference.addEventListener('change', stop);
    return () => {
      continuation.current = null;
      // Read the old node before canceling its animation; the next effect consumes
      // this pose only if the same reading surface is still present and enabled.
      if (animation.playState === 'running' && element.isConnected && !document.hidden && !preference.matches) {
        const style = getComputedStyle(element);
        continuation.current = { element, opacity: style.opacity, transform: style.transform };
      }
      animation.cancel();
      document.removeEventListener('visibilitychange', stop);
      preference.removeEventListener('change', stop);
    };
  }, [ref, page, enabled]);
}
