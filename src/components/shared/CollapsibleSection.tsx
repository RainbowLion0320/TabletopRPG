import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { DisclosureMotion } from './DisclosureMotion';

interface CollapsibleSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  triggerClassName: string;
  label: ReactNode;
  children: ReactNode;
}

/** A native button keeps keyboard behavior while the body retains its closing visual. */
export function CollapsibleSection({ open, onOpenChange, className, triggerClassName, label, children }: CollapsibleSectionProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  const active = typeof document === 'undefined' ? null : document.activeElement;
  const closingFocus = !open && wasOpen.current && active !== triggerRef.current && rootRef.current?.contains(active) ? active : null;

  useLayoutEffect(() => {
    wasOpen.current = open;
    if (!closingFocus || triggerRef.current?.closest('[inert], [aria-hidden="true"]')) return;
    // Inert may already have blurred the old body control; never steal focus from another control.
    if (document.activeElement === closingFocus || document.activeElement === document.body) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open, closingFocus]);

  return <div ref={rootRef} className={className} data-expanded={open}>
    <button ref={triggerRef} type="button" className={`collapsible-section-trigger ${triggerClassName}`}
      aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)}>
      {label}
    </button>
    <DisclosureMotion open={open} id={id}>{children}</DisclosureMotion>
  </div>;
}
