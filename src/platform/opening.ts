import { useCallback, useRef, useState } from 'react';
import { flushGameStorage, gameStorage } from './storage';

export const OPENING_SEEN_KEY = 'trpg-opening-v1';

export function shouldPlayOpening(): boolean {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try { return gameStorage.getItem(OPENING_SEEN_KEY) !== 'seen'; }
  catch { return true; }
}

export function useOpeningCinematic() {
  const [open, setOpen] = useState(shouldPlayOpening);
  const [playId, setPlayId] = useState(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const finish = useCallback((reason: 'finished' | 'skipped' | 'unavailable') => {
    setOpen(false);
    if (reason !== 'unavailable') {
      try {
        if (gameStorage.getItem(OPENING_SEEN_KEY) !== 'seen') {
          gameStorage.setItem(OPENING_SEEN_KEY, 'seen'); void flushGameStorage().catch(() => undefined);
        }
      }
      catch { /* Presentation preferences never block investigation or change its records. */ }
    }
  }, []);
  const replay = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPlayId(id => id + 1); setOpen(true);
  }, []);
  return { open, playId, returnFocusRef, finish, replay };
}
