import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';

export const THINKING_TEXT = 'AI DM 正在推演下一幕';

export function ThinkingOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlayRef.current?.focus({ preventScroll: true });
  }, []);

  function blockKeyboardInput(event: KeyboardEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      aria-busy="true"
      aria-label={THINKING_TEXT}
      aria-live="polite"
      className="thinking-overlay"
      onKeyDown={blockKeyboardInput}
      ref={overlayRef}
      role="status"
      tabIndex={-1}
    >
      <div className="thinking-overlay-text" aria-hidden="true">
        {Array.from(THINKING_TEXT).map((char, index) => (
          <span
            key={`${char}-${index}`}
            style={{ '--delay': `${index * 0.055}s` } as CSSProperties}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </div>
    </div>
  );
}
