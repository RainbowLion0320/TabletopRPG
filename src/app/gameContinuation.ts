import type { GameState } from '../types/game';
import type { DiceRollPresentation } from './diceRollAnimation';
import { storyData } from '../data/storyData';
import { getScenarioProgressForState } from '../scenario/engine';

export interface GameContinuation {
  state: GameState;
  roll: DiceRollPresentation | null;
}

/** Suspend the live investigation without dropping a draft, pending turn or locked die. */
export function captureGameContinuation(state: GameState, roll: DiceRollPresentation | null): GameContinuation {
  return { state: { ...state, isThinking: false }, roll };
}

export function continuationPreview(state: GameState, label = '当前调查') {
  return {
    label,
    scene: storyData.scenes[state.currentScene]?.name ?? '当前场景',
    players: state.players.map((player) => player.name).join('、'),
    detail: getScenarioProgressForState(state).worldTime.replace('T', ' ')
  };
}
