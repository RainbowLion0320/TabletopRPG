import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '../../src/components/game/TopBar';
import { makeState } from '../dm/fixtures';

describe('TopBar', () => {
  it('shows the current chapter as the main title and keeps the scene as context', () => {
    render(<TopBar state={makeState({ currentScene: 'S01' })} onToggleMenu={vi.fn()} />);

    expect(screen.getByText('第一幕：接受委托')).toHaveClass('brand-title');
    expect(screen.getByText('摩勒住宅')).toHaveClass('brand-scene');
    expect(screen.queryByText('雾中消逝')).toBeNull();
  });

  it('updates the chapter title for investigation-route scenes', () => {
    render(<TopBar state={makeState({ currentScene: 'S04' })} onToggleMenu={vi.fn()} />);

    expect(screen.getByText('第二幕：街区调查')).toHaveClass('brand-title');
    expect(screen.getByText('卡森其药店')).toHaveClass('brand-scene');
  });
});
