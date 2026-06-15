import { describe, expect, it } from 'vitest';
import { gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import { makeState } from './fixtures';

function applyCaseBoardPatch(state: ReturnType<typeof makeState>, patch: unknown) {
  return gameReducer(state, { type: 'applyCaseBoardPatch', patch } as never);
}

describe('gameReducer dynamic case board state', () => {
  it('drops AI nodes and edges that have no player-visible source anchor', () => {
    const state = makeState();

    const next = applyCaseBoardPatch(state, {
      nodes: [
        {
          id: 'ai-node-orphan',
          type: 'theory',
          title: '凭空出现的幕后真相',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: [],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      edges: [
        {
          id: 'ai-edge-orphan',
          from: 'ai-node-orphan',
          to: 'scene-s01',
          tone: 'suspicion',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ]
    });

    expect(next.caseBoard?.nodes).toEqual([]);
    expect(next.caseBoard?.edges).toEqual([]);
  });

  it('drops AI nodes that reference unrevealed KP secrets', () => {
    const state = makeState({
      eventLog: [{ id: 'evt-1', turn: 1, kind: 'narrative', description: '玩家注意到伊莎贝拉回避问题' }]
    });

    const next = applyCaseBoardPatch(state, {
      nodes: [
        {
          id: 'ai-secret-node',
          type: 'theory',
          title: '未解锁内幕',
          detail: 'secret.note_resentment.revealed 指向真相',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['evt-1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      edges: []
    });

    expect(next.caseBoard?.nodes).toEqual([]);
  });

  it('merges duplicate AI nodes and upgrades hypotheses to confirmed when evidence arrives', () => {
    const state = makeState({
      eventLog: [
        { id: 'evt-1', turn: 1, kind: 'narrative', description: '玩家怀疑伊莎贝拉隐瞒动机' },
        { id: 'evt-2', turn: 2, kind: 'state_update', description: '玩家找到相关线索' }
      ],
      clueIds: ['I02']
    });

    const first = applyCaseBoardPatch(state, {
      nodes: [
        {
          id: 'ai-isabella-hidden',
          type: 'theory',
          title: '伊莎贝拉有所隐瞒',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['evt-1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      edges: []
    });

    const second = applyCaseBoardPatch(first, {
      nodes: [
        {
          id: 'ai-isabella-hidden-duplicate',
          type: 'theory',
          title: '伊莎贝拉 有所隐瞒',
          subtitle: '由合影照片支持',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [],
          sourceEventIds: ['evt-2'],
          sourceClueIds: ['I02'],
          createdTurn: 2,
          updatedTurn: 2,
          status: 'active'
        }
      ],
      edges: []
    });

    expect(second.caseBoard?.nodes).toHaveLength(1);
    expect(second.caseBoard?.nodes[0]).toMatchObject({
      id: 'ai-isabella-hidden',
      title: '伊莎贝拉有所隐瞒',
      subtitle: '由合影照片支持',
      certainty: 'confirmed',
      sourceEventIds: ['evt-1', 'evt-2'],
      sourceClueIds: ['I02'],
      createdTurn: 1,
      updatedTurn: 2,
      status: 'active'
    });
  });

  it('remaps edges from duplicate incoming node ids to the merged node id', () => {
    const state = makeState({
      eventLog: [
        { id: 'evt-1', turn: 1, kind: 'narrative', description: '玩家看到药店后门有撬痕' },
        { id: 'evt-2', turn: 2, kind: 'narrative', description: '玩家推断可能有人协助进入' }
      ]
    });

    const first = applyCaseBoardPatch(state, {
      nodes: [
        {
          id: 'ai-backdoor-old',
          type: 'event',
          title: '药店后门被撬',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [],
          sourceEventIds: ['evt-1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        },
        {
          id: 'ai-inside-help',
          type: 'theory',
          title: '可能有内应协助',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['evt-2'],
          sourceClueIds: [],
          createdTurn: 2,
          updatedTurn: 2,
          status: 'active'
        }
      ],
      edges: []
    });

    const second = applyCaseBoardPatch(first, {
      nodes: [
        {
          id: 'ai-backdoor-new',
          type: 'event',
          title: '药店后门 被撬',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [],
          sourceEventIds: ['evt-2'],
          sourceClueIds: [],
          createdTurn: 2,
          updatedTurn: 2,
          status: 'active'
        }
      ],
      edges: [
        {
          id: 'ai-edge-help',
          from: 'ai-backdoor-new',
          to: 'ai-inside-help',
          label: '推测',
          tone: 'suspicion',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['evt-2'],
          createdTurn: 2,
          updatedTurn: 2,
          status: 'active'
        }
      ]
    });

    expect(second.caseBoard?.nodes).toHaveLength(2);
    expect(second.caseBoard?.edges).toHaveLength(1);
    expect(second.caseBoard?.edges[0]).toMatchObject({
      from: 'ai-backdoor-old',
      to: 'ai-inside-help'
    });
  });

  it('caps active AI nodes by archiving old low-confidence hypotheses first', () => {
    const eventLog = Array.from({ length: 55 }, (_, index) => ({
      id: `evt-${index}`,
      turn: index,
      kind: 'narrative',
      description: `事件 ${index}`
    }));
    const state = makeState({ eventLog });
    const nodes = eventLog.map((event, index) => ({
      id: `ai-node-${index}`,
      type: 'theory',
      title: `推测 ${index}`,
      source: 'ai',
      certainty: index === 0 ? 'confirmed' : 'hypothesis',
      sourceFactIds: [],
      sourceEventIds: [event.id],
      sourceClueIds: [],
      createdTurn: index,
      updatedTurn: index,
      status: 'active'
    }));

    const next = applyCaseBoardPatch(state, { nodes, edges: [] });
    const active = next.caseBoard?.nodes.filter((node) => node.status === 'active') ?? [];
    const archived = next.caseBoard?.nodes.filter((node) => node.status === 'archived') ?? [];

    expect(active).toHaveLength(50);
    expect(archived).toHaveLength(5);
    expect(next.caseBoard?.nodes.find((node) => node.id === 'ai-node-0')?.status).toBe('active');
    expect(next.caseBoard?.nodes.find((node) => node.id === 'ai-node-1')?.status).toBe('archived');
  });

  it('hydrates v6 caseBoard saves and defaults old saves to an empty board', () => {
    const legacy = hydrateGameState({ players: [], currentScene: 'S01' });
    expect(legacy.caseBoard).toEqual({ nodes: [], edges: [], lastUpdatedTurn: 0 });

    const hydrated = hydrateGameState({
      players: [],
      currentScene: 'S01',
      caseBoard: {
        lastUpdatedTurn: 3,
        nodes: [
          {
            id: 'ai-node',
            type: 'event',
            title: '玩家打碎窗户',
            source: 'ai',
            certainty: 'confirmed',
            sourceFactIds: [],
            sourceEventIds: ['evt-3'],
            sourceClueIds: [],
            createdTurn: 3,
            updatedTurn: 3,
            status: 'active'
          }
        ],
        edges: []
      }
    });

    expect(hydrated.caseBoard?.lastUpdatedTurn).toBe(3);
    expect(hydrated.caseBoard?.nodes[0]).toMatchObject({
      id: 'ai-node',
      type: 'event',
      title: '玩家打碎窗户',
      certainty: 'confirmed'
    });
  });
});
