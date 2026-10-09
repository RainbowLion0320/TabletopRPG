import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import type { IncompatibleSaveSlot, SaveSlot } from '../../types/game';
import { useDialogFocus } from '../shared/useDialogFocus';
import { ArchiveEmptyArt } from '../shared/ArchiveEmptyArt';
import { JournalArt } from '../shared/JournalArt';
import './save-manager.css';

interface SaveManagerModalProps {
  open: boolean;
  saves: SaveSlot[];
  incompatibleSaves: IncompatibleSaveSlot[];
  onClose: () => void;
  onDelete: (id: number) => Promise<boolean>;
  onLoad: (save: SaveSlot) => void;
}

export function SaveManagerModal({ incompatibleSaves = [], onClose, onDelete, onLoad, open, saves }: SaveManagerModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deletingRef = useRef(false);
  const focusAfterChange = useRef<{ id: number; index: number; removed: boolean } | null>(null);
  const [confirmationId, setConfirmationId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function close() { if (!deletingRef.current) onClose(); }
  function focusInList(target: HTMLButtonElement | null | undefined) {
    if (!target) return;
    target.focus({ preventScroll: true });
    const list = dialogRef.current?.querySelector<HTMLElement>('.save-list');
    if (!list?.contains(target)) return;
    const control = target.getBoundingClientRect(), body = list.getBoundingClientRect();
    if (control.bottom > body.bottom) list.scrollTop += control.bottom - body.bottom + 8;
    else if (control.top < body.top) list.scrollTop += control.top - body.top - 8;
  }
  useDialogFocus(open, dialogRef, close, undefined, {
    getFallbackFocus: () => document.querySelector<HTMLButtonElement>('.dock-actor-avatar, .ending-actions button')
  });
  useEffect(() => {
    if (!open) {
      setConfirmationId(null);
      setError(null);
      focusAfterChange.current = null;
    }
  }, [open]);
  useLayoutEffect(() => {
    if (!open || deletingId !== null) return;
    const restore = focusAfterChange.current;
    if (restore) {
      const rows = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('.save-slot-card') ?? []);
      const originalRow = rows.find((row) => row.dataset.saveId === String(restore.id));
      if (restore.removed && originalRow) {
        closeRef.current?.focus({ preventScroll: true });
        return;
      }
      const nextRow = rows[Math.min(restore.index, rows.length - 1)];
      const target = originalRow?.querySelector<HTMLButtonElement>('[data-action="delete"]')
        ?? nextRow?.querySelector<HTMLButtonElement>('[data-action="load"]')
        ?? nextRow?.querySelector<HTMLButtonElement>('[data-action="delete"]')
        ?? closeRef.current;
      focusInList(target);
      focusAfterChange.current = null;
    } else if (confirmationId !== null) focusInList(cancelRef.current);
  }, [open, confirmationId, deletingId, saves, incompatibleSaves]);

  function askToDelete(slotId: number) {
    if (deletingRef.current) return;
    setError(null);
    setConfirmationId(slotId);
  }
  function cancelDeletion(slotId: number, index: number) {
    focusAfterChange.current = { id: slotId, index, removed: false };
    setConfirmationId(null);
    setError(null);
  }
  async function confirmDeletion(slotId: number, index: number) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeletingId(slotId);
    setError(null);
    try {
      if (!await onDelete(slotId)) throw new Error('delete failed');
      focusAfterChange.current = { id: slotId, index, removed: true };
      setConfirmationId(null);
    } catch {
      setError('未能删除，存档已保留。请稍后重试。');
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  }

  if (!open) return null;
  const busy = deletingId !== null;
  const slots = [...saves, ...incompatibleSaves];

  return createPortal(
    <div className="save-manager-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} tabIndex={-1} aria-modal="true" aria-labelledby={`${id}-title`} className="save-manager-card" role="dialog">
        <header className="save-manager-heading">
          <div><h2 id={`${id}-title`}><JournalArt size={24} />读取存档</h2><p>{slots.length ? `${slots.length} 份本地调查记录` : '保存调查后，可在这里选择记录继续。'}</p></div>
          <button type="button" className="ghost-btn save-manager-close" aria-label="关闭存档列表" disabled={busy} onClick={close}><X size={18} aria-hidden="true" /></button>
        </header>

        {slots.length ? <div className="save-list" aria-label="本地存档" aria-busy={busy}>
          {slots.map((slot, index) => {
            const save = 'gameState' in slot ? slot : null;
            const confirming = confirmationId === slot.id;
            const messageId = `${id}-delete-${slot.id}`;
            return <article className={`save-slot-card${save ? '' : ' save-slot-incompatible'}`} key={`${save ? 'valid' : 'incompatible'}-${slot.id}`} data-save-id={slot.id} aria-label={`${slot.scene}，${slot.savedAt}`}>
              <div className="save-slot-heading"><h3>{slot.scene}</h3>{save === saves[0] && <span className="save-slot-tag">最近保存</span>}{!save && <span className="save-slot-tag unavailable">版本不兼容</span>}</div>
              <time className="save-slot-time">{slot.savedAt}</time>
              <div className="save-slot-party">
                {save && <div className="save-party-portraits" aria-hidden="true">{save.gameState.players.map((player) => <span key={player.id}><b>{player.name.slice(0, 1)}</b>{player.portrait && <img src={player.portrait} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>)}</div>}
                <span>{slot.players}</span>
              </div>
              {!save && <p className="save-slot-note">当前剧情版本暂时无法载入，记录仍保留在本机。</p>}
              {confirming ? <div className="save-delete-confirmation">
                <p id={messageId} role={error ? 'alert' : 'status'}>{error ?? (busy ? '正在删除…' : '删除这份存档？删除后无法恢复。')}</p>
                <div className="save-slot-actions">
                  <button type="button" ref={cancelRef} className="ghost-btn" disabled={busy} onClick={() => cancelDeletion(slot.id, index)}>保留存档</button>
                  <button type="button" className="ghost-btn danger" aria-describedby={messageId} disabled={busy} onClick={() => { void confirmDeletion(slot.id, index); }}>确认删除</button>
                </div>
              </div> : <div className="save-slot-actions">
                <button type="button" className="ghost-btn danger save-slot-delete" data-action="delete" aria-label={`删除存档：${slot.scene}，${slot.savedAt}`} disabled={busy} onClick={() => askToDelete(slot.id)}><Trash2 size={16} aria-hidden="true" />删除</button>
                {save && <button type="button" className="primary-btn save-slot-load" data-action="load" disabled={busy} onClick={() => { if (!deletingRef.current) onLoad(save); }}>载入存档</button>}
              </div>}
            </article>;
          })}
        </div> : <div className="save-manager-empty"><ArchiveEmptyArt /><p>暂无存档</p></div>}

        <footer><button ref={closeRef} type="button" className="ghost-btn" disabled={busy} onClick={close}>关闭</button></footer>
      </div>
    </div>, document.body
  );
}
