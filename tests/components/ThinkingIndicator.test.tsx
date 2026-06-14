import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { THINKING_TEXT, ThinkingIndicator } from '../../src/components/game/ThinkingIndicator';

describe('ThinkingIndicator', () => {
  it('announces the AI DM thinking state and renders animated inline characters', () => {
    render(<ThinkingIndicator />);

    const indicator = screen.getByRole('status', { name: THINKING_TEXT });
    expect(indicator).toHaveAttribute('aria-busy', 'true');
    expect(indicator).toHaveClass('thinking-line');

    const animatedCharacters = indicator.querySelectorAll('.thinking-line-text span');
    expect(animatedCharacters).toHaveLength(Array.from(THINKING_TEXT).length);
    expect(animatedCharacters[0]).toHaveStyle({ '--delay': '0s' });
  });
});
