import type { GameState } from '../types/game';
import type { DiceRollPresentation } from './diceRollAnimation';
import { storyData } from '../data/storyData';
import { getScenarioDefinition, getScenarioProgressForState } from '../scenario/engine';

export interface GameContinuation {
  state: GameState;
  roll: DiceRollPresentation | null;
}

/** Suspend the live investigation without dropping a draft, pending turn or locked die. */
export function captureGameContinuation(state: GameState, roll: DiceRollPresentation | null): GameContinuation {
  return { state: { ...state, isThinking: false }, roll };
}

export function continuationPreview(state: GameState, label = '当前调查') {
  const progress = getScenarioProgressForState(state);
  const ending = getScenarioDefinition().progression.endings.find((item) => item.id === progress.endingId);
  return {
    label: ending ? '已结案' : label,
    scene: ending?.title ?? storyData.scenes[state.currentScene]?.name ?? '当前场景',
    players: state.players.map((player) => player.name).join('、'),
    detail: progress.worldTime.replace('T', ' '),
    completed: Boolean(ending)
  };
}
