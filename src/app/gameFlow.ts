import { storyData } from '../data/storyData';
import type { PlayerAction } from '../services/aiDm';
import type { CheckRequest, DiceResult, GameState } from '../types/game';

export function buildPlayerActions(state: GameState): PlayerAction[] {
  return state.players.map((player) => ({
    player: player.name,
    action: state.declarations[player.id] || '等待'
  }));
}

export function buildDiceResultMessage(check: CheckRequest, result: DiceResult) {
  const contract = result.level === 'fumble'
    ? check.resolution?.fumble ?? check.resolution?.failure
    : result.level === 'fail'
      ? check.resolution?.failure
      : check.resolution?.success;
  return `【检定结果】${check.player} 的 ${check.skill} 检定：掷出 ${result.roll}，阈值 ${check.threshold}，结果：${result.label}。这是规则事实，不得改写或推翻；请根据结果继续叙述。${contract ? `【结算契约】${contract}` : ''}`;
}

export function buildDiceResultAction(state: GameState, check: CheckRequest, checkMessage: string, result?: DiceResult): PlayerAction {
  return {
    player: check.player,
    action: checkMessage,
    scene: storyData.scenes[state.currentScene].name,
    ...(result ? { checkResult: {
      skill: check.skill,
      outcome: result.level,
      targetItemIds: check.resolution?.targetItemIds
    } } : {})
  };
}

export function findSuggestionTargetPlayerId(state: GameState) {
  // Suggestions go to the actor whose declaration is currently being entered.
  return state.players[state.currentActorIndex]?.id ?? null;
}
