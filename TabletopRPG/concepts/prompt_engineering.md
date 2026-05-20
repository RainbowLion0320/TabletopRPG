---
type: concept
title: 提示词工程
tags: [prompt, ai, methodology]
sources: [project_plan.md]
created: 2026-05-18
updated: 2026-05-18
---

# 提示词工程

## 概述

项目采用版本化提示词管理方法，所有 AI 提示词通过 Git 版本控制，确保可追溯和可回滚。

## 管理规范

- 提示词文件存放在 `/prompts` 目录
- 每次修改走 Git commit，重大变更新建版本文件
- 刘晓为提示词工程主力，唐龙翔负责前端集成

## 系统提示词结构

AI DM 的系统提示词（`buildSystemPrompt()`）由以下部分动态组合：

### 1. 规则层
- COC 7th Edition 核心检定规则
- D100 技能检定机制说明
- 难度等级定义（普通/困难/极难）

### 2. 剧本层
- 当前剧本数据（`STORY_DATA`）
- 场景描述、NPC 信息、物品列表
- 故事标记（flags）状态

### 3. 状态层
- 当前游戏状态快照
- 所有玩家角色数据（属性、技能、HP/MP/SAN）
- 玩家位置、已发现线索
- 当前探索模式（合作/分离）

### 4. 格式层
- 严格 JSON 输出格式规范
- 各字段含义和取值范围
- 确保前端可靠解析

## 输出格式约束

AI 被要求以严格 JSON 格式返回，包含：
- `narrative` -- 叙事文本
- `check` -- 技能检定请求（可选）
- `stateUpdate` -- 状态变更（可选）
- `playerChoices` -- 推荐行动列表
- `nextPrompt` -- 下一步引导

详见 [[entities/ai_dm]] 的 AI 响应格式部分。

## 上下文窗口管理

- 对话历史限制在最近 12 轮（24 条消息）
- 超出自动截断最早消息
- 系统提示词每次重建（包含最新状态），不依赖历史中的状态信息

## 多 Provider 适配

不同 AI Provider 的 API 格式差异在调用层处理：
- Anthropic Claude：使用 Messages API 格式
- OpenAI：使用 ChatCompletions 格式
- MiMo / 自定义：兼容 OpenAI 格式

提示词内容本身保持 Provider 无关。

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[sources/project_plan]]
