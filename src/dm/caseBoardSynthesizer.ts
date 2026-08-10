import type {
  ApiConfig,
  AtomicFact,
  CaseBoardNodeType,
  CaseBoardPatch,
  DynamicCaseBoardEdge,
  DynamicCaseBoardNode,
  PersistedDMEvent,
  StoryItem
} from '../types/game';
import { normalizeCaseBoardText, semanticEdgeKey, semanticNodeKey } from './caseBoardModel';
import { generateJson } from './llm/client';

export interface CaseBoardVisibleNodeInput {
  id: string;
  type: CaseBoardNodeType | 'event';
  title: string;
}

export interface CaseBoardSynthesizerInput {
  turn: number;
  narrative: string;
  playerActions: Array<{ player: string; action: string }>;
  facts: readonly AtomicFact[];
  newFacts?: readonly AtomicFact[];
  events: readonly PersistedDMEvent[];
  clues: readonly StoryItem[];
  newClueIds?: readonly string[];
  existingBoard: CaseBoardPatch;
  visibleNodes: readonly CaseBoardVisibleNodeInput[];
  currentSceneNodeId: string;
  signal?: AbortSignal;
}

const CASE_BOARD_SYNTHESIZER_PROMPT = `你是跑团案件板合成助手，专门整理“核心关系”。人物态度、目标、知识和状态已由系统归入实体档案，你只提议真正需要出现在主关系图的关键事件、跨实体关系和核心推测。

# 输出契约
返回唯一 JSON 对象：{ "nodes": [...], "edges": [...] }

# 规则
- 只使用输入中的玩家可见叙事、行动、已发现线索、events 和 facts，禁止未来真相、未解锁内幕、进度或未知占位。
- 新 node 的 type 只能是 event 或 theory；不得重复创建输入中已有的人物、地点、物证。
- semanticKey 必须描述稳定含义，不得包含回合号；importance 为 1-5。
- 每个 node 和 edge 至少引用一个输入中真实存在的 fact/event/clue id。
- edge 的 from/to 只能使用“可连接节点”里的 id 或本次新 node id；relationKey 必须稳定，不随 label 措辞变化。
- event 必须至少连接 1 个可见锚点；theory 必须至少连接 2 个可见锚点。
- 明确事实 certainty=confirmed；推测 certainty=hypothesis。推测边使用 suspicion，路线使用 route，证据使用 evidence，直接危险使用 danger。
- 每轮最多 2 个 nodes、4 条 edges。没有核心信息增量时返回空数组。
- 不输出 insight、坐标、Markdown、注释或前后缀文本。`;

const NODE_PROPERTIES = {
  id: { type: 'string' },
  semanticKey: { type: 'string' },
  type: { type: 'string', enum: ['event', 'theory'] },
  title: { type: 'string' },
  subtitle: { type: 'string' },
  detail: { type: 'string' },
  importance: { type: 'number' },
  source: { type: 'string', enum: ['ai'] },
  certainty: { type: 'string', enum: ['confirmed', 'hypothesis'] },
  sourceFactIds: { type: 'array', items: { type: 'string' } },
  sourceEventIds: { type: 'array', items: { type: 'string' } },
  sourceClueIds: { type: 'array', items: { type: 'string' } },
  createdTurn: { type: 'number' },
  updatedTurn: { type: 'number' },
  status: { type: 'string', enum: ['active'] }
} as const;

const EDGE_PROPERTIES = {
  id: { type: 'string' },
  relationKey: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  label: { type: 'string' },
  tone: { type: 'string', enum: ['evidence', 'suspicion', 'route', 'danger'] },
  source: { type: 'string', enum: ['ai'] },
  certainty: { type: 'string', enum: ['confirmed', 'hypothesis'] },
  sourceFactIds: { type: 'array', items: { type: 'string' } },
  sourceEventIds: { type: 'array', items: { type: 'string' } },
  sourceClueIds: { type: 'array', items: { type: 'string' } },
  createdTurn: { type: 'number' },
  updatedTurn: { type: 'number' },
  status: { type: 'string', enum: ['active'] }
} as const;

const CASE_BOARD_PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: NODE_PROPERTIES,
        required: Object.keys(NODE_PROPERTIES)
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: EDGE_PROPERTIES,
        required: Object.keys(EDGE_PROPERTIES)
      }
    }
  },
  required: ['nodes', 'edges']
} satisfies Record<string, unknown>;

function compactList<T>(items: readonly T[], limit: number): T[] {
  return items.slice(-limit);
}

function buildSynthesizerUserMessage(input: CaseBoardSynthesizerInput): string {
  return [
    `回合：${input.turn}`,
    `当前场景节点：${input.currentSceneNodeId}`,
    `本轮叙事：${input.narrative || '（无）'}`,
    '玩家行动：',
    ...input.playerActions.map((action) => `- ${action.player}：${action.action}`),
    '可连接节点（只能复制这些 id 或本轮新 node id）：',
    ...(input.visibleNodes ?? []).map((node) => `- ${node.id} [${node.type}] ${node.title}`),
    '已发现线索：',
    ...(input.clues.length ? input.clues.map((clue) => `- ${clue.id} ${clue.name}`) : ['- （无）']),
    '可引用 facts：',
    ...(input.facts.length ? compactList(input.facts, 20).map((fact) =>
      `- ${fact.id}：${fact.actor}/${fact.predicate}/${fact.target ?? '-'}=${fact.value}`
    ) : ['- （无）']),
    '本轮 events：',
    ...compactList(input.events.filter((event) => event.turn === input.turn), 12)
      .map((event) => `- ${event.id}：${event.kind} ${event.description}`),
    '当前核心动态节点：',
    ...input.existingBoard.nodes.filter((node) => node.status === 'active').slice(-20)
      .map((node) => `- ${node.id} ${node.semanticKey} ${node.title}`),
    '当前动态关系：',
    ...input.existingBoard.edges.filter((edge) => edge.status === 'active').slice(-20)
      .map((edge) => `- ${edge.relationKey} ${edge.from}->${edge.to} ${edge.label ?? ''}`)
  ].join('\n');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : []);
}

function normalizeNode(value: unknown): DynamicCaseBoardNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const semanticKey = typeof source.semanticKey === 'string' ? source.semanticKey.trim() : '';
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!id || !semanticKey || !title || (source.type !== 'event' && source.type !== 'theory')) return null;
  return {
    id,
    semanticKey,
    type: source.type,
    title: title.slice(0, 60),
    subtitle: typeof source.subtitle === 'string' ? source.subtitle.trim().slice(0, 80) : undefined,
    detail: typeof source.detail === 'string' ? source.detail.trim().slice(0, 240) : undefined,
    importance: Math.min(5, Math.max(1, Math.floor(Number(source.importance) || 3))) as DynamicCaseBoardNode['importance'],
    source: 'ai',
    certainty: source.certainty === 'confirmed' ? 'confirmed' : 'hypothesis',
    sourceFactIds: toStringArray(source.sourceFactIds),
    sourceEventIds: toStringArray(source.sourceEventIds),
    sourceClueIds: toStringArray(source.sourceClueIds),
    createdTurn: Number.isFinite(source.createdTurn) ? Number(source.createdTurn) : 0,
    updatedTurn: Number.isFinite(source.updatedTurn) ? Number(source.updatedTurn) : 0,
    status: 'active'
  };
}

function normalizeEdge(value: unknown): DynamicCaseBoardEdge | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const relationKey = typeof source.relationKey === 'string' ? source.relationKey.trim() : '';
  const from = typeof source.from === 'string' ? source.from.trim() : '';
  const to = typeof source.to === 'string' ? source.to.trim() : '';
  if (!id || !relationKey || !from || !to) return null;
  return {
    id,
    relationKey,
    from,
    to,
    label: typeof source.label === 'string' ? source.label.trim().slice(0, 40) : undefined,
    tone: source.tone === 'danger' || source.tone === 'route' || source.tone === 'evidence'
      ? source.tone
      : 'suspicion',
    source: 'ai',
    certainty: source.certainty === 'confirmed' ? 'confirmed' : 'hypothesis',
    sourceFactIds: toStringArray(source.sourceFactIds),
    sourceEventIds: toStringArray(source.sourceEventIds),
    sourceClueIds: toStringArray(source.sourceClueIds),
    createdTurn: Number.isFinite(source.createdTurn) ? Number(source.createdTurn) : 0,
    updatedTurn: Number.isFinite(source.updatedTurn) ? Number(source.updatedTurn) : 0,
    status: 'active'
  };
}

export function parseCaseBoardPatchJson(raw: string): CaseBoardPatch {
  try {
    const parsed = JSON.parse(raw) as { nodes?: unknown; edges?: unknown };
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes.flatMap((item) => {
        const node = normalizeNode(item);
        return node ? [node] : [];
      }).slice(0, 2) : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges.flatMap((item) => {
        const edge = normalizeEdge(item);
        return edge ? [edge] : [];
      }).slice(0, 4) : [],
      insights: []
    };
  } catch {
    return { nodes: [], edges: [], insights: [] };
  }
}

function hasValidAnchor(
  item: Pick<DynamicCaseBoardNode, 'sourceFactIds' | 'sourceEventIds' | 'sourceClueIds'>,
  input: CaseBoardSynthesizerInput
): boolean {
  const factIds = new Set(input.facts.map((fact) => fact.id));
  const eventIds = new Set(input.events.map((event) => event.id));
  const clueIds = new Set(input.clues.map((clue) => clue.id));
  return item.sourceFactIds.some((id) => factIds.has(id))
    || item.sourceEventIds.some((id) => eventIds.has(id))
    || item.sourceClueIds.some((id) => clueIds.has(id));
}

function auditPatch(patch: CaseBoardPatch, input: CaseBoardSynthesizerInput): CaseBoardPatch {
  const nodes = patch.nodes.filter((node) => hasValidAnchor(node, input));
  const visibleNodes = input.visibleNodes ?? [];
  const validIds = new Set([...visibleNodes.map((node) => node.id), ...nodes.map((node) => node.id)]);
  const edges = patch.edges.filter((edge) =>
    validIds.has(edge.from) && validIds.has(edge.to) && hasValidAnchor(edge, input)
  );
  const degree = new Map<string, number>();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  });
  const connectedNodes = nodes.filter((node) =>
    (degree.get(node.id) ?? 0) >= (node.type === 'theory' ? 2 : 1)
  );
  const connectedIds = new Set([...visibleNodes.map((node) => node.id), ...connectedNodes.map((node) => node.id)]);
  return {
    nodes: connectedNodes,
    edges: edges.filter((edge) => connectedIds.has(edge.from) && connectedIds.has(edge.to)),
    insights: []
  };
}

const CASE_SIGNAL_TERMS = [
  '发现', '痕迹', '刮痕', '拖拽', '脚印', '指纹', '血迹', '污渍', '闷响', '证词',
  '承认', '否认', '隐瞒', '可疑', '异常', '暗格', '纸条', '信件', '照片', '地图', '账本'
];

function fallbackFromNarrative(input: CaseBoardSynthesizerInput): CaseBoardPatch {
  if (input.playerActions.some((action) =>
    /【检定结果】[\s\S]*结果[：:]\s*(?:失败|大失败)/.test(action.action)
  )) {
    return { nodes: [], edges: [], insights: [] };
  }
  const narrativeEvent = [...input.events].reverse().find((event) =>
    event.turn === input.turn && event.kind === 'narrative'
  );
  if (!narrativeEvent || !input.currentSceneNodeId) return { nodes: [], edges: [], insights: [] };
  const candidate = input.narrative.split(/[。！？!?；;\n]+/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 6)
    .map((text) => ({ text, score: CASE_SIGNAL_TERMS.filter((term) => text.includes(term)).length }))
    .sort((left, right) => right.score - left.score || left.text.length - right.text.length)[0];
  if (!candidate || candidate.score < 2) return { nodes: [], edges: [], insights: [] };
  const uncertain = /可能|也许|或许|似乎|像是|疑似|推测|怀疑|不确定/.test(candidate.text);
  const mentionedAnchors = (input.visibleNodes ?? []).filter((node) =>
    node.id !== input.currentSceneNodeId && candidate.text.includes(node.title)
  );
  if (uncertain && mentionedAnchors.length < 1) return { nodes: [], edges: [], insights: [] };
  const semanticKey = `${uncertain ? 'theory' : 'event'}:${normalizeCaseBoardText(candidate.text)}`;
  if (input.existingBoard.nodes.some((node) => semanticNodeKey(node) === semanticKey)) {
    return { nodes: [], edges: [], insights: [] };
  }
  const nodeId = `ai-${semanticKey}`;
  const node: DynamicCaseBoardNode = {
    id: nodeId,
    semanticKey,
    type: uncertain ? 'theory' : 'event',
    title: candidate.text.length > 30 ? `${candidate.text.slice(0, 29)}…` : candidate.text,
    subtitle: uncertain ? '待验证推测' : '本轮关键发现',
    detail: candidate.text,
    importance: uncertain ? 4 : 3,
    source: 'ai',
    certainty: uncertain ? 'hypothesis' : 'confirmed',
    sourceFactIds: [],
    sourceEventIds: [narrativeEvent.id],
    sourceClueIds: [],
    createdTurn: input.turn,
    updatedTurn: input.turn,
    status: 'active'
  };
  const anchors = [input.currentSceneNodeId, ...mentionedAnchors.map((item) => item.id)]
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, uncertain ? 2 : 1);
  const edges: DynamicCaseBoardEdge[] = anchors.map((anchorId, index) => ({
    id: `edge-${nodeId}-${index}`,
    relationKey: `${anchorId}->${semanticKey}:${uncertain ? 'suspicion' : 'observation'}`,
    from: anchorId,
    to: nodeId,
    label: uncertain ? '支持推测' : '发现于此',
    tone: uncertain ? 'suspicion' : 'evidence',
    source: 'ai',
    certainty: uncertain ? 'hypothesis' : 'confirmed',
    sourceFactIds: [],
    sourceEventIds: [narrativeEvent.id],
    sourceClueIds: [],
    createdTurn: input.turn,
    updatedTurn: input.turn,
    status: 'active'
  }));
  return { nodes: [node], edges, insights: [] };
}

function hasMeaningfulChange(patch: CaseBoardPatch, input: CaseBoardSynthesizerInput): boolean {
  const nodeKeys = new Set(input.existingBoard.nodes.map(semanticNodeKey));
  const edgeKeys = new Set(input.existingBoard.edges.map(semanticEdgeKey));
  return patch.nodes.some((node) => !nodeKeys.has(semanticNodeKey(node)))
    || patch.edges.some((edge) => !edgeKeys.has(semanticEdgeKey(edge)));
}

export async function synthesizeCaseBoardPatch(
  config: ApiConfig,
  input: CaseBoardSynthesizerInput
): Promise<CaseBoardPatch> {
  // 失败检定后的叙事可能包含假设或“没有发现”；不得把它固化为确认案件节点。
  if (input.playerActions.some((action) =>
    /【检定结果】[\s\S]*结果[：:]\s*(?:失败|大失败)/.test(action.action)
  )) {
    return { nodes: [], edges: [], insights: [] };
  }
  let proposed: CaseBoardPatch = { nodes: [], edges: [], insights: [] };
  try {
    const result = await generateJson(config, {
      label: 'caseBoardSynthesizer',
      instructions: CASE_BOARD_SYNTHESIZER_PROMPT,
      input: [{ role: 'user', content: buildSynthesizerUserMessage(input) }],
      schemaName: 'case_board_patch',
      schema: CASE_BOARD_PATCH_SCHEMA,
      maxOutputTokens: 900,
      useTools: false,
      signal: input.signal
    });
    proposed = parseCaseBoardPatchJson(result.rawText);
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[caseBoardSynthesizer] failed, use deterministic fallback:',
        err instanceof Error ? err.message : err);
    }
  }
  const audited = auditPatch(proposed, input);
  return hasMeaningfulChange(audited, input) ? audited : fallbackFromNarrative(input);
}
