---
type: entity
title: 角色系统
tags: [character, coc, game-system]
sources: [project_plan.md, ../../docs/PRD.md]
created: 2026-05-18
updated: 2026-05-29
---

# 角色系统

## 概述

当前实现是“预设调查员选择”而不是自定义角色创建器。玩家可在开始游戏前从 4 个预设调查员中选择 1-4 名进入同一局游戏。

## 当前角色选择流程

| 步骤 | 内容 |
|------|------|
| 1 | 标题页点击“开始游戏” |
| 2 | 进入“选择调查员”页面 |
| 3 | 默认选中前 2 名预设调查员，可增减选择，最多 4 名 |
| 4 | 点击“进入游戏”，初始化 `GameState` |

## 预设调查员

| 角色名 | 职业 | 定位 |
|--------|------|------|
| 亨利·格雷 | 私家侦探 | 前苏格兰场侦探，观察/心理/调查 |
| 艾达·华莱士 | 医生 | 战地护士出身，医学/急救/心理 |
| 托马斯·贝尔 | 记者 | 调查记者，图书馆/社交/信息收集 |
| 罗伯特·肖 | 警察 | 老牌巡警，格斗/射击/执法 |

## 职业定义

代码中当前定义 5 个职业：

| 职业 | id | 说明 |
|------|----|------|
| 私家侦探 | `detective` | 追踪线索，社交与观察并重 |
| 警察 | `police` | 执法经验，战斗与社交兼备 |
| 医生 | `doctor` | 急救、医学、生物学 |
| 记者 | `journalist` | 调查、采访、消息灵通 |
| 学者 | `scholar` | 研究古籍与神秘学（当前无预设角色） |

## 属性体系

角色数据保留 COC 风格基础属性：

| 属性 | 英文 |
|------|------|
| 力量 | STR |
| 体质 | CON |
| 体型 | SIZ |
| 敏捷 | DEX |
| 外貌 | APP |
| 智力 | INT |
| 意志 | POW |
| 教育 | EDU |
| 幸运 | Luck |

派生属性：

当前派生属性由 `src/data/gameRules.ts` 的 `deriveInvestigatorStats(attrs)` 统一计算，选角 UI、预设角色生成和存档恢复不得重复写公式。

| 属性 | 计算公式 |
|------|----------|
| HP | `floor((CON + SIZ) / 10)` |
| MP | `floor(POW / 5)` |
| SAN | `POW` |

## 技能系统

当前 `src/data/skills.ts` 定义 23 个技能，分为观察、社交、知识、战斗、行动、特殊 6 类。技能值结构为：

```ts
{
  base: number,
  added: number,
  isJob?: boolean
}
```

总技能值 = `base + added`。

## 角色数据结构

```ts
interface Investigator {
  id: string;
  name: string;
  gender: string;
  age: number;
  hometown: string;
  job: string;
  role?: string;
  attrs: Attributes;
  hp: number;
  mp: number;
  san: number;
  luck: number;
  currentHp: number;
  currentMp: number;
  currentSan: number;
  skills: Record<string, SkillValue>;
  background?: {
    importantPerson?: string;
    belief?: string;
    meaningfulItem?: string;
    trait?: string;
    story?: string;
  };
}
```

## Backlog

- 自定义角色创建 UI。
- 学者预设角色或隐藏未使用职业。
- 角色导入/导出。
- 头像与角色卡详情页。

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[decisions/ai_role_decision]]
- [[concepts/core_loop]]
