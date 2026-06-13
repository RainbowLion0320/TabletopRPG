import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THINKING_TEXT, ThinkingOverlay } from '../../src/components/game/ThinkingOverlay';

describe('ThinkingOverlay', () => {
  it('announces the AI DM thinking state and renders animated characters', () => {
    render(<ThinkingOverlay />);

    const overlay = screen.getByRole('status', { name: THINKING_TEXT });
    expect(overlay).toHaveAttribute('aria-busy', 'true');
    expect(overlay).toHaveClass('thinking-overlay');

    const animatedCharacters = overlay.querySelectorAll('.thinking-overlay-text span');
    expect(animatedCharacters).toHaveLength(Array.from(THINKING_TEXT).length);
    expect(animatedCharacters[0]).toHaveStyle({ '--delay': '0s' });
  });
});
