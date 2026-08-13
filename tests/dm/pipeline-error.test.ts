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

  it('keeps fallback narration and NPC synchronized with an accepted scene change', async () => {
    const unsupportedClaim = JSON.stringify({
      narrative: '你们抵达卡森其药店，发现埃里克脸上有伤，手一直在发抖。',
      activeNpc: '老赫特之家酒保',
      nextPrompt: '追问酒保。',
      playerChoices: { 亨利: ['追问酒保'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(unsupportedClaim)));
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S03',
      activeNpcName: '老赫特之家酒保'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.knownFactIds = ['F08'];

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '离开酒吧，立即前往卡森其药店。' }]
    });

    expect(output.legacyResponse.stateUpdate?.sceneChange).toBe('S04');
    expect(output.legacyResponse.activeNpc).toBeNull();
    expect(output.legacyResponse.narrative).toContain('已经抵达卡森其药店');
    expect(output.legacyResponse.narrative).not.toContain('仍在老赫特酒吧');
    expect(output.legacyResponse.narrative).not.toContain('老赫特之家酒保');
    expect(output.legacyResponse.playerChoices?.亨利).not.toContain('请老赫特之家酒保只核对已经确认的事实');
  });

  it('uses authored pre-roll narration without calling the model for a scenario check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 聆听: 65 })],
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '艾达', action: '专心聆听深潜者的声调，理解它的诉求。' }]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_NEGOTIATION_LISTEN');
    expect(output.legacyResponse.narrative).toBe('调查员需要先通过聆听检定理解对方的真正诉求。');
    expect(output.legacyResponse.narrative).not.toMatch(/货物|小艇|释放埃里克/);
    expect(output.legacyResponse.activeNpc).toBe('扶桑花号交涉代表');
  });

  it('projects a settled route into semantic fallback NPC and choices', async () => {
    const invalidOutcome = JSON.stringify({
      narrative: '交涉代表立刻释放了埃里克，并允许你们离开。',
      activeNpc: '埃里克·摩勒',
      nextPrompt: '带埃里克离开。',
      playerChoices: { 艾达: ['返回药店'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(invalidOutcome)));
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' })],
      currentScene: 'S05',
      activeNpcName: '埃里克·摩勒'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '艾达', action: '不使用武力，正式选择和平交涉路线。' }]
    });

    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_CHOOSE_NEGOTIATION');
    expect(output.legacyResponse.activeNpc).toBe('扶桑花号交涉代表');
    expect(output.legacyResponse.narrative).toContain('暂缓攻击');
    expect(output.legacyResponse.playerChoices?.艾达?.[0]).toBe('先听懂对方诉求，再说服其释放埃里克。');
    expect(output.legacyResponse.playerChoices?.艾达).not.toContain('听懂深潜者诉求');
    expect(output.legacyResponse.playerChoices?.艾达).not.toContain('前往卡森其药店继续调查');
  });

  it('uses a combat-aware semantic fallback after a resolved successful attack', async () => {
    const invalidOutcome = JSON.stringify({
      narrative: '交涉代表立刻释放了埃里克，并允许调查员停止战斗离开码头。',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '带埃里克离开。',
      playerChoices: { 罗伯特: ['停止攻击并谈判'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(invalidOutcome)));
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })],
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.variables.combatRoundStarted = true;
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 2, active: true, visible: true };

    const output = await runDmTurn(config, {
      state,
      actions: [{
        player: '罗伯特',
        action: '【检定结果】罗伯特 的 格斗（拳） 检定：掷出 59，阈值 70，结果：普通成功（59）。这是规则事实，不得改写或推翻；请根据结果继续叙述。'
      }]
    });

    expect(output.legacyResponse.narrative).toContain('攻击已经结算并奏效');
    expect(output.legacyResponse.narrative).toContain('一名深潜者失去战斗能力');
    expect(output.legacyResponse.narrative).not.toMatch(/提供更多可核实的信息|释放了埃里克/);
    expect(output.legacyResponse.playerChoices?.罗伯特).not.toContain(
      '用警棍指向深潜者代表，警告它下令停船'
    );
  });
});
