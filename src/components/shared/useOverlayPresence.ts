import { useLayoutEffect, useRef, useState } from 'react';

export const OVERLAY_EXIT_MS = 170;

/** Keep only the outgoing visual briefly; logical close, focus and input are immediate. */
export function useOverlayPresence<T>(value: T, open = Boolean(value), exitMs = OVERLAY_EXIT_MS) {
  const lastValue = useRef(value);
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    if (open) { lastValue.current = value; setRetained(true); }
  }, [open, value]);

  useLayoutEffect(() => {
    if (open || !retained) return;
    if (document.hidden || typeof window.matchMedia !== 'function') { setRetained(false); return; }
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (document.hidden || preference.matches) { setRetained(false); return; }
    const finish = () => setRetained(false);
    const stop = () => { if (document.hidden || preference.matches) finish(); };
    const timer = window.setTimeout(finish, exitMs);
    document.addEventListener('visibilitychange', stop);
    preference.addEventListener('change', stop);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', stop);
      preference.removeEventListener('change', stop);
    };
  }, [open, retained, exitMs]);

  return {
    present: open || retained,
    value: open ? value : lastValue.current,
    layerProps: {
      inert: open ? undefined : '',
      'data-ui-phase': open ? 'open' : 'closing',
      'aria-hidden': open ? undefined : true
    }
  };
}
