/**
 * DM 引擎管线编排器。
 *
 * - v1：兼容旧路径，直接调 services/aiDm.callAiDm。
 * - v2：完整 Agent 管线
 *     ContextBuilder → Narrator(function calling) → Director → StateResolver
 *     输出 legacyResponse 仍兼容现有 reducer.applyAiResponse；
 *     events[] 用于事件日志（暂未持久化，phase 5 接入长期记忆）。
 */

import type { ApiConfig } from '../types/game';
import { callAiDm, AiResponseFormatError, type PlayerAction } from '../services/aiDm';
import { buildDmContext } from './contextBuilder';
import { getActiveKnowledgeBase } from './knowledgeBase';
import { callNarrator, NarratorError } from './narrator';
import { validateToolCalls } from './director';
import { resolveDmTurn } from './stateResolver';
import type { DmEngineVersion, DmTurnInput, DmTurnOutput } from './types';

const RECENT_TURN_WINDOW_PAIRS = 8; // 8 对 user/assistant = 16 条消息

async function runV1(config: ApiConfig, input: DmTurnInput): Promise<DmTurnOutput> {
  const { raw, response } = await callAiDm(config, input.state, input.actions);
  return { raw, legacyResponse: response };
}

async function runV2(config: ApiConfig, input: DmTurnInput): Promise<DmTurnOutput> {
  const kb = getActiveKnowledgeBase();
  const ctx = buildDmContext(input.state, kb, {
    mode: input.state.exploreMode,
    checkPlayer: pickSpotlightPlayer(input.actions),
    relevantSkills: [] // phase 4+: intentClassifier 推断
  });

  const history = input.state.conversationHistory
    .slice(-RECENT_TURN_WINDOW_PAIRS * 2)
    .map((turn) => ({ role: turn.role, content: turn.content }));

  const narrator = await callNarrator(config, {
    ctx,
    actions: input.actions,
    mode: input.state.exploreMode,
    history
  });

  const directorResult = validateToolCalls(narrator.toolCalls, { state: input.state, kb });

  if (import.meta.env.DEV && directorResult.rejected.length) {
    // eslint-disable-next-line no-console
    console.warn(
      '[pipeline-v2] director rejected tool_calls:',
      directorResult.rejected.map((r) => `${r.call.name}: ${r.reason}`)
    );
  }

  const resolved = resolveDmTurn({
    narrator,
    acceptedCalls: directorResult.accepted,
    turn: ctx.dynamic.workingMemory.turnCount + 1
  });

  return {
    raw: narrator.raw,
    legacyResponse: resolved.legacyResponse,
    events: resolved.events
  };
}

function pickSpotlightPlayer(actions: PlayerAction[]): string | null {
  if (actions.length === 1) return actions[0].player;
  return null;
}

export async function runDmTurn(
  version: DmEngineVersion,
  config: ApiConfig,
  input: DmTurnInput
): Promise<DmTurnOutput> {
  if (version !== 'v2') {
    return runV1(config, input);
  }
  try {
    return await runV2(config, input);
  } catch (err) {
    // v2 出错时降级到 v1，避免直接卡死整局；同时把错误信息写控制台便于排查
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[pipeline-v2] failed, falling back to v1:',
        err instanceof Error ? err.message : err
      );
    }
    if (err instanceof NarratorError || err instanceof AiResponseFormatError) {
      // 这两类错误是模型输出问题；直接抛给上层，让 UI 显示重试提示
      throw err;
    }
    return runV1(config, input);
  }
}
