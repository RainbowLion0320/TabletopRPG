---
type: concept
title: 技术选型
tags: [tech, architecture, decision]
sources: [project_plan.md]
created: 2026-05-14
updated: 2026-05-14
---

# 技术选型

## 选型总览

| 层次 | 选择 | 核心理由 |
|------|------|----------|
| **前端** | 原生 HTML + JS | 无构建链，团队全员（包括唐龙翔 Vibe Coding）均可参与修改 |
| **AI 接入** | OpenAI / Claude API | 直接调用，最快路径验证玩法，无需中间层 |
| **数据存储** | localStorage + JSON | 无需后端，存档读档成本极低，纯前端闭环 |
| **策划文档** | Markdown | Git 原生渲染，策划直写，技术直读 |
| **版本管理** | Git + GitHub | 文档 + 代码 + 资产统一管理 |
| **部署** | GitHub Pages / Vercel | 零成本，URL 即可分享游玩 |

## 关键约束

- **API Key 安全**：通过页面输入框传入，绝对不硬编码进代码提交
- **无框架原则**：不引入 React/Vue 等框架，保持简单可改
- **代码规范**：缩进 2 空格，文件编码 UTF-8

## 架构边界

```
浏览器
├── index.html        入口
├── js/ai.js          ← OpenAI/Claude API 调用封装（唯一对外接口）
├── js/storage.js     ← localStorage 读写封装
├── js/main.js        ← 主逻辑，协调 ai.js 和 storage.js
└── js/dice.js        ← 骰子系统（方案C才需要）
```

## 风险点

- **Context Window 限制**：长对话后 API 费用和 token 限制需要处理（截断策略 TBD）
- **API 费用**：测试阶段用较便宜的模型（gpt-4o-mini / claude-haiku），生产用更好的
- **localStorage 容量**：一般浏览器限制 5MB，长存档需要注意

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[entities/save_system]]
