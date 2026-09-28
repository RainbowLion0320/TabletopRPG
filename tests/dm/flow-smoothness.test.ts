import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import { reviewNarratorSemantics } from '../../src/dm/turnGuards';
import { getActiveKnowledgeBase } from '../../src/dm/knowledgeBase';
import { makeInvestigator, makeState } from './fixtures';
import type { ApiConfig } from '../../src/types/game';

const config: ApiConfig = { provider: 'openai', protocol: 'responses', apiKey: 'test-key', endpoint: 'https://unit.test/v1', model: 'test-model' };
const names = ['亨利·格雷', '艾达·华莱士', '托马斯·贝尔', '罗伯特·肖'];

function mockNarrator(narrative: string, toolCalls: unknown[] = []) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const isNarrator = body.text?.format?.name === 'narrator_response';
    return new Response(JSON.stringify({
      output_text: JSON.stringify(isNarrator ? { narrative, activeNpc: null, nextPrompt: '', playerChoices: {}, keywords: [] } : { facts: [], nodes: [], edges: [] }),
      output: isNarrator ? toolCalls : []
    }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return () => fetchMock.mock.calls.filter(([, init]) => String(init?.body).includes('narrator_response')).length;
}

afterEach(() => vi.unstubAllGlobals());

describe('smooth DM turn regressions', () => {
  it.each([
    '需要注意，这里无需进行潜行检定，直接拿起即可。',
    '请不要进行潜行检定，直接拿起即可。',
    '你需要先征求同意，之后再进行潜行检定。'
  ])('does not invent a dice step for %s', async (narrative) => {
    const count = mockNarrator(narrative);
    const result = await runDmTurn(config, { state: makeState(), actions: [{ player: '亨利', action: '原地思考' }] });
    await result.backgroundUpdate;
    expect(result.legacyResponse.check).toBeNull();
    expect(result.legacyResponse.narrative).toBe(narrative);
    expect(count()).toBe(1);
  });

  it.each(['潜行检定没有通过，你停下了脚步。', '潜行检定未能成功，你的脚步声惊动了对方。', '这次潜行检定并未成功。'])('accepts settled failure without retry: %s', async (narrative) => {
    const count = mockNarrator(narrative);
    const result = await runDmTurn(config, { state: makeState(), actions: [{
      player: '亨利', action: '【检定结果】亨利 的 潜行 检定：掷出 90，结果：失败（90）。',
      checkResult: { skill: '潜行', outcome: 'fail' }
    }] });
    await result.backgroundUpdate;
    expect(result.legacyResponse.check).toBeNull();
    expect(result.legacyResponse.narrative).toBe(narrative);
    expect(count()).toBe(1);
  });

  it.each([1, 2, 4])('retains each of %i player checks when the DM supplies only the first tool', async (size) => {
    const players = names.slice(0, size).map((name) => makeInvestigator({ name }, { 潜行: 60 }));
    const narrative = players.map((player) => `${player.name}需要进行潜行检定。`).join('');
    const count = mockNarrator(narrative, [{ type: 'function_call', call_id: 'check-first', name: 'request_check', arguments: JSON.stringify({ player: players[0].name, skill: '潜行', difficulty: '困难' }) }]);
    const state = makeState({ players });
    const actions = players.map((player) => ({ player: player.name, action: '原地思考' }));
    const result = await runDmTurn(config, { state, actions });
    await result.backgroundUpdate;
    const checks = [result.legacyResponse.check, ...(result.legacyResponse.check?.queuedChecks ?? [])];
    expect(checks.map((check) => check?.player)).toEqual(players.map((player) => player.name));
    expect(checks[0]?.difficulty).toBe('困难');
    expect(count()).toBe(1);
    expect(state.pendingCheck).toBeNull();
    if (size > 1) {
      expect(reviewNarratorSemantics({ narrative, nextPrompt: '', playerChoices: {} }, [{ name: 'request_check', arguments: {
        player: players[0].name, skill: '潜行', difficulty: '普通'
      } }], state, getActiveKnowledgeBase(), actions)?.severity).toBe('blocking');
    }
  });
});
