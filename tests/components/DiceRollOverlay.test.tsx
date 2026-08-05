import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    const { rerender } = render(<DiceRollOverlay roll={rolling} />);

    const dialog = screen.getByRole('dialog', { name: '命运检定' });
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(dialog).toHaveClass('rolling');
    expect(screen.getByText('亨利·格雷 · 侦查')).toBeInTheDocument();
    expect(screen.getByText('目标值 75')).toBeInTheDocument();
    expect(dialog.querySelector('.dice-roll-total')).toBeNull();

    rerender(<DiceRollOverlay roll={{ ...rolling, phase: 'revealed' }} />);

    expect(dialog).toHaveAttribute('aria-busy', 'false');
    expect(dialog).toHaveClass('revealed', 'result-success');
    expect(screen.getByText('42')).toHaveClass('dice-roll-total');
    expect(screen.getByRole('heading', { name: '普通成功' })).toBeInTheDocument();
  });

  it('uses the fumble presentation for an authoritative 100', () => {
    render(<DiceRollOverlay roll={{
      ...rolling,
      result: { roll: 100, level: 'fumble', label: '大失败（100）' },
      phase: 'revealed'
    }} />);

    expect(screen.getByRole('dialog', { name: '命运检定' })).toHaveClass('result-fumble');
    expect(screen.getByText('100')).toHaveClass('dice-roll-total');
    expect(screen.getByRole('heading', { name: '大失败' })).toBeInTheDocument();
  });
});
