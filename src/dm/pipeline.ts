/**
 * DM 引擎管线编排器。
 *
 * Phase 0：仅占位。v1 / v2 都委托给旧 services/aiDm.callAiDm。
 * 后续 phase 会逐步把 v2 替换为真正的 Agent 多步管线。
 */

import type { ApiConfig } from '../types/game';
import { callAiDm } from '../services/aiDm';
import type { DmEngineVersion, DmTurnInput, DmTurnOutput } from './types';

/**
 * 执行一轮 DM 推演。
 *
 * @param version 引擎版本；当前阶段 v1/v2 行为相同
 * @param config  AI API 配置
 * @param input   游戏状态 + 本轮玩家动作
 */
export async function runDmTurn(
  version: DmEngineVersion,
  config: ApiConfig,
  input: DmTurnInput
): Promise<DmTurnOutput> {
  // Phase 0：v2 暂时退化为 v1，确保 flag 切换不破坏现有行为。
  // Phase 4 起 v2 接入真正的 Agent 管线。
  void version;
  const { raw, response } = await callAiDm(config, input.state, input.actions);
  return { raw, legacyResponse: response };
}
