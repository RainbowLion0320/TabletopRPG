import { useEffect, useId, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import type { IncompatibleSaveSlot, SaveSlot } from '../../types/game';
import { useDialogFocus } from '../shared/useDialogFocus';
import { useOverlayPresence } from '../shared/useOverlayPresence';
import { useOverlayEntry } from '../shared/useOverlayEntry';
import { DisclosureMotion } from '../shared/DisclosureMotion';
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
  const motion = useOverlayPresence(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayEntry(motion.present, dialogRef);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deletingRef = useRef(false);
  const focusAfterChange = useRef<{ id: number; index: number; removed: boolean } | null>(null);
  const rowPositions = useRef(new Map<string, { element: HTMLElement; top: number }>());
  const rowAnimations = useRef(new Map<HTMLElement, Animation>());
  const removalRequested = useRef<number | null>(null);
  const [confirmationId, setConfirmationId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  function close() { if (!deletingRef.current) onClose(); }
  function back() {
    if (deletingRef.current) return;
    if (confirmationId !== null) {
      const index = [...saves, ...incompatibleSaves].findIndex((slot) => slot.id === confirmationId);
      cancelDeletion(confirmationId, Math.max(0, index));
    } else onClose();
  }
  function rowMotionY(row: HTMLElement | null) {
    if (!row || !rowAnimations.current.has(row)) return 0;
    const transform = getComputedStyle(row).transform;
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
  }
  function cancelRowMotion() {
    rowAnimations.current.forEach(animation => animation.cancel());
    rowAnimations.current.clear();
  }
  function keepFocusedRowReachable(target: HTMLButtonElement) {
    const row = target.closest<HTMLElement>('.save-slot-card'), animation = row && rowAnimations.current.get(row);
    const list = row?.closest<HTMLElement>('.save-list');
    if (!row || !animation || !list) return;
    const control = target.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (control.top < bounds.top || control.bottom > bounds.bottom
      || !target.contains(document.elementFromPoint(control.x + control.width / 2, control.y + control.height / 2))) {
      animation.cancel(); rowAnimations.current.delete(row);
    }
  }
  function focusInList(target: HTMLButtonElement | null | undefined) {
    if (!target) return;
    target.focus({ preventScroll: true });
    const list = dialogRef.current?.querySelector<HTMLElement>('.save-list');
    if (!list?.contains(target)) return;
    const control = target.getBoundingClientRect(), body = list.getBoundingClientRect();
    const y = rowMotionY(target.closest<HTMLElement>('.save-slot-card')) * (target.offsetHeight ? control.height / target.offsetHeight : 1);
    if (control.bottom - y > body.bottom) list.scrollTop += control.bottom - y - body.bottom + 8;
    else if (control.top - y < body.top) list.scrollTop += control.top - y - body.top - 8;
    keepFocusedRowReachable(target);
  }
  function settleControls(event: TransitionEvent<HTMLDivElement>) {
    if (!open || deletingRef.current || event.propertyName !== 'grid-template-rows'
      || event.target !== event.currentTarget.firstElementChild) return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLButtonElement) || focused.disabled
      || !event.currentTarget.contains(focused) || focused.closest('[inert], [aria-hidden="true"]')) return;
    // The final prompt height can move a focused last-row control beyond a short list.
    focusInList(focused);
  }
  useDialogFocus(open, dialogRef, back, undefined, {
    getFallbackFocus: () => document.querySelector<HTMLButtonElement>('.dock-actor-avatar, .ending-actions button')
  });
  useEffect(() => {
    if (!motion.present) {
      setConfirmationId(null);
      setError(null);
      focusAfterChange.current = null;
    }
  }, [motion.present]);
  useLayoutEffect(() => {
    if (!open) return;
    setConfirmationId(null);
    setError(null);
    focusAfterChange.current = null;
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
  useLayoutEffect(() => {
    const list = dialogRef.current?.querySelector<HTMLElement>('.save-list');
    if (!open || !list) {
      cancelRowMotion(); rowPositions.current.clear(); removalRequested.current = null;
      return;
    }
    const rows = Array.from(list.querySelectorAll<HTMLElement>('.save-slot-card'));
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const cache = () => {
      rowPositions.current = new Map(rows.map(element => [element.dataset.saveId!, { element, top: element.offsetTop }]));
    };
    const removed = removalRequested.current !== null
      && rowPositions.current.has(String(removalRequested.current))
      && !rows.some(row => row.dataset.saveId === String(removalRequested.current));
    for (const [row, animation] of rowAnimations.current) {
      if (!row.isConnected) { animation.cancel(); rowAnimations.current.delete(row); }
    }
    if (removed) {
      removalRequested.current = null;
      if (document.hidden || !preference || preference.matches) cancelRowMotion();
      else for (const row of rows) {
        const before = rowPositions.current.get(row.dataset.saveId!);
        if (!before || before.element !== row || !row.animate || Math.abs(before.top - row.offsetTop) < 1) continue;
        const from = before.top + rowMotionY(row) - row.offsetTop;
        rowAnimations.current.get(row)?.cancel();
        const animation = row.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], {
          duration: 170, easing: 'cubic-bezier(.2,.7,.2,1)'
        });
        rowAnimations.current.set(row, animation);
        const release = () => { if (rowAnimations.current.get(row) === animation) rowAnimations.current.delete(row); };
        void animation.finished.then(release, release);
      }
      // Keep the immediately restored button touchable, even if its former row was below the clip.
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && list.contains(focused)) keepFocusedRowReachable(focused);
    }
    cache();
    // Natural confirmation/image sizes update only layout baselines; scrolling never starts reflow.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(cache);
    rows.forEach(row => observer?.observe(row));
    const stop = () => {
      if (document.hidden || !preference || preference.matches) { cancelRowMotion(); cache(); removalRequested.current = null; }
    };
    document.addEventListener('visibilitychange', stop); preference?.addEventListener('change', stop);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', stop); preference?.removeEventListener('change', stop); };
  }, [open, saves, incompatibleSaves]);
  useEffect(() => () => { cancelRowMotion(); rowPositions.current.clear(); removalRequested.current = null; }, []);

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
    removalRequested.current = slotId;
    setDeletingId(slotId);
    setError(null);
    try {
      if (!await onDelete(slotId)) throw new Error('delete failed');
      focusAfterChange.current = { id: slotId, index, removed: true };
      setConfirmationId(null);
    } catch {
      removalRequested.current = null;
      setError('未能删除，存档已保留。请稍后重试。');
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  }

  if (!motion.present) return null;
  const busy = deletingId !== null;
  const slots = [...saves, ...incompatibleSaves];

  return createPortal(
    <div {...motion.layerProps} className="save-manager-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} tabIndex={-1} aria-modal={open || undefined} aria-labelledby={`${id}-title`} className="save-manager-card" role={open ? 'dialog' : undefined}>
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
              <div className="save-slot-controls" onTransitionEnd={settleControls}>
                <DisclosureMotion open={confirming}>
                  <div className="save-delete-confirmation">
                    <p id={messageId} role={confirming ? (error ? 'alert' : 'status') : undefined}>{error ?? (busy ? '正在删除…' : '删除这份存档？删除后无法恢复。')}</p>
                  </div>
                </DisclosureMotion>
                <div className={`save-slot-actions${confirming ? ' confirming' : ''}`}>
                  {confirming ? <>
                    <button type="button" ref={cancelRef} className="ghost-btn" disabled={busy} onClick={() => cancelDeletion(slot.id, index)}>保留存档</button>
                    <button type="button" className="ghost-btn danger" aria-describedby={messageId} disabled={busy} onClick={() => { void confirmDeletion(slot.id, index); }}>确认删除</button>
                  </> : <>
                    <button type="button" className="ghost-btn danger save-slot-delete" data-action="delete" aria-label={`删除存档：${slot.scene}，${slot.savedAt}`} disabled={busy} onClick={() => askToDelete(slot.id)}><Trash2 size={16} aria-hidden="true" />删除</button>
                    {save && <button type="button" className="primary-btn save-slot-load" data-action="load" disabled={busy} onClick={() => { if (!deletingRef.current) onLoad(save); }}>载入存档</button>}
                  </>}
                </div>
              </div>
            </article>;
          })}
        </div> : <div className="save-manager-empty"><ArchiveEmptyArt /><p>暂无存档</p></div>}

        <footer><button ref={closeRef} type="button" className="ghost-btn" disabled={busy} onClick={close}>关闭</button></footer>
      </div>
    </div>, document.body
  );
}
