/**
 * services/aiDm.ts
 *
 * Phase 6 起，旧 v1 单次调用路径已删除。本文件保留为向后兼容的薄壳，
 * 仅暴露新 DM 管线 (`src/dm/pipeline.ts`) 之外仍被使用的小工具：
 *
 * - {@link PlayerAction}：玩家行动声明的轻量类型
 * - {@link buildUserMessage}：把行动声明拼成喂给历史的字符串
 * - {@link AiResponseFormatError}：管线/UI 共享的解析失败异常
 *
 * 注意：v2 管线在 `src/dm/narrator.ts` 中有自己的 `buildNarratorUserMessage`，
 * 此处保留同名版本仅是因为 `useGameController.appendHistory` 用它写历史串。
 * 两者实现保持一致；如调整请同步修改两边。
 */

import type { GameState } from '../types/game';

export interface PlayerAction {
  player: string;
  action: string;
  scene?: string;
}

export class AiResponseFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseFormatError';
  }
}

export function buildUserMessage(actions: PlayerAction[], mode: GameState['exploreMode']) {
  if (mode === 'together') {
    return `【本轮行动宣言】\n${actions.map((item) => `${item.player}：${item.action}`).join('\n')}`;
  }
  const action = actions[0];
  return `【${action.player} 在 ${action.scene ?? '当前场景'}】${action.action}`;
}
