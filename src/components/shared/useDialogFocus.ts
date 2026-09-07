import { useEffect, useRef, type RefObject } from 'react';

const dialogs: HTMLElement[] = [];
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard actions in the topmost dialog and restore its opener on close. */
export function useDialogFocus(open: boolean, ref: RefObject<HTMLElement>, onClose: () => void, returnFocusRef?: RefObject<HTMLElement>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = returnFocusRef?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogs.push(dialog);
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.tabIndex >= 0 && !element.hidden && !element.closest('[inert], [aria-hidden="true"]'))
      .sort((left, right) => left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    (dialog.querySelector<HTMLElement>('[aria-label^="关闭"]') ?? controls()[0] ?? dialog).focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === 'Tab') {
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
      const wasTopmost = dialogs[dialogs.length - 1] === dialog;
      const index = dialogs.lastIndexOf(dialog);
      if (index >= 0) dialogs.splice(index, 1);
      if (wasTopmost && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, ref, returnFocusRef]);
}
