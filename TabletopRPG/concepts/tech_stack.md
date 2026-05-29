---
type: concept
title: 技术选型
tags: [tech, architecture, decision, react, vite]
sources: [project_plan.md, ../../docs/SPEC.md]
created: 2026-05-14
updated: 2026-05-29
---

# 技术选型

## 选型总览

| 层次 | 选择 | 当前理由 |
|------|------|----------|
| **前端** | React 18 + TypeScript | 组件化承载复杂 UI 和游戏状态 |
| **构建工具** | Vite | 本地开发快，生产构建简单 |
| **图标** | lucide-react | 轻量、统一的按钮图标来源 |
| **AI 接入** | Anthropic / OpenAI / MiMo / 自定义端点 | 覆盖主流与兼容 OpenAI 的服务 |
| **数据存储** | localStorage + JSON | 无需后端，适合本地 Demo |
| **游戏规则** | COC 第七版风格 D100 | 检定机制明确，适合 AI 裁判 |
| **自动化测试** | Playwright | 覆盖核心浏览器 smoke 流程与 D100 规则 |
| **策划文档** | Markdown + Wiki | Git 可追溯，便于 AI/人协作维护 |

## 当前架构结构

```
src/
├── app/                 # App 编排、screen 状态、顶层事件
├── components/
│   ├── setup/           # 标题页、预设调查员选择
│   └── game/            # 游戏主界面组件
├── data/                # 剧本、技能、职业、预设调查员
├── services/            # AI、骰子、存档/API 配置
├── state/               # reducer、存档水合、AI 响应归一化
├── styles/              # 全局样式
├── types/               # 领域类型
└── main.tsx             # React 挂载入口
```

## 数据存储（localStorage）

| Key | 状态 | 内容 |
|-----|------|------|
| `trpg-saves-v2` | 当前 | 新版存档槽位数组，最多 12 条 |
| `trpg-api` | 当前 | API 配置（provider、apiKey、endpoint、model） |

> 当前代码已实现最近存档读取、存档列表、指定载入和删除；导入/导出仍在 backlog。

## AI 调用

- Anthropic：`https://api.anthropic.com/v1/messages`，默认 `claude-3-5-sonnet-latest`
- OpenAI：`https://api.openai.com/v1/chat/completions`，默认 `gpt-4o`
- MiMo：`https://token-plan-cn.xiaomimimo.com/v1/chat/completions`，默认 `mimo-v2.5`
- 自定义：`{endpoint}/chat/completions`

## 关键约束

- API Key 由用户在 UI 中输入并保存在本地浏览器，不能硬编码进仓库。
- AI 响应进入 reducer 前必须通过 JSON 契约校验；格式无效时修复重试一次，仍无效则拦截。
- 存档或已验证 AI 响应进入 UI 前必须经过归一化，避免非法引用破坏主流程。
- 核心流程修改后应运行 `npm run test:smoke`。
- 当前项目无后端；公开部署前若要隐藏 API Key，需要新增服务端代理。

## 风险点

- **AI 输出质量**：已用 JSON 契约校验、格式修复重试、状态归一化和 smoke tests 降低风险。
- **localStorage 容量**：对话历史限制在最近 32 条 conversation turns。
- **浏览器直调 API**：适合 Demo，不适合共享密钥的公开生产环境。

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[entities/save_system]]
