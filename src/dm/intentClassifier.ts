/**
 * Intent Classifier (Phase 2 计划项 / P8.2)
 *
 * 纯规则分类器：从玩家本轮行动文本里派生：
 *  - relevantSkills: 与该动作语义相关的技能名集合（用于 ContextBuilder 精简玩家卡）
 *  - hasConflict:    本轮是否包含明显冲突/暴力/危险动作（用于 Director 收窄工具集）
 *  - intentKind:     粗分类（observe/social/combat/move/use/research/other）
 *
 * 设计：
 *  - 零 LLM 调用，纯关键字 + 字典命中
 *  - 永远是"过宽优于过窄"：宁可多塞一两个相关技能给 Narrator，也不要漏了关键技能
 *  - 输入是 PlayerAction[]（多人 together 模式会合并所有动作的 relevantSkills 并集）
 */

import type { PlayerAction } from '../services/aiDm';
import { isAffirmativeCombatAction } from '../services/actionIntent';

export type IntentKind =
  | 'observe'
  | 'social'
  | 'combat'
  | 'move'
  | 'use'
  | 'research'
  | 'other';

export interface ClassifiedIntent {
  /** 与本轮相关的技能名（COC 7e 标准技能名） */
  relevantSkills: string[];
  /** 是否包含冲突/战斗类倾向（用于 Director 是否允许 propose_state_update.hp 等） */
  hasConflict: boolean;
  /** 是否明确表达了移动/转场；独立于主 intent，避免“去警局调查”被 observe 吞掉。 */
  hasMovement: boolean;
  /** 粗分类，主要服务调试与未来收窄 */
  intentKind: IntentKind;
}

// ---------- 关键字字典 ----------
// 每个关键字命中即注入一组相关技能。命中可重叠。

interface DictEntry {
  /** 触发关键字（小写匹配，命中即触发） */
  keywords: string[];
  /** 该意图相关的技能名 */
  skills: string[];
  /** 此关键字所属的粗意图分类 */
  kind: IntentKind;
  /** 是否表示冲突/战斗 */
  conflict?: boolean;
}

const MOVEMENT_KEYWORDS = [
  '去', '前往', '前去', '赶往', '去往', '动身', '出发', '离开', '进入', '走进',
  '走向', '来到', '抵达', '回到', '返回', '转移到', '换个地方', '潜入', '潜行',
  '溜', '逃跑', '逃走', '撤退', '后撤'
] as const;

const DICTIONARY: DictEntry[] = [
  // ---- 观察 / 探查 ----
  {
    keywords: ['看', '观察', '查看', '检查', '搜', '搜查', '搜索', '搜寻', '调查', '寻找', '找'],
    skills: ['侦查', '聆听'],
    kind: 'observe'
  },
  {
    keywords: ['听', '偷听', '聆听', '凑近', '贴近耳朵'],
    skills: ['聆听'],
    kind: 'observe'
  },
  {
    keywords: ['观察表情', '神色', '脸色', '判断真假', '是否说谎', '撒谎', '心思'],
    skills: ['心理学'],
    kind: 'observe'
  },
  // ---- 社交 ----
  {
    keywords: ['说服', '劝说', '谈判', '请求', '拜托', '安抚'],
    skills: ['说服', '心理学'],
    kind: 'social'
  },
  {
    keywords: ['撒谎', '骗', '编造', '编个', '假装', '假扮', '伪装身份', '虚张声势'],
    skills: ['话术'],
    kind: 'social'
  },
  {
    keywords: ['威胁', '恐吓', '吓唬', '逼问', '施压'],
    skills: ['恐吓', '心理学'],
    kind: 'social',
    conflict: true
  },
  {
    keywords: ['攀谈', '搭话', '聊天', '套话', '询问', '问', '打听'],
    skills: ['话术', '心理学'],
    kind: 'social'
  },
  // ---- 战斗 ----
  {
    keywords: ['打', '揍', '拳', '冲拳', '出拳', '殴打', '搏斗', '徒手', '近战'],
    skills: ['格斗（拳）'],
    kind: 'combat',
    conflict: true
  },
  {
    keywords: ['开枪', '射击', '射', '枪击', '掏枪', '瞄准', '扣扳机'],
    skills: ['射击（手枪）'],
    kind: 'combat',
    conflict: true
  },
  {
    keywords: ['闪避', '躲', '躲开', '避开', '挡', '格挡'],
    skills: ['闪避'],
    kind: 'combat',
    conflict: true
  },
  {
    keywords: ['逃跑', '逃走', '撤退', '后撤'],
    skills: ['闪避', '潜行'],
    kind: 'combat'
  },
  // ---- 移动 / 行动 ----
  {
    keywords: [
      '去', '前往', '前去', '赶往', '去往', '动身', '出发', '离开', '进入', '走进',
      '走向', '来到', '抵达', '回到', '返回', '转移到', '换个地方'
    ],
    skills: [],
    kind: 'move'
  },
  {
    keywords: ['潜入', '潜行', '溜', '蹑手蹑脚', '蹲伏', '躲藏', '藏身'],
    skills: ['潜行'],
    kind: 'move'
  },
  {
    keywords: ['开车', '驾车', '驾驶', '驾驶汽车', '开汽车', '驱车', '驶向', '加速', '甩开'],
    skills: ['驾驶（汽车）'],
    kind: 'move'
  },
  {
    keywords: ['前往', '赶往', '转往', '转向', '走向', '出发', '动身', '返回', '离开', '抵达'],
    skills: [],
    kind: 'move'
  },
  // ---- 使用 / 操作 ----
  {
    keywords: ['急救', '救治', '止血', '包扎', '抢救'],
    skills: ['急救', '医学'],
    kind: 'use'
  },
  {
    keywords: ['修', '修理', '修复', '撬锁', '撬', '拆开', '修机械'],
    skills: ['机械维修'],
    kind: 'use'
  },
  {
    keywords: ['拍照', '拍下', '相机', '快门', '取景'],
    skills: ['摄影'],
    kind: 'use'
  },
  // ---- 研究 / 知识 ----
  {
    keywords: ['查阅', '查资料', '翻书', '查档案', '查文献', '图书馆', '档案'],
    skills: ['图书馆'],
    kind: 'research'
  },
  {
    keywords: ['法律', '律师', '法条', '诉讼', '搜查令'],
    skills: ['法律'],
    kind: 'research'
  },
  {
    keywords: ['历史', '年代', '考据'],
    skills: ['历史'],
    kind: 'research'
  },
  {
    keywords: ['神秘学', '咒语', '符咒', '魔法', '邪教', '神话'],
    skills: ['神秘学'],
    kind: 'research'
  },
  {
    keywords: ['尸体', '解剖', '验尸', '伤口', '诊断', '症状', '中毒'],
    skills: ['医学', '生物学'],
    kind: 'research'
  },
  {
    keywords: ['化学', '药剂', '粉末', '成分', '提取', '化验'],
    skills: ['医学', '生物学'],
    kind: 'research'
  },
  {
    keywords: ['考古', '古物', '古迹', '遗迹', '文物'],
    skills: ['考古学'],
    kind: 'research'
  }
];

// ---------- 主入口 ----------

/**
 * 对一组玩家行动做意图分类。
 * 多个动作的 relevantSkills 取并集；conflict 取或；intentKind 取最高优先级命中。
 * 多人共同调查时，移动或战斗不能被另一名玩家先说出的“检查”吞掉。
 */
export function classifyIntent(actions: PlayerAction[]): ClassifiedIntent {
  const skillSet = new Set<string>();
  let hasConflict = false;
  let hasMovement = false;
  let intentKind: IntentKind = 'other';

  const priority: Record<IntentKind, number> = {
    other: 0,
    observe: 1,
    social: 2,
    research: 3,
    use: 4,
    move: 5,
    combat: 6
  };

  for (const a of actions) {
    const text = (a.action || '').toLowerCase();
    if (!text) continue;
    const affirmativeCombat = isAffirmativeCombatAction(text);
    if (affirmativeCombat) {
      skillSet.add(/(?:开枪|射击|枪击|扣扳机|开火)/.test(text) ? '射击（手枪）' : '格斗（拳）');
      hasConflict = true;
      intentKind = 'combat';
    }
    const onlyDiscussesMovement = /(?:提醒|建议|询问|商量|考虑|计划|打算)[^，。；！？\n]{0,18}(?:前往|赶往|去往|出发|动身|返回|离开|抵达|到达)/.test(text);
    if (!onlyDiscussesMovement && MOVEMENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
      hasMovement = true;
    }

    for (const entry of DICTIONARY) {
      const hit = entry.keywords.some((kw) => text.includes(kw.toLowerCase()));
      if (!hit) continue;
      if (entry.kind === 'move' && onlyDiscussesMovement) continue;
      for (const skill of entry.skills) skillSet.add(skill);
      if (entry.conflict) hasConflict = true;
      if (priority[entry.kind] > priority[intentKind]) {
        intentKind = entry.kind;
      }
    }
  }

  return {
    relevantSkills: [...skillSet],
    hasConflict,
    hasMovement,
    intentKind
  };
}

/** 调试接口：暴露字典用于测试覆盖 */
export const __INTENT_DICT_FOR_TESTS = DICTIONARY;
