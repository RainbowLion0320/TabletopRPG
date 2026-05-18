---
type: concept
title: 技术选型
tags: [tech, architecture, decision]
sources: [project_plan.md]
created: 2026-05-14
updated: 2026-05-18
---

# 技术选型

## 选型总览

| 层次 | 选择 | 核心理由 |
|------|------|----------|
| **前端** | 原生 HTML + CSS + JS（单文件） | 无构建链，团队全员均可参与修改 |
| **AI 接入** | Anthropic / OpenAI / MiMo API | 多 Provider 支持，直接调用，无需中间层 |
| **数据存储** | localStorage + JSON | 无需后端，存档读档成本极低，纯前端闭环 |
| **游戏规则** | COC 第七版（D100） | 成熟规则体系，技能检定机制明确 |
| **策划文档** | Markdown | Git 原生渲染，策划直写，技术直读 |
| **版本管理** | Git + GitHub | 文档 + 代码 + 资产统一管理 |
| **部署** | GitHub Pages / Vercel | 零成本，URL 即可分享游玩 |

## 关键约束

- **API Key 安全**：通过 `config.local.js`（gitignored）配置预设，或通过页面输入框传入，绝对不硬编码进代码提交
- **单文件架构**：所有 HTML / CSS / JS 集中在 `src/index.html`，不引入 React/Vue 等框架
- **代码规范**：缩进 2 空格，文件编码 UTF-8

## 架构结构

```
src/
├── index.html            # 游戏主体（HTML + CSS + JS 单文件，~4000行）
├── config.local.js       # API Key 预设配置（gitignored）
└── config.local.example.js  # 配置模板

代码逻辑分区（index.html 内部）：
├── Pages / HTML 结构      # 页面结构（标题页、创建页、游戏页）
├── Styles / CSS          # 全部样式
├── Game Data             # 剧本数据（STORY_DATA）、职业定义、技能列表
├── Game Logic            # 游戏状态管理、角色创建、存档读档
├── AI Integration        # AI DM 调用、提示词构建、响应解析
└── UI Handlers           # DOM 事件处理、打字机效果、骰子动画
```

## 数据存储（localStorage）

| Key | 内容 |
|-----|------|
| `trpg-character` | 当前角色数据 |
| `trpg-saves` | 存档槽位数组 |
| `trpg-api` | API 配置（provider、key、endpoint、model） |
| `trpg-api-history` | 最近 10 个使用过的 API Key |
| `trpg-game-logs` | 错误/调试日志（上限 200 条） |

## 风险点

- **Context Window 限制**：已实现截断策略（保留最近 12 轮 / 24 条消息）
- **API 费用**：测试阶段用较便宜的模型（claude-haiku / gpt-4o-mini），生产用更好的
- **localStorage 容量**：一般浏览器限制 5MB，长存档需要注意
- **JSON 解析**：AI 返回非标准 JSON 时使用正则兜底提取

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[entities/save_system]]
