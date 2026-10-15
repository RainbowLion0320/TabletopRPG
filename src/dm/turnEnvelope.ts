import type { OpenAiTool } from './tools';
import type { LlmToolCall } from './llm/types';

export const NARRATE_TURN = 'narrate_turn';

/** Prose travels beside the original rule tools, not in a second model call. */
export function narrationTool(schema: OpenAiTool['function']['parameters']): OpenAiTool<string> {
  return { type: 'function', function: { name: NARRATE_TURN,
    description: '交付本轮完整叙事与每位玩家的建议。与本轮所需的规则提议在同一响应调用；正文仍经前端审核后显示。', parameters: schema } };
}

export function unpackNarration(rawText: string, calls: LlmToolCall[]) {
  const narration = calls.filter(call => call.name === NARRATE_TURN);
  return {
    raw: narration.length ? JSON.stringify(narration[0].arguments) : rawText,
    calls: calls.filter(call => call.name !== NARRATE_TURN),
    receiptCalls: calls,
    malformed: narration.length > 1 ? '一轮只交付一份完整叙事，请合并各玩家的回应。' : undefined
  };
}
