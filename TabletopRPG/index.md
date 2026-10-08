---
type: overview
title: Wiki 内容目录
tags: [index, aligned]
sources: [../../docs/PRD.md, ../../docs/SPEC.md, ../../docs/GDD.md]
created: 2026-05-14
updated: 2026-10-08
---

# TabletopRPG Wiki · 内容目录

> LLM 维护的结构化项目知识库。当前与 `docs/PRD.md`、`docs/SPEC.md`、`docs/GDD.md` 和 `src/` 运行时代码对齐。

## 概述

| 页面 | 简介 |
|------|------|
| [项目全局综述](overview.md) | 当前项目定位、状态、已实现/未实现范围 |

## 实体页（entities/）

| 页面 | 简介 | 状态 |
|------|------|------|
| [团队成员](entities/team.md) | 团队成员分工与资源交付职责 | ✅ |
| [AI DM 系统](entities/ai_dm.md) | 严格 API 兼容、否定骰果识别、多人检定补全、非阻断诊断不重试、内部信息隔离与回合续跑 | ✅ 已实现 |
| [角色系统](entities/character_system.md) | 默认单人、1-4 名调查员、档案卡选角/擅长技能/独立勾选与局内实时档案 | ✅ 已实现 |
| [存档系统](entities/save_system.md) | 档案卡列表、删除确认、写入失败恢复、v8 存档与失败回合续跑 | ✅ 已实现（最近存档、列表、删除） |

## 概念页（concepts/）

| 页面 | 简介 | 状态 |
|------|------|------|
| [核心玩法循环](concepts/core_loop.md) | 行动、检定队列与汇总结算；骰子统一字体、单一结果等级和手动确认 | ✅ 已实现 |
| [提示词工程](concepts/prompt_engineering.md) | 三层事实边界、分级语义复核、当前内嵌提示词结构与外部化计划 | ✅ |
| [技术选型](concepts/tech_stack.md) | React/Vite/TypeScript、多 Provider、localStorage、数值规则配置 | ✅ |
| [Android 游戏客户端](concepts/android_app.md) | 0.4.13 交付自动收拢、照片案件档案、存档写入恢复、默认 MiMo、多行行动与阅读、完整场景、原生网络/加密续玩与正式签名 | ✅ 已实现 |
| [共享交互 UI](concepts/game_ui.md) | 照片案件档案、存档卡、实心黄铜操作、多行行动、阅读不抢位置、固定关闭与手机优先布局 | ✅ 已实现 |
| [音乐与音效系统](concepts/audio_system.md) | 分场景配乐、环境与骰子音效、选角顶栏图标、独立开关/音量记忆、素材授权 | ✅ 已实现 |
| [动态案件板与调查台](concepts/case_board.md) | 手机照片档案与固定筛选、桌面按需关系图、v7 核心关系、审核与迁移 | ✅ 已实现 |
| [模组规范与剧情推进引擎](concepts/scenario_engine.md) | YAML 唯一事实源、Condition/Effect、节点推进、v8 迁移 | ✅ 已实现 |

## 决策记录（decisions/）

| 页面 | 简介 | 状态 |
|------|------|------|
| [AI 角色定位](decisions/ai_role_decision.md) | 选定方案 C：完整 TRPG + D100 骰子系统 | ✅ 已决定 |
| [MVP 功能范围](decisions/mvp_scope.md) | 当前 MVP 与 backlog 边界 | ✅ 已对齐 |

## 原始资料摘要（sources/）

| 页面 | 原始资料 | 导入日期 |
|------|----------|----------|
| [项目推进方案](sources/project_plan.md) | AI跑团游戏项目推进方案.html | 2026-05-14 |

## 外部事实源

| 文件 | 用途 |
|------|------|
| `docs/PRD.md` | 产品范围和验收标准 |
| `docs/SPEC.md` | 技术架构与契约 |
| `docs/GDD.md` | 游戏设计当前版本 |
| `src/` | 运行时代码事实源 |
| [2026-09-07 全面审查](../docs/reviews/2026-09-07-game-review.md) | 本轮问题修复、范围与验证证据 |
| [2026-10-08 控件与体验优化](../docs/reviews/2026-10-08-ui-polish.md) | 持续优化目标、档案/菜单/多行阅读、规则与默认 MiMo 接入验收 |
