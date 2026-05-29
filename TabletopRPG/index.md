---
type: overview
title: Wiki 内容目录
tags: [index, aligned]
sources: [../../docs/PRD.md, ../../docs/SPEC.md, ../../docs/GDD.md]
created: 2026-05-14
updated: 2026-05-29
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
| [AI DM 系统](entities/ai_dm.md) | AI DM Provider、提示词、响应格式校验、检定流程 | ✅ 已实现 |
| [角色系统](entities/character_system.md) | 当前预设调查员选择、职业/技能数据结构、派生数值规则 | ✅ 已实现（预设选择） |
| [存档系统](entities/save_system.md) | `trpg-saves-v2`、API 配置 | ✅ 已实现（最近存档、列表、删除） |

## 概念页（concepts/）

| 页面 | 简介 | 状态 |
|------|------|------|
| [核心玩法循环](concepts/core_loop.md) | title/setup/game 状态机，行动 -> AI -> 检定循环 | ✅ 已实现 |
| [提示词工程](concepts/prompt_engineering.md) | 当前内嵌提示词结构与外部化计划 | ✅ |
| [技术选型](concepts/tech_stack.md) | React/Vite/TypeScript、多 Provider、localStorage、数值规则配置 | ✅ |

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
