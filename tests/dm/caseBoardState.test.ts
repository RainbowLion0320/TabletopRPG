import { describe, expect, it } from 'vitest';
import { buildFactCaseBoardPatch } from '../../src/dm/caseBoardModel';
import { collectKnownNpcNames, getVisibleCaseBoard } from '../../src/dm/caseBoard';
import { caseBoard as caseBoardDefinition } from '../../src/data/scenarios/wuzhongxiaoshi';
import { createScenarioProgress } from '../../src/scenario/engine';
import { gameReducer, hydrateGameState } from '../../src/state/gameReducer';
import type { AtomicFact, DynamicCaseBoardEdge, DynamicCaseBoardNode } from '../../src/types/game';
import { makeState } from './fixtures';

function applyCaseBoardPatch(state: ReturnType<typeof makeState>, patch: unknown) {
  return gameReducer(state, { type: 'applyCaseBoardPatch', patch } as never);
}

function node(partial: Partial<DynamicCaseBoardNode> & Pick<DynamicCaseBoardNode, 'id' | 'type' | 'title'>): DynamicCaseBoardNode {
  return {
    semanticKey: `${partial.type}:${partial.title.replace(/\s/g, '')}`,
    importance: 3,
    source: 'ai',
    certainty: partial.type === 'theory' ? 'hypothesis' : 'confirmed',
    sourceFactIds: [],
    sourceEventIds: [],
    sourceClueIds: [],
    createdTurn: 1,
    updatedTurn: 1,
    status: 'active',
    ...partial
  };
}

function edge(partial: Partial<DynamicCaseBoardEdge> & Pick<DynamicCaseBoardEdge, 'id' | 'from' | 'to'>): DynamicCaseBoardEdge {
  return {
    relationKey: `${partial.from}->${partial.to}:evidence`,
    tone: 'evidence',
    source: 'ai',
    certainty: 'confirmed',
    sourceFactIds: [],
    sourceEventIds: [],
    sourceClueIds: [],
    createdTurn: 1,
    updatedTurn: 1,
    status: 'active',
    ...partial
  };
}

describe('gameReducer v7 case board state', () => {
  it('recognizes authored NPC aliases when the DM introduces them', () => {
    const state = makeState();
    state.messages = [
      { id: 'dm-1', type: 'dm', text: '店主提到蒙特利尔最近来过。' },
      { id: 'player-1', type: 'player', text: '我声称老赫特酒保也在这里。' }
    ];

    expect(collectKnownNpcNames(state)).toContain('洛夫·蒙特利尔');
    expect(collectKnownNpcNames(state)).not.toContain('老赫特之家酒保');
  });

  it('shows the missing person from the authored opening case board', () => {
    const visible = getVisibleCaseBoard(caseBoardDefinition, makeState());

    expect(visible.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'npc-eric', title: '埃里克·摩勒' })
    ]));
  });

  it('shows a discovered item without revealing its analysis result', () => {
    const state = makeState();
    state.clues = [{ id: 'I04', name: '小册子', desc: '夹页受过处理。', scene: 'S01', found: true }];
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.clueStates.I04 = 'discovered';

    const discovered = getVisibleCaseBoard(caseBoardDefinition, state).nodes;
    expect(discovered).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'item-i04', subtitle: '夹页受过特殊处理' })
    ]));
    expect(discovered.map((item) => `${item.title}${item.subtitle}`)).not.toEqual(
      expect.arrayContaining([expect.stringContaining('贝尔街14号')])
    );

    state.scenarioProgress.clueStates.I04 = 'analyzed';
    state.scenarioProgress.knownFactIds.push('F06');
    expect(getVisibleCaseBoard(caseBoardDefinition, state).nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'item-i04', title: '小册子' }),
      expect.objectContaining({ id: 'scene-s04', subtitle: '贝尔街14号' })
    ]));
  });

  it('does not turn a newspaper clipping into a confirmed smuggling theory', () => {
    const state = makeState();
    state.clues = [{ id: 'I06', name: '报纸残片', desc: '扫毒通稿。', scene: 'S01', found: true }];
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.clueStates.I06 = 'discovered';

    expect(getVisibleCaseBoard(caseBoardDefinition, state).nodes.map((item) => item.id))
      .not.toContain('theory-smuggling');

    state.scenarioProgress.knownFactIds.push('F07');
    expect(getVisibleCaseBoard(caseBoardDefinition, state).nodes.map((item) => item.id))
      .toContain('theory-smuggling');
  });

  it('keeps NPCs from previously visited scenes known after moving away', () => {
    const state = makeState({ currentScene: 'S03', flags: { 'sceneVisited.S01': true } });
    expect(collectKnownNpcNames(state)).toEqual(
      expect.arrayContaining(['伊莎贝拉·摩勒', '老赫特之家酒保'])
    );
  });

  it('drops proposals without a player-visible source anchor', () => {
    const state = makeState();
    const next = applyCaseBoardPatch(state, {
      nodes: [node({ id: 'ai-orphan', type: 'event', title: '凭空出现的真相' })],
      edges: [edge({ id: 'edge-orphan', from: 'scene-s01', to: 'ai-orphan' })],
      insights: []
    });
    expect(next.caseBoard?.nodes).toEqual([]);
    expect(next.caseBoard?.edges).toEqual([]);
  });

  it('drops content that references an unrevealed secret', () => {
    const state = makeState({ eventLog: [{ id: 'evt-1', turn: 1, kind: 'narrative', description: '回避问题' }] });
    const next = applyCaseBoardPatch(state, {
      nodes: [node({
        id: 'ai-secret', type: 'event', title: '未解锁内容', detail: 'secret.hidden.truth', sourceEventIds: ['evt-1']
      })],
      edges: [edge({ id: 'edge-secret', from: 'scene-s01', to: 'ai-secret', sourceEventIds: ['evt-1'] })],
      insights: []
    });
    expect(next.caseBoard?.nodes).toEqual([]);
  });

  it('merges by semanticKey and upgrades a connected hypothesis', () => {
    const state = makeState({
      activeNpcName: '伊莎贝拉·摩勒',
      eventLog: [
        { id: 'evt-1', turn: 1, kind: 'narrative', description: '怀疑隐瞒' },
        { id: 'evt-2', turn: 2, kind: 'narrative', description: '证词补强' }
      ]
    });
    const first = applyCaseBoardPatch(state, {
      nodes: [node({
        id: 'ai-hidden', semanticKey: 'theory:isabella-hidden', type: 'theory', title: '伊莎贝拉有所隐瞒', sourceEventIds: ['evt-1']
      })],
      edges: [
        edge({ id: 'e1', relationKey: 'scene-hidden', from: 'scene-s01', to: 'ai-hidden', tone: 'suspicion', certainty: 'hypothesis', sourceEventIds: ['evt-1'] }),
        edge({ id: 'e2', relationKey: 'isabella-hidden', from: 'npc-isabella', to: 'ai-hidden', tone: 'suspicion', certainty: 'hypothesis', sourceEventIds: ['evt-1'] })
      ],
      insights: []
    });
    const second = applyCaseBoardPatch(first, {
      nodes: [node({
        id: 'ai-hidden-new', semanticKey: 'theory:isabella-hidden', type: 'theory', title: '伊莎贝拉隐瞒了信息',
        subtitle: '证词补强', certainty: 'confirmed', sourceEventIds: ['evt-2'], updatedTurn: 2
      })],
      edges: [],
      insights: []
    });
    expect(second.caseBoard?.nodes).toHaveLength(1);
    expect(second.caseBoard?.nodes[0]).toMatchObject({
      id: 'ai-hidden', certainty: 'confirmed', subtitle: '证词补强', status: 'active', sourceEventIds: ['evt-1', 'evt-2']
    });
  });

  it('folds fact slots into one entity insight instead of adding cards', () => {
    const oldFact: AtomicFact = {
      id: 'f_1_0', turn: 1, actor: '伊莎贝拉·摩勒', predicate: 'goal', value: '保护父亲名誉', source: 'system1'
    };
    const newFact: AtomicFact = {
      id: 'f_2_0', turn: 2, actor: '伊莎贝拉·摩勒', predicate: 'goal', value: '协助调查', source: 'system1', supersedes: oldFact.id
    };
    let state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.atomicFacts = [oldFact, newFact];
    state = applyCaseBoardPatch(state, buildFactCaseBoardPatch(state, [oldFact]));
    state = applyCaseBoardPatch(state, buildFactCaseBoardPatch(state, [newFact]));
    expect(state.caseBoard?.nodes).toEqual([]);
    expect(state.caseBoard?.insights).toHaveLength(1);
    expect(state.caseBoard?.insights[0]).toMatchObject({
      ownerNodeId: 'npc-isabella', kind: 'motive', text: '当前目标：协助调查', sourceFactIds: ['f_1_0', 'f_2_0']
    });
  });

  it('turns a relationship between visible entities into a stable edge', () => {
    const relation: AtomicFact = {
      id: 'f_3_0', turn: 3, actor: '伊莎贝拉·摩勒', predicate: 'relationship',
      target: '埃里克·摩勒', value: '父女', source: 'system1'
    };
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ id: 'I02', name: '合影照片', desc: '一张合影。', scene: 'S01', found: true }];
    state.atomicFacts = [relation];
    const next = applyCaseBoardPatch(state, buildFactCaseBoardPatch(state, [relation]));
    expect(next.caseBoard?.edges).toEqual([
      expect.objectContaining({
        from: 'npc-isabella', to: 'npc-eric', relationKey: 'npc-isabella->npc-eric:relationship', label: '父女'
      })
    ]);
    expect(next.caseBoard?.insights).toEqual([]);
  });

  it('keeps a relationship with an unknown endpoint in the known subject dossier', () => {
    const relation: AtomicFact = {
      id: 'f_3_1', turn: 3, actor: '伊莎贝拉·摩勒', predicate: 'relationship',
      target: '尚未露面的陌生人', value: '似乎认识对方', source: 'system1'
    };
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.atomicFacts = [relation];
    const next = applyCaseBoardPatch(state, buildFactCaseBoardPatch(state, [relation]));
    expect(next.caseBoard?.edges).toEqual([]);
    expect(next.caseBoard?.insights).toEqual([
      expect.objectContaining({ ownerNodeId: 'npc-isabella', text: '似乎认识对方' })
    ]);
  });

  it('archives old low-confidence nodes after the 30-node cap', () => {
    const eventLog = Array.from({ length: 35 }, (_, index) => ({
      id: `evt-${index}`, turn: index + 1, kind: 'narrative', description: `事件 ${index}`
    }));
    const state = makeState({ eventLog });
    const nodes = eventLog.map((event, index) => node({
      id: `ai-${index}`, semanticKey: `event:${index}`, type: 'event', title: `事件 ${index}`,
      certainty: index === 0 ? 'confirmed' : 'hypothesis', sourceEventIds: [event.id], createdTurn: index + 1, updatedTurn: index + 1
    }));
    const edges = eventLog.map((event, index) => edge({
      id: `edge-${index}`, relationKey: `scene-event-${index}`, from: 'scene-s01', to: `ai-${index}`,
      sourceEventIds: [event.id], createdTurn: index + 1, updatedTurn: index + 1
    }));
    const next = applyCaseBoardPatch(state, { nodes, edges, insights: [] });
    expect(next.caseBoard?.nodes.filter((item) => item.status === 'active')).toHaveLength(30);
    expect(next.caseBoard?.nodes.find((item) => item.id === 'ai-0')?.status).toBe('active');
  });

  it('migrates v6 fact cards into v7 entity insights without a model call', () => {
    const hydrated = hydrateGameState({
      players: [],
      currentScene: 'S01',
      activeNpcName: '伊莎贝拉·摩勒',
      atomicFacts: [{
        id: 'f_1_0', turn: 1, actor: '伊莎贝拉·摩勒', predicate: 'knowledge', value: '父亲常去酒吧', source: 'system1'
      }],
      caseBoard: {
        lastUpdatedTurn: 1,
        nodes: [{
          id: 'ai-old-card', type: 'event', title: '伊莎贝拉透露父亲常去酒吧', source: 'ai', certainty: 'confirmed',
          sourceFactIds: ['f_1_0'], sourceEventIds: [], sourceClueIds: [], createdTurn: 1, updatedTurn: 1, status: 'active'
        }],
        edges: []
      }
    });
    expect(hydrated.caseBoard?.nodes).toEqual([]);
    expect(hydrated.caseBoard?.insights).toEqual([
      expect.objectContaining({ ownerNodeId: 'npc-isabella', kind: 'testimony', text: '透露或知晓：父亲常去酒吧' })
    ]);
  });

  it('defaults old saves to an empty v7 board', () => {
    const legacy = hydrateGameState({ players: [], currentScene: 'S01' });
    expect(legacy.caseBoard).toEqual({ nodes: [], edges: [], insights: [], lastUpdatedTurn: 0 });
  });
});
