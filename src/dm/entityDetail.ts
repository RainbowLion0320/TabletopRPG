/**
 * 实体详情数据接口 — 为资料栏弹窗提供已/未知信息的结构化数据。
 *
 * 复用现有 KnowledgeBase + computeRevealedSecretIds + deriveRevealContext。
 */

import type { GameState, StoryItem } from '../types/game';
import { allSkills } from '../data/skills';
import { storyData } from '../data/storyData';
import type { NarrativeMarkTarget } from '../services/narrativeMarkup';
import { sentenceContaining } from '../services/narrativeMarkup';
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

function playerDetail(targetId: string, state: GameState): EntityDetail | null {
  const player = state.players.find((item) => item.id === targetId || item.name === targetId);
  if (!player) return null;
  const background = [
    player.background?.story,
    player.background?.belief ? `信念：${player.background.belief}` : '',
    player.background?.importantPerson ? `重要之人：${player.background.importantPerson}` : '',
    player.background?.meaningfulItem ? `珍视之物：${player.background.meaningfulItem}` : '',
    player.background?.trait ? `特质：${player.background.trait}` : ''
  ].filter(Boolean).join('\n');
  return {
    name: player.name,
    role: player.job || player.role || '调查员',
    portrait: player.portrait,
    baseInfo: `${background || '调查团队成员。'}\n当前 HP ${player.currentHp}/${player.hp}，SAN ${player.currentSan}/${player.san}。`,
    knownSecrets: [],
    unknownCount: 0
  };
}

function narrativeNpcDetail(npcName: string, state: GameState): EntityDetail | null {
  const kb = getActiveKnowledgeBase();
  const layered = kb.npcs[npcName];
  if (!layered) return null;
  const visitedSceneIds = new Set([
    state.currentScene,
    'S01',
    ...state.clues.map((clue) => clue.scene)
  ]);
  const formallyKnown = state.activeNpcName === npcName
    || state.messages.some((message) => message.npcName === npcName)
    || Object.values(storyData.scenes).some((scene) =>
      visitedSceneIds.has(scene.id) && scene.npcs.includes(npcName)
    );
  if (!formallyKnown) {
    return {
      name: npcName,
      role: layered.public.role,
      portrait: layered.public.portrait,
      baseInfo: layered.public.appearance,
      knownSecrets: [],
      unknownCount: 0
    };
  }
  const detail = getNpcDetail(npcName, state);
  return detail ? { ...detail, unknownCount: 0 } : null;
}

function narrativeItemDetail(itemId: string, state: GameState): EntityDetail | null {
  const item = storyData.items[itemId];
  if (!item) return null;
  const collected = state.clues.find((clue) => clue.id === itemId);
  if (!collected) {
    return {
      name: item.name,
      role: '叙事中提及的物证',
      baseInfo: item.desc,
      knownSecrets: [],
      unknownCount: 0
    };
  }
  const detail = getClueDetail(collected, state);
  return detail ? { ...detail, unknownCount: 0 } : null;
}

function sceneDetail(sceneId: string, state: GameState): EntityDetail | null {
  const kb = getActiveKnowledgeBase();
  const layered = kb.scenes[sceneId as keyof typeof kb.scenes];
  if (!layered) return null;
  const visited = state.currentScene === sceneId
    || sceneId === 'S01'
    || state.clues.some((clue) => clue.scene === sceneId)
    || (state.eventLog ?? []).some((event) =>
      event.kind === 'scene_change'
      && (event.description.includes(sceneId) || event.description.includes(layered.public.name))
    );
  const revealed = computeRevealedSecretIds(kb, deriveRevealContext(state));
  const knownSecrets = visited ? (layered.secretIds ?? []).flatMap((id) => {
    const secret = revealed.has(id) ? kb.secrets[id] : null;
    return secret ? [secret.content] : [];
  }) : [];
  return {
    name: layered.public.name,
    role: layered.public.chapterTitle,
    baseInfo: layered.public.desc,
    knownSecrets,
    unknownCount: 0
  };
}

const SKILL_GROUP_NAMES = {
  observe: '观察类技能',
  social: '社交类技能',
  know: '知识类技能',
  combat: '战斗类技能',
  action: '行动类技能',
  special: '特殊技能'
} as const;

function skillDetail(skillName: string, state: GameState): EntityDetail | null {
  const skill = allSkills.find((item) => item.name === skillName);
  if (!skill) return null;
  const base = typeof skill.base === 'number' ? `${skill.base}%` : skill.base === 'EDU' ? '等于 EDU' : '等于 DEX×2';
  const values = state.players.map((player) => {
    const value = player.skills[skillName];
    const total = value ? value.base + value.added : typeof skill.base === 'number' ? skill.base : '按属性计算';
    return `${player.name}：${typeof total === 'number' ? `${total}%` : total}`;
  });
  return {
    name: skill.name,
    role: SKILL_GROUP_NAMES[skill.group],
    baseInfo: `基础值：${base}。检定时掷 D100，点数不高于技能值即为成功。`,
    knownSecrets: values.length ? [`当前调查员数值\n${values.join('\n')}`] : [],
    unknownCount: 0
  };
}

const RULE_DETAILS: Record<string, { role: string; text: string }> = {
  HP: { role: '角色状态', text: '生命值。降到 0 时角色会失去行动能力；重伤等后果由当前规则裁决。' },
  SAN: { role: '角色状态', text: '理智值。遭遇超自然或强烈刺激时可能损失，并可能引发疯狂状态。' },
  普通: { role: '检定难度', text: '普通难度要求检定结果不高于技能值。' },
  普通难度: { role: '检定难度', text: '普通难度要求检定结果不高于技能值。' },
  普通检定: { role: '检定难度', text: '普通检定要求检定结果不高于技能值。' },
  困难: { role: '检定难度', text: '困难难度要求检定结果不高于技能值的一半。' },
  困难难度: { role: '检定难度', text: '困难难度要求检定结果不高于技能值的一半。' },
  困难检定: { role: '检定难度', text: '困难检定要求检定结果不高于技能值的一半。' },
  极难: { role: '检定难度', text: '极难难度要求检定结果不高于技能值的五分之一。' },
  极难难度: { role: '检定难度', text: '极难难度要求检定结果不高于技能值的五分之一。' },
  极难检定: { role: '检定难度', text: '极难检定要求检定结果不高于技能值的五分之一。' },
  大成功: { role: '检定结果', text: '极低骰点带来的最佳检定结果，具体收益由当前情境裁决。' },
  普通成功: { role: '检定结果', text: '检定通过，角色完成了当前难度要求。' },
  困难成功: { role: '检定结果', text: '检定达到困难成功等级。' },
  极难成功: { role: '检定结果', text: '检定达到极难成功等级。' },
  检定成功: { role: '检定结果', text: '检定通过，具体效果由当前情境裁决。' },
  成功: { role: '检定结果', text: '检定通过，具体效果由当前情境裁决。' },
  大失败: { role: '检定结果', text: '检定出现严重失败，可能产生额外后果。' },
  检定失败: { role: '检定结果', text: '检定未达到当前难度要求。' },
  失败: { role: '检定结果', text: '检定未达到当前难度要求。' },
  受伤: { role: '角色状态', text: '角色生命值已经受到损失。' },
  重伤: { role: '危险状态', text: '角色遭受了足以影响生存与行动的严重伤势。' },
  濒死: { role: '危险状态', text: '角色处于生命危险中，需要立即处理。' },
  昏迷: { role: '危险状态', text: '角色当前无法正常感知环境或主动行动。' },
  中毒: { role: '危险状态', text: '角色受到毒素影响，具体后果由当前规则裁决。' },
  恐慌: { role: '危险状态', text: '角色处于强烈恐惧反应中。' },
  疯狂: { role: '理智状态', text: '理智冲击引发的异常状态，持续时间和表现由规则裁决。' },
  临时疯狂: { role: '理智状态', text: '短时间内大量损失 SAN 可能引发的即时异常状态。' },
  不定性疯狂: { role: '理智状态', text: '较长时间内累计损失大量 SAN 可能引发的持续异常状态。' }
};

function dynamicCaseBoardDetail(targetId: string, state: GameState): EntityDetail | null {
  const id = targetId.replace(/^caseboard:/, '');
  const node = state.caseBoard?.nodes.find((item) => item.id === id && item.status === 'active');
  if (!node) return null;
  return {
    name: node.title,
    role: node.certainty === 'confirmed' ? '已证实资料' : '案件推测',
    baseInfo: node.detail || node.subtitle || '案件板中的玩家可见资料。',
    knownSecrets: [`记录于第 ${node.createdTurn} 回合`],
    unknownCount: 0
  };
}

export function getNarrativeMarkDetail(
  target: NarrativeMarkTarget,
  state: GameState,
  sourceText: string
): EntityDetail | null {
  if (target.id.startsWith('caseboard:')) return dynamicCaseBoardDetail(target.id, state);
  if (target.kind === 'person') {
    return playerDetail(target.id, state) ?? narrativeNpcDetail(target.canonicalName ?? target.id, state);
  }
  if (target.kind === 'location') return sceneDetail(target.id, state);
  if (target.kind === 'item') return narrativeItemDetail(target.id, state);
  if (target.kind === 'skill') return skillDetail(target.id, state);
  if (target.source === 'llm') {
    const role = target.keywordKind === 'danger'
      ? '本轮危险标记'
      : target.keywordKind === 'state'
        ? '本轮状态标记'
        : '本轮线索标记';
    return {
      name: target.label,
      role,
      baseInfo: sentenceContaining(sourceText, target.label),
      knownSecrets: ['此标记来自本轮叙事，仅帮助定位原文，不代表系统已确认新的剧情事实。'],
      unknownCount: 0
    };
  }
  const rule = RULE_DETAILS[target.id] ?? RULE_DETAILS[target.label];
  return rule ? {
    name: target.label,
    role: rule.role,
    baseInfo: rule.text,
    knownSecrets: [],
    unknownCount: 0
  } : null;
}
