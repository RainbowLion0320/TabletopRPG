---
type: concept
title: 技术选型
tags: [tech, architecture, decision, react, vite]
sources: [project_plan.md, ../../docs/SPEC.md]
created: 2026-05-14
updated: 2026-06-14
---

# 技术选型

## 选型总览

| 层次 | 选择 | 当前理由 |
|------|------|----------|
| **前端** | React 18 + TypeScript | 组件化承载复杂 UI 和游戏状态 |
| **构建工具** | Vite | 本地开发快，生产构建简单 |
| **图标** | lucide-react | 轻量、统一的按钮图标来源 |
| **AI 接入** | OpenAI Responses / OpenAI-compatible Chat Completions / 自定义端点 | 明确区分官方 Responses 与兼容网关协议 |
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
├── data/                # 规则配置、剧本、技能、职业、预设调查员
├── dm/                  # AI DM 管线、LLM adapter、记忆层
├── services/            # 骰子、存档/API 配置等通用服务
├── state/               # reducer、存档水合、AI 响应归一化
├── styles/              # 全局样式
├── types/               # 领域类型
└── main.tsx             # React 挂载入口
```

## 数据存储（localStorage）

| Key | 状态 | 内容 |
|-----|------|------|
| `trpg-saves-v2` | 当前 | 新版存档槽位数组，最多 12 条 |
| `trpg-api` | 当前 | API 配置（provider、protocol、apiKey、endpoint、model） |

> 当前代码已实现最近存档读取、存档列表、指定载入和删除；导入/导出仍在 backlog。

## 数值规则配置

核心数值规则集中在 `src/data/gameRules.ts`：

- 默认属性。
- HP/MP/SAN/Luck 派生规则。
- `EDU`、`DEX×2` 等技能基础值解析。
- 未知技能兜底值。
- 普通/困难/极难难度阈值。
- D100 大失败阈值。

预设角色生成、存档水合、选角 UI 和骰子服务都应引用该配置，不应在组件或服务中重复写公式。

## AI 调用

AI Provider 配置由 `ApiConfig` 统一承载：`provider`、`protocol`、`endpoint`、`apiKey`、`model`。

| Provider | 默认协议 | 基础端点 | 请求路径 |
|----------|----------|----------|----------|
| OpenAI | `responses` | `https://api.openai.com/v1` | `/responses` |
| MiMo | `chat-completions` | 用户配置 | `/chat/completions` |
| 自定义 | 用户显式选择 | 用户配置 | 按协议选择 |

`src/dm/llm/client.ts` 是唯一中立入口。协议差异只能存在于 `responsesAdapter.ts` 和 `chatCompletionsAdapter.ts`，DM 业务模块不得直接 `fetch` 模型 endpoint。

## 关键约束

- API Key 由用户在 UI 中输入并保存在本地浏览器，不能硬编码进仓库。
- 游戏数值公式优先进入 `src/data/gameRules.ts`，避免 UI、服务和 reducer 各自硬编码。
- AI Provider 不做失败后自动猜协议；协议由 provider 默认值或用户配置明确决定。
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
