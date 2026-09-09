import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AudioDirector } from '../../src/audio/AudioDirector';
import { gameAudio } from '../../src/audio/audio';
import type { DiceRollPresentation } from '../../src/app/diceRollAnimation';
import type { GameState } from '../../src/types/game';

vi.mock('../../src/audio/audio', () => ({ gameAudio: {
  unlock: vi.fn(), play: vi.fn(), setVisible: vi.fn(), setSoundscape: vi.fn(), setDiceRolling: vi.fn(), dispose: vi.fn(),
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const state = { currentScene: 'S01', scenarioProgress: { endingId: null } } as GameState;
const roll: DiceRollPresentation = {
  check: { playerId: 'p1', skill: '侦查' } as DiceRollPresentation['check'],
  result: { roll: 100, level: 'fumble', label: '大失败' }, phase: 'rolling',
};

it('plays exactly one result cue at reveal, never on subsequent renders or confirm', () => {
  const view = render(<AudioDirector screen="game" state={state} roll={roll} />);
  expect(gameAudio.setDiceRolling).toHaveBeenLastCalledWith(true);
  expect(gameAudio.play).not.toHaveBeenCalled();
  const revealed = { ...roll, phase: 'revealed' as const };
  view.rerender(<AudioDirector screen="game" state={state} roll={revealed} />);
  expect(gameAudio.setDiceRolling).toHaveBeenLastCalledWith(false);
  expect(gameAudio.play).toHaveBeenNthCalledWith(1, 'diceLand');
  expect(gameAudio.play).toHaveBeenNthCalledWith(2, 'failure');
  view.rerender(<AudioDirector screen="game" state={state} roll={{ ...revealed }} />);
  view.rerender(<AudioDirector screen="game" state={state} roll={null} />);
  expect(gameAudio.play).toHaveBeenCalledTimes(2);
});

it('does not replay an already-revealed result on mount or returning home', () => {
  const view = render(<AudioDirector screen="game" state={state} roll={{ ...roll, phase: 'revealed' }} />);
  view.rerender(<AudioDirector screen="title" state={state} roll={roll} />);
  expect(gameAudio.setDiceRolling).toHaveBeenLastCalledWith(false);
  expect(gameAudio.play).not.toHaveBeenCalled();
});
