import type { CheckRequest, DiceResult } from '../types/game';

// The delivered sequence contains 30 frames at 12 fps. The deadline stays
// independent of asset loading so a failed download cannot block play.
export const DICE_ROLL_DURATION_MS = 2_500;

export interface DiceRollPresentation {
  check: CheckRequest;
  result: DiceResult;
  phase: 'rolling' | 'revealed';
  revealAt?: number;
}
