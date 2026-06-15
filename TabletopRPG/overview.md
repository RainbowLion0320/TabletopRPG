---
type: overview
title: 项目全局综述
tags: [overview, project, aligned]
sources: [project_plan.md, ../../docs/PRD.md, ../../docs/SPEC.md, ../../docs/GDD.md]
created: 2026-05-14
updated: 2026-06-15
---

# AI 跑团游戏 · 项目全局综述

## 项目定位

轻量级 Web 形式的 AI 驱动叙事跑团游戏（TRPG）。当前实现是 Vite + React + TypeScript 单页应用，由 AI 担任 DM，基于 COC 第七版风格的 D100 检定推进《雾中消逝》调查模组。

## 当前状态

- **阶段**：MVP 核心闭环已可运行，正在进行文档/规格/代码对齐与稳定化。
- **仓库**：`D:\Projects\TabletopRPG`（[GitHub](https://github.com/RainbowLion0320/TabletopRPG)）
- **当前事实源**：
  - PRD：`docs/PRD.md`
  - 技术规格：`docs/SPEC.md`
  - 游戏设计：`docs/GDD.md`
  - 运行时代码：`src/`

## 已实现功能

- React/Vite/TypeScript 前端架构。
- 标题页、预设调查员选择页、横屏游戏主界面。
- 4 个预设调查员，可选择 1-4 名进入游戏。
- AI DM 支持 OpenAI、Anthropic、MiMo、自定义 OpenAI-compatible endpoint。
- AI DM 响应进入游戏前执行 JSON 契约校验，格式无效时自动修复重试一次。
- D100 技能检定系统，骰子由前端执行。
- Together / Split 两种探索模式。
- AI 推荐行动建议。
- 全屏资料界面：默认展示玩家已知案件板，行动日志作为辅助页签保留。
- localStorage 存档：当前 key 为 `trpg-saves-v2`，支持最近存档、列表载入和删除。
- 首个剧本模块「雾中消逝」：5 个场景、6 个 NPC 条目、8 个线索物品。
- Playwright smoke tests：覆盖标题页、选角、主界面、无 API Key、存档/读档、非法存档和 D100 大失败优先规则。

## 当前未实现/不在 MVP 范围

- 自定义 5 步角色创建 UI。
- 完整战斗轮序、伤害骰、弹药、SAN 疯狂自动化。
- 音效/BGM。
- 局域网/在线多人。
- 多剧本导入或模组编辑器。
- 后端 API 代理、账号系统。

## 核心技术决策

- **前端**：React 18 + TypeScript + Vite。
- **AI 接入**：浏览器直调 Anthropic / OpenAI / MiMo / 自定义端点。
- **数据存储**：localStorage + JSON，无后端。
- **状态管理**：`useReducer` + `GameState`，恢复存档时统一经过 `hydrateGameState()`。
- **游戏规则**：COC 第七版风格 D100 技能检定。

详见 [[concepts/tech_stack]]

## 最大风险

1. **AI 输出不稳定** -> 已加入 JSON 契约校验、格式修复重试、状态归一化和核心 smoke tests；仍需扩大 AI 响应边界测试覆盖。
2. **浏览器直调 API Key 风险** -> 当前适合本地 Demo；公开部署前建议后端代理。
3. **文档漂移** -> 本次建立 `PRD.md` / `SPEC.md` / `GDD.md` / wiki / code 对齐基线。
4. **功能范围蔓延** -> 未实现功能统一进入 backlog。

## 相关页面

- [[entities/team]] -- 团队分工
- [[entities/ai_dm]] -- AI DM 系统
- [[entities/character_system]] -- 角色系统
- [[entities/save_system]] -- 存档系统
- [[decisions/ai_role_decision]] -- AI 角色定位决策
- [[decisions/mvp_scope]] -- MVP 功能范围
- [[concepts/core_loop]] -- 核心玩法循环
- [[concepts/tech_stack]] -- 技术选型
- [[concepts/prompt_engineering]] -- 提示词工程
- [[sources/project_plan]] -- 原始推进方案
