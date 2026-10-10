import { caseBoard } from '../../data/scenarios/wuzhongxiaoshi';
import { storyData } from '../../data/storyData';
import { getVisibleCaseBoard } from '../../dm/caseBoard';
import { countCompletedGameTurns } from '../../services/turns';
import type {
  CaseBoardCertainty,
  CaseBoardEdgeTone,
  CaseBoardInsight,
  CaseBoardNodeType,
  DynamicCaseBoardNode,
  GameState
} from '../../types/game';

export type CaseBoardDisplayNodeType = CaseBoardNodeType | 'event';

export interface CaseBoardDisplayNode {
  id: string;
  type: CaseBoardDisplayNodeType;
  refId?: string;
  title: string;
  subtitle?: string;
  importance: number;
  certainty: CaseBoardCertainty;
  portrait?: string;
  dynamic?: DynamicCaseBoardNode;
  insightCount: number;
  latestUpdateTurn: number;
}

export interface CaseBoardDisplayEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  tone: CaseBoardEdgeTone;
  certainty: CaseBoardCertainty;
  dynamic: boolean;
  sourceFactIds: string[];
  sourceEventIds: string[];
  sourceClueIds: string[];
}

export interface CaseBoardThread {
  id: string;
  title: string;
  nodeIds: string[];
  edgeCount: number;
  latestTurn: number;
}

export interface CaseBoardGraphModel {
  nodes: CaseBoardDisplayNode[];
  edges: CaseBoardDisplayEdge[];
  insights: CaseBoardInsight[];
  threads: CaseBoardThread[];
  summary: string;
}

export interface LayoutedCaseBoardNode extends CaseBoardDisplayNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CASE_BOARD_NODE_SIZE: Record<CaseBoardDisplayNodeType, { width: number; height: number }> = {
  npc: { width: 240, height: 146 },
  scene: { width: 230, height: 140 },
  item: { width: 232, height: 144 },
  event: { width: 244, height: 144 },
  theory: { width: 248, height: 148 }
};

function threadNodePriority(node: CaseBoardDisplayNode): number {
  const typeWeight = node.type === 'theory' ? 5 : node.type === 'scene' ? 4 : node.type === 'npc' ? 3 : 2;
  return node.importance * 10 + typeWeight;
}

function deriveThreads(nodes: CaseBoardDisplayNode[], edges: CaseBoardDisplayEdge[]): CaseBoardThread[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  });
  const visited = new Set<string>();
  const threads: CaseBoardThread[] = [];
  nodes.forEach((start) => {
    if (visited.has(start.id)) return;
    const queue = [start.id];
    const nodeIds: string[] = [];
    visited.add(start.id);
    while (queue.length) {
      const current = queue.shift()!;
      nodeIds.push(current);
      adjacency.get(current)?.forEach((next) => {
        if (visited.has(next)) return;
        visited.add(next);
        queue.push(next);
      });
    }
    const threadNodes = nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
    const anchor = [...threadNodes].sort((left, right) =>
      threadNodePriority(right) - threadNodePriority(left)
      || left.title.localeCompare(right.title, 'zh-CN')
    )[0];
    const edgeCount = edges.filter((edge) => nodeIds.includes(edge.from) && nodeIds.includes(edge.to)).length;
    threads.push({
      id: `thread-${anchor.id}`,
      title: anchor.title,
      nodeIds,
      edgeCount,
      latestTurn: Math.max(0, ...threadNodes.map((node) => node.latestUpdateTurn))
    });
  });
  return threads.sort((left, right) =>
    right.latestTurn - left.latestTurn || right.nodeIds.length - left.nodeIds.length
  );
}

export function buildCaseBoardGraphModel(state: GameState): CaseBoardGraphModel {
  const visible = getVisibleCaseBoard(caseBoard, state);
  const currentTurn = countCompletedGameTurns(state.conversationHistory, state.summarizedTurnCount);
  const activeInsights = (state.caseBoard?.insights ?? []).filter((insight) => insight.status === 'active');
  const insightCount = new Map<string, number>();
  const latestInsightTurn = new Map<string, number>();
  activeInsights.forEach((insight) => {
    insightCount.set(insight.ownerNodeId, (insightCount.get(insight.ownerNodeId) ?? 0) + 1);
    latestInsightTurn.set(insight.ownerNodeId, Math.max(latestInsightTurn.get(insight.ownerNodeId) ?? 0, insight.updatedTurn));
  });
  const staticNodes: CaseBoardDisplayNode[] = visible.nodes.map((node) => {
    const isCurrentScene = node.type === 'scene' && node.refId === state.currentScene;
    const isActiveNpc = node.type === 'npc'
      && Boolean(state.activeNpcName)
      && (node.refId === state.activeNpcName || node.title === state.activeNpcName);
    return {
      id: node.id,
      type: node.type,
      refId: node.refId,
      title: node.title,
      subtitle: node.subtitle,
      importance: node.importance ?? 3,
      certainty: 'confirmed',
      portrait: node.type === 'npc' && node.refId ? storyData.npcs[node.refId]?.portrait : undefined,
      insightCount: insightCount.get(node.id) ?? 0,
      latestUpdateTurn: Math.max(
        latestInsightTurn.get(node.id) ?? 0,
        isCurrentScene || isActiveNpc ? currentTurn : 0
      )
    };
  });
  const dynamicNodes: CaseBoardDisplayNode[] = (state.caseBoard?.nodes ?? [])
    .filter((node) => node.status === 'active')
    .map((node) => ({
      id: node.id,
      type: node.type,
      refId: node.refId,
      title: node.title,
      subtitle: node.subtitle,
      importance: node.importance,
      certainty: node.certainty,
      portrait: node.type === 'npc' && node.refId ? storyData.npcs[node.refId]?.portrait : undefined,
      dynamic: node,
      insightCount: insightCount.get(node.id) ?? 0,
      latestUpdateTurn: Math.max(node.updatedTurn, latestInsightTurn.get(node.id) ?? 0)
    }));
  const nodes = [...staticNodes, ...dynamicNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: CaseBoardDisplayEdge[] = [
    ...visible.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      tone: edge.tone,
      certainty: 'confirmed' as const,
      dynamic: false,
      sourceFactIds: [],
      sourceEventIds: [],
      sourceClueIds: []
    })),
    ...(state.caseBoard?.edges ?? [])
      .filter((edge) => edge.status === 'active' && nodeIds.has(edge.from) && nodeIds.has(edge.to))
      .map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.label,
        tone: edge.tone,
        certainty: edge.certainty,
        dynamic: true,
        sourceFactIds: edge.sourceFactIds,
        sourceEventIds: edge.sourceEventIds,
        sourceClueIds: edge.sourceClueIds
      }))
  ];
  const threads = deriveThreads(nodes, edges);
  const people = nodes.filter((node) => node.type === 'npc').length;
  const evidence = nodes.filter((node) => node.type === 'item' || node.type === 'event').length;
  const hypotheses = nodes.filter((node) => node.type === 'theory' && node.certainty === 'hypothesis').length;
  const recent = [...nodes].sort((left, right) => right.latestUpdateTurn - left.latestUpdateTurn)[0];
  const knownCounts = [people ? `${people} 名相关人物` : '', evidence ? `${evidence} 项证据` : '', hypotheses ? `${hypotheses} 条待验证推测` : ''].filter(Boolean).join(' · ');
  const summary = `${knownCounts ? `${knownCounts}。` : ''}${recent?.latestUpdateTurn ? `最近更新：${recent.title}。` : '调查刚刚开始。'}`;
  return { nodes, edges, insights: activeInsights, threads, summary };
}

export async function layoutCaseBoardGraph(
  nodes: CaseBoardDisplayNode[],
  edges: CaseBoardDisplayEdge[]
): Promise<LayoutedCaseBoardNode[]> {
  if (!nodes.length) return [];
  const { layoutNodes } = await import('./caseBoardLayout');
  return layoutNodes(nodes, edges);
}
