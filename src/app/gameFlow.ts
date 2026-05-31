import { storyData } from '../data/storyData';
import type { PlayerAction } from '../services/aiDm';
import type { CheckRequest, DiceResult, GameState } from '../types/game';

export function buildSplitAction(state: GameState): PlayerAction {
  const player = state.players[state.currentSplitPlayer] ?? state.players[0];
  const sceneId = state.playerLocations[player.id] ?? 'S01';
  return {
    player: player.name,
    action: state.declarations[player.id] || '等待',
    scene: storyData.scenes[sceneId].name
  };
}

export function buildPlayerActions(state: GameState): PlayerAction[] {
  if (state.exploreMode === 'together') {
    return state.players.map((player) => ({
      player: player.name,
      action: state.declarations[player.id] || '等待'
    }));
  }
  return [buildSplitAction(state)];
}

export function buildDiceResultMessage(check: CheckRequest, result: DiceResult) {
  return `【检定结果】${check.player} 的 ${check.skill} 检定：掷出 ${result.roll}，阈值 ${check.threshold}，结果：${result.label}。这是规则事实，不得改写或推翻；请根据结果继续叙述。`;
}

export function buildDiceResultAction(state: GameState, check: CheckRequest, checkMessage: string): PlayerAction {
  return {
    player: check.player,
    action: checkMessage,
    scene: storyData.scenes[state.currentScene].name
  };
}

export function findSuggestionTargetPlayerId(state: GameState) {
  if (state.exploreMode === 'split') {
    return state.players[state.currentSplitPlayer]?.id ?? null;
  }
  // Together mode: suggestions go to the actor whose turn it currently is.
  return state.players[state.currentActorIndex]?.id ?? null;
}

