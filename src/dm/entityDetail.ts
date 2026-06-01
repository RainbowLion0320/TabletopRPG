/**
 * 实体详情数据接口 — 为资料栏弹窗提供已/未知信息的结构化数据。
 *
 * 复用现有 KnowledgeBase + computeRevealedSecretIds + deriveRevealContext。
 */

import type { GameState, StoryItem } from '../types/game';
import { getActiveKnowledgeBase, computeRevealedSecretIds, deriveRevealContext } from './knowledgeBase';

export interface EntityDetail {
  name: string;
  /** NPC: 角色身份 / 线索: "线索" */
  role: string;
  /** 立绘 URL（可选） */
  portrait?: string;
  /** 始终可见的基础描述（NPC: appearance / 线索: desc） */
  baseInfo: string;
  /** 已解锁的真相文本数组 */
  knownSecrets: string[];
  /** 未解锁的 secret 数量 */
  unknownCount: number;
}

/**
 * 获取 NPC 详情数据。
 */
export function getNpcDetail(npcName: string, state: GameState): EntityDetail | null {
  const kb = getActiveKnowledgeBase();
  const layered = kb.npcs[npcName];
  if (!layered) return null;

  const ctx = deriveRevealContext(state);
  const revealed = computeRevealedSecretIds(kb, ctx);

  const secretIds = layered.secretIds ?? [];
  const knownSecrets: string[] = [];
  let unknownCount = 0;

  for (const id of secretIds) {
    if (revealed.has(id)) {
      const secret = kb.secrets[id];
      if (secret) knownSecrets.push(secret.content);
    } else {
      unknownCount++;
    }
  }

  return {
    name: npcName,
    role: layered.public.role,
    portrait: layered.public.portrait,
    baseInfo: layered.public.appearance,
    knownSecrets,
    unknownCount
  };
}

/**
 * 获取线索详情数据。
 */
export function getClueDetail(clue: StoryItem, state: GameState): EntityDetail | null {
  const kb = getActiveKnowledgeBase();
  // 通过 clue.id 在 KB items 中查找对应的 layered entity
  const layered = kb.items[clue.id];
  if (!layered) {
    // KB 中没有对应条目（可能是动态生成的线索），仅显示基础信息
    return {
      name: clue.name,
      role: '线索',
      baseInfo: clue.desc,
      knownSecrets: [],
      unknownCount: 0
    };
  }

  const ctx = deriveRevealContext(state);
  const revealed = computeRevealedSecretIds(kb, ctx);

  const secretIds = layered.secretIds ?? [];
  const knownSecrets: string[] = [];
  let unknownCount = 0;

  for (const id of secretIds) {
    if (revealed.has(id)) {
      const secret = kb.secrets[id];
      if (secret) knownSecrets.push(secret.content);
    } else {
      unknownCount++;
    }
  }

  return {
    name: clue.name,
    role: '线索',
    portrait: undefined,
    baseInfo: clue.desc,
    knownSecrets,
    unknownCount
  };
}
