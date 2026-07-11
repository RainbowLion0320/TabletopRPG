import { caseBoard } from '../data/scenarios/wuzhongxiaoshi';
import type {
  AtomicFact,
  CaseBoardInsight,
  CaseBoardPatch,
  DynamicCaseBoardEdge,
  DynamicCaseBoardNode,
  GameState
} from '../types/game';
import { getVisibleCaseBoard } from './caseBoard';

export function normalizeCaseBoardText(text: string): string {
  return text.toLocaleLowerCase('zh-CN').replace(/[\s·・:："'“”‘’、，,。.!！?？\-—_]/g, '');
}

export function semanticNodeKey(node: Pick<DynamicCaseBoardNode, 'semanticKey' | 'type' | 'title'>): string {
  return node.semanticKey || `${node.type}:${normalizeCaseBoardText(node.title)}`;
}

export function semanticEdgeKey(edge: Pick<DynamicCaseBoardEdge, 'relationKey' | 'from' | 'to' | 'tone'>): string {
  return edge.relationKey || `${edge.from}->${edge.to}:${edge.tone}`;
}

export function mergeCaseBoardPatches(...patches: CaseBoardPatch[]): CaseBoardPatch {
  return {
    nodes: patches.flatMap((patch) => patch.nodes),
    edges: patches.flatMap((patch) => patch.edges),
    insights: patches.flatMap((patch) => patch.insights)
  };
}

function nodeIdForEntity(state: GameState, entity: string | undefined): string | null {
  if (!entity) return null;
  const visible = getVisibleCaseBoard(caseBoard, state);
  const staticNode = visible.nodes.find((node) => node.refId === entity || node.title === entity);
  if (staticNode) return staticNode.id;
  const dynamic = (state.caseBoard?.nodes ?? []).find((node) =>
    node.status === 'active' && (node.refId === entity || node.title === entity)
  );
  return dynamic?.id ?? null;
}

function insightKind(fact: AtomicFact): CaseBoardInsight['kind'] {
  if (fact.predicate === 'goal') return 'motive';
  if (fact.predicate === 'stance_toward') return 'attitude';
  if (fact.predicate === 'knowledge') return 'testimony';
  if (fact.predicate === 'state' || fact.predicate === 'capability') return 'status';
  return 'observation';
}

function insightText(fact: AtomicFact): string {
  if (fact.predicate === 'goal') return `当前目标：${fact.value}`;
  if (fact.predicate === 'stance_toward') return `对${fact.target ?? '调查员'}的态度：${fact.value}`;
  if (fact.predicate === 'knowledge') return `透露或知晓：${fact.value}`;
  if (fact.predicate === 'capability') return `能力：${fact.value}`;
  if (fact.predicate === 'state') return `当前状态：${fact.value}`;
  return fact.value;
}

function factInsight(fact: AtomicFact, ownerNodeId: string): CaseBoardInsight {
  const slotKey = `${ownerNodeId}:${fact.predicate}:${normalizeCaseBoardText(fact.target ?? '')}`;
  return {
    id: `insight-${normalizeCaseBoardText(slotKey)}`,
    ownerNodeId,
    slotKey,
    kind: insightKind(fact),
    text: insightText(fact),
    detail: `${fact.actor}${fact.target ? ` → ${fact.target}` : ''}：${fact.value}`,
    certainty: fact.predicate === 'goal' || fact.predicate === 'stance_toward'
      ? 'hypothesis'
      : 'confirmed',
    sourceFactIds: [fact.id],
    sourceEventIds: [],
    sourceClueIds: [],
    createdTurn: fact.turn,
    updatedTurn: fact.turn,
    status: 'active'
  };
}

const CASE_SIGNAL_TERMS = [
  '痕迹', '刮痕', '脚印', '指纹', '血迹', '污渍', '暗格', '地图', '账本', '照片',
  '纸条', '信件', '药物', '粉末', '尸体', '失踪', '破坏', '袭击', '枪声', '闷响'
];

function isCoreWorldObservation(fact: AtomicFact): boolean {
  return fact.actor === 'world'
    && CASE_SIGNAL_TERMS.filter((term) => fact.value.includes(term)).length >= 1;
}

function worldObservationPatch(fact: AtomicFact, state: GameState): CaseBoardPatch {
  const currentSceneNodeId = nodeIdForEntity(state, state.currentScene);
  if (!currentSceneNodeId) return { nodes: [], edges: [], insights: [] };
  const semanticKey = `event:${normalizeCaseBoardText(fact.value)}`;
  const nodeId = `ai-${semanticKey}`;
  return {
    nodes: [{
      id: nodeId,
      semanticKey,
      type: 'event',
      title: fact.value,
      subtitle: '现场观察',
      detail: fact.value,
      importance: 4,
      source: 'ai',
      certainty: 'confirmed',
      sourceFactIds: [fact.id],
      sourceEventIds: [],
      sourceClueIds: [],
      createdTurn: fact.turn,
      updatedTurn: fact.turn,
      status: 'active'
    }],
    edges: [{
      id: `edge-${nodeId}-${currentSceneNodeId}`,
      relationKey: `${nodeId}->${currentSceneNodeId}:observation`,
      from: currentSceneNodeId,
      to: nodeId,
      label: '发现于此',
      tone: 'evidence',
      source: 'ai',
      certainty: 'confirmed',
      sourceFactIds: [fact.id],
      sourceEventIds: [],
      sourceClueIds: [],
      createdTurn: fact.turn,
      updatedTurn: fact.turn,
      status: 'active'
    }],
    insights: []
  };
}

export function buildFactCaseBoardPatch(
  state: GameState,
  facts: readonly AtomicFact[]
): CaseBoardPatch {
  const patch: CaseBoardPatch = { nodes: [], edges: [], insights: [] };
  for (const fact of facts) {
    if (fact.predicate === 'relationship') {
      const from = nodeIdForEntity(state, fact.actor);
      const to = nodeIdForEntity(state, fact.target);
      if (from && to) {
        const relationKey = `${from}->${to}:relationship`;
        patch.edges.push({
          id: `edge-${normalizeCaseBoardText(relationKey)}`,
          relationKey,
          from,
          to,
          label: fact.value,
          tone: 'evidence',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [fact.id],
          sourceEventIds: [],
          sourceClueIds: [],
          createdTurn: fact.turn,
          updatedTurn: fact.turn,
          status: 'active'
        });
        continue;
      }
    }

    const ownerNodeId = nodeIdForEntity(state, fact.actor);
    if (ownerNodeId) {
      patch.insights.push(factInsight(fact, ownerNodeId));
      continue;
    }
    if (isCoreWorldObservation(fact)) {
      const observation = worldObservationPatch(fact, state);
      patch.nodes.push(...observation.nodes);
      patch.edges.push(...observation.edges);
    }
  }
  return patch;
}

export function visibleCaseBoardNodeIds(state: GameState): Set<string> {
  const visible = getVisibleCaseBoard(caseBoard, state);
  return new Set([
    ...visible.nodes.map((node) => node.id),
    ...(state.caseBoard?.nodes ?? [])
      .filter((node) => node.status === 'active')
      .map((node) => node.id)
  ]);
}
