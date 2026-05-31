import { describe, expect, it } from 'vitest';
import {
  buildEpisodicMemoryRecord,
  searchEpisodicMemory,
  shouldRetrieveEpisodicMemory
} from '../../src/dm/memory/episodicMemory';
import type { EpisodicMemoryRecord } from '../../src/types/game';

function record(partial: Partial<EpisodicMemoryRecord> & { id: string; text: string; turn: number }): EpisodicMemoryRecord {
  return {
    id: partial.id,
    turn: partial.turn,
    sceneId: partial.sceneId ?? 'S01',
    text: partial.text,
    playerNames: partial.playerNames ?? [],
    entityIds: partial.entityIds ?? [],
    tags: partial.tags ?? [],
    source: partial.source ?? 'episode',
    visibility: partial.visibility ?? 'dm',
    importance: partial.importance ?? 1
  };
}

describe('episodicMemory retrieval', () => {
  it('detects retrieval-worthy historical and social/research actions', () => {
    expect(shouldRetrieveEpisodicMemory('observe', [{ player: '亨利', action: '我看看窗户' }])).toBe(false);
    expect(shouldRetrieveEpisodicMemory('social', [{ player: '亨利', action: '我询问伊莎贝拉' }])).toBe(true);
    expect(shouldRetrieveEpisodicMemory('observe', [{ player: '亨利', action: '我回忆上次她答应过什么' }])).toBe(true);
    expect(shouldRetrieveEpisodicMemory('research', [{ player: '艾达', action: '查阅旧报纸' }])).toBe(true);
  });

  it('ranks by query overlap, metadata, importance, and excludes current/future turns', () => {
    const records = [
      record({
        id: 'old-social',
        turn: 2,
        sceneId: 'S01',
        text: '伊莎贝拉曾答应亨利，如果他继续帮助寻找父亲，她会交出父亲的私人信件。',
        playerNames: ['亨利'],
        entityIds: ['伊莎贝拉·摩勒'],
        tags: ['承诺'],
        importance: 3
      }),
      record({
        id: 'wrong-scene',
        turn: 3,
        sceneId: 'S03',
        text: '酒保提到码头附近有人盯梢。',
        playerNames: ['亨利'],
        entityIds: ['老赫特之家酒保'],
        importance: 2
      }),
      record({
        id: 'future',
        turn: 9,
        sceneId: 'S01',
        text: '伊莎贝拉未来才说出的内容，不应被召回。',
        playerNames: ['亨利'],
        entityIds: ['伊莎贝拉·摩勒'],
        importance: 10
      })
    ];

    const results = searchEpisodicMemory(records, {
      query: '伊莎贝拉 上次 答应 亨利 信件',
      sceneId: 'S01',
      entityIds: ['伊莎贝拉·摩勒'],
      playerNames: ['亨利'],
      maxTurnExclusive: 9,
      limit: 3
    });

    expect(results.map((r) => r.record.id)).toEqual(['old-social']);
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].reasons).toEqual(expect.arrayContaining(['entity', 'player', 'scene']));
  });

  it('builds compact episode records from one resolved DM turn', () => {
    const built = buildEpisodicMemoryRecord({
      turn: 4,
      sceneId: 'S01',
      actions: [{ player: '亨利', action: '安抚伊莎贝拉并询问信件' }],
      narrative: '伊莎贝拉的语气软化，答应交出父亲留下的信件。',
      events: [{ id: 'evt-4-narr', turn: 4, kind: 'narrative', description: '叙事推进' }],
      facts: [
        {
          id: 'f_4_0',
          turn: 4,
          actor: '伊莎贝拉·摩勒',
          predicate: 'stance_toward',
          target: '亨利',
          value: '信任',
          source: 'system1'
        }
      ],
      activeNpcName: '伊莎贝拉·摩勒'
    });

    expect(built).toEqual(expect.objectContaining({
      turn: 4,
      sceneId: 'S01',
      playerNames: ['亨利'],
      entityIds: ['伊莎贝拉·摩勒'],
      source: 'episode',
      visibility: 'dm'
    }));
    expect(built?.id).toMatch(/^em_4_/);
    expect(built?.text).toContain('玩家行动');
    expect(built?.text).toContain('伊莎贝拉');
    expect(built?.tags).toEqual(expect.arrayContaining(['narrative', 'stance_toward']));
  });
});
