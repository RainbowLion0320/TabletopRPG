---
type: concept
title: 动态案件板与调查台
tags: [case-board, ai, ui, memory, implemented]
sources: [../../docs/PRD.md, ../../docs/SPEC.md, ../../docs/GDD.md]
created: 2026-07-11
updated: 2026-10-08
---

# 动态案件板与调查台

0.4.12 移动端复用原人物/场景照片和档案底板，去掉重复计数、单记录重复标题与零项摘要；资料页签和搜索/筛选常驻，长列表单独滚动，详情返回原卡片。手机与原生宽竖屏不构建隐藏关系图，React Flow/ELK/worker 仅桌面按需加载；手机/桌面切换保留查询与类型，清除不可见的脉络筛选。进度只显示已发现/已分析数量，不泄露剧本线索总数。事实来源、可见范围和 patch 审核不变。

## 定位

案件板是玩家可见的调查工作区，不是完整日志，也不是 AI 自由生成的证据墙。v7 使用“静态主线骨架 + 确定性实体档案 + AI 核心关系提议 + reducer 审核”的混合结构。

## 信息分层

- 主图只显示人物、地点、物证、关键事件和核心推测。
- `goal`、`stance_toward`、`knowledge`、`capability`、`state` 进入所属实体的 insight 时间线。
- `relationship` 仅在双方都为玩家已知实体时成为关系边，否则进入已知主体档案。
- 新物品激活剧本静态节点，不重复创建动态物证卡。
- 事件至少连接一个可见锚点；推测至少连接两个可见锚点。

## 身份与审核

- 节点按 `semanticKey` 合并。
- insight 按 `slotKey` 更新。
- 关系按 `relationKey` 更新，并可从 hypothesis 升级为 confirmed。
- 所有动态内容必须引用玩家已见 fact、event 或 clue；未解锁 secret、未来后果和孤立节点不得进入主图。
- 上限为 30 个动态核心节点、60 条动态边和 120 条 insight，超限优先归档旧的低置信推测。

## 展示

- 桌面端由 React Flow 渲染，ELK Layered 负责从左到右分层和正交连线。
- connected components 自动形成“调查脉络”；支持搜索、类型筛选、推测开关、平移、缩放和适配。
- 选中节点后显示右侧档案，包括公开描述、已解锁信息、关系、insight 时间线和玩家可读来源。
- 移动端改为按调查脉络分组的纵向列表，并使用全屏详情层。
- 坐标不进入模型契约或存档；后台新增节点保持当前视口。

## 存档迁移

v7 存档持久化核心节点、关系和 insights。v6 存档在 hydrate 时根据原子事实确定性迁移：目标、态度和知识卡折叠进实体档案，关系卡转为边，孤立低价值卡归档。迁移不调用模型。

## 被引用于

- [[../overview]]
- [[../entities/ai_dm]]
- [[tech_stack]]
- [[game_ui]]
- [[android_app]]
- [[../index]]
