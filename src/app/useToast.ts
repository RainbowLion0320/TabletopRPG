import { useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
  }, []);

  function clearToast() {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast('');
  }

  function notify(text: string) {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast('');
    }, text.length > 16 ? 4000 : 1800);
  }

  return { clearToast, notify, toast };
}

