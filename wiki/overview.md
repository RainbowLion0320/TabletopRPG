---
type: overview
title: 项目全局综述
tags: [overview, project]
sources: [project_plan.md]
created: 2026-05-14
updated: 2026-05-18
---

# AI 跑团游戏 · 项目全局综述

## 项目定位

轻量级 Web 形式的 AI 驱动叙事跑团游戏（TRPG）。核心差异点：由 AI 担任游戏主持人（DM），基于 COC（克苏鲁的呼唤）第七版规则，玩家通过文字交互推进剧情，无需专业 DM 主持即可游玩。

## 当前状态

- **阶段**：Phase 2 · 核心玩法开发（已完成大部分核心功能）
- **仓库**：`D:\Projects\TabletopRPG`（[GitHub](https://github.com/RainbowLion0320/TabletopRPG)）
- **已完成功能**：
  - 完整角色创建流程（5 步向导 + 4 个预设角色）
  - AI DM 系统（支持 Anthropic / OpenAI / MiMo 多 Provider）
  - D100 技能检定系统（COC 7th Edition）
  - 多槽位存档/读档系统
  - 合作/分离探索模式
  - AI 推荐行动建议系统
  - 内置错误日志系统
  - 首个剧本模块「雾中消逝」（5 个场景）

## 关键时间节点

| 日期 | 事件 | 状态 |
|------|------|------|
| **2026-05-18** | 锁定 AI 角色定位（见 [[decisions/ai_role_decision]]） | ✅ 已完成 |
| **2026-05-21** | Phase 1 结束，MVP 功能范围冻结 | 进行中 |
| **2026-05-31** | 里程碑：跑通 5 分钟完整对话循环 | 待完成 |
| **2026-06-13** | 部署上线（GitHub Pages / Vercel） | 待完成 |
| **2026-06-15** | 项目 Demo 录制，收尾 | 待完成 |

## 核心技术决策

- **前端**：原生 HTML + CSS + JS，单文件架构（`src/index.html`），无构建链
- **AI 接入**：Anthropic Claude / OpenAI / MiMo API 直调，支持自定义端点
- **数据存储**：localStorage + JSON，无后端
- **部署**：GitHub Pages / Vercel，零成本，URL 即可分享
- **游戏规则**：COC 第七版（D100 技能检定系统）

详见 [[concepts/tech_stack]]

## 最大风险

1. **AI 输出质量不稳定**（高风险） -> 提示词版本化管理 + 严格 JSON 输出格式 + 兜底逻辑
2. **剧本内容量跟不上**（中风险） -> 宁少勿烂，backlog 制
3. **技术范围蔓延**（中风险） -> 5/21 后新需求一律进 backlog

## 相关页面

- [[entities/team]] -- 团队分工
- [[entities/ai_dm]] -- AI DM 系统
- [[entities/character_system]] -- 角色系统
- [[entities/save_system]] -- 存档系统
- [[decisions/ai_role_decision]] -- AI 角色定位决策（已完成）
- [[decisions/mvp_scope]] -- MVP 功能范围
- [[concepts/core_loop]] -- 核心玩法循环
- [[concepts/tech_stack]] -- 技术选型
- [[concepts/prompt_engineering]] -- 提示词工程
- [[sources/project_plan]] -- 原始推进方案
