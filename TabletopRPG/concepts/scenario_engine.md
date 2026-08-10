---
type: concept
title: 模组规范与剧情推进引擎
tags: [scenario, yaml, progression, rules, save-v8]
sources: [../../scenarios/wuzhongxiaoshi/manifest.yaml, ../../docs/scenarios/authoring-guide.md, ../../docs/SPEC.md]
created: 2026-07-12
updated: 2026-07-12
---

# 模组规范与剧情推进引擎

## 事实源

模组由 `manifest / world / progression / rules / presentation` 五个 YAML 文件组成。YAML 是唯一人工维护事实源；运行时 TypeScript、声明类型、KP 手册、剧情图和案件板骨架均由 `scenario:generate` 生成。

## 运行模型

`ScenarioProgress` 记录模组版本、世界时间、活动幕、节点/目标状态、玩家已知事实、线索状态、幂等事件、声明变量、时钟、遭遇、检定结果和结局。

Condition/Effect 是无脚本 DSL。AI 只能提议当前节点列出的 `eventId`；Director 校验条件后，reducer 原子应用 YAML 效果。AI 不能直接创建权威地点、人物、线索、事实、变量或结局。

玩家明确声明与作者事件一致时，本地规则也可生成同一 `propose_story_event` 候选，但仍必须通过 Director 条件审核。Narrator 连续两次违反场景语义时只生成当前场景内的安全无进展叙事，之后交给空转升级恢复，不允许模型错误阻塞整局。

## 推进保障

- 场景可达性 = 空间出口 + Condition。
- `once` 事件在模型重试和读档后不重复执行。
- 必经节点 3 回合软提示，6 回合 fail-forward。
- 关键线索失败或损坏时执行替代事件，不允许主线死局。
- v8 存档校验模组版本和内容哈希，旧存档保守迁移且不补发惩罚/奖励。

## 被引用于
- [[core_loop]]
- [[../entities/ai_dm]]
- [[../entities/save_system]]
- [[../overview]]
