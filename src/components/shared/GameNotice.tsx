import { useRef } from 'react';
import { useOverlayPresence } from './useOverlayPresence';
import { useOverlayEntry } from './useOverlayEntry';
import './game-notice.css';

export function GameNotice({ message }: { message: string }) {
  const motion = useOverlayPresence(message);
  const visualRef = useRef<HTMLDivElement>(null);
  useOverlayEntry(motion.present, visualRef);
  return (
    <div className="game-notice" role="status" aria-live="polite" aria-atomic="true">
      {motion.present && <div ref={visualRef} className="toast" {...motion.layerProps}>{motion.value}</div>}
    </div>
  );
}
