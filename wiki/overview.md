---
type: overview
title: 项目全局综述
tags: [overview, project]
sources: [project_plan.md]
created: 2026-05-14
updated: 2026-05-14
---

# AI 跑团游戏 · 项目全局综述

## 项目定位

轻量级 Web 形式的 AI 驱动叙事跑团游戏（TRPG）。核心差异点：由 AI 担任游戏叙事角色（DM 或 NPC），玩家通过文字交互推进剧情，无需专业 DM 主持即可游玩。

## 当前状态

- **阶段**：Phase 1 · 立项与设计（2026-05-14 起）
- **仓库**：`D:\Projects\TabletopRPG`（[GitHub](https://github.com/RainbowLion0320/TabletopRPG)）
- **最近动作**：Git 环境搭建完成，仓库目录结构初始化

## 关键时间节点

| 日期 | 事件 |
|------|------|
| **2026-05-18** | ⚠️ 锁定 AI 角色定位（见 [[decisions/ai_role_decision]]） |
| **2026-05-21** | Phase 1 结束，MVP 功能范围冻结 |
| **2026-05-31** | 里程碑：跑通 5 分钟完整对话循环 |
| **2026-06-13** | 部署上线（GitHub Pages / Vercel） |
| **2026-06-15** | 项目 Demo 录制，收尾 |

## 核心技术决策

- **前端**：原生 HTML + JS，无构建链，全员可参与修改
- **AI 接入**：OpenAI / Claude API 直调
- **数据存储**：localStorage + JSON，无后端
- **部署**：GitHub Pages / Vercel，零成本，URL 即可分享

详见 [[concepts/tech_stack]]

## 最大风险

1. **AI 输出质量不稳定**（高风险）→ 提示词版本化管理 + 兜底逻辑
2. **剧本内容量跟不上**（中风险）→ 宁少勿烂，backlog 制
3. **技术范围蔓延**（中风险）→ 5/21 后新需求一律进 backlog

## 相关页面

- [[entities/team]] — 团队分工
- [[decisions/ai_role_decision]] — 当前最关键的待决策项
- [[concepts/core_loop]] — 核心玩法循环
- [[sources/project_plan]] — 原始推进方案
