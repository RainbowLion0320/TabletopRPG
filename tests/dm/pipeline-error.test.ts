import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import { AiResponseFormatError } from '../../src/services/aiDm';
import { createScenarioProgress } from '../../src/scenario/engine';
import type { ApiConfig } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

const config: ApiConfig = {
  provider: 'openai',
  protocol: 'responses',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

function jsonResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      output_text: content,
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: content }]
        }
      ]
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runDmTurn error classification', () => {
  it('settles legal travel before requesting a risky destination follow-up check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }),
        makeInvestigator({ name: '艾达' }, { 心理学: 65 })
      ],
      currentScene: 'S02'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.variables.oldHethLead = true;

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '亨利', action: '暂时收手，离开分局，改从老赫特酒吧寻找突破口' },
        { player: '艾达', action: '与亨利一同离开分局前往老赫特酒吧；进门后先观察酒保和常客对埃里克照片的反应，不惊动其他人。' }
      ]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.legacyResponse.stateUpdate?.sceneChange).toBe('S03');
    expect(output.legacyResponse.activeNpc).toBeNull();
    expect(output.legacyResponse.check).toEqual(expect.objectContaining({
      player: '艾达',
      skill: '心理学',
      difficulty: '普通',
      continuationActions: [
        { player: '亨利', action: '寻找突破口' },
        { player: '艾达', action: '进门后先观察酒保和常客对埃里克照片的反应，不惊动其他人。' }
      ]
    }));
  });

  it('reports narrator JSON parse failures as AI response format errors', async () => {
    const malformed = '{\n  "narrative": "雾里传来"钟声"\n  "activeNpc": null\n}';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(malformed)));

    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01'
    });

    await expect(
      runDmTurn(config, {
        state,
        actions: [{ player: '亨利', action: '我向雾里的钟声走去。' }]
      })
    ).rejects.toBeInstanceOf(AiResponseFormatError);
  });

  it('falls back safely after repeated semantic scene violations', async () => {
    const invalidArrival = JSON.stringify({
      narrative: '你们已经抵达卡森其药店。',
      activeNpc: null,
      nextPrompt: '进入药店。',
      playerChoices: { 亨利: ['进入药店'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(invalidArrival)));
    const state = makeState({ players: [makeInvestigator({ name: '亨利' })], currentScene: 'S01' });

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '在没有地址线索时前往卡森其药店。' }]
    });

    expect(output.legacyResponse?.narrative).toContain('仍在摩勒住宅');
    expect(output.legacyResponse?.stateUpdate?.sceneChange).toBeNull();
  });
});
