import { describe, expect, it } from 'vitest';
import { gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import type { AiResponse, PersistedDMEvent } from '../../src/types/game';
import { makeInvestigator, makeState } from './fixtures';

describe('gameReducer applyAiResponse pendingConsequences merge', () => {
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
});
