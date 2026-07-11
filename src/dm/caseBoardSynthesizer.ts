import type {
  ApiConfig,
  AtomicFact,
  CaseBoardPatch,
  DynamicCaseBoardEdge,
  DynamicCaseBoardNode,
  PersistedDMEvent,
  StoryItem
} from '../types/game';
import { generateJson } from './llm/client';

export interface CaseBoardSynthesizerInput {
  turn: number;
  narrative: string;
  playerActions: Array<{ player: string; action: string }>;
  facts: readonly AtomicFact[];
  /** Facts extracted from this turn only, used for deterministic fallback. */
  newFacts?: readonly AtomicFact[];
  events: readonly PersistedDMEvent[];
  clues: readonly StoryItem[];
  /** Clues accepted by StateResolver during this turn. */
  newClueIds?: readonly string[];
  existingBoard: CaseBoardPatch;
  signal?: AbortSignal;
}

const CASE_BOARD_SYNTHESIZER_PROMPT = `你是跑团案件板合成助手。任务：只基于玩家已见信息，提出可展示在案件板上的动态卡片和关系。

# 输出契约
返回唯一 JSON 对象：
{ "nodes": [DynamicCaseBoardNode...], "edges": [DynamicCaseBoardEdge...] }

# 规则
- 只使用输入中的本轮叙事、玩家行动、已发现线索、events、facts。
- 禁止写未解锁内幕、未来真相、总进度、未知占位。
- 每个 node 必须至少包含一个 sourceFactIds / sourceEventIds / sourceClueIds。
- 每个 edge 必须至少包含一个 sourceFactIds / sourceEventIds。
- 证据明确时 certainty="confirmed"，合理推测时 certainty="hypothesis"。
- 优先引用“本轮新增 facts”和本轮 events，来源 id 必须逐字复制输入中的真实 id。
- 若本轮出现新的物证、痕迹、证词、地点、人物关系或合理推测，至少输出 1 个 node。
- 只有本轮纯属重复叙述、没有任何案件信息增量时，才返回空 nodes/edges。
- 不要输出坐标；系统会自动布局。
- 每轮最多 4 个 nodes、4 条 edges。
- 不要 Markdown，不要注释，不要前后缀文本。`;

const CASE_BOARD_PATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['npc', 'item', 'scene', 'theory', 'event'] },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          detail: { type: 'string' },
          source: { type: 'string', enum: ['ai'] },
          certainty: { type: 'string', enum: ['confirmed', 'hypothesis'] },
          sourceFactIds: { type: 'array', items: { type: 'string' } },
          sourceEventIds: { type: 'array', items: { type: 'string' } },
          sourceClueIds: { type: 'array', items: { type: 'string' } },
          createdTurn: { type: 'number' },
          updatedTurn: { type: 'number' },
          status: { type: 'string', enum: ['active'] }
        },
        required: [
          'id',
          'type',
          'title',
          'source',
          'certainty',
          'sourceFactIds',
          'sourceEventIds',
          'sourceClueIds',
          'createdTurn',
          'updatedTurn',
          'status'
        ]
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          label: { type: 'string' },
          tone: { type: 'string', enum: ['evidence', 'suspicion', 'route', 'danger'] },
          source: { type: 'string', enum: ['ai'] },
          certainty: { type: 'string', enum: ['confirmed', 'hypothesis'] },
          sourceFactIds: { type: 'array', items: { type: 'string' } },
          sourceEventIds: { type: 'array', items: { type: 'string' } },
          createdTurn: { type: 'number' },
          updatedTurn: { type: 'number' },
          status: { type: 'string', enum: ['active'] }
        },
        required: [
          'id',
          'from',
          'to',
          'tone',
          'source',
          'certainty',
          'sourceFactIds',
          'sourceEventIds',
          'createdTurn',
          'updatedTurn',
          'status'
        ]
      }
    }
  },
  required: ['nodes', 'edges']
} satisfies Record<string, unknown>;

function compactList<T>(items: readonly T[], limit: number): T[] {
  return items.slice(-limit);
}

function buildSynthesizerUserMessage(input: CaseBoardSynthesizerInput): string {
  const lines = [
    `回合：${input.turn}`,
    `本轮叙事：${input.narrative || '（无）'}`,
    '玩家行动：',
    ...input.playerActions.map((action) => `- ${action.player}：${action.action}`),
    '已发现线索：',
    ...(input.clues.length
      ? input.clues.map((clue) => `- ${clue.id} ${clue.name}：${clue.desc}`)
      : ['- （无）']),
    '可引用 facts：',
    ...(input.facts.length
      ? compactList(input.facts, 20).map((fact) =>
          `- ${fact.id}：${fact.actor}/${fact.predicate}/${fact.target ?? '-'}=${fact.value}`
        )
      : ['- （无）']),
    '本轮新增 facts（优先转成案件板资料）：',
    ...(input.newFacts?.length
      ? input.newFacts.map((fact) =>
          `- ${fact.id}：${fact.actor}/${fact.predicate}/${fact.target ?? '-'}=${fact.value}`
        )
      : ['- （无）']),
    `本轮新增线索 id：${input.newClueIds?.length ? input.newClueIds.join('、') : '（无）'}`,
    '可引用 events：',
    ...(input.events.length
      ? compactList(input.events, 20).map((event) => `- ${event.id}：${event.kind} ${event.description}`)
      : ['- （无）']),
    '当前动态案件板：',
    ...input.existingBoard.nodes.filter((node) => node.status === 'active').slice(-20)
      .map((node) => `- node ${node.id} ${node.title}（${node.certainty}）`),
    ...input.existingBoard.edges.filter((edge) => edge.status === 'active').slice(-20)
      .map((edge) => `- edge ${edge.id} ${edge.from}->${edge.to} ${edge.label ?? ''}（${edge.certainty}）`)
  ];
  return lines.join('\n');
}

function normalizeBoardText(text: string): string {
  return text.toLocaleLowerCase('zh-CN').replace(/[\s·・:："'“”‘’、，,。.\-—_]/g, '');
}

function hasValidAnchor(
  sourceFactIds: readonly string[],
  sourceEventIds: readonly string[],
  sourceClueIds: readonly string[],
  input: CaseBoardSynthesizerInput
): boolean {
  const facts = new Set(input.facts.map((fact) => fact.id));
  const events = new Set(input.events.map((event) => event.id));
  const clues = new Set(input.clues.map((clue) => clue.id));
  return sourceFactIds.some((id) => facts.has(id))
    || sourceEventIds.some((id) => events.has(id))
    || sourceClueIds.some((id) => clues.has(id));
}

function auditPatch(patch: CaseBoardPatch, input: CaseBoardSynthesizerInput): CaseBoardPatch {
  return {
    nodes: patch.nodes.filter((node) => hasValidAnchor(
      node.sourceFactIds,
      node.sourceEventIds,
      node.sourceClueIds,
      input
    )),
    edges: patch.edges.filter((edge) => hasValidAnchor(
      edge.sourceFactIds,
      edge.sourceEventIds,
      [],
      input
    ))
  };
}

function addsSource(incoming: readonly string[], existing: readonly string[]): boolean {
  const known = new Set(existing);
  return incoming.some((id) => !known.has(id));
}

function hasMeaningfulPatch(patch: CaseBoardPatch, input: CaseBoardSynthesizerInput): boolean {
  const existingNodes = new Map(input.existingBoard.nodes.map((node) => [
    `${node.type}:${normalizeBoardText(node.title)}`,
    node
  ]));
  const existingEdges = new Map(input.existingBoard.edges.map((edge) => [
    `${edge.from}->${edge.to}:${normalizeBoardText(edge.label ?? '')}:${edge.tone}`,
    edge
  ]));
  const nodeChange = patch.nodes.some((node) => {
    const existing = existingNodes.get(`${node.type}:${normalizeBoardText(node.title)}`);
    if (!existing) return true;
    return (existing.certainty === 'hypothesis' && node.certainty === 'confirmed')
      || addsSource(node.sourceFactIds, existing.sourceFactIds)
      || addsSource(node.sourceEventIds, existing.sourceEventIds)
      || addsSource(node.sourceClueIds, existing.sourceClueIds)
      || Boolean(node.subtitle && node.subtitle !== existing.subtitle)
      || Boolean(node.detail && node.detail !== existing.detail);
  });
  if (nodeChange) return true;
  return patch.edges.some((edge) => {
    const key = `${edge.from}->${edge.to}:${normalizeBoardText(edge.label ?? '')}:${edge.tone}`;
    const existing = existingEdges.get(key);
    if (!existing) return true;
    return (existing.certainty === 'hypothesis' && edge.certainty === 'confirmed')
      || addsSource(edge.sourceFactIds, existing.sourceFactIds)
      || addsSource(edge.sourceEventIds, existing.sourceEventIds);
  });
}

function trimTitle(text: string, maxLength = 30): string {
  const normalized = text.replace(/\s+/g, ' ').replace(/^[：:，,。；;\s]+|[：:，,。；;\s]+$/g, '');
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function factTitle(fact: AtomicFact): string {
  if (fact.actor === 'world') return trimTitle(fact.value);
  if (fact.predicate === 'stance_toward') {
    return trimTitle(`${fact.actor}对${fact.target ?? '调查员'}：${fact.value}`);
  }
  if (fact.predicate === 'relationship') {
    return trimTitle(`${fact.actor}${fact.target ? `与${fact.target}` : ''}：${fact.value}`);
  }
  if (fact.predicate === 'goal') return trimTitle(`${fact.actor}的目标：${fact.value}`);
  if (fact.predicate === 'knowledge') return trimTitle(`${fact.actor}透露：${fact.value}`);
  return trimTitle(`${fact.actor}：${fact.value}`);
}

function fallbackFromFacts(input: CaseBoardSynthesizerInput): DynamicCaseBoardNode[] {
  const existing = new Set(input.existingBoard.nodes.map((node) =>
    `${node.type}:${normalizeBoardText(node.title)}`
  ));
  const nodes: DynamicCaseBoardNode[] = [];
  for (const fact of input.newFacts ?? []) {
    const title = factTitle(fact);
    if (!title) continue;
    const uncertain = fact.predicate === 'goal' || fact.predicate === 'stance_toward';
    const type: DynamicCaseBoardNode['type'] = uncertain || fact.predicate === 'relationship'
      ? 'theory'
      : 'event';
    const key = `${type}:${normalizeBoardText(title)}`;
    if (existing.has(key)) continue;
    existing.add(key);
    nodes.push({
      id: `ai-fact-${fact.id}`,
      type,
      title,
      subtitle: fact.actor === 'world' ? '本轮调查发现' : `${fact.actor} · ${fact.predicate}`,
      detail: `${fact.actor}${fact.target ? ` → ${fact.target}` : ''}：${fact.value}`,
      source: 'ai',
      certainty: uncertain ? 'hypothesis' : 'confirmed',
      sourceFactIds: [fact.id],
      sourceEventIds: [],
      sourceClueIds: [],
      createdTurn: input.turn,
      updatedTurn: input.turn,
      status: 'active'
    });
    if (nodes.length >= 2) break;
  }
  return nodes;
}

const CASE_SIGNAL_TERMS = [
  '发现', '痕迹', '刮痕', '拖拽', '脚印', '指纹', '血迹', '污渍', '药水', '气味',
  '闷响', '证词', '承认', '否认', '回避', '隐瞒', '可疑', '异常', '暗格', '标本',
  '纸条', '信件', '照片', '地图', '账本', '指向', '关系', '去过', '地下室'
] as const;

function signalScore(text: string): number {
  return CASE_SIGNAL_TERMS.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function fallbackFromNarrative(input: CaseBoardSynthesizerInput): DynamicCaseBoardNode[] {
  const narrativeEvent = [...input.events].reverse().find((event) =>
    event.turn === input.turn && event.kind === 'narrative'
  );
  if (!narrativeEvent) return [];
  const candidates = input.narrative
    .split(/[。！？!?；;\n]+/)
    .map((text) => text.trim())
    .filter((text) => text.length >= 6)
    .map((text) => ({ text, score: signalScore(text) }))
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  const best = candidates[0];
  if (!best || best.score < 2) return [];

  const uncertain = /可能|也许|或许|似乎|像是|疑似|推测|怀疑|不确定/.test(best.text);
  const title = trimTitle(best.text);
  const key = `${uncertain ? 'theory' : 'event'}:${normalizeBoardText(title)}`;
  const duplicate = input.existingBoard.nodes.some((node) =>
    `${node.type}:${normalizeBoardText(node.title)}` === key
  );
  if (duplicate) return [];
  return [{
    id: `ai-event-${narrativeEvent.id}`,
    type: uncertain ? 'theory' : 'event',
    title,
    subtitle: uncertain ? '根据本轮叙事自动整理' : '本轮调查记录',
    detail: best.text,
    source: 'ai',
    certainty: uncertain ? 'hypothesis' : 'confirmed',
    sourceFactIds: [],
    sourceEventIds: [narrativeEvent.id],
    sourceClueIds: [],
    createdTurn: input.turn,
    updatedTurn: input.turn,
    status: 'active'
  }];
}

function ensureMeaningfulPatch(
  proposed: CaseBoardPatch,
  input: CaseBoardSynthesizerInput
): CaseBoardPatch {
  const audited = auditPatch(proposed, input);
  if (hasMeaningfulPatch(audited, input)) return audited;
  const factNodes = fallbackFromFacts(input);
  if (factNodes.length) return { nodes: factNodes, edges: [] };
  return { nodes: fallbackFromNarrative(input), edges: [] };
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : []);
}

function normalizeNode(value: unknown): DynamicCaseBoardNode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id.trim() : '';
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const type = source.type;
  if (!id || !title || !['npc', 'item', 'scene', 'theory', 'event'].includes(String(type))) return null;
  return {
    id,
    type: type as DynamicCaseBoardNode['type'],
    title,
    subtitle: typeof source.subtitle === 'string' && source.subtitle.trim() ? source.subtitle.trim() : undefined,
    detail: typeof source.detail === 'string' && source.detail.trim() ? source.detail.trim() : undefined,
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
  const from = typeof source.from === 'string' ? source.from.trim() : '';
  const to = typeof source.to === 'string' ? source.to.trim() : '';
  const tone = ['evidence', 'suspicion', 'route', 'danger'].includes(String(source.tone))
    ? source.tone as DynamicCaseBoardEdge['tone']
    : 'suspicion';
  if (!id || !from || !to) return null;
  return {
    id,
    from,
    to,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : undefined,
    tone,
    source: 'ai',
    certainty: source.certainty === 'confirmed' ? 'confirmed' : 'hypothesis',
    sourceFactIds: toStringArray(source.sourceFactIds),
    sourceEventIds: toStringArray(source.sourceEventIds),
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
      }).slice(0, 4) : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges.flatMap((item) => {
        const edge = normalizeEdge(item);
        return edge ? [edge] : [];
      }).slice(0, 4) : []
    };
  } catch {
    return { nodes: [], edges: [] };
  }
}

export async function synthesizeCaseBoardPatch(
  config: ApiConfig,
  input: CaseBoardSynthesizerInput
): Promise<CaseBoardPatch> {
  let proposed: CaseBoardPatch = { nodes: [], edges: [] };
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
      console.warn('[caseBoardSynthesizer] failed, skip patch:',
        err instanceof Error ? err.message : err);
    }
  }
  return ensureMeaningfulPatch(proposed, input);
}
