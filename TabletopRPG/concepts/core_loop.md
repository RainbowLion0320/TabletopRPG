---
type: concept
title: 核心玩法循环
tags: [gameplay, core, loop]
sources: [project_plan.md, ../../docs/PRD.md, ../../docs/GDD.md]
created: 2026-05-18
updated: 2026-05-27
---

# 核心玩法循环

## 概述

游戏采用 TRPG 叙事循环：AI 描述场景 -> 玩家声明行动 -> AI 判定结果 -> 必要时触发前端 D100 检定 -> AI 继续叙事。当前实现围绕单浏览器本地多人（hot-seat）体验。

## 主循环流程

```
AI 叙事
  -> 玩家输入行动
  -> callAiDm()
  -> AI JSON / 文本响应
    ├─ 无检定：applyAiResponse() 更新状态与叙事
    └─ 有检定：prepareCheck() -> 玩家掷骰 -> 检定结果回传 AI
```

## 页面状态机

```
title
  ├─ 开始游戏 -> setup -> game
  ├─ 继续游戏 -> game
  └─ AI 设置 -> title modal
```

## 游戏模式

### Together（一同行动）

1. 每名已选调查员输入一条行动。
2. 前端组合为“本轮行动宣言”。
3. AI 一次性结算本轮行动。

### Split（分头探索）

1. `currentSplitPlayer` 指定当前行动调查员。
2. `playerLocations` 追踪每名调查员所在场景。
3. 当前调查员单独提交行动，AI 按该场景叙事。

## 技能检定

| 难度 | 目标值 |
|------|--------|
| 普通 | 技能值 |
| 困难 | 技能值 / 2 |
| 极难 | 技能值 / 5 |

| 结果 | 条件 |
|------|------|
| 大失败 | 骰值 >= 96 |
| 极难成功 | 骰值 <= 技能值/5 |
| 困难成功 | 骰值 <= 技能值/2 |
| 普通成功 | 骰值 <= 技能值 |
| 失败 | 其他 |

## AI 推荐行动

AI 响应中的 `playerChoices` 会显示为建议行动按钮。玩家可以点击写入行动输入框，也可以自由输入。

## 状态更新

AI 响应可通过 `stateUpdate` 更新：

- HP/SAN 增减。
- flags。
- newItems。
- sceneChange。
- activeNpc。
- playerChoices。

更新进入 reducer 后会进行归一化，避免非法值破坏游戏流程。

## 当前剧本模块

| ID | 场景 | 说明 |
|----|------|------|
| S01 | 摩勒住宅 | 起始点，委托人和住宅线索 |
| S02 | 上城区第二分局 | 洛夫·蒙特利尔相关调查 |
| S03 | 老赫特酒吧 | “老鼠”信息 |
| S04 | 卡森其药店 | 核心危险场景 |
| S05 | 泰晤士港 | 终幕地点 |

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[entities/character_system]]
- [[entities/save_system]]
- [[decisions/ai_role_decision]]
