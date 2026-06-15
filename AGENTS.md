# TabletopRPG Wiki Schema

这是 AI 跑团游戏项目的 Wiki 维护规范。当你（LLM Agent）被要求操作本 wiki 时，必须遵守以下约定。

---

## 目录结构

```
TabletopRPG/
├── index.md              # 内容目录（每次 ingest/更新后必须同步）
├── log.md                # 操作日志（append-only，只追加不修改）
├── overview.md           # 项目全局综述
├── concepts/             # 核心概念页（玩法机制、技术概念等）
├── entities/             # 实体页（人物、系统模块、关键资产等）
├── sources/              # 原始资料的摘要页
└── decisions/            # 重要决策记录

raw/                      # 原始素材（只读，LLM 不得修改）
```

> 历史资料里可能出现 `wiki/` 这个占位名；当前仓库中的实际 wiki 目录是 `TabletopRPG/`。所有新增和更新都必须写入 `TabletopRPG/`。

---

## 页面类型与格式

每个 wiki 页面顶部须有 YAML frontmatter：

```yaml
---
type: concept | entity | source | decision | overview
title: 页面标题
tags: [tag1, tag2]
sources: [原始资料文件名或链接]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

---

## 操作规范

### Ingest（导入新资料）
1. 将原始资料放入 `raw/`
2. 读取原始资料，与用户讨论关键要点
3. 在 `TabletopRPG/sources/` 写摘要页
4. 更新 `TabletopRPG/overview.md`（如有影响）
5. 更新或新建相关 `concepts/` 和 `entities/` 页面
6. 更新 `TabletopRPG/index.md`
7. 在 `TabletopRPG/log.md` 追加一条日志：`## [YYYY-MM-DD] ingest | 资料名称`

### Query（查询）
1. 先读 `TabletopRPG/index.md` 找相关页面
2. 读取相关页面后综合回答
3. 有价值的查询结果可以作为新页面存入 wiki（与用户确认）

### Lint（健康检查）
检查：孤立页面（无入链）、矛盾内容、缺失的交叉引用、过时信息。
在 `TabletopRPG/log.md` 追加：`## [YYYY-MM-DD] lint | 发现 N 个问题`

---

## 工程操作规范

- 项目级贡献规则见 `CONTRIBUTING.md`，Git 入门流程见 `docs/git使用指南.md`。
- 代码改动至少运行 `npm test` 和 `npm run build`；涉及浏览器交互、主游戏界面、AI DM 端到端流程时再运行 `npm run test:smoke`。
- AI DM 业务模块不得直接调用模型 endpoint。Narrator、Summarizer、Memory、caseBoardSynthesizer 模块只能通过 `src/dm/llm/client.ts` 访问模型。
- 只有 `src/dm/llm/*Adapter.ts` 可以包含 `/responses`、`/chat/completions` 或协议专用请求字段。
- 动态案件板只能走“AI 提议 patch -> reducer 审核落地”链路；AI 不得直接写 UI、坐标、未解锁 secret 或绕过 `applyCaseBoardPatch`。
- 不得提交 `.env.local`、API Key、`dist/`、`test-results/`、`playwright-report/`、`node_modules/` 或原始设计稿。

---

## 交叉引用规范

- 页面内引用其他 wiki 页面用相对路径：`[[entities/角色系统]]`
- 引用原始资料用：`[资料名](../../raw/文件名)`
- 每个实体/概念页底部维护"被引用于"反向链接列表

---

## 本项目 Wiki 页面清单（初始规划）

### entities/
- `team.md` — 团队成员与分工
- `ai_dm.md` — AI DM 系统（核心实体，待决策锁定后填充）
- `character_system.md` — 角色系统（属性/职业/背景）
- `save_system.md` — 存档系统

### concepts/
- `core_loop.md` — 核心玩法循环
- `prompt_engineering.md` — 提示词工程方法论
- `tech_stack.md` — 技术选型与决策

### decisions/
- `ai_role_decision.md` — AI 角色定位决策（⚠️ 2026-05-18 前必须锁定）
- `mvp_scope.md` — MVP 功能范围

### sources/
- `project_plan.md` — 项目推进方案摘要
