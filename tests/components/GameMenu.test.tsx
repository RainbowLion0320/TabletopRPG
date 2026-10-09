import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameMenu } from '../../src/components/game/GameMenu';
import { DmDebugDrawer } from '../../src/components/game/DmDebugDrawer';
import { useState } from 'react';

afterEach(() => vi.unstubAllEnvs());

describe('player menu and developer notes', () => {
  it('keeps KP knowledge out of the player menu even in a development preview', () => {
    render(<GameMenu open onClose={vi.fn()} onHome={vi.fn()} onLoad={vi.fn()} onOpenApi={vi.fn()} onRestart={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'AI 设置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'KP 笔记' })).not.toBeInTheDocument();
  });

  it('contains keyboard focus, closes without acting, and returns to its opener', () => {
    const onSave = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>菜单</button><GameMenu open={open} onClose={() => setOpen(false)}
        onHome={vi.fn()} onLoad={vi.fn()} onOpenApi={vi.fn()} onRestart={vi.fn()} onSave={onSave} /></>;
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '菜单', exact: true });
    opener.focus(); fireEvent.click(opener);
    const close = screen.getByRole('button', { name: '关闭调查菜单' });
    expect(close).toHaveFocus();
    screen.getByRole('button', { name: '继续调查' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: '继续调查' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes only the nested sound sheet first and retains the menu below it', () => {
    const onClose = vi.fn();
    render(<GameMenu open onClose={onClose} onHome={vi.fn()} onLoad={vi.fn()} onOpenApi={vi.fn()} onRestart={vi.fn()} onSave={vi.fn()} />);
    const sound = screen.getByRole('button', { name: '声音设置' });
    sound.focus(); fireEvent.click(sound);
    expect(screen.getByRole('dialog', { name: '声音设置' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '声音设置' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '调查菜单' })).toBeInTheDocument();
    expect(sound).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(sound, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
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
