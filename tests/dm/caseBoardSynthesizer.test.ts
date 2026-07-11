import { afterEach, describe, expect, it, vi } from 'vitest';
import { synthesizeCaseBoardPatch } from '../../src/dm/caseBoardSynthesizer';
import type { ApiConfig, AtomicFact, PersistedDMEvent } from '../../src/types/game';

const config: ApiConfig = {
  provider: 'openai',
  protocol: 'responses',
  apiKey: 'unit-test-key',
  model: 'unit-test-model',
  endpoint: 'https://unit.test/v1'
};

function response(body: unknown): Response {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(JSON.stringify({ output_text: content }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function narrativeEvent(description: string): PersistedDMEvent {
  return { id: 'evt-1-narr', turn: 1, kind: 'narrative', description };
}

function fact(value: string): AtomicFact {
  return {
    id: 'f_1_0',
    turn: 1,
    actor: 'world',
    predicate: 'state',
    value,
    source: 'system1'
  };
}

function input(overrides: Partial<Parameters<typeof synthesizeCaseBoardPatch>[1]> = {}) {
  const event = narrativeEvent('门廊留下了新鲜拖拽刮痕');
  return {
    turn: 1,
    narrative: event.description,
    playerActions: [{ player: '亨利', action: '检查门廊' }],
    facts: [],
    newFacts: [],
    events: [event],
    clues: [],
    newClueIds: [],
    existingBoard: { nodes: [], edges: [] },
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('caseBoardSynthesizer fallback', () => {
  it('creates a source-anchored card from a new fact when AI returns an empty patch', async () => {
    const newFact = fact('门廊留有拖拽重物的刮痕');
    vi.stubGlobal('fetch', vi.fn(async () => response({ nodes: [], edges: [] })));

    const patch = await synthesizeCaseBoardPatch(config, input({
      facts: [newFact],
      newFacts: [newFact]
    }));

    expect(patch).toEqual({
      nodes: [expect.objectContaining({
        id: 'ai-fact-f_1_0',
        title: '门廊留有拖拽重物的刮痕',
        certainty: 'confirmed',
        sourceFactIds: ['f_1_0']
      })],
      edges: []
    });
  });

  it('uses a high-signal narrative event when fact extraction produced nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ nodes: [], edges: [] })));
    const narrative = '伊莎贝拉提到地下室昨晚传来闷响。她对此显得十分不安。';

    const patch = await synthesizeCaseBoardPatch(config, input({
      narrative,
      events: [narrativeEvent(narrative)]
    }));

    expect(patch.nodes).toEqual([
      expect.objectContaining({
        id: 'ai-event-evt-1-narr',
        title: '伊莎贝拉提到地下室昨晚传来闷响',
        sourceEventIds: ['evt-1-narr']
      })
    ]);
  });

  it('does not create noise from a generic continuation turn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ nodes: [], edges: [] })));
    const narrative = '调查继续进行，众人等待下一步行动。';

    const patch = await synthesizeCaseBoardPatch(config, input({
      narrative,
      events: [narrativeEvent(narrative)]
    }));

    expect(patch).toEqual({ nodes: [], edges: [] });
  });

  it('drops proposals with invented source ids and falls back to the real new fact', async () => {
    const newFact = fact('楼梯地毯留有疑似血迹的污渍');
    vi.stubGlobal('fetch', vi.fn(async () => response({
      nodes: [{
        id: 'ai-invented',
        type: 'theory',
        title: '不存在来源的推测',
        source: 'ai',
        certainty: 'hypothesis',
        sourceFactIds: ['not-a-real-fact'],
        sourceEventIds: [],
        sourceClueIds: [],
        createdTurn: 1,
        updatedTurn: 1,
        status: 'active'
      }],
      edges: []
    })));

    const patch = await synthesizeCaseBoardPatch(config, input({
      facts: [newFact],
      newFacts: [newFact]
    }));

    expect(patch.nodes).toEqual([
      expect.objectContaining({ id: 'ai-fact-f_1_0', sourceFactIds: ['f_1_0'] })
    ]);
  });

  it('preserves a duplicate-title proposal when it upgrades an existing hypothesis', async () => {
    const oldEvent: PersistedDMEvent = {
      id: 'evt-old', turn: 0, kind: 'narrative', description: '旧推测'
    };
    const newEvent = narrativeEvent('新证词证实地下室有人活动');
    vi.stubGlobal('fetch', vi.fn(async () => response({
      nodes: [{
        id: 'ai-basement-new',
        type: 'theory',
        title: '地下室有人活动',
        source: 'ai',
        certainty: 'confirmed',
        sourceFactIds: [],
        sourceEventIds: [newEvent.id],
        sourceClueIds: [],
        createdTurn: 1,
        updatedTurn: 1,
        status: 'active'
      }],
      edges: []
    })));

    const patch = await synthesizeCaseBoardPatch(config, input({
      events: [oldEvent, newEvent],
      existingBoard: {
        nodes: [{
          id: 'ai-basement-old',
          type: 'theory',
          title: '地下室有人活动',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: [oldEvent.id],
          sourceClueIds: [],
          createdTurn: 0,
          updatedTurn: 0,
          status: 'active'
        }],
        edges: []
      }
    }));

    expect(patch.nodes).toEqual([
      expect.objectContaining({
        id: 'ai-basement-new',
        certainty: 'confirmed',
        sourceEventIds: [newEvent.id]
      })
    ]);
  });
});
