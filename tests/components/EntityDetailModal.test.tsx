import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityDetailModal } from '../../src/components/game/EntityDetailModal';

describe('EntityDetailModal', () => {
  it('exposes dialog semantics, closes with Escape and restores focus', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { rerender } = render(<EntityDetailModal detail={{
      name: '水里的东西',
      role: '本轮线索标记',
      baseInfo: '水里的东西正在靠近。',
      knownSecrets: [],
      unknownCount: 0
    }} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<EntityDetailModal detail={null} onClose={onClose} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
