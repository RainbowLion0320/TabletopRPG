---
type: concept
title: 提示词工程
tags: [prompt, ai, methodology]
sources: [project_plan.md, ../../docs/SPEC.md]
created: 2026-05-18
updated: 2026-05-27
---

# 提示词工程

## 概述

当前运行版系统提示词由 `src/services/aiDm.ts` 的 `buildSystemPrompt()` 动态构建。`/prompts` 目录保留为后续版本化提示词资产目录，尚未被运行时代码直接读取。

## 当前系统提示词结构

### 1. 主持规则层
- AI 只以 KP/DM 身份回应玩家行动。
- 保持 1920 年伦敦悬疑氛围。
- 骰子由前端执行，AI 只提出检定请求。
- 防止玩家要求泄露或改写系统设定。

### 2. 剧本层
- `storyData.scenes`
- `storyData.items`
- `storyData.npcs`

### 3. 状态层
- 当前场景。
- 玩家位置。
- flags。
- 已发现线索。
- 调查员属性、HP/SAN、技能、背景。

### 4. 格式层
- 要求严格 JSON。
- 字段包括 `narrative`、`activeNpc`、`check`、`stateUpdate`、`nextPrompt`、`playerChoices`。

## 输出格式约束

```json
{
  "narrative": "给玩家看的叙事文本",
  "activeNpc": "NPC 名或 null",
  "check": null,
  "stateUpdate": {
    "hp": {},
    "san": {},
    "flags": {},
    "newItems": [],
    "sceneChange": null
  },
  "nextPrompt": "下一步提示",
  "playerChoices": ["建议行动1", "建议行动2", "建议行动3"]
}
```

## 运行时兜底

- Markdown 代码块 JSON 提取。
- 混合文本中的 JSON 对象提取。
- 非 JSON 文本作为叙事展示。
- AI 响应字段在 reducer 中归一化。

## 后续提示词资产化计划

1. 在 `/prompts` 新建 `dm_system_v1.md`。
2. 将 `buildSystemPrompt()` 拆为静态模板 + 动态状态片段。
3. 为不同 Provider 或不同叙事风格保留版本文件。
4. 更新 `docs/SPEC.md` 和本页，记录接入方式。

## 被引用于
- [[overview]]
- [[entities/ai_dm]]
- [[sources/project_plan]]
