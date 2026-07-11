import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiResponseFormatError } from '../../src/dm/llm/errors';
import { maybeConsolidateMemory } from '../../src/dm/summarizer';
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
