import type { CheckRequest, DiceResult } from '../types/game';

export const DICE_ROLL_DURATION_MS = 1_250;
export const DICE_RESULT_HOLD_MS = 1_050;

export interface DiceRollPresentation {
  check: CheckRequest;
  result: DiceResult;
  phase: 'rolling' | 'revealed';
}
