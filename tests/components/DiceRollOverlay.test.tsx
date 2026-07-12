import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DiceRollOverlay } from '../../src/components/game/DiceRollOverlay';
import type { DiceRollPresentation } from '../../src/app/useGameController';

const rolling: DiceRollPresentation = {
  check: {
    player: '艾达·华莱士',
    skill: '侦查',
    difficulty: '普通',
    skillVal: 60,
    threshold: 60
  },
  phase: 'rolling',
  result: { roll: 46, level: 'success', label: '普通成功（46）' }
};

describe('DiceRollOverlay', () => {
  it('shows check context while the percentile dice are rolling', () => {
    render(<DiceRollOverlay roll={rolling} />);

    expect(screen.getByRole('status')).toHaveClass('rolling');
    expect(screen.getByText('艾达·华莱士')).toBeInTheDocument();
    expect(screen.getByText('侦查 · 普通难度 · 阈值 60')).toBeInTheDocument();
    expect(screen.getByText('骰声掠过桌面，命运正在落定')).toBeInTheDocument();
    expect(screen.queryByText('普通成功（46）')).not.toBeInTheDocument();
  });

  it('reveals the locked roll and outcome after the animation', () => {
    render(<DiceRollOverlay roll={{ ...rolling, phase: 'revealed' }} />);

    expect(screen.getByRole('status')).toHaveClass('revealed');
    expect(screen.getByText('46')).toBeInTheDocument();
    expect(screen.getByText('普通成功（46）')).toBeInTheDocument();
  });
});
