import { describe, expect, it, vi } from 'vitest';
import { gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import { createScenarioProgress } from '../../src/scenario/engine';
import { isAffirmativeCombatAction } from '../../src/services/actionIntent';
import type { AiResponse, AtomicFact, EpisodicMemoryRecord, PersistedDMEvent, ProspectiveIntent } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

describe('gameReducer start opening message', () => {
  it('keeps the scenario opening compact while preserving the letter paragraph break', () => {
    const next = gameReducer(makeState(), {
      type: 'start',
      players: [makeInvestigator({ name: '亨利' })]
    });
    const opening = next.messages[0]?.text ?? '';

    expect(opening).toMatch(/^.+。雨夜的伦敦/);
    expect(opening).not.toContain('。\n\n雨夜的伦敦');
    expect(opening.match(/\n\n/g)).toHaveLength(1);
    expect(opening).toContain('\n\n信中写道');
  });

  it('keeps message ids unique when time and randomness are identical', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.01);
    let state = makeState();

    state = gameReducer(state, { type: 'appendMessage', message: { type: 'system', text: '第一条' } });
    state = gameReducer(state, { type: 'appendMessage', message: { type: 'system', text: '第二条' } });

    expect(new Set(state.messages.map((message) => message.id)).size).toBe(2);
    now.mockRestore();
    random.mockRestore();
  });
});

describe('gameReducer applyAiResponse pendingConsequences merge', () => {
  it('keeps authored soft escalation internal instead of adding a player-visible prompt', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' })] });
    state.messages = [];
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.idleTurns = 2;

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: { narrative: '雨声仍在窗外延续，你们暂时没有新的发现。' },
      raw: '{}'
    });

    expect(next.scenarioProgress?.idleTurns).toBe(3);
    expect(next.messages.some((message) => message.text.startsWith('推进提示'))).toBe(false);
    expect(next.messages.some((message) => message.type === 'dm')).toBe(true);
  });

  it('keeps original party actions on a pending check for dice continuation', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' })] });
    const continuationActions = [{ player: '亨利', action: '搜查书房' }];
    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        check: { player: '亨利', skill: '侦查', difficulty: '普通', continuationActions }
      },
      raw: '{}'
    });
    expect(next.pendingCheck?.continuationActions).toEqual(continuationActions);
  });

  it('prepares authored scenario checks with the investigator skill threshold', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }, { 聆听: 65 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '你们开始辨认非人的声调。',
        stateUpdate: { storyEventIds: ['EV_NEGOTIATION_LISTEN'] }
      },
      raw: '{}'
    });

    expect(next.pendingCheck).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_LISTEN',
      skillVal: 65,
      threshold: 65
    }));
  });

  it('uses the submitted actor for authored checks after the shared turn resets', () => {
    const state = makeState({
      players: [
        makeInvestigator({ name: '亨利' }, { 聆听: 40 }),
        makeInvestigator({ name: '艾达' }, { 聆听: 65 })
      ],
      currentScene: 'S05'
    });
    state.currentActorIndex = 0;
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '艾达开始辨认深潜者的声调。',
        stateUpdate: { storyEventIds: ['EV_NEGOTIATION_LISTEN'] }
      },
      raw: '{}',
      actorName: '艾达'
    });

    expect(next.pendingCheck).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_LISTEN',
      player: '艾达',
      skillVal: 65,
      threshold: 65
    }));
  });

  it('clears a resolved check instead of leaving the rolled request active', () => {
    const state = makeState({ players: [makeInvestigator({ name: '亨利' }, { 侦查: 60 })] });
    state.pendingCheck = {
      player: '亨利', skill: '侦查', difficulty: '普通', skillVal: 60, threshold: 60
    };

    const next = gameReducer(state, {
      type: 'applyDiceResult',
      result: { roll: 42, level: 'success', label: '普通成功（42）' }
    });

    expect(next.pendingCheck).toBeNull();
  });

  it('advances world time exactly once when a generic clue check settles through its continuation', () => {
    let state = makeState({
      players: [makeInvestigator({ name: '托马斯' }, { 侦查: 65 })],
      currentScene: 'S04'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.worldTime = '1920-07-13T19:20';
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';
    state.pendingCheck = {
      player: '托马斯', skill: '侦查', difficulty: '普通', skillVal: 65, threshold: 65
    };
    state.conversationHistory = [{ role: 'user', content: '搜查后厅油布包中的地图。' }];

    state = gameReducer(state, {
      type: 'applyDiceResult',
      result: { roll: 30, level: 'hard', label: '困难成功（30）' }
    });
    expect(state.scenarioProgress.worldTime).toBe('1920-07-13T19:20');

    state = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '地图标出了扶桑花号的位置。',
        stateUpdate: { storyEventIds: ['EV_S04_MAP'] }
      },
      raw: '{}',
      actorName: '托马斯'
    });

    expect(state.scenarioProgress.worldTime).toBe('1920-07-13T19:25');
    expect(state.scenarioProgress.firedEventIds).toContain('EV_S04_MAP');
    expect(state.scenarioProgress.knownFactIds).toContain('F09');
  });

  it('does not display an authored event cue twice when the narrator already says it verbatim', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 侦查: 50 })],
      currentScene: 'S04'
    });
    state.messages = [];
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'active';
    state.scenarioProgress.objectiveStates.O05 = 'active';
    const cue = '后厅油布包中的地图笔记标出了泰晤士港扶桑花号的位置。';

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: cue,
        stateUpdate: { storyEventIds: ['EV_S04_MAP'] }
      },
      raw: '{}',
      actorName: '艾达'
    });

    expect(next.messages.filter((message) => message.text === cue)).toHaveLength(1);
    expect(next.messages.find((message) => message.text === cue)?.type).toBe('dm');
  });

  it('keeps the authored follow-up check after a successful listening roll', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }, { 聆听: 65, 说服: 60 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';
    state.pendingCheck = {
      scenarioCheckId: 'CHECK_LISTEN', player: '亨利', skill: '聆听', difficulty: '普通', skillVal: 65, threshold: 65
    };

    const next = gameReducer(state, {
      type: 'applyDiceResult',
      result: { roll: 30, level: 'hard', label: '困难成功（30）' }
    });

    expect(next.pendingCheck).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_PERSUADE',
      skill: '说服',
      threshold: 30
    }));
    expect(next.scenarioProgress?.endingId).toBeNull();
  });

  it('refreshes stale pre-finale choices after the combat route settles', () => {
    const player = makeInvestigator({ id: 'p-robert', name: '罗伯特' });
    const state = makeState({ players: [player], currentScene: 'S05' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.suggestionsByPlayerId = {
      'p-robert': ['沿防波堤观察甲板', '从舷梯登船寻找管事', '在码头隐蔽观察']
    };
    state.suggestions = state.suggestionsByPlayerId['p-robert'];

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '调查员以武力阻止深潜者。',
        playerChoices: {},
        stateUpdate: { storyEventIds: ['EV_CHOOSE_COMBAT'] }
      },
      raw: '{}'
    });

    expect(next.scenarioProgress?.variables.finaleRoute).toBe('combat');
    expect(next.suggestionsByPlayerId['p-robert']).toHaveLength(3);
    expect(next.suggestionsByPlayerId['p-robert'].every(isAffirmativeCombatAction)).toBe(true);
  });

  it('turns a failed authored listen into an extreme persuasion check without AI continuation', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 聆听: 65, 说服: 60 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';
    state.pendingCheck = {
      scenarioCheckId: 'CHECK_LISTEN', player: '艾达', skill: '聆听', difficulty: '普通', skillVal: 65, threshold: 65
    };

    const next = gameReducer(state, {
      type: 'applyDiceResult',
      result: { roll: 89, level: 'fail', label: '失败（89）' }
    });

    expect(next.pendingCheck).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_PERSUADE',
      player: '艾达',
      difficulty: '极难',
      threshold: 12
    }));
    expect(next.messages.some((message) => message.text.includes('难度提高为极难'))).toBe(true);
  });

  it('moves every investigator location when together-mode scene state changes', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const state = makeState({
      players: [henry, ada], currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒'
    });
    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: { narrative: '你们抵达药店。', stateUpdate: { sceneChange: 'S04' } },
      raw: '{}'
    });

    expect(next.currentScene).toBe('S04');
    expect(next.playerLocations).toEqual({ 'p-henry': 'S04', 'p-ada': 'S04' });
    expect(next.activeNpcName).toBeNull();
  });

  it('stores player-specific choices by player id without collapsing them into global suggestions', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const state = makeState({ players: [henry, ada] });
    const response: AiResponse = {
      narrative: '你们暂时分工调查。',
      playerChoices: {
        亨利: ['检查书桌暗格', '比对便签笔迹', '询问伊莎贝拉父亲习惯'],
        艾达: ['观察窗外动静', '安抚伊莎贝拉', '留意楼上脚步声']
      }
    };

    const next = gameReducer(state, { type: 'applyAiResponse', response, raw: '{}' });

    expect(next.suggestionsByPlayerId).toEqual({
      'p-henry': ['检查书桌暗格', '比对便签笔迹', '询问伊莎贝拉父亲习惯'],
      'p-ada': ['观察窗外动静', '安抚伊莎贝拉', '留意楼上脚步声']
    });
    expect(next.suggestions).toEqual(['检查书桌暗格', '比对便签笔迹', '询问伊莎贝拉父亲习惯']);
  });

  it('keeps nextPrompt out of player-visible messages while retaining raw DM record', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })]
    });
    const raw = JSON.stringify({
      narrative: '雾中传来远处的脚步声。',
      activeNpc: null,
      nextPrompt: '你们可以继续调查码头或返回灯塔。',
      playerChoices: ['调查码头', '返回灯塔', '呼喊同伴']
    });
    const response: AiResponse = {
      narrative: '雾中传来远处的脚步声。',
      activeNpc: null,
      nextPrompt: '你们可以继续调查码头或返回灯塔。',
      playerChoices: ['调查码头', '返回灯塔', '呼喊同伴']
    };

    const next = gameReducer(state, { type: 'applyAiResponse', response, raw });

    expect(next.messages).toEqual([
      expect.objectContaining({
        type: 'dm',
        text: '雾中传来远处的脚步声。'
      })
    ]);
    expect(next.messages.some((message) => message.text === response.nextPrompt)).toBe(false);
    expect(next.conversationHistory).toEqual([{ role: 'assistant', content: raw }]);
    expect(next.suggestions).toEqual(['调查码头', '返回灯塔', '呼喊同伴']);
  });

  it('decays existing pending and removes triggered ones; appends fresh scheduled', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      pendingConsequences: [
        {
          id: 'thugs',
          description: '暴徒',
          remainingTurns: 1,
          triggerEvent: '袭击',
          scheduledAtTurn: 0
        },
        {
          id: 'storm',
          description: '风暴',
          remainingTurns: 4,
          triggerEvent: '断电',
          scheduledAtTurn: 0
        }
      ]
    });

    const response: AiResponse = {
      narrative: '事件推进',
      stateUpdate: {
        triggeredConsequenceIds: ['thugs'],
        scheduledConsequences: [
          {
            id: 'fog',
            description: '浓雾',
            remainingTurns: 2,
            triggerEvent: '能见度归零',
            scheduledAtTurn: 5
          }
        ]
      }
    };

    const next = gameReducer(state, { type: 'applyAiResponse', response, raw: '{}' });
    const ids = (next.pendingConsequences ?? []).map((p) => p.id).sort();
    expect(ids).toEqual(['fog', 'storm']);
    const storm = next.pendingConsequences!.find((p) => p.id === 'storm')!;
    expect(storm.remainingTurns).toBe(3); // decayed by 1
    const fog = next.pendingConsequences!.find((p) => p.id === 'fog')!;
    expect(fog.remainingTurns).toBe(2);
  });

  it('same-id scheduled overwrites the decayed copy', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' })],
      pendingConsequences: [
        {
          id: 'thugs',
          description: 'old',
          remainingTurns: 4,
          triggerEvent: 'old-trigger',
          scheduledAtTurn: 0
        }
      ]
    });

    const response: AiResponse = {
      narrative: 'reschedule',
      stateUpdate: {
        scheduledConsequences: [
          {
            id: 'thugs',
            description: 'new',
            remainingTurns: 1,
            triggerEvent: 'new-trigger',
            scheduledAtTurn: 5
          }
        ]
      }
    };

    const next = gameReducer(state, { type: 'applyAiResponse', response, raw: '{}' });
    expect(next.pendingConsequences).toHaveLength(1);
    expect(next.pendingConsequences![0].description).toBe('new');
    expect(next.pendingConsequences![0].remainingTurns).toBe(1);
  });
});

describe('gameReducer appendEvents', () => {
  it('appends events and caps eventLog at 200', () => {
    const startEvents: PersistedDMEvent[] = Array.from({ length: 195 }, (_, i) => ({
      id: `e-${i}`,
      turn: i,
      kind: 'narrative',
      description: `n${i}`
    }));
    const state = makeState({ eventLog: startEvents });
    const incoming: PersistedDMEvent[] = Array.from({ length: 10 }, (_, i) => ({
      id: `n-${i}`,
      turn: 200 + i,
      kind: 'narrative',
      description: `m${i}`
    }));
    const next = gameReducer(state, { type: 'appendEvents', events: incoming });
    expect(next.eventLog).toHaveLength(200);
    // Tail of new should be present
    expect(next.eventLog![next.eventLog!.length - 1].id).toBe('n-9');
    // Earliest five should have been dropped
    expect(next.eventLog!.find((e) => e.id === 'e-0')).toBeUndefined();
  });

  it('returns original state when events is empty', () => {
    const state = makeState({ eventLog: [{ id: 'a', turn: 0, kind: 'narrative', description: 'x' }] });
    const next = gameReducer(state, { type: 'appendEvents', events: [] });
    expect(next).toBe(state);
  });
});

describe('gameReducer action log retention', () => {
  it('keeps a 100-turn play session instead of truncating at 40 entries', () => {
    let state = makeState();
    for (let index = 0; index < 100; index += 1) {
      state = gameReducer(state, { type: 'addLog', text: `turn-${index}` });
    }
    expect(state.actionLog).toHaveLength(100);
    expect(state.actionLog[0].text).toBe('turn-99');
    expect(state.actionLog[99].text).toBe('turn-0');
  });
});

describe('gameReducer consolidateMemory', () => {
  it('preserves conversation history appended after the summarized source snapshot', () => {
    const baseHistory = [
      { role: 'user' as const, content: 'old user' },
      { role: 'assistant' as const, content: 'old dm' }
    ];
    const suffix = [
      { role: 'user' as const, content: 'current user' },
      { role: 'assistant' as const, content: 'current dm' }
    ];
    const state = makeState({
      conversationHistory: [...baseHistory, ...suffix]
    });

    const next = gameReducer(state, {
      type: 'consolidateMemory',
      summary: 'summarized old turns',
      summarizedUntilIndex: 0,
      remainingHistory: [{ role: 'assistant', content: 'kept recent old dm' }],
      sourceHistoryLength: baseHistory.length
    });

    expect(next.longTermMemorySummary).toBe('summarized old turns');
    expect(next.conversationHistory).toEqual([
      { role: 'assistant', content: 'kept recent old dm' },
      ...suffix
    ]);
  });
});

describe('gameReducer actor selection', () => {
  it('does not let together-mode actor clicks skip the sequential action order', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })]
    });

    const next = gameReducer(state, { type: 'setCurrentActor', index: 1 });

    expect(next.currentActorIndex).toBe(0);
  });
});

describe('gameReducer scene focus synchronization', () => {
  it('updates chapter scene, resident NPC, and all together-mode locations on a scene change', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const state = makeState({
      players: [henry, ada],
      currentScene: 'S01',
      activeNpcName: '伊莎贝拉·摩勒'
    });

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '你们抵达上城区第二分局。',
        activeNpc: null,
        stateUpdate: { sceneChange: 'S02' }
      },
      raw: '{}'
    });

    expect(next.currentScene).toBe('S02');
    expect(next.activeNpcId).toBe('N03');
    expect(next.activeNpcName).toBe('洛夫·蒙特利尔');
    expect(next.playerLocations).toEqual({ 'p-henry': 'S02', 'p-ada': 'S02' });
  });

  it('settles a source-scene story event before applying the paired scene change', () => {
    const state = makeState({ currentScene: 'S02', activeNpcName: '洛夫·蒙特利尔' });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B03 = 'active';
    state.scenarioProgress.beatStates.B04 = 'active';
    state.scenarioProgress.objectiveStates.O03 = 'active';
    state.scenarioProgress.objectiveStates.O04 = 'active';
    state.scenarioProgress.variables.oldHethLead = true;

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '蒙特利尔冷淡地结束会面，你们随后抵达老赫特酒吧。',
        stateUpdate: { sceneChange: 'S03', storyEventIds: ['EV_MEET_MONTREAL'] }
      },
      raw: '{}'
    });

    expect(next.currentScene).toBe('S03');
    expect(next.activeNpcName).toBe('老赫特之家酒保');
    expect(next.scenarioProgress?.beatStates.B03).toBe('completed');
    expect(next.scenarioProgress?.objectiveStates.O03).toBe('completed');
    expect(next.scenarioProgress?.variables.metMontreal).toBe(true);
  });

  it('keeps explicit null meaningful when the scene did not change', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: { narrative: '房间里暂时无人说话。', activeNpc: null },
      raw: '{}'
    });

    expect(next.activeNpcName).toBeNull();
  });

  it('keeps the resident NPC focused when the narration still shows them reacting', () => {
    const state = makeState({ currentScene: 'S01', activeNpcName: '伊莎贝拉·摩勒' });

    const next = gameReducer(state, {
      type: 'applyAiResponse',
      response: {
        narrative: '伊莎贝拉皱着眉望向书房门口。',
        activeNpc: null
      },
      raw: '{}'
    });

    expect(next.activeNpcId).toBe('N01');
    expect(next.activeNpcName).toBe('伊莎贝拉·摩勒');
  });

  it('moves the visible stage with the selected investigator in split mode', () => {
    const henry = makeInvestigator({ id: 'p-henry', name: '亨利' });
    const ada = makeInvestigator({ id: 'p-ada', name: '艾达' });
    const state = makeState({
      players: [henry, ada],
      currentScene: 'S01',
      activeNpcName: '伊莎贝拉·摩勒'
    });
    state.exploreMode = 'split';
    state.playerLocations = { 'p-henry': 'S01', 'p-ada': 'S03' };

    const moved = gameReducer(state, { type: 'setPlayerScene', playerIndex: 0, sceneId: 'S02' });
    expect(moved.currentScene).toBe('S02');
    expect(moved.activeNpcId).toBe('N03');
    expect(moved.activeNpcName).toBe('洛夫·蒙特利尔');

    const switched = gameReducer(moved, { type: 'setCurrentSplitPlayer', index: 1 });
    expect(switched.currentScene).toBe('S03');
    expect(switched.activeNpcId).toBe('N04');
    expect(switched.activeNpcName).toBe('老赫特之家酒保');
  });
});

describe('gameReducer hydrateGameState v2 saves remain compatible', () => {
  it('clears an old generic check that intercepted authored booklet analysis', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '托马斯' }, { 侦查: 65 })],
      currentScene: 'S01'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'active';
    state.scenarioProgress.clueStates.I04 = 'discovered';
    state.clues = [{ id: 'I04', name: '小册子', description: '', discoveredAt: 1 }];
    state.pendingCheck = {
      player: '托马斯', skill: '侦查', difficulty: '普通', skillVal: 65, threshold: 65,
      continuationActions: [{ player: '托马斯', action: '检查小册子夹页并谨慎加热，使隐写显字。' }]
    };

    const hydrated = hydrateGameState(state);

    expect(hydrated.pendingCheck).toBeNull();
  });

  it('repairs an old generic finale persuasion check into the authored listen step', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '艾达' }, { 聆听: 65, 说服: 60 })],
      currentScene: 'S05'
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed';
    state.scenarioProgress.beatStates.B02 = 'completed';
    state.scenarioProgress.beatStates.B05 = 'completed';
    state.scenarioProgress.beatStates.B06 = 'active';
    state.scenarioProgress.objectiveStates.O08 = 'active';
    state.scenarioProgress.variables.finaleRoute = 'negotiation';
    state.pendingCheck = {
      player: '艾达', skill: '说服', difficulty: '普通', skillVal: 60, threshold: 60
    };

    const hydrated = hydrateGameState(state);

    expect(hydrated.pendingCheck).toEqual(expect.objectContaining({
      scenarioCheckId: 'CHECK_LISTEN',
      player: '艾达',
      skill: '聆听',
      difficulty: '普通',
      skillVal: 65,
      threshold: 65
    }));
  });

  it('repairs legacy split saves whose visible scene lagged behind the selected player location', () => {
    const hydrated = hydrateGameState({
      players: [
        { id: 'p1', name: '亨利', attrs: {}, hp: 12, mp: 12, san: 60, luck: 50, currentHp: 12, currentMp: 12, currentSan: 60, skills: {} },
        { id: 'p2', name: '艾达', attrs: {}, hp: 12, mp: 12, san: 60, luck: 50, currentHp: 12, currentMp: 12, currentSan: 60, skills: {} }
      ],
      exploreMode: 'split',
      currentSplitPlayer: 1,
      currentScene: 'S01',
      activeNpcName: null,
      playerLocations: { p1: 'S02', p2: 'S03' },
      flags: {},
      conversationHistory: []
    });

    expect(hydrated.currentScene).toBe('S03');
    expect(hydrated.activeNpcId).toBe('N04');
    expect(hydrated.activeNpcName).toBe('老赫特之家酒保');
    expect(hydrated.playerLocations).toEqual({ p1: 'S02', p2: 'S03' });
  });

  it('drops legacy player-visible progression prompts from saved messages', () => {
    const hydrated = hydrateGameState({
      players: [makeInvestigator({ id: 'p1', name: '亨利' })],
      messages: [
        { id: 'internal-hint', type: 'system', text: '推进提示：检查书桌抽屉。' },
        { id: 'dice-result', type: 'system', text: '检定结果：普通成功（42）' }
      ]
    });

    expect(hydrated.messages.some((message) => message.text.startsWith('推进提示'))).toBe(false);
    expect(hydrated.messages.some((message) => message.text.startsWith('检定结果'))).toBe(true);
  });

  it('removes withdrawn pharmacy-map and ambush UI records from a migrated live save', () => {
    const progress = createScenarioProgress();
    progress.moduleVersion = '1.1.5';
    progress.contentHash = '4d651496e9200891';
    progress.activeActId = 'A03';
    progress.beatStates.B01 = 'completed';
    progress.beatStates.B02 = 'completed';
    progress.beatStates.B05 = 'completed';
    progress.beatStates.B06 = 'active';
    progress.objectiveStates.O05 = 'completed';
    progress.objectiveStates.O06 = 'active';
    progress.clueStates.I07 = 'analyzed';
    progress.knownFactIds.push('F09');
    progress.firedEventIds.push('EV_S04_MAP', 'EV_S04_THUGS');
    progress.encounters.ENC02.state = 'active';
    progress.visitedSceneIds.push('S04');
    const hydrated = hydrateGameState({
      players: [makeInvestigator({ id: 'p1', name: '托马斯' })],
      currentScene: 'S04',
      scenarioProgress: progress,
      clues: ['I07'],
      messages: [
        { id: 'player', type: 'player', text: '抵达药店后先确认现场。', playerName: '托马斯' },
        { id: 'map', type: 'system', text: '后厅油布包中的地图笔记标出了泰晤士港扶桑花号的位置。' },
        { id: 'ambush', type: 'dm', text: '三个黑影堵住去路。（战斗阶段开始）' }
      ],
      conversationHistory: [
        { role: 'user', content: '抵达药店后先确认现场。' },
        { role: 'assistant', content: '{"narrative":"三个黑影堵住去路。（战斗阶段开始）"}' }
      ],
      suggestions: ['抓起杂物作为防身武器'],
      actionLog: [{ time: '19:20', text: '剧情事件：EV_S04_MAP' }],
      longTermMemorySummary: '已经找到地图并进入战斗。',
      prospectiveIntents: [{ id: 'fight', description: '继续战斗', dueTurn: 10, createdTurn: 9, ttl: 2 }]
    });

    expect(hydrated.clues.map((clue) => clue.id)).not.toContain('I07');
    expect(hydrated.messages.map((message) => message.id)).toEqual(['player']);
    expect(hydrated.conversationHistory).toEqual([{ role: 'user', content: '抵达药店后先确认现场。' }]);
    expect(hydrated.suggestions).toContain('搜查后厅油布包，寻找并检查潮湿的地图笔记');
    expect(hydrated.actionLog.some((entry) => entry.text.includes('EV_S04_MAP'))).toBe(false);
    expect(hydrated.longTermMemorySummary).toBe('');
    expect(hydrated.summarizedUntilIndex).toBe(0);
    expect(hydrated.prospectiveIntents).toEqual([]);
  });

  it('does not repeat pharmacy cleanup after reaching the finale and repairs stale suggestions', () => {
    const progress = createScenarioProgress();
    progress.activeActId = 'A03';
    progress.beatStates.B01 = 'completed';
    progress.beatStates.B02 = 'completed';
    progress.beatStates.B05 = 'completed';
    progress.beatStates.B06 = 'active';
    progress.objectiveStates.O05 = 'completed';
    progress.objectiveStates.O06 = 'completed';
    progress.objectiveStates.O07 = 'active';
    progress.clueStates.I07 = 'analyzed';
    progress.knownFactIds.push('F09');
    progress.firedEventIds.push('EV_S04_MAP', 'EV_CHOOSE_COMBAT');
    progress.variables.finaleRoute = 'combat';
    progress.encounters.ENC01.state = 'active';
    progress.visitedSceneIds.push('S04', 'S05');
    progress.migrationLog.push('1.1.6：撤回旧版进入药店时自动授予的地图，保留现场并恢复为可调查状态。');

    const hydrated = hydrateGameState({
      players: [makeInvestigator({ id: 'p1', name: '托马斯' })],
      currentScene: 'S05',
      scenarioProgress: progress,
      clues: ['I07'],
      messages: [{
        id: 'map', type: 'system', text: '后厅油布包中的地图笔记标出了泰晤士港扶桑花号的位置。'
      }],
      suggestions: [
        '搜查后厅油布包，寻找并检查潮湿的地图笔记',
        '检查柜台附近是否留下雪茄或其他痕迹',
        '观察浓雾与后门附近的撤离痕迹'
      ],
      longTermMemorySummary: '调查员已经抵达扶桑花号并选择战斗。'
    });

    expect(hydrated.clues.map((clue) => clue.id)).toContain('I07');
    expect(hydrated.messages.map((message) => message.id)).toContain('map');
    expect(hydrated.suggestions.every((suggestion) => suggestion.includes('深潜者'))).toBe(true);
    expect(hydrated.suggestions.some((suggestion) => suggestion.includes('后厅油布包'))).toBe(false);
    expect(hydrated.longTermMemorySummary).toBe('调查员已经抵达扶桑花号并选择战斗。');
  });

  it('repairs persisted finale suggestions that describe an attack opportunity without attacking', () => {
    const progress = createScenarioProgress();
    progress.activeActId = 'A03';
    progress.beatStates.B06 = 'active';
    progress.variables.finaleRoute = 'combat';
    progress.encounters.ENC01.state = 'active';
    progress.visitedSceneIds.push('S05');

    const hydrated = hydrateGameState({
      players: [makeInvestigator({ id: 'p1', name: '罗伯特' })],
      currentScene: 'S05',
      scenarioProgress: progress,
      suggestionsByPlayerId: {
        p1: [
          '攻击一名仍在抵抗的深潜者，为营救埃里克争取时间',
          '配合同伴牵制深潜者，并寻找下一次攻击机会',
          '观察甲板混战后选择一名仍在抵抗的深潜者发动攻击'
        ]
      }
    });

    expect(hydrated.suggestionsByPlayerId.p1).not.toContain(
      '配合同伴牵制深潜者，并寻找下一次攻击机会'
    );
    expect(hydrated.suggestionsByPlayerId.p1).toHaveLength(3);
    expect(hydrated.suggestionsByPlayerId.p1.every((suggestion) =>
      /攻击|制服/.test(suggestion)
    )).toBe(true);
  });

  it('repairs an offstage active NPC to match the persisted scene', () => {
    const hydrated = hydrateGameState({
      players: [makeInvestigator({ id: 'p1', name: '亨利' })],
      currentScene: 'S02',
      activeNpcId: 'N01',
      activeNpcName: '伊莎贝拉·摩勒'
    });

    expect(hydrated.activeNpcId).toBe('N03');
    expect(hydrated.activeNpcName).toBe('洛夫·蒙特利尔');
  });

  it('hydrates valid narrative keywords and drops malformed hints', () => {
    const hydrated = hydrateGameState({
      players: [],
      messages: [{
        id: 'rich-message',
        type: 'dm',
        text: '水里的东西正在接近。',
        keywords: [
          { text: '水里的东西', kind: 'clue' },
          { text: '并不存在', kind: 'danger' },
          { text: '<b>', kind: 'state' }
        ]
      }]
    });

    expect(hydrated.messages[0].keywords).toEqual([{ text: '水里的东西', kind: 'clue' }]);
  });

  it('hydrates a save without eventLog/pendingConsequences with empty arrays', () => {
    const stateLikeV2 = {
      players: [
        {
          id: 'p1',
          name: '亨利',
          attrs: {},
          hp: 12,
          mp: 12,
          san: 60,
          luck: 50,
          currentHp: 12,
          currentMp: 12,
          currentSan: 60,
          skills: {}
        }
      ],
      currentScene: 'S01',
      flags: {},
      conversationHistory: []
    };
    const hydrated = hydrateGameState(stateLikeV2);
    expect(hydrated.eventLog).toEqual([]);
    expect(hydrated.pendingConsequences).toEqual([]);
  });

  it('hydrates a save with malformed pendingConsequences entries by dropping invalid ones', () => {
    const stateLikeV3 = {
      players: [
        {
          id: 'p1',
          name: '亨利',
          attrs: {},
          hp: 12,
          mp: 12,
          san: 60,
          luck: 50,
          currentHp: 12,
          currentMp: 12,
          currentSan: 60,
          skills: {}
        }
      ],
      currentScene: 'S01',
      flags: {},
      conversationHistory: [],
      pendingConsequences: [
        { id: 'good', description: 'd', triggerEvent: 't', remainingTurns: 2, scheduledAtTurn: 0 },
        { id: 'good', description: 'duplicate', triggerEvent: 't', remainingTurns: 1, scheduledAtTurn: 0 },
        { description: 'no id', triggerEvent: 't', remainingTurns: 1, scheduledAtTurn: 0 },
        { id: 'badnums', description: 'd', triggerEvent: 't', remainingTurns: 'NaN', scheduledAtTurn: 0 }
      ]
    };
    const hydrated = hydrateGameState(stateLikeV3);
    expect(hydrated.pendingConsequences).toHaveLength(1);
    expect(hydrated.pendingConsequences![0].id).toBe('good');
  });

  it('hydrates npcMindModels using the map key as the canonical npcId', () => {
    const hydrated = hydrateGameState({
      players: [
        {
          id: 'p1',
          name: '亨利',
          attrs: {},
          hp: 12,
          mp: 12,
          san: 60,
          luck: 50,
          currentHp: 12,
          currentMp: 12,
          currentSan: 60,
          skills: {}
        }
      ],
      currentScene: 'S01',
      flags: {},
      conversationHistory: [],
      npcMindModels: {
        '伊莎贝拉·摩勒': {
          npcId: '错误嵌套值',
          coreMotivation: '找回父亲',
          currentStance: '谨慎合作',
          stanceHistoryFactIds: ['f_1_0'],
          lastUpdatedTurn: 1
        }
      }
    });

    expect(hydrated.npcMindModels?.['伊莎贝拉·摩勒'].npcId).toBe('伊莎贝拉·摩勒');
  });
});

describe('gameReducer cognitive memory actions', () => {
  it('deduplicates appended facts and links stance facts into NPC history', () => {
    const state = makeState();
    state.atomicFacts = [
      {
        id: 'f_1_0',
        turn: 1,
        actor: '伊莎贝拉·摩勒',
        predicate: 'stance_toward',
        target: '亨利',
        value: '警惕',
        source: 'system1'
      }
    ];
    state.npcMindModels = {
      '伊莎贝拉·摩勒': {
        npcId: '伊莎贝拉·摩勒',
        coreMotivation: '寻找父亲',
        currentStance: '谨慎合作',
        stanceHistoryFactIds: ['f_1_0'],
        lastUpdatedTurn: 1
      }
    };
    const incoming: AtomicFact[] = [
      state.atomicFacts[0],
      {
        id: 'f_2_0',
        turn: 2,
        actor: '伊莎贝拉·摩勒',
        predicate: 'stance_toward',
        target: '亨利',
        value: '信任',
        supersedes: 'f_1_0',
        source: 'system1'
      },
      {
        id: 'f_2_1',
        turn: 2,
        actor: '伊莎贝拉·摩勒',
        predicate: 'knowledge',
        value: '知道父亲书房异常',
        source: 'system1'
      }
    ];

    const next = gameReducer(state, { type: 'appendFacts', facts: incoming });

    expect(next.atomicFacts?.map((f) => f.id)).toEqual(['f_1_0', 'f_2_0', 'f_2_1']);
    expect(next.npcMindModels?.['伊莎贝拉·摩勒'].stanceHistoryFactIds).toEqual([
      'f_1_0',
      'f_2_0'
    ]);
    expect(next.npcMindModels?.['伊莎贝拉·摩勒'].lastUpdatedTurn).toBe(2);
  });

  it('adds and decays prospective intents without decaying newly added ones first', () => {
    const state = makeState();
    state.prospectiveIntents = [
      {
        id: 'i_old',
        owner: 'world',
        predictedAction: '雾气变浓',
        triggerCondition: '下一轮',
        ttl: 1,
        createdTurn: 1
      }
    ];
    const incoming: ProspectiveIntent[] = [
      {
        id: 'i_new',
        owner: '伊莎贝拉·摩勒',
        predictedAction: '主动交出信件',
        triggerCondition: '调查员继续追问',
        ttl: 6,
        createdTurn: 2
      }
    ];

    const decayed = gameReducer(state, { type: 'decayProspectiveIntents' });
    const next = gameReducer(decayed, { type: 'addProspectiveIntents', intents: incoming });

    expect(next.prospectiveIntents).toEqual(incoming);
  });
});

describe('gameReducer episodic memory actions', () => {
  function episode(id: string, turn: number): EpisodicMemoryRecord {
    return {
      id,
      turn,
      sceneId: 'S01',
      text: `episode ${id}`,
      playerNames: ['亨利'],
      entityIds: ['伊莎贝拉·摩勒'],
      tags: ['test'],
      source: 'episode',
      visibility: 'dm',
      importance: 1
    };
  }

  it('hydrates episodicMemory and drops malformed entries', () => {
    const hydrated = hydrateGameState({
      players: [
        {
          id: 'p1',
          name: '亨利',
          attrs: {},
          hp: 12,
          mp: 12,
          san: 60,
          luck: 50,
          currentHp: 12,
          currentMp: 12,
          currentSan: 60,
          skills: {}
        }
      ],
      currentScene: 'S01',
      flags: {},
      conversationHistory: [],
      episodicMemory: [
        episode('em_1', 1),
        episode('em_1', 2),
        { id: 'bad', turn: 2, playerNames: [] }
      ]
    });

    expect(hydrated.episodicMemory?.map((m) => m.id)).toEqual(['em_1']);
  });

  it('appends episodic memory, deduplicates by id, and caps at 300 records', () => {
    const state = makeState();
    state.episodicMemory = Array.from({ length: 299 }, (_, i) => episode(`em_${i}`, i));

    const next = gameReducer(state, {
      type: 'appendEpisodicMemory',
      records: [episode('em_298', 298), episode('em_new_a', 300), episode('em_new_b', 301)]
    });

    expect(next.episodicMemory).toHaveLength(300);
    expect(next.episodicMemory?.[0].id).toBe('em_1');
    expect(next.episodicMemory?.at(-2)?.id).toBe('em_new_a');
    expect(next.episodicMemory?.at(-1)?.id).toBe('em_new_b');
  });
});
