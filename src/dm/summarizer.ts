/**
 * Long-term Memory Summarizer.
 *
 * 设计：
 * - conversationHistory 不再无限累积。当超出"近 N 对"窗口时，把更早的部分压缩为
 *   一段 200-400 字的 KP 视角日志，写入 state.longTermMemorySummary。
 * - 每次合并都会把上一次的 summary 当作前置上下文塞给 LLM，避免遗忘。
 * - Anthropic / OpenAI 兼容协议都用纯 JSON 响应（不需要 function calling）。
 */

import type { ApiConfig, ConversationTurn, GameState } from '../types/game';
import {
  extractResponseText,
  jsonSchemaTextFormat,
  readResponsesJson,
  responsesEndpoint,
  responsesModel
} from './openaiResponses';

/** 近 N 对（user/assistant）原文不被总结。8 对 = 16 条。 */
export const RECENT_TURN_PAIRS_KEEP = 8;
/** 触发合并的最小累积对数：超过 8 + 6 = 14 对才执行总结，避免抖动。 */
export const SUMMARIZE_TRIGGER_PAIRS = 14;

export interface MemoryConsolidation {
  /** 合并后的新摘要（包含此前的 summary） */
  summary: string;
  /** 已被总结进 summary 的 conversationHistory 上界（数组下标，不含） */
  summarizedUntilIndex: number;
  /** 合并后保留下来的近 N 对原文，给 reducer 直接覆盖 conversationHistory */
  remainingHistory: ConversationTurn[];
}

export interface MaybeConsolidateOptions {
  /** 强制总结（用于调试） */
  force?: boolean;
}

/**
 * 判断是否需要总结；如果需要，调用 LLM 并返回整合结果。
 *
 * @returns null 表示当前不需要总结
 */
export async function maybeConsolidateMemory(
  config: ApiConfig,
  state: GameState,
  options: MaybeConsolidateOptions = {}
): Promise<MemoryConsolidation | null> {
  const history = state.conversationHistory;
  const totalLen = history.length;
  const summarizedUntil = state.summarizedUntilIndex ?? 0;
  const unsummarizedLen = totalLen - summarizedUntil;

  // 分对数（向下取整）。每对 = 1 user + 1 assistant
  const unsummarizedPairs = Math.floor(unsummarizedLen / 2);
  if (!options.force && unsummarizedPairs < SUMMARIZE_TRIGGER_PAIRS) return null;

  // 留下"近 RECENT_TURN_PAIRS_KEEP 对"原文，剩余的需要总结
  const keepCount = Math.min(totalLen, RECENT_TURN_PAIRS_KEEP * 2);
  const sliceEnd = totalLen - keepCount;
  if (sliceEnd <= summarizedUntil) return null;

  const oldChunk = history.slice(summarizedUntil, sliceEnd);
  if (oldChunk.length === 0) return null;

  const newSummary = await summarizeChunk(
    config,
    oldChunk,
    state.longTermMemorySummary || ''
  );

  const remainingHistory = history.slice(sliceEnd);
  return {
    summary: newSummary,
    // 总结合并后，索引重置：保留段从 0 开始计数
    summarizedUntilIndex: 0,
    remainingHistory
  };
}

// ---------- LLM 调用 ----------

const SUMMARIZE_SYSTEM_PROMPT = `你是 KP（守密人）。任务：把若干轮跑团历史压缩为一段 200-400 字的中文日志。

要求：
- 第一人称（KP 视角）的备忘，写"我让玩家……他们……NPC……发生了……"。
- 必须保留：场景切换、人物互动、获得线索、检定结果、NPC 态度变化、剧情后果。
- 略去玩家原话和 AI 原叙述的修辞，保留事实核。
- 如已有"前情提要"，把它整合进新版日志，不要重复列举。
- 输出严格 JSON 对象：{"summary":"<日志正文>"}，不要 Markdown，不要注释，不要前后缀。`;

interface SummarizerJson {
  summary?: unknown;
}

const SUMMARY_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' }
  },
  required: ['summary']
} satisfies Record<string, unknown>;

async function summarizeChunk(
  config: ApiConfig,
  chunk: ConversationTurn[],
  previousSummary: string
): Promise<string> {
  const userMessage = buildSummarizerUserMessage(chunk, previousSummary);

  const response = await fetch(`${responsesEndpoint(config)}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: responsesModel(config),
      instructions: SUMMARIZE_SYSTEM_PROMPT,
      input: [{ role: 'user', content: userMessage }],
      max_output_tokens: 1024,
      text: jsonSchemaTextFormat('memory_summary', SUMMARY_RESPONSE_SCHEMA),
      store: false
    })
  });
  const data = await readResponsesJson(response, 'Summarizer');
  return parseSummary(extractResponseText(data));
}
function buildSummarizerUserMessage(chunk: ConversationTurn[], previousSummary: string): string {
  const head = previousSummary.trim()
    ? `已有前情提要：\n${previousSummary.trim()}\n\n请整合进新版日志。`
    : '尚无前情提要，本次为初次总结。';
  const body = chunk
    .map((turn) => `[${turn.role === 'user' ? '玩家' : 'DM'}] ${turn.content}`)
    .join('\n\n');
  return `${head}\n\n以下是需要压缩的回合原文：\n${body}`;
}

function parseSummary(raw: string): string {
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const candidates = [stripped];
  if (start >= 0 && end > start) candidates.push(stripped.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as SummarizerJson;
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
        return parsed.summary.trim();
      }
    } catch {
      // try next candidate
    }
  }
  // 解析失败时退回原文（去掉外层），避免污染。
  return stripped.slice(0, 800);
}
