import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THINKING_CHANGE_MS, THINKING_LINES, THINKING_TEXT, ThinkingIndicator } from '../../src/components/game/ThinkingIndicator';

afterEach(() => vi.useRealTimers());

describe('ThinkingIndicator', () => {
  it('announces the AI DM thinking state once and keeps its painted ornament decorative', () => {
    render(<ThinkingIndicator />);

    const indicator = screen.getByRole('status', { name: THINKING_TEXT });
    expect(indicator).toHaveAttribute('aria-busy', 'true');
    expect(indicator).toHaveClass('thinking-line');

    expect(THINKING_LINES).toContain(indicator.textContent!.replaceAll('\u00a0', ' '));
    expect(indicator.querySelector('.thinking-line-text')).toHaveAttribute('aria-hidden', 'true');
    expect(indicator.querySelector('img')).toHaveAttribute('alt', '');
    expect(indicator.querySelector('img')).toHaveAttribute('aria-hidden', 'true');
  });

  it('cycles without repetitions during a long wait, keeps one accessible announcement, and cancels its timer on completion', () => {
    vi.useFakeTimers();
    const { unmount } = render(<ThinkingIndicator />);
    const read = () => screen.getByRole('status', { name: THINKING_TEXT }).textContent!.replaceAll('\u00a0', ' ');
    const seen = new Set<string>([read()]);
    const diceRandom = vi.spyOn(Math, 'random');
    const first = read();
    act(() => vi.advanceTimersByTime(THINKING_CHANGE_MS - 1));
    expect(read()).toBe(first);
    act(() => vi.advanceTimersByTime(1)); seen.add(read());
    for (let index = 2; index < THINKING_LINES.length; index++) {
      act(() => vi.advanceTimersByTime(THINKING_CHANGE_MS)); seen.add(read());
    }
    expect(seen.size).toBe(THINKING_LINES.length);
    expect(diceRandom).not.toHaveBeenCalled(); diceRandom.mockRestore();
    expect(vi.getTimerCount()).toBe(1);
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
