import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiResponseFormatError } from '../../src/dm/llm/errors';
import { maybeConsolidateMemory } from '../../src/dm/summarizer';
import { parseSummary } from '../../src/dm/summarizer';
import { createInitialGameState } from '../../src/state/gameReducer';
import type { ApiConfig, ConversationTurn } from '../../src/types/game';

const config: ApiConfig = {
  provider: 'openai',
  protocol: 'responses',
  endpoint: 'https://unit.test/v1',
  apiKey: 'unit-key',
  model: 'gpt-test'
};

function stateWithHistory() {
  const state = createInitialGameState([]);
  state.conversationHistory = Array.from({ length: 18 }, (_, index): ConversationTurn => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `turn-${index}`
  }));
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('maybeConsolidateMemory', () => {
  it('accepts a useful Chinese plain-text fallback when a provider omits the JSON wrapper', () => {
    expect(parseSummary('KP日志：调查员已从摩勒住宅前往警局，并确认便签仍留在书房桌面。'))
      .toContain('调查员已从摩勒住宅前往警局');
  });

  it.each([
    ['non-JSON text', 'this is not json'],
    ['an empty summary', '{"summary":""}']
  ])('rejects %s instead of storing it as long-term memory', async (_label, outputText) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      output_text: outputText
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })));

    await expect(maybeConsolidateMemory(config, stateWithHistory(), { force: true }))
      .rejects.toBeInstanceOf(AiResponseFormatError);
  });
});
