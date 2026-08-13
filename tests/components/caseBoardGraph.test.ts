import { describe, expect, it } from 'vitest';
import { storyData } from '../../src/data/storyData';
import {
  buildCaseBoardGraphModel,
  filterCaseBoardGraph,
  layoutCaseBoardGraph,
  type CaseBoardDisplayEdge,
  type CaseBoardDisplayNode
} from '../../src/components/game/caseBoardGraph';
import { makeState } from '../dm/fixtures';
import { createScenarioProgress } from '../../src/scenario/engine';

function displayNode(index: number): CaseBoardDisplayNode {
  const types = ['npc', 'scene', 'item', 'event', 'theory'] as const;
  const type = types[index % types.length];
  return {
    id: `node-${index}`,
    type,
    title: `资料 ${index}`,
    subtitle: '布局测试',
    importance: (index % 5 + 1) as 1 | 2 | 3 | 4 | 5,
    certainty: type === 'theory' ? 'hypothesis' : 'confirmed',
    insightCount: 0,
    latestUpdateTurn: index
  };
}

function overlaps(
  left: Awaited<ReturnType<typeof layoutCaseBoardGraph>>[number],
  right: Awaited<ReturnType<typeof layoutCaseBoardGraph>>[number]
) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

describe('case board graph model and layout', () => {
  it('builds a spoiler-safe initial summary from visible content', () => {
    const model = buildCaseBoardGraphModel(makeState({ activeNpcName: '伊莎贝拉·摩勒' }));
    expect(model.nodes.map((node) => node.title)).toEqual(expect.arrayContaining(['摩勒住宅', '伊莎贝拉·摩勒']));
    expect(model.summary).not.toMatch(/鸦片|蒙特利尔关系网|泰晤士港/);
  });

  it('keeps the current finale scene and NPC newer than stale dynamic discoveries', () => {
    const conversationHistory = Array.from({ length: 8 }, (_, index) => [
      { role: 'user' as const, content: `第 ${index + 1} 回合行动` },
      { role: 'assistant' as const, content: `第 ${index + 1} 回合结果` }
    ]).flat();
    const state = makeState({
      currentScene: 'S05',
      activeNpcName: '扶桑花号交涉代表',
      conversationHistory
    });
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.visitedSceneIds = ['S01', 'S05'];
    state.caseBoard = {
      nodes: [{
        id: 'dynamic-montreal',
        semanticKey: 'npc:montreal',
        type: 'npc',
        title: '洛夫·蒙特利尔',
        importance: 4,
        source: 'ai',
        certainty: 'confirmed',
        sourceFactIds: [],
        sourceEventIds: [],
        sourceClueIds: [],
        createdTurn: 3,
        updatedTurn: 3,
        status: 'active'
      }],
      edges: [],
      insights: [],
      lastUpdatedTurn: 3
    };

    const model = buildCaseBoardGraphModel(state);
    expect(model.nodes.find((node) => node.id === 'scene-s05')?.latestUpdateTurn).toBe(8);
    expect(model.nodes.find((node) => node.id === 'npc-hybrid-envoy')?.latestUpdateTurn).toBe(8);
    expect(model.summary).toContain('最近更新：扶桑花号');
    expect(model.summary).not.toContain('最近更新：洛夫·蒙特利尔');
  });

  it('lays out fourteen mixed nodes without rectangle overlap', async () => {
    const nodes = Array.from({ length: 14 }, (_, index) => displayNode(index));
    const edges: CaseBoardDisplayEdge[] = nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      from: nodes[Math.max(0, index - (index % 3))].id,
      to: node.id,
      label: '关联',
      tone: index % 2 ? 'suspicion' : 'evidence',
      certainty: node.certainty,
      dynamic: true,
      sourceFactIds: [],
      sourceEventIds: [],
      sourceClueIds: []
    }));
    const layouted = await layoutCaseBoardGraph(nodes, edges);
    expect(layouted).toHaveLength(14);
    for (let left = 0; left < layouted.length; left += 1) {
      for (let right = left + 1; right < layouted.length; right += 1) {
        expect(overlaps(layouted[left], layouted[right]), `${layouted[left].id} overlaps ${layouted[right].id}`).toBe(false);
      }
    }
  });

  it('filters by type while keeping search context relations', () => {
    const state = makeState({ activeNpcName: '伊莎贝拉·摩勒' });
    state.clues = [{ ...storyData.items.I04, found: true }];
    state.scenarioProgress = createScenarioProgress();
    state.scenarioProgress.clueStates.I04 = 'discovered';
    const model = buildCaseBoardGraphModel(state);
    const items = filterCaseBoardGraph(model, { query: '', type: 'item', showHypotheses: true, threadId: 'all' });
    expect(items.nodes.every((node) => node.type === 'item')).toBe(true);
    const search = filterCaseBoardGraph(model, { query: '小册子', type: 'all', showHypotheses: true, threadId: 'all' });
    expect(search.nodes.map((node) => node.title)).toEqual(expect.arrayContaining(['小册子']));
    expect(search.nodes.map((node) => node.title)).not.toContain('卡森其药店');
  });
});
