/**
 * System1 同步事实抽取器 - Phase 9 L2 入口。
 *
 * 触发：每轮 stateResolver 之后、reducer.appendFacts 之前。
 * 目标：从本轮 narrator 输出 + 玩家行动中抽取 1-3 条原子事实（SPO 三元组），
 *      并在写入前调 findSupersedeTarget 判断是否构成 supersedes 链。
 *
 * 设计原则：
 * - 失败容错：LLM 调用报错 / JSON 解析失败 → 返回 [] 不抛错，主对话流不受影响。
 * - Token 预算：~800 in + ~400 out，prompt 紧凑。
 * - 严格 schema：每条 fact 必须含 actor + predicate + value，否则丢弃。
 */

import type { ApiConfig, AtomicFact, FactPredicate } from '../../types/game';
import { findSupersedeTarget } from './evolutionChain';

// ---------- 输入 / 输出 ----------

export interface FactExtractorInput {
  /** 本轮回合号（用于生成 fact id 与 fact.turn） */
  turn: number;
  /** Narrator 本轮叙事文本（去除工具调用后的纯叙述） */
  narrative: string;
  /** 玩家本轮行动声明（顺序保留） */
  playerActions: Array<{ player: string; action: string }>;
  /** 在场 NPC 名单，提示 LLM 优先关注这些 actor */
  inScopeNpcs: string[];
  /** 玩家名单，用于 stance_toward / relationship 的 target 范围提示 */
  playerNames: string[];
  /** 现有 facts（用于 supersede 合并查询） */
  existingFacts: readonly AtomicFact[];
}

const FACT_PREDICATES: ReadonlyArray<FactPredicate> = [
  'stance_toward',
  'goal',
  'knowledge',
  'capability',
  'state',
  'relationship'
];

const PREDICATE_SET: ReadonlySet<string> = new Set<string>(FACT_PREDICATES);

// ---------- 主入口 ----------

/**
 * 抽取并合并本轮 atomic facts。
 *
 * @returns 待写入的 facts（已设置好 supersedes 字段）；失败时返回空数组。
 */
export async function extractFactsFromTurn(
  config: ApiConfig,
  input: FactExtractorInput
): Promise<AtomicFact[]> {
  if (!input.narrative.trim() && !input.playerActions.length) return [];

  let raw: string;
  try {
    raw = await callExtractorLLM(config, input);
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[factExtractor] LLM call failed, skip turn:',
        err instanceof Error ? err.message : err);
    }
    return [];
  }

  const parsed = parseExtractorJson(raw);
  if (!parsed.length) return [];

  const out: AtomicFact[] = [];
  let idx = 0;
  for (const candidate of parsed) {
    const fact = buildFact(candidate, input, idx);
    if (!fact) continue;
    // 判断是否覆盖旧 fact
    const supersedeTarget = findSupersedeTarget(input.existingFacts, {
      actor: fact.actor,
      predicate: fact.predicate,
      target: fact.target
    });
    if (supersedeTarget && supersedeTarget.value === fact.value) {
      // value 完全相同 → 视为重复，不写入
      continue;
    }
    if (supersedeTarget) {
      fact.supersedes = supersedeTarget.id;
    }
    out.push(fact);
    idx += 1;
    if (out.length >= 3) break; // 单轮最多 3 条
  }
  return out;
}

// ---------- LLM Prompt ----------

const EXTRACTOR_SYSTEM_PROMPT = `你是 KP 的事实抽取助手。任务：从本轮 DM 叙事 + 玩家行动中抽取 1-3 条「原子事实」。

# 输出契约
返回唯一一个 JSON 对象：
{ "facts": [ { "actor":"...", "predicate":"...", "target":"...", "value":"..." }, ... ] }

# 谓词集合（必须严格选择其一）
- stance_toward：actor 对 target 的态度（友好/敌意/警惕/信任…）
- goal：actor 当前的目标或动机
- knowledge：actor 知道某项事实
- capability：actor 拥有某种能力
- state：actor 当前的物理/心理状态（受伤/疲惫/醉酒…）
- relationship：actor 与 target 的关系（父女/同事/旧识…）

# 抽取规则
- actor 必须是出现在叙事中的具体人名 / 玩家名 / 'world'（全局环境）。
- target 仅在 stance_toward 与 relationship 时必填，其他谓词可省略。
- value 必须是简短中文（≤20 字），描述「是什么」，不要写过程。
- 只抽取本轮新增或发生变化的事实；不要重复总结历史。
- 每轮最多 3 条；若没有值得记录的事实，返回 { "facts": [] }。
- 不要 Markdown，不要注释，不要前后缀文本。`;

interface ExtractorJsonShape {
  facts?: unknown;
}

interface CandidateFact {
  actor: string;
  predicate: FactPredicate;
  target?: string;
  value: string;
}

function buildExtractorUserMessage(input: FactExtractorInput): string {
  const lines: string[] = [];
  if (input.inScopeNpcs.length) {
    lines.push(`在场 NPC：${input.inScopeNpcs.join('、')}`);
  }
  if (input.playerNames.length) {
    lines.push(`玩家：${input.playerNames.join('、')}`);
  }
  if (input.playerActions.length) {
    lines.push('玩家本轮行动：');
    for (const a of input.playerActions) {
      lines.push(`  - ${a.player}：${a.action}`);
    }
  }
  if (input.narrative.trim()) {
    lines.push('DM 本轮叙事：');
    lines.push(input.narrative.trim());
  }
  return lines.join('\n');
}

async function callExtractorLLM(
  config: ApiConfig,
  input: FactExtractorInput
): Promise<string> {
  const userMessage = buildExtractorUserMessage(input);

  if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model || 'claude-3-5-sonnet-latest',
        max_tokens: 512,
        system: EXTRACTOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    const data = await readJsonResponse(response);
    if (!response.ok || data.error) {
      throw new Error(data.error?.message ?? `HTTP ${response.status}`);
    }
    return data.content?.[0]?.text || '';
  }

  const endpoint = (
    config.provider === 'mimo'
      ? config.endpoint || 'https://token-plan-cn.xiaomimimo.com/v1'
      : config.endpoint || 'https://api.openai.com/v1'
  ).replace(/\/+$/, '');
  const model =
    config.provider === 'mimo'
      ? config.model || 'mimo-v2.5-pro'
      : config.model || 'gpt-4o';

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTOR_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ]
    })
  });
  const data = await readJsonResponse(response);
  if (!response.ok || data.error) {
    throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  }
  return data.choices?.[0]?.message?.content || '';
}

async function readJsonResponse(response: Response): Promise<{
  error?: { message?: string };
  content?: Array<{ text?: string }>;
  choices?: Array<{ message?: { content?: string } }>;
}> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    throw new Error(`factExtractor 响应不是 JSON：${text.slice(0, 120)}`);
  }
}

// ---------- JSON 解析 ----------

/** 解析 LLM 返回，宽容地从大段文本中抠出 JSON 对象。 */
export function parseExtractorJson(raw: string): CandidateFact[] {
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();
  if (!stripped) return [];

  const candidates: string[] = [stripped];
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(stripped.slice(start, end + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as ExtractorJsonShape;
      if (Array.isArray(parsed.facts)) {
        return parsed.facts.flatMap(toCandidate);
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

function toCandidate(item: unknown): CandidateFact[] {
  if (!item || typeof item !== 'object') return [];
  const obj = item as Record<string, unknown>;
  const actor = typeof obj.actor === 'string' ? obj.actor.trim() : '';
  const predicate = typeof obj.predicate === 'string' ? obj.predicate.trim() : '';
  const value = typeof obj.value === 'string' ? obj.value.trim() : '';
  const target = typeof obj.target === 'string' ? obj.target.trim() : '';
  if (!actor || !value) return [];
  if (!PREDICATE_SET.has(predicate)) return [];
  const cand: CandidateFact = {
    actor,
    predicate: predicate as FactPredicate,
    value
  };
  if (target) cand.target = target;
  return [cand];
}

// ---------- Fact 构造 ----------

function buildFact(
  candidate: CandidateFact,
  input: FactExtractorInput,
  idx: number
): AtomicFact | null {
  // stance_toward / relationship 必须有 target
  if ((candidate.predicate === 'stance_toward' || candidate.predicate === 'relationship')
    && !candidate.target) {
    return null;
  }
  const fact: AtomicFact = {
    id: `f_${input.turn}_${idx}`,
    turn: input.turn,
    actor: candidate.actor,
    predicate: candidate.predicate,
    value: candidate.value,
    source: 'system1'
  };
  if (candidate.target) fact.target = candidate.target;
  return fact;
}
