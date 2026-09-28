import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameMenu } from '../../src/components/game/GameMenu';
import { DmDebugDrawer } from '../../src/components/game/DmDebugDrawer';

afterEach(() => vi.unstubAllEnvs());

describe('player menu and developer notes', () => {
  it('keeps KP knowledge out of the player menu even in a development preview', () => {
    render(<GameMenu open onHome={vi.fn()} onLoad={vi.fn()} onManageSaves={vi.fn()} onOpenApi={vi.fn()} onRestart={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'AI 设置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'KP 笔记' })).not.toBeInTheDocument();
  });

  it('retains notes behind developer diagnostics and excludes them from release builds', () => {
    vi.stubEnv('DEV', true);
    const onOpenJournal = vi.fn();
    const { rerender } = render(<DmDebugDrawer onOpenJournal={onOpenJournal} />);
    expect(screen.queryByText('KP 笔记')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'DM ⚙' }));
    fireEvent.click(screen.getByRole('button', { name: 'KP 笔记' }));
    expect(onOpenJournal).toHaveBeenCalledOnce();
    vi.stubEnv('DEV', false);
    rerender(<DmDebugDrawer onOpenJournal={onOpenJournal} />);
    expect(screen.queryByText('KP 笔记')).not.toBeInTheDocument();
    expect(screen.queryByText(/DM Debug/)).not.toBeInTheDocument();
  });
});
