import type { CSSProperties } from 'react';

export const THINKING_TEXT = 'AI DM 正在推演下一幕';

export function ThinkingIndicator() {
  return (
    <div
      aria-busy="true"
      aria-label={THINKING_TEXT}
      aria-live="polite"
      className="thinking-line"
      role="status"
    >
      <div className="thinking-line-text" aria-hidden="true">
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
