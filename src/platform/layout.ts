import { useSyncExternalStore } from 'react';

const phoneQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 700px)') : null;
const boardListQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 900px)') : null;
const shortViewportQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-height: 500px)') : null;
let nativeUi = false;
const listeners = new Set<() => void>();
const isPhone = () => nativeUi || (phoneQuery?.matches ?? false);
const isBoardList = () => nativeUi || (boardListQuery?.matches ?? false);
const isShortViewport = () => shortViewportQuery?.matches ?? false;
const subscribeQuery = (query: MediaQueryList | null) => (notify: () => void) => {
  listeners.add(notify);
  query?.addEventListener('change', notify);
  return () => { listeners.delete(notify); query?.removeEventListener('change', notify); };
};
const subscribe = subscribeQuery(phoneQuery);
const subscribeBoard = subscribeQuery(boardListQuery);
const subscribeShortViewport = subscribeQuery(shortViewportQuery);

/** The same phone layout is used by the APK and a narrow web viewport. */
export function initializeGameUi(native = false) {
  nativeUi = native;
  document.documentElement.classList.add('fog-ui');
  const sync = () => document.documentElement.classList.toggle('portrait-ui', isPhone());
  sync();
  listeners.forEach((notify) => notify());
  phoneQuery?.addEventListener('change', sync);
  return () => {
    phoneQuery?.removeEventListener('change', sync);
    nativeUi = false;
    listeners.forEach((notify) => notify());
  };
}

export function usePortraitLayout() {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}

export function useCaseBoardListLayout() {
  return useSyncExternalStore(subscribeBoard, isBoardList, () => false);
}

export function useShortViewport() {
  return useSyncExternalStore(subscribeShortViewport, isShortViewport, () => false);
}
