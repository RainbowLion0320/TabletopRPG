import { LogOut } from 'lucide-react';
import { useId, useRef } from 'react';
import { useDialogFocus } from '../components/shared/useDialogFocus';

export function ExitGameDialog({ open, busy, error, onClose, onExit }: {
  open: boolean; busy: boolean; error: string; onClose: () => void; onExit: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const id = useId();
  useDialogFocus(open, dialog, onClose);
  if (!open) return null;
  return <div className="android-exit-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="android-exit-card" role="dialog" aria-modal="true" aria-busy={busy}
      aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
      <header><LogOut size={20} aria-hidden="true" /><h2 id={`${id}-title`}>退出游戏？</h2></header>
      <div className="android-exit-body">
        <p id={`${id}-description`}>下次打开可从首页继续游戏。</p>
        {(busy || error) && <p className="android-exit-status" role={error ? 'alert' : 'status'}>{error || '正在保存并退出…'}</p>}
      </div>
      <footer><button type="button" className="secondary-action" disabled={busy} onClick={onClose}>留在游戏</button>
        <button type="button" className="primary-btn" disabled={busy} onClick={onExit}>退出游戏</button></footer>
    </div>
  </div>;
}
