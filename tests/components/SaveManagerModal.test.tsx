import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SaveManagerModal } from '../../src/components/game/SaveManagerModal';
import type { IncompatibleSaveSlot, SaveSlot } from '../../src/types/game';
import { makeState } from '../dm/fixtures';

function save(id: number): SaveSlot {
  return { id, scene: '摩勒住宅', savedAt: `2026/10/8 12:00:0${id}`, players: '亨利', gameState: makeState() };
}
const blocked: IncompatibleSaveSlot = { id: 3, scene: '旧存档场景', savedAt: '2026/9/1', players: '艾达', reason: 'SECRET_HASH moduleId invalid internal diagnostic' };

describe('SaveManagerModal', () => {
  it('preserves a slot on cancel, restores focus and only loads the explicitly selected save', () => {
    const onDelete = vi.fn().mockResolvedValue(true), onLoad = vi.fn(), saves = [save(2), save(1)];
    render(<SaveManagerModal open saves={saves} incompatibleSaves={[]} onClose={vi.fn()} onDelete={onDelete} onLoad={onLoad} />);
    const rows = screen.getAllByRole('article');
    expect(screen.getByRole('button', { name: '关闭存档管理' })).toHaveFocus();
    expect(screen.getAllByText('最近保存')).toHaveLength(1);
    const deleteButton = within(rows[1]).getByRole('button', { name: /^删除存档/ });
    fireEvent.click(deleteButton);
    const keep = within(rows[1]).getByRole('button', { name: '保留存档' });
    expect(keep).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(keep);
    expect(within(rows[1]).getByRole('button', { name: /^删除存档/ })).toHaveFocus();
    fireEvent.click(within(rows[1]).getByRole('button', { name: '载入存档' }));
    expect(onLoad).toHaveBeenCalledExactlyOnceWith(saves[1]);
  });

  it('guards duplicate deletion, loading and exits until persistence finishes, then focuses the remaining slot', async () => {
    let resolve!: (value: boolean) => void;
    const onDelete = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const onClose = vi.fn(), onLoad = vi.fn();
    function Harness() {
      const [saves, setSaves] = useState([save(2), save(1)]);
      return <SaveManagerModal open saves={saves} incompatibleSaves={[]} onClose={onClose} onLoad={onLoad} onDelete={async (id) => {
        const result = await onDelete();
        if (result) setSaves((current) => current.filter((slot) => slot.id !== id));
        return result;
      }} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: /^删除存档/ })[0]);
    const confirm = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(confirm); fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name: '载入存档' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭存档管理' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.save-manager-backdrop')!);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onLoad).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('正在删除');
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true);
    await act(async () => resolve(true));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '载入存档' })).toHaveFocus();
  });

  it('keeps deletion failure private and allows another attempt, including incompatible saves', async () => {
    const onDelete = vi.fn().mockRejectedValueOnce(new Error('INTERNAL_DISK_ERROR')).mockResolvedValueOnce(false);
    render(<SaveManagerModal open saves={[]} incompatibleSaves={[blocked]} onClose={vi.fn()} onLoad={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByText('版本不兼容')).toBeInTheDocument();
    expect(screen.queryByText(/SECRET_HASH|moduleId/)).toBeNull();
    expect(screen.queryByRole('button', { name: '载入存档' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^删除存档/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认删除' })));
    expect(screen.getByRole('alert')).toHaveTextContent('未能删除，存档已保留');
    expect(screen.queryByText(/INTERNAL_DISK_ERROR/)).toBeNull();
    expect(screen.getByRole('button', { name: '保留存档' })).toHaveFocus();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认删除' })));
    expect(onDelete.mock.calls.map((call) => call[0])).toEqual([3, 3]);
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('focuses Close after the last deletion and resets confirmation when reopened', async () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const onClose = vi.fn(), onDelete = vi.fn().mockResolvedValue(true);
    const props = { incompatibleSaves: [], onClose, onDelete, onLoad: vi.fn() };
    const { rerender, unmount } = render(<SaveManagerModal {...props} open saves={[save(1)]} />);
    fireEvent.click(screen.getByRole('button', { name: /^删除存档/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '确认删除' })));
    rerender(<SaveManagerModal {...props} open saves={[]} />);
    expect(screen.getByRole('button', { name: '关闭', exact: true })).toHaveFocus();
    rerender(<SaveManagerModal {...props} open saves={[save(2)]} />);
    fireEvent.click(screen.getByRole('button', { name: /^删除存档/ }));
    rerender(<SaveManagerModal {...props} open={false} saves={[save(2)]} />);
    expect(opener).toHaveFocus();
    rerender(<SaveManagerModal {...props} open saves={[save(2)]} />);
    expect(screen.queryByRole('button', { name: '确认删除' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    unmount(); opener.remove();
  });
});
