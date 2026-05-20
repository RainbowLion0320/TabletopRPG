---
type: entity
title: 角色系统
tags: [character, coc, game-system]
sources: [project_plan.md]
created: 2026-05-18
updated: 2026-05-18
---

# 角色系统

## 概述

基于 COC（克苏鲁的呼唤）第七版规则的完整角色创建与管理系统。支持预设角色快速开始和自定义角色创建两种模式。

## 角色创建流程（5 步向导）

| 步骤 | 内容 | 说明 |
|------|------|------|
| Step 0 | 选择创建模式 | 预设角色 / 自定义创建 |
| Step 1 | 基本信息 | 职业选择、姓名（支持随机生成）、年龄、性别 |
| Step 2 | 属性生成 | 骰子投掷（2D6+6×5 等）或手动输入，COC 7th 规则 |
| Step 3 | 技能分配 | 职业技能点 + 兴趣技能点分配 |
| Step 4 | 角色背景 | 重要之人、信念、意义非凡之物、特质 |

## 职业（6 种）

| 职业 | 英文 | 核心技能方向 |
|------|------|-------------|
| 私家侦探 | Private Detective | 侦查、跟踪、心理学 |
| 警察 | Police | 射击、格斗、威胁 |
| 医生 | Doctor | 急救、医学、科学 |
| 记者 | Journalist | 快速交谈、图书馆、说服 |
| 学者 | Scholar | 图书馆、历史、考古 |
| 平民 | Civilian | 通用技能 |

## 属性体系（COC 7th Edition）

### 基础属性

| 属性 | 英文 | 生成规则 |
|------|------|----------|
| 力量 | STR | (2D6+6)×5 |
| 体质 | CON | (2D6+6)×5 |
| 体型 | SIZ | (2D6+6)×5 |
| 敏捷 | DEX | (2D6+6)×5 |
| 外貌 | APP | (2D6+6)×5 |
| 智力 | INT | (2D6+6)×5 |
| 意志 | POW | (2D6+6)×5 |
| 教育 | EDU | (2D6+6)×5 |
| 幸运 | Luck | (2D6+6)×5 |

### 派生属性

| 属性 | 计算公式 |
|------|----------|
| 生命值（HP） | (CON + SIZ) / 10 |
| 魔法值（MP） | POW / 5 |
| 理智值（SAN） | POW |

## 技能系统（22 种）

技能分为 6 大类：

| 分类 | 技能 |
|------|------|
| 观察 | 侦查、聆听、灵感 |
| 社交 | 话术、说服、威胁、魅惑 |
| 知识 | 图书馆、历史、神秘学、科学、考古 |
| 战斗 | 格斗、射击、闪避 |
| 行动 | 潜行、攀爬、驾驶、急救 |
| 特殊 | 心理学、克苏鲁神话、医学 |

技能基础值来源：固定数值或基于属性计算（如 闪避 = DEX×2，母语 = EDU×5）。

## 预设角色（4 个）

| 角色名 | 职业 | 定位 |
|--------|------|------|
| Henry Grey | 私家侦探 | 侦探型 |
| Ada Wallace | 医生 | 医疗型 |
| Thomas Bell | 记者 | 信息收集型 |
| Robert Shaw | 警察 | 战斗型 |

## 角色数据结构

```javascript
{
  name, job, gender, age, hometown, description,
  attrs: { STR, CON, SIZ, DEX, APP, INT, POW, EDU, Luck },
  skills: { skillName: value, ... },
  background: { importantPerson, belief, meaningfulItem, trait },
  hp, mp, san
}
```

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[decisions/ai_role_decision]]
- [[concepts/core_loop]]
