import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiceRollOverlay } from '../../src/components/game/DiceRollOverlay';
import type { DiceRollPresentation } from '../../src/app/diceRollAnimation';

const rolling: DiceRollPresentation = {
  check: {
    player: '亨利·格雷',
    skill: '侦查',
    difficulty: '普通',
    skillVal: 75,
    threshold: 75
  },
  result: { roll: 42, level: 'success', label: '普通成功（42）' },
  phase: 'rolling'
};

describe('DiceRollOverlay', () => {
  it('keeps the authoritative result hidden while rolling and reveals it with check context', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<DiceRollOverlay onConfirm={onConfirm} roll={rolling} />);

    const dialog = screen.getByRole('dialog', { name: '命运检定' });
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(dialog).toHaveClass('rolling');
    expect(screen.getByText('亨利·格雷 · 侦查')).toBeInTheDocument();
    expect(screen.getByText('目标值 75')).toBeInTheDocument();
    expect(dialog.querySelector('.dice-roll-total')).toBeNull();
    expect(screen.queryByRole('button', { name: '确认结果' })).toBeNull();

    rerender(<DiceRollOverlay onConfirm={onConfirm} roll={{ ...rolling, phase: 'revealed' }} />);

    expect(dialog).toHaveAttribute('aria-busy', 'false');
    expect(dialog).toHaveClass('revealed', 'result-success');
    expect(screen.getByText('42')).toHaveClass('dice-roll-total');
    expect(screen.getByRole('heading', { name: '普通成功' })).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: '确认结果' });
    expect(confirmButton).toHaveFocus();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses the fumble presentation for an authoritative 100', () => {
    render(<DiceRollOverlay roll={{
      ...rolling,
      result: { roll: 100, level: 'fumble', label: '大失败（100）' },
      phase: 'revealed'
    }} onConfirm={() => undefined} />);

    expect(screen.getByRole('dialog', { name: '命运检定' })).toHaveClass('result-fumble');
    expect(screen.getByText('100')).toHaveClass('dice-roll-total');
    expect(screen.getByRole('heading', { name: '大失败' })).toBeInTheDocument();
  });

  it.each<[number, string, string]>([
    [1, '00', '1'], [10, '10', '0'], [99, '90', '9'], [100, '00', '0']
  ])('keeps percentile faces consistent with the locked total %i', (value, tens, ones) => {
    const { container } = render(<DiceRollOverlay roll={{
      ...rolling, phase: 'revealed', result: { ...rolling.result, roll: value }
    }} onConfirm={vi.fn()} />);
    expect(container.querySelector('.dice-face.tens-die')).toHaveTextContent(String(tens));
    expect(container.querySelector('.dice-face.ones-die')).toHaveTextContent(String(ones));
    expect(container.querySelector('.dice-roll-total')).toHaveTextContent(String(value));
  });

  it('contains keyboard focus, ignores premature confirmation and restores the opener', () => {
    const onConfirm = vi.fn();
    function View({ roll }: { roll: DiceRollPresentation | null }) {
      return <><button>外部操作</button><DiceRollOverlay roll={roll} onConfirm={onConfirm} /></>;
    }
    const { rerender } = render(<View roll={null} />);
    const opener = screen.getByRole('button', { name: '外部操作' });
    opener.focus();
    rerender(<View roll={rolling} />);
    const dialog = screen.getByRole('dialog', { name: '命运检定' });
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<View roll={{ ...rolling, phase: 'revealed' }} />);
    const confirm = screen.getByRole('button', { name: '确认结果' });
    fireEvent.keyDown(confirm, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(onConfirm).toHaveBeenCalledOnce();
    rerender(<View roll={null} />);
    expect(opener).toHaveFocus();
  });

  it('shows the current check index in a multiplayer queue', () => {
    render(<DiceRollOverlay roll={{ ...rolling, check: { ...rolling.check, batchIndex: 2, batchTotal: 4 } }} onConfirm={vi.fn()} />);
    expect(screen.getByText('第 2/4 项')).toBeInTheDocument();
  });
});
