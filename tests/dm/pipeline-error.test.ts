import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDmTurn } from '../../src/dm/pipeline';
import { AiResponseFormatError } from '../../src/services/aiDm';
import { createScenarioProgress } from '../../src/scenario/engine';
import { gameReducer } from '../../src/state/gameReducer';
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

function jsonResponseWithStoryEvent(content: string, eventId: string): Response {
  return new Response(
    JSON.stringify({
      output_text: content,
      output: [
        {
          type: 'function_call',
          id: `fc-${eventId}`,
          call_id: `call-${eventId}`,
          name: 'propose_story_event',
          arguments: JSON.stringify({ eventId })
        },
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

function countNarratorRequests(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(([, init]) => {
    const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}')) as {
      text?: { format?: { name?: string } };
    };
    return body.text?.format?.name === 'narrator_response';
  }).length;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runDmTurn error classification', () => {
  it('turns the attack that selects combat into the first authored combat check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [{
        player: '罗伯特',
        action: '拒绝交涉，抽出警棍攻击甲板上的一名深潜者。'
      }]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.actorName).toBe('罗伯特');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_CHOOSE_COMBAT');

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '罗伯特',
      skill: '格斗（拳）',
      difficulty: '普通',
      scenarioCheckId: 'CHECK_COMBAT'
    }));
    expect(next.scenarioProgress?.clocks.fusangEscape.value).toBe(0);
    expect(next.scenarioProgress?.encounters.ENC01.round).toBe(0);
  });

  it('turns a natural first strike into the first authored combat check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { '格斗（拳）': 50 }),
        makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '亨利', action: '守住船舱入口，掩护罗伯特继续进攻，本轮不出手。' },
        { player: '罗伯特', action: '用警棍抢先打倒离埃里克最近的深潜者。' }
      ]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.actorName).toBe('罗伯特');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_CHOOSE_COMBAT');
    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '罗伯特',
      skill: '格斗（拳）',
      difficulty: '普通',
      scenarioCheckId: 'CHECK_COMBAT'
    }));
  });

  it('uses the declared firearm skill for an equipped combat actor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特', equipment: ['警用左轮手枪'] }, {
        '格斗（拳）': 50,
        '射击（手枪）': 60
      })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '罗伯特', action: '拔出警用左轮手枪射击一名深潜者。' }]
    });
    const next = gameReducer(state, {
      type: 'applyAiResponse', response: output.legacyResponse, raw: output.raw, actorName: output.actorName
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '罗伯特', skill: '射击（手枪）', difficulty: '普通', scenarioCheckId: 'CHECK_COMBAT'
    }));
  });

  it('uses firearm skill for the authored handgun attack suggestion during combat', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特', equipment: ['警用左轮手枪'] }, {
        '格斗（拳）': 70,
        '射击（手枪）': 60
      })],
      currentScene: 'S05'
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
      actions: [{ player: '罗伯特', action: '使用随身手枪攻击一名仍在抵抗的深潜者' }]
    });
    const next = gameReducer(state, {
      type: 'applyAiResponse', response: output.legacyResponse, raw: output.raw, actorName: output.actorName
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_COMBAT_ATTACK');
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '罗伯特', skill: '射击（手枪）', threshold: 60, scenarioCheckId: 'CHECK_COMBAT'
    }));
  });

  it('does not start authored combat from an unarmed firearm declaration', async () => {
    const invalid = JSON.stringify({
      narrative: '没有可用的枪械，这次行动无法按声明执行。',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '选择实际持有的装备。',
      playerChoices: { 艾达: ['保持距离继续观察'] }
    });
    const fetchMock = vi.fn(async () => jsonResponse(invalid));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '艾达', equipment: [] }, { '格斗（拳）': 30 })],
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '艾达', action: '拔出手枪射击深潜者。' }]
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(output.legacyResponse.stateUpdate?.storyEventIds).not.toContain('EV_CHOOSE_COMBAT');
    expect(output.legacyResponse.check).toBeFalsy();
  });

  it('does not start authored combat from an unarmed authored handgun suggestion', async () => {
    const invalid = JSON.stringify({
      narrative: '没有可用的枪械，这次行动无法按声明执行。',
      activeNpc: '扶桑花号交涉代表',
      nextPrompt: '选择实际持有的装备。',
      playerChoices: { 艾达: ['保持距离继续观察'] }
    });
    const fetchMock = vi.fn(async () => jsonResponse(invalid));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '艾达', equipment: [] }, { '格斗（拳）': 30 })],
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '艾达', action: '使用随身手枪攻击一名仍在抵抗的深潜者' }]
    });

    expect(fetchMock).toHaveBeenCalled();
    expect(output.legacyResponse.stateUpdate?.storyEventIds).not.toContain('EV_CHOOSE_COMBAT');
    expect(output.legacyResponse.check).toBeFalsy();
  });

  it('preserves the actor that proposed an authored combat check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [
        makeInvestigator({ name: '艾达' }, { '闪避': 70, '格斗（拳）': 30 }),
        makeInvestigator({ name: '罗伯特' }, { '闪避': 50, '格斗（拳）': 70 })
      ],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 1, active: true, visible: true };

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '艾达', action: '继续用灯光锁定刚才闪避的深潜者，为罗伯特示警，本轮不攻击。' },
        { player: '罗伯特', action: '再次逼近同一名深潜者，避开蹼爪后用警棍横扫他的膝部。' }
      ]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.actorName).toBe('罗伯特');
    expect(output.legacyResponse?.stateUpdate?.storyEventIds).toContain('EV_COMBAT_ATTACK');
  });

  it('issues the authored combat check for natural weapon strike wording without calling the model', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '罗伯特' }, { '格斗（拳）': 70 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'combat';
    state.scenarioProgress.variables.combatRoundStarted = true;
    state.scenarioProgress.encounters.ENC01.state = 'active';
    state.scenarioProgress.clocks.fusangEscape = { value: 3, active: true, visible: true };

    const output = await runDmTurn(config, {
      state,
      actions: [{
        player: '罗伯特',
        action: '绕过倒地的敌人，向第三名仍在抵抗的深潜者踏步近身，用警棍击打他的膝部使其失去战斗能力。'
      }]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.actorName).toBe('罗伯特');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_COMBAT_ATTACK');

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '罗伯特',
      skill: '格斗（拳）',
      scenarioCheckId: 'CHECK_COMBAT'
    }));
    expect(next.scenarioProgress?.clocks.fusangEscape.value).toBe(3);
  });

  it('settles a source clue and its newly unlocked travel in one real turn', async () => {
    const response = JSON.stringify({
      narrative: '酒保收下酒钱，明确指出“老鼠”在贝尔街14号废弃药店出没。你们随即抵达药店后门。',
      activeNpc: null,
      nextPrompt: '药店后门已经敞开，下一步怎么做？',
      playerChoices: {
        亨利: ['进入药店调查'],
        罗伯特: ['警戒后门']
      },
      keywords: []
    });
    const fetchMock = vi.fn(async () => jsonResponse(response));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '罗伯特' })],
      currentScene: 'S03',
      activeNpcName: '老赫特之家酒保'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B04 = 'active';
    state.scenarioProgress.objectiveStates.O04 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '亨利', action: '给酒保酒钱，请他说明“老鼠”和贝尔街14号的确切关系。' },
        { player: '罗伯特', action: '根据酒保刚确认的地址，立即与亨利一起前往卡森其药店。' }
      ]
    });

    expect(countNarratorRequests(fetchMock)).toBe(1);
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_BARTENDER_RAT');
    expect(output.legacyResponse.stateUpdate?.sceneChange).toBe('S04');

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.currentScene).toBe('S04');
    expect(next.scenarioProgress?.knownFactIds).toContain('F08');
    expect(next.scenarioProgress?.firedEventIds).toEqual(expect.arrayContaining([
      'EV_BARTENDER_RAT',
      'EV_S04_FOG'
    ]));
    expect(next.players.every((player) => player.currentSan === player.san - 1)).toBe(true);
  });

  it('does not travel to a scene unlocked in the same turn when it is only mentioned in testimony', async () => {
    const response = JSON.stringify({
      narrative: '伊莎贝拉确认委托，允许调查员继续在住宅内检查埃里克留下的个人物品。',
      activeNpc: '伊莎贝拉·摩勒',
      nextPrompt: '先检查住宅里的哪一处？',
      playerChoices: {
        托马斯: ['检查书桌抽屉与相框'],
        罗伯特: ['检查书架夹缝与垃圾桶']
      },
      keywords: []
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(response)));
    const state = makeState({
      players: [makeInvestigator({ name: '托马斯' }), makeInvestigator({ name: '罗伯特' })],
      currentScene: 'S01',
      activeNpcName: '伊莎贝拉·摩勒'
    });
    state.scenarioProgress = createScenarioProgress();

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '托马斯', action: '接受伊莎贝拉的正式委托，请她说明警方已做过的调查。' },
        { player: '罗伯特', action: '确认共同接受委托，询问伊莎贝拉埃里克常去的酒吧、书房和可供搜查的个人物品。' }
      ]
    });

    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_ACCEPT_COMMISSION');
    expect(output.legacyResponse.stateUpdate?.sceneChange).toBeNull();

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.currentScene).toBe('S01');
    expect(next.scenarioProgress?.beatStates.B02).toBe('active');
  });

  it('falls back immediately when clue narration disagrees with an authored failure event', async () => {
    const narrative = JSON.stringify({
      narrative: '尽管亨利没能判断便签上笔触是否异常，他仍看清了桌面上那张写有“别来找我”的字条。',
      activeNpc: '伊莎贝拉·摩勒',
      nextPrompt: '下一步怎么做？',
      playerChoices: { 亨利: ['记录便签'] }
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponseWithStoryEvent(narrative, 'EV_FIND_I01'));
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S01',
      activeNpcName: '伊莎贝拉·摩勒'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '亨利', action: '系统搜查书房桌面、抽屉和书架夹缝。' },
        { player: '亨利', action: '【检定结果】亨利的侦查检定：掷出84，结果：失败。' }
      ]
    });

    expect(countNarratorRequests(fetchMock)).toBe(1);
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_FAIL_I01');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).not.toContain('EV_FIND_I01');
    expect(output.legacyResponse.narrative).toContain('别来找我');
  });

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
    expect(output.legacyResponse.narrative).not.toContain('声明中的其他新信息');
    expect(output.legacyResponse.narrative).not.toContain('仍在老赫特酒吧');
    expect(output.legacyResponse.narrative).not.toContain('老赫特之家酒保');
    expect(output.legacyResponse.playerChoices?.亨利).not.toContain('请老赫特之家酒保只核对已经确认的事实');
  });

  it('does not blame players when a visible suggestion is followed but model narration violates clue authority', async () => {
    const invalidDiscovery = JSON.stringify({
      narrative: '两人从窄窗进入药店，立刻在柜台附近发现了雪茄头。',
      activeNpc: null,
      nextPrompt: '检查雪茄头。',
      playerChoices: { 亨利: ['检查雪茄头'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(invalidDiscovery)));
    const player = makeInvestigator({ name: '亨利' });
    const state = makeState({ players: [player], currentScene: 'S04' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.suggestions = ['侧身从窄窗翻入药店内部'];
    state.suggestionsByPlayerId = { [player.id]: [...state.suggestions] };

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '侧身从窄窗翻入药店内部' }]
    });

    expect(output.legacyResponse.narrative).toContain('按刚才选定的方式继续行动');
    expect(output.legacyResponse.narrative).not.toContain('声明中的新信息无法');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).not.toContain('EV_S04_CIGAR');
  });

  it('rebuilds current-scene choices when a check continuation returns no suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(JSON.stringify({
      narrative: '入口周围暂时没有更多可确认的痕迹。',
      activeNpc: null,
      nextPrompt: '继续调查药店。',
      playerChoices: {}
    }))));
    const state = makeState({
      players: [makeInvestigator({ id: 'henry', name: '亨利' })],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.firedEventIds = ['EV_S04_FOG'];
    state.suggestions = ['前往卡森其药店继续调查'];
    state.suggestionsByPlayerId = { henry: [...state.suggestions] };

    const output = await runDmTurn(config, {
      state,
      actions: [{
        player: '亨利',
        action: '【检定结果】亨利 的 侦查检定：掷出 49，阈值 50，结果：普通成功。'
      }]
    });

    expect(output.legacyResponse.playerChoices?.亨利).toContain('搜查后厅被翻动的区域和遗留包裹');
    expect(output.legacyResponse.playerChoices?.亨利).not.toContain('前往卡森其药店继续调查');
  });

  it('prioritizes the destination of the active mandatory beat in semantic fallback choices', async () => {
    const invalidDiscovery = JSON.stringify({
      narrative: '亨利在桌面上又发现了一张便签。',
      activeNpc: '伊莎贝拉·摩勒',
      nextPrompt: '查看便签。',
      playerChoices: { 亨利: ['查看便签'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(invalidDiscovery)));
    const state = makeState({ players: [makeInvestigator({ name: '亨利' })], currentScene: 'S01' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B03 = 'active';
    state.scenarioProgress.beatStates.B04 = 'active';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.knownFactIds = ['F05', 'F06'];
    state.scenarioProgress.variables.oldHethLead = true;

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '原地整理刚才的记录。' }]
    });

    expect(output.legacyResponse.playerChoices?.亨利).toContain('前往卡森其药店继续调查');
  });

  it('offers a destination unlocked by an accepted story event in the same turn', async () => {
    const content = JSON.stringify({
      narrative: '后厅油布包中的地图笔记标出了泰晤士港扶桑花号的位置。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {
        托马斯: ['小心检查店内深处是否有其他东西', '再次警戒后门确保退路畅通', '继续观察当前环境']
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(content)));
    const state = makeState({
      players: [makeInvestigator({ name: '托马斯' }, { 侦查: 65 })],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [
        { player: '托马斯', action: '搜查后厅油布包，寻找并检查潮湿的地图笔记。' },
        {
          player: '托马斯',
          action: '【检定结果】托马斯 的 侦查检定：掷出 44，阈值 65，结果：普通成功（44）。这是规则事实，不得改写或推翻；请根据结果继续叙述。'
        }
      ]
    });

    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_S04_MAP');
    expect(output.legacyResponse.playerChoices?.托马斯?.[0]).toBe('前往泰晤士港·扶桑花号继续调查');
    expect(output.legacyResponse.playerChoices?.托马斯).not.toContain(
      '在扶桑花号上选择阻止深潜者或尝试交涉。'
    );
  });

  it('keeps a map-check continuation in S04 when 去向 only describes the evidence', async () => {
    const content = JSON.stringify({
      narrative: '油布包中的地图标出了泰晤士港扶桑花号的位置，调查员仍在药店整理物证。',
      activeNpc: null,
      nextPrompt: '下一步怎么办？',
      playerChoices: {
        '亨利·格雷': ['携带地图继续检查药店后门']
      }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(content)));
    const state = makeState({
      players: [makeInvestigator({ name: '亨利·格雷' }, { 侦查: 75 })],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [
        {
          player: '亨利·格雷',
          action: '搜查后厅被翻动的区域和油布包，只寻找能确认埃里克去向与港口位置的物证。'
        },
        {
          player: '亨利·格雷',
          action: '【检定结果】亨利·格雷 的 侦查 检定：掷出 29，阈值 75，结果：困难成功（29）。这是规则事实，不得改写或推翻；请根据结果继续叙述。'
        }
      ]
    });

    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_S04_MAP');
    expect(output.legacyResponse.stateUpdate?.sceneChange).toBeNull();
    expect(output.legacyResponse.activeNpc).toBeNull();
  });

  it('uses authored scene actions instead of objective text in semantic fallback choices', async () => {
    const invalid = JSON.stringify({
      narrative: '药店窗外停着一辆近期反复转运货物的马车。',
      activeNpc: null,
      nextPrompt: '追查马车。',
      playerChoices: { 亨利: ['追查马车'] }
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(invalid)));
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      currentScene: 'S04',
      activeNpcName: null
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [{ player: '亨利', action: '原地整理已经确认的记录。' }]
    });

    expect(output.legacyResponse.playerChoices?.亨利).toEqual([
      '搜查后厅被翻动的区域和遗留包裹',
      '检查柜台附近的烟灰与使用痕迹',
      '确认后门、窗户和街巷方向，规划安全退路'
    ]);
    expect(output.legacyResponse.playerChoices?.亨利).not.toContain('应对浓雾与追兵，找到扶桑花号的位置。');
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

  it('turns natural listening with negated persuasion into the authored listen check', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 聆听: 65, 说服: 60 }),
        makeInvestigator({ name: '艾达' }, { 聆听: 65, 说服: 60 })
      ],
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
      actions: [
        {
          player: '亨利',
          action: '放下武器，与扶桑花号交涉代表保持距离，专心倾听并准确复述它关于埃里克和交易的诉求。'
        },
        {
          player: '艾达',
          action: '协助亨利维持安静的交涉空间，观察代表语气与停顿，确保不误解它的诉求，不另行发起攻击或说服。'
        }
      ]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.actorName).toBe('亨利');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_NEGOTIATION_LISTEN');
    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '亨利',
      skill: '聆听',
      difficulty: '普通',
      scenarioCheckId: 'CHECK_LISTEN'
    }));
  });

  it('starts negotiation and its authored listen check from natural lowered-weapon wording', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 聆听: 65, 说服: 60 }),
        makeInvestigator({ name: '艾达' }, { 聆听: 65, 说服: 60 })
      ],
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';

    const output = await runDmTurn(config, {
      state,
      actions: [
        {
          player: '亨利',
          action: '放下武器，与扶桑花号交涉代表保持距离，专心倾听并准确复述它关于埃里克和交易的诉求。'
        },
        {
          player: '艾达',
          action: '协助亨利维持安静的交涉空间，观察代表语气与停顿，确保不误解它的诉求，不另行发起攻击或说服。'
        }
      ]
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output.actorName).toBe('亨利');
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_CHOOSE_NEGOTIATION');
    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: output.legacyResponse,
      raw: output.raw,
      actorName: output.actorName
    });
    expect(next.scenarioProgress?.variables.finaleRoute).toBe('negotiation');
    expect(next.pendingCheck).toEqual(expect.objectContaining({
      player: '亨利',
      skill: '聆听',
      difficulty: '普通',
      scenarioCheckId: 'CHECK_LISTEN'
    }));
  });

  it('projects a settled route into semantic fallback NPC and choices', async () => {
    const invalidOutcome = JSON.stringify({
      narrative: '交涉代表立刻释放了埃里克，并允许你们离开。',
      activeNpc: '埃里克·摩勒',
      nextPrompt: '带埃里克离开。',
      playerChoices: { 艾达: ['返回药店'] }
    });
    const fetchMock = vi.fn(async () => jsonResponse(invalidOutcome));
    vi.stubGlobal('fetch', fetchMock);
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

    expect(countNarratorRequests(fetchMock)).toBe(0);
    expect(output.legacyResponse.stateUpdate?.storyEventIds).toContain('EV_CHOOSE_NEGOTIATION');
    expect(output.legacyResponse.activeNpc).toBe('扶桑花号交涉代表');
    expect(output.legacyResponse.narrative).toContain('暂缓攻击');
    expect(output.legacyResponse.check).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_LISTEN',
      player: '艾达',
      skill: '聆听'
    }));
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
