import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import { createScenarioProgress } from '../../src/scenario/engine';
import type { ApiConfig, GameState } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

/**
 * 场景切换的权责：正则推断是兜底，模型自己的判断不该被丢掉。
 * 这两条通道之前只有正则在起作用，导致玩家换个说法就切不动场景。
 */

const config: ApiConfig = {
  provider: 'openai',
  protocol: 'responses',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

const prose = (narrative: string) => JSON.stringify({
  narrative,
  activeNpc: null,
  nextPrompt: '继续行动。',
  playerChoices: {},
  keywords: []
});

/** 第一轮叙事附带工具调用，后续轮次只给正文，避免反复下发同一调用。 */
function mockNarrator(narrative: string, call?: { name: string; arguments: Record<string, unknown> }) {
  let narratorTurns = 0;
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const isNarrator = body.text?.format?.name === 'narrator_response'
      || String(body.instructions ?? '').includes('COC 第七版 AI DM Agent');
    if (!isNarrator) {
      return new Response(JSON.stringify({ facts: [], nodes: [], edges: [] }), { status: 200 });
    }
    narratorTurns += 1;
    const output: unknown[] = [{ type: 'message', content: [{ type: 'output_text', text: prose(narrative) }] }];
    if (call && narratorTurns === 1) {
      output.push({
        type: 'function_call',
        call_id: 'scene-1',
        name: call.name,
        arguments: JSON.stringify(call.arguments)
      });
    }
    return new Response(JSON.stringify({ output_text: prose(narrative), output }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function stateAt(currentScene: GameState['currentScene'], facts: string[] = []) {
  const state = makeState({
    players: [makeInvestigator({ name: '亨利' })],
    currentScene
  });
  state.scenarioProgress = createScenarioProgress();
  state.scenarioProgress.knownFactIds = facts;
  return state;
}

afterEach(() => vi.unstubAllGlobals());

describe('scene progression accepts the model’s own move', () => {
  it('honours a scene change the regex cannot phrase-match', async () => {
    // 「离开这里」表达了移动（hasMovement 为真、工具被放开），但没说去哪儿，
    // 正则推断只能返回 null；此前模型的判断就在这一格被整个丢掉。
    mockNarrator('你们走出分局，沿街往摩勒住宅的方向去。', {
      name: 'propose_scene_change',
      arguments: { targetSceneId: 'S01', reason: '调查员决定返回摩勒住宅' }
    });

    const result = await runDmTurn(config, {
      state: stateAt('S02'),
      actions: [{ player: '亨利', action: '我们离开这里，先回去一趟。' }]
    });
    await result.backgroundUpdate;

    expect(result.legacyResponse?.stateUpdate?.sceneChange).toBe('S01');
  });

  it('still refuses a scene the current one does not connect to', async () => {
    mockNarrator('迷雾深处忽然出现港口的轮廓。', {
      name: 'propose_scene_change',
      arguments: { targetSceneId: 'S05', reason: '模型想直接跳到港口' }
    });

    const result = await runDmTurn(config, {
      state: stateAt('S02'),
      actions: [{ player: '亨利', action: '我们离开这里，先回去一趟。' }]
    });
    await result.backgroundUpdate;

    // 被拒绝时解析器把 sceneChange 置为 null，任何非空值都意味着越界跳转被放行了。
    expect(result.legacyResponse?.stateUpdate?.sceneChange ?? null).toBeNull();
  });

  it('keeps the regex path working for a named destination', async () => {
    mockNarrator('你们回到摩勒住宅的客厅。');
    const state = stateAt('S02');

    const result = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '我们回客厅吧。' }]
    });
    await result.backgroundUpdate;

    expect(result.legacyResponse?.stateUpdate?.sceneChange).toBe('S01');
  });
});
