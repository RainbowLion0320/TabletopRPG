import type { CheckRequest, DiceResult } from '../types/game';

export const DICE_ROLL_DURATION_MS = 2_200;

export interface DiceRollPresentation {
  check: CheckRequest;
  result: DiceResult;
  phase: 'rolling' | 'revealed';
  revealAt?: number;
}
