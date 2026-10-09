---
type: overview
title: Wiki 内容目录
tags: [index, aligned]
sources: [../../docs/PRD.md, ../../docs/SPEC.md, ../../docs/GDD.md]
created: 2026-05-14
updated: 2026-10-09
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
| [AI DM 系统](entities/ai_dm.md) | 建议本地去重不重试、严格 API 兼容、否定骰果识别、多人检定补全、非阻断诊断不重试、内部信息隔离与回合续跑 | ✅ 已实现 |
| [角色系统](entities/character_system.md) | 默认单人、1-4 名调查员、档案卡选角与清晰实时属性/技能/背景、查询对比与阅读位置 | ✅ 已实现 |
| [存档系统](entities/save_system.md) | 当前调查与结案回顾续接、单条损坏隔离、完整保存确认与保存后退出、升级后的立绘恢复、草稿/待处理行动保留、先选择读档和清晰档案卡列表、删除确认、写入失败恢复与 v8 兼容 | ✅ 已实现 |

## 概念页（concepts/）

| 页面 | 简介 | 状态 |
|------|------|------|
| [核心玩法循环](concepts/core_loop.md) | 行动、检定队列与汇总结算；骰子统一字体、单一结果等级和手动确认 | ✅ 已实现 |
| [提示词工程](concepts/prompt_engineering.md) | 三层事实边界、分级语义复核、当前内嵌提示词结构与外部化计划 | ✅ |
| [技术选型](concepts/tech_stack.md) | React/Vite/TypeScript、多 Provider、localStorage、数值规则配置 | ✅ |
| [Android 游戏客户端](concepts/android_app.md) | 0.5.2 七类精绘 UI、透明装裱与专用骰子、0.5.1 有界输入自动保存与后台恢复、美术原稿共享 UI、手机竖屏、一行选角、完整场景与多行行动、属性/资料/存档、原生网络与加密续玩、MiMo 默认与自定义优先、正式签名回归和最近两版收拢 | ✅ 已实现 |
| [共享交互 UI](concepts/game_ui.md) | 原冷蓝首页、白蓝标题、金/蓝按钮与配套面板/图标，整套控件和状态统一；固定任务/阅读工具、多人草稿/属性、资料/案件、声音/AI、存档/骰子/结案，手机优先兼顾网页 | ✅ 已实现 |
| [音乐与音效系统](concepts/audio_system.md) | 淡出结束释放闲置长缓存、短音效复用、设备恢复后接续当前声音、过时音效丢弃、分场景配乐、绘制声音控件、固定返回与独立滚动、44px 操作、音量记忆与素材授权 | ✅ 已实现 |
| [动态案件板与调查台](concepts/case_board.md) | 清晰照片档案与搜索护框、安卓桌面图输出剔除、网页图错误隔离、关联返回、桌面视角适配/恢复及中文工具、手机列表、v7 核心关系、审核与迁移 | ✅ 已实现 |
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
