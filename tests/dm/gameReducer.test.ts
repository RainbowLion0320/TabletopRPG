import { describe, expect, it } from 'vitest';
import { gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import type { AiResponse, AtomicFact, EpisodicMemoryRecord, PersistedDMEvent, ProspectiveIntent } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

describe('gameReducer applyAiResponse pendingConsequences merge', () => {
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

describe('gameReducer actor selection', () => {
  it('does not let together-mode actor clicks skip the sequential action order', () => {
    const state = makeState({
      players: [makeInvestigator({ name: '亨利' }), makeInvestigator({ name: '艾达' })]
    });

    const next = gameReducer(state, { type: 'setCurrentActor', index: 1 });

    expect(next.currentActorIndex).toBe(0);
  });
});

describe('gameReducer hydrateGameState v2 saves remain compatible', () => {
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
