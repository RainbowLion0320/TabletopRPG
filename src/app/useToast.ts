import { useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);

  function notify(text: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(''), 1800);
  }

  return { notify, toast };
}

