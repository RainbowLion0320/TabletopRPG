/**
 * System2 异步合成器 - Phase 9 L5 / L6 入口。
 *
 * 触发：与 summarizer 相同节奏（每 14 对触发），由 pipeline 串接调用。
 * 一次 LLM 调用同时返回：
 *   - npcMindModels：per-NPC 单视图（coreMotivation + currentStance + 玩家特例）
 *   - prospectiveIntents：未来 N 轮可能发生的 NPC 行为（ttl=defaultIntentTtl）
 *
 * 设计：
 * - 输入：近 N 条 atomicFacts + 现有 mindModels + 现有 summary（参考过去）
 * - 输出仅覆盖 coreMotivation/currentStance/playerExceptions；
 *   stanceHistoryFactIds 由 P9.3 写入 fact 链时维护，不在 system2 层覆盖
 * - 失败容错：抛错时 pipeline 捕获 → 保留旧模型；不影响 summary 与主对话流
 */

import type {
  ApiConfig,
  AtomicFact,
  NpcMindModel,
  ProspectiveIntent
} from '../../types/game';

// ---------- 输入 / 输出 ----------

export interface System2Input {
  /** 当前回合号；用于生成 intent.id / lastUpdatedTurn */
  turn: number;
  /** 近 N 条 atomicFacts，按时间升序；建议 30-60 条 */
  recentFacts: readonly AtomicFact[];
  /** 现有 mindModels，给 LLM 增量参考 */
  existingMindModels: Readonly<Record<string, NpcMindModel>>;
  /** 在场或近期出现过的 NPC 名单；LLM 仅为这些 NPC 生成模型 */
  npcCandidates: string[];
  /** 玩家名单 */
  playerNames: string[];
  /** 已有 summary，用于背景对齐 */
  summary: string;
  /** intent 默认 ttl（默认 6） */
  defaultIntentTtl: number;
}

export interface System2Output {
  /** 待合并到 reducer 的 NPC 心智更新（不含 stanceHistoryFactIds） */
  mindModelUpdates: Array<{
    npcId: string;
    coreMotivation: string;
    currentStance: string;
    playerExceptions?: Record<string, string>;
  }>;
  /** 待写入 reducer 的新增前瞻意图（已分配 id 与 ttl） */
  prospectiveIntents: ProspectiveIntent[];
}

// ---------- 主入口 ----------

export async function synthesizeSystem2(
  config: ApiConfig,
  input: System2Input
): Promise<System2Output> {
  if (!input.npcCandidates.length && !input.recentFacts.length) {
    return { mindModelUpdates: [], prospectiveIntents: [] };
  }

  const raw = await callSynthesizerLLM(config, input);
  return parseSynthesizerJson(raw, input);
}

// ---------- LLM Prompt ----------

const SYNTHESIZER_SYSTEM_PROMPT = `你是 KP（守密人）的「认知合成器」。任务：基于近期事实链与现有心智模型，
为每个相关 NPC 输出一份「心智模型」（动机 + 整体立场 + 玩家特例），并给出 3-5 条「前瞻意图」。

# 输出契约
返回唯一一个 JSON 对象：
{
  "npcMindModels": {
    "<NPC 全名>": {
      "coreMotivation": "<一句话核心动机，≤25 字>",
      "currentStance": "<对调查者整体的当前态度，≤25 字>",
      "playerExceptions": { "<玩家名>": "<对该玩家的不同立场，≤25 字>" }
    },
    ...
  },
  "prospectiveIntents": [
    { "owner": "<NPC 全名 或 'world'>", "predictedAction": "<NPC 接下来可能做的事>", "triggerCondition": "<触发条件>" },
    ...
  ]
}

# 规则
- npcMindModels 仅为「在场或近期出现的 NPC」更新；不要凭空创造未在事实/在场名单出现的角色。
- coreMotivation / currentStance 必须用一句话中文；不要空字符串。
- playerExceptions 仅在 NPC 对某玩家明显不同时填写；多数情况留空对象 {} 或省略字段。
- prospectiveIntents 最多 5 条，应基于 fact + 现有心智合理推断；不要重复已经发生的事。
- 不要 Markdown，不要注释，不要前后缀文本。`;

interface SynthesizerJsonShape {
  npcMindModels?: unknown;
  prospectiveIntents?: unknown;
}

function buildSynthesizerUserMessage(input: System2Input): string {
  const lines: string[] = [];
  if (input.summary.trim()) {
    lines.push('已有前情提要（KP 视角）：');
    lines.push(input.summary.trim());
    lines.push('');
  }
  if (input.npcCandidates.length) {
    lines.push(`需要更新心智的 NPC：${input.npcCandidates.join('、')}`);
  }
  if (input.playerNames.length) {
    lines.push(`玩家：${input.playerNames.join('、')}`);
  }
  if (input.recentFacts.length) {
    lines.push('');
    lines.push('近期原子事实（按时间升序）：');
    for (const f of input.recentFacts) {
      const target = f.target ? `→${f.target}` : '';
      const prev = f.supersedes ? `（覆盖 ${f.supersedes}）` : '';
      lines.push(`  · [t${f.turn}] ${f.actor}${target} ${f.predicate}: ${f.value}${prev}`);
    }
  }
  if (Object.keys(input.existingMindModels).length) {
    lines.push('');
    lines.push('现有心智模型（供参考，按需修订）：');
    for (const [name, m] of Object.entries(input.existingMindModels)) {
      lines.push(`  · ${name}: motivation=${m.coreMotivation || '(空)'}, stance=${m.currentStance || '(空)'}`);
    }
  }
  return lines.join('\n');
}

async function callSynthesizerLLM(
  config: ApiConfig,
  input: System2Input
): Promise<string> {
  const userMessage = buildSynthesizerUserMessage(input);

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
        max_tokens: 1024,
        system: SYNTHESIZER_SYSTEM_PROMPT,
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
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYNTHESIZER_SYSTEM_PROMPT },
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
    throw new Error(`system2Synthesizer 响应不是 JSON：${text.slice(0, 120)}`);
  }
}

// ---------- JSON 解析 ----------

/** 解析 LLM 输出为 System2Output；宽容解析，schema 不合则丢弃。 */
export function parseSynthesizerJson(raw: string, input: System2Input): System2Output {
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();

  const candidates: string[] = [stripped];
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(stripped.slice(start, end + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as SynthesizerJsonShape;
      const mindModelUpdates = extractMindModelUpdates(parsed.npcMindModels, input.npcCandidates);
      const prospectiveIntents = extractIntents(
        parsed.prospectiveIntents,
        input.turn,
        input.defaultIntentTtl
      );
      return { mindModelUpdates, prospectiveIntents };
    } catch {
      // try next candidate
    }
  }
  return { mindModelUpdates: [], prospectiveIntents: [] };
}

function extractMindModelUpdates(
  raw: unknown,
  candidates: string[]
): System2Output['mindModelUpdates'] {
  if (!raw || typeof raw !== 'object') return [];
  const allowed = candidates.length ? new Set(candidates) : null;
  const out: System2Output['mindModelUpdates'] = [];
  for (const [npcId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!npcId.trim()) continue;
    if (allowed && !allowed.has(npcId)) continue;
    if (!value || typeof value !== 'object') continue;
    const obj = value as Record<string, unknown>;
    const coreMotivation = typeof obj.coreMotivation === 'string' ? obj.coreMotivation.trim() : '';
    const currentStance = typeof obj.currentStance === 'string' ? obj.currentStance.trim() : '';
    if (!coreMotivation && !currentStance) continue;
    const exceptionsRaw = obj.playerExceptions;
    const playerExceptions = isPlainObject(exceptionsRaw)
      ? Object.fromEntries(
          Object.entries(exceptionsRaw as Record<string, unknown>).flatMap(([k, v]) => {
            const text = typeof v === 'string' ? v.trim() : '';
            return k && text ? [[k, text] as const] : [];
          })
        )
      : undefined;
    const update: System2Output['mindModelUpdates'][number] = {
      npcId,
      coreMotivation,
      currentStance
    };
    if (playerExceptions && Object.keys(playerExceptions).length) {
      update.playerExceptions = playerExceptions;
    }
    out.push(update);
  }
  return out;
}

function extractIntents(
  raw: unknown,
  turn: number,
  defaultTtl: number
): ProspectiveIntent[] {
  if (!Array.isArray(raw)) return [];
  const out: ProspectiveIntent[] = [];
  let idx = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const owner = typeof obj.owner === 'string' ? obj.owner.trim() : '';
    const predictedAction = typeof obj.predictedAction === 'string' ? obj.predictedAction.trim() : '';
    const triggerCondition = typeof obj.triggerCondition === 'string' ? obj.triggerCondition.trim() : '';
    if (!owner || !predictedAction || !triggerCondition) continue;
    const ttlRaw = typeof obj.ttl === 'number' ? Math.floor(obj.ttl) : defaultTtl;
    const ttl = Math.max(1, Math.min(ttlRaw, 50));
    out.push({
      id: `i_${turn}_${idx}`,
      owner,
      predictedAction,
      triggerCondition,
      ttl,
      createdTurn: turn
    });
    idx += 1;
    if (out.length >= 5) break;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
