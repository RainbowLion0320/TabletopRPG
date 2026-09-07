interface ConversationTurnLike {
  role: string;
  content?: unknown;
}

const DICE_RESULT_PREFIX = '【检定结果】';

export function isDiceResultHistoryTurn(turn: ConversationTurnLike): boolean {
  return turn.role === 'user'
    && typeof turn.content === 'string'
    && turn.content.trimStart().startsWith(DICE_RESULT_PREFIX);
}

export function countCompletedGameTurns(history: readonly ConversationTurnLike[], summarizedTurnCount = 0): number {
  return summarizedTurnCount + history.filter((turn) => turn.role === 'user' && !isDiceResultHistoryTurn(turn)).length;
}

export function getDmRequestTurn(history: readonly ConversationTurnLike[], summarizedTurnCount = 0): number {
  const completed = countCompletedGameTurns(history, summarizedTurnCount);
  const continuesCurrentTurn = history[history.length - 1]?.role === 'user';
  return Math.max(1, completed + (continuesCurrentTurn ? 0 : 1));
}
