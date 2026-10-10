import { useLayoutEffect, type RefObject } from 'react';

/** Reveal changed reading content in place: retain DOM, focus and scroll positions. */
export function useReadingMotion(ref: RefObject<HTMLElement>, page: string | boolean, enabled = true) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element?.animate || document.hidden) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;
    const animation = element.animate([{ opacity: .72 }, { opacity: 1 }], {
      duration: 160, easing: 'cubic-bezier(.2,.7,.2,1)'
    });
    const stop = () => { if (document.hidden || preference.matches) animation.cancel(); };
    document.addEventListener('visibilitychange', stop);
    preference.addEventListener('change', stop);
    return () => {
      animation.cancel();
      document.removeEventListener('visibilitychange', stop);
      preference.removeEventListener('change', stop);
    };
  }, [ref, page, enabled]);
}
