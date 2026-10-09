import { useEffect, useRef, type RefObject } from 'react';

interface DialogEntry { element: HTMLElement; trapFocus: boolean }
const dialogs: DialogEntry[] = [];
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

/** Keep keyboard actions in the topmost dialog and restore its opener on close. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement>, onClose: () => void, returnFocusRef?: RefObject<HTMLElement>, options?: { trapFocus?: boolean; getFallbackFocus?: () => HTMLElement | null }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const fallbackRef = useRef(options?.getFallbackFocus);
  fallbackRef.current = options?.getFallbackFocus;
  const trapFocus = options?.trapFocus ?? true;
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const dialog = element;
    const previous = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const entry = { element: dialog, trapFocus };
    // Child effects may register first when a nested dialog mounts with its parent.
    const descendant = dialogs.findIndex((item) => dialog.contains(item.element));
    if (descendant < 0) dialogs.push(entry);
    else dialogs.splice(descendant, 0, entry);
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.tabIndex >= 0 && !element.hidden && !element.closest('[inert], [aria-hidden="true"]'))
      .filter((element) => {
        const collapsed = element.closest('details:not([open])');
        return !collapsed || collapsed.querySelector('summary') === element;
      })
      .sort((left, right) => left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    if (dialogs[dialogs.length - 1] === entry) {
      (dialog.querySelector<HTMLElement>('[aria-label^="关闭"]') ?? controls()[0] ?? dialog).focus({ preventScroll: true });
    }
    function handleKeyDown(event: KeyboardEvent) {
      // Escape and Tab can cancel or choose IME candidates without leaving the dialog.
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        if (dialogs[dialogs.length - 1] !== entry) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
        // A desktop side panel owns Escape; Tab still belongs to its enclosing modal.
        if ([...dialogs].reverse().find((item) => item.trapFocus) !== entry) return;
        const elements = controls();
        const first = elements[0] ?? dialog;
        const last = elements[elements.length - 1] ?? dialog;
        if (!dialog.contains(document.activeElement) || document.activeElement === dialog
          || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const wasTopmost = dialogs[dialogs.length - 1] === entry;
      const index = dialogs.indexOf(entry);
      if (index >= 0) dialogs.splice(index, 1);
      const target = returnFocusRef?.current ?? previous;
      const active = document.activeElement;
      const restore = active === document.body || dialog.contains(active);
      if (!wasTopmost || !restore) return;
      const focus = (candidate: HTMLElement | null | undefined) => {
        if (candidate?.isConnected && !candidate.closest('[inert], [aria-hidden="true"]')) candidate.focus({ preventScroll: true });
      };
      focus(target);
      // Responsive layouts can hide the original opener while the dialog is open.
      if (document.activeElement === document.body || dialog.contains(document.activeElement)) focus(fallbackRef.current?.());
    };
  }, [open, ref, returnFocusRef, trapFocus]);
}
