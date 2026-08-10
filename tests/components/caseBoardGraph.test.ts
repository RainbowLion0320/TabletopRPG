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
    const model = buildCaseBoardGraphModel(state);
    const items = filterCaseBoardGraph(model, { query: '', type: 'item', showHypotheses: true, threadId: 'all' });
    expect(items.nodes.every((node) => node.type === 'item')).toBe(true);
    const search = filterCaseBoardGraph(model, { query: '小册子', type: 'all', showHypotheses: true, threadId: 'all' });
    expect(search.nodes.map((node) => node.title)).toEqual(expect.arrayContaining(['小册子']));
    expect(search.nodes.map((node) => node.title)).not.toContain('卡森其药店');
  });
});
