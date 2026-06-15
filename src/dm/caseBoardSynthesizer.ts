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
  events: readonly PersistedDMEvent[];
  clues: readonly StoryItem[];
  existingBoard: CaseBoardPatch;
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
  try {
    const result = await generateJson(config, {
      label: 'caseBoardSynthesizer',
      instructions: CASE_BOARD_SYNTHESIZER_PROMPT,
      input: [{ role: 'user', content: buildSynthesizerUserMessage(input) }],
      schemaName: 'case_board_patch',
      schema: CASE_BOARD_PATCH_SCHEMA,
      maxOutputTokens: 900,
      useTools: false
    });
    return parseCaseBoardPatchJson(result.rawText);
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[caseBoardSynthesizer] failed, skip patch:',
        err instanceof Error ? err.message : err);
    }
    return { nodes: [], edges: [] };
  }
}
