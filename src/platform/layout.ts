import { useSyncExternalStore } from 'react';

const phoneQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 700px)') : null;
const isPhone = () => phoneQuery?.matches ?? false;
const subscribe = (notify: () => void) => {
  phoneQuery?.addEventListener('change', notify);
  return () => phoneQuery?.removeEventListener('change', notify);
};

/** The same phone layout is used by the APK and a narrow web viewport. */
export function initializeGameUi(native = false) {
  document.documentElement.classList.add('fog-ui');
  const sync = () => document.documentElement.classList.toggle('portrait-ui', native || isPhone());
  sync();
  phoneQuery?.addEventListener('change', sync);
  return () => phoneQuery?.removeEventListener('change', sync);
}

export function usePortraitLayout() {
  return useSyncExternalStore(subscribe, isPhone, () => false);
}
