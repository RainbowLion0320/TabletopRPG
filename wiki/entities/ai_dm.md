---
type: entity
title: AI DM 系统
tags: [ai, core, implemented]
sources: [project_plan.md]
created: 2026-05-14
updated: 2026-05-18
---

# AI DM 系统

## 角色定位

AI 担任完整的 TRPG 游戏主持人（DM），基于 COC 第七版规则，负责场景描述、剧情推进、技能检定判定、NPC 扮演和状态管理。采用**方案 C（完整 TRPG + 骰子系统）**。

详见 [[decisions/ai_role_decision]]

## 支持的 AI Provider

| Provider | 端点 | 默认模型 |
|----------|------|----------|
| Anthropic Claude | `https://api.anthropic.com/v1/messages` | Claude Sonnet 4.5 |
| OpenAI | ChatCompletions 端点 | GPT-4o |
| MiMo | 自定义端点 | 可配置 |
| 自定义 | 用户输入端点 | 用户输入模型 |

## API 调用架构

```
玩家输入 -> buildSystemPrompt() -> API 调用 -> processAIResponse() -> UI 更新
```

### 系统提示词组成

1. 游戏规则（COC 7th Edition 检定机制）
2. 剧本数据（场景、物品、NPC）
3. 当前游戏状态快照（玩家位置、已发现线索、故事标记）
4. 全部玩家角色数据（属性、技能、背景）
5. 输出格式规范（严格 JSON）

### AI 响应格式（JSON）

```json
{
  "narrative": "场景描述文本（前端以打字机效果展示）",
  "check": {
    "skill": "侦查",
    "difficulty": "普通|困难|极难",
    "player": "角色名"
  },
  "stateUpdate": {
    "hp": { "角色名": -2 },
    "san": { "角色名": -1 },
    "flags": { "metMontreal": true }
  },
  "playerChoices": ["建议行动1", "建议行动2", "建议行动3"],
  "nextPrompt": "引导下一步行动（1-2句话）"
}
```

## 上下文管理

- 保留最近 **12 轮**（24 条消息）对话历史
- 超出后自动截断最早的消息
- 防止 context window 溢出

## 技能检定流程

1. AI 判定需要技能检定 -> 返回 `check` 字段
2. 前端弹出 D100 骰子界面
3. 玩家投骰 -> 显示结果（大成功/成功/困难成功/极难成功/失败/大失败）
4. `sendCheckResultToAI()` 将结果传回 AI
5. AI 根据检定结果叙述后续发展

### 判定标准（COC 7th Edition）

| 结果 | 条件 |
|------|------|
| 大成功 | 骰值 <= 技能值/5 |
| 极难成功 | 骰值 <= 技能值/2 |
| 成功 | 骰值 <= 技能值 |
| 失败 | 骰值 > 技能值 |
| 大失败 | 骰值 96-100 |

## 游戏模式

### 合作模式（Together）
- 所有玩家同时输入行动（声明池）
- AI 在一次叙事中统一解决所有行动

### 分离模式（Split）
- 追踪各玩家所在场景
- 玩家分别提交行动
- AI 按场景分别叙述

## 兜底逻辑

- JSON 解析失败时使用正则匹配提取
- API 调用错误时显示错误信息并记录到内置日志系统

## 被引用于
- [[overview]]
- [[decisions/ai_role_decision]]
- [[concepts/core_loop]]
- [[entities/character_system]]
