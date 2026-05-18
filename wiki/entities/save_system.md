---
type: entity
title: 存档系统
tags: [save, storage, localStorage]
sources: [project_plan.md]
created: 2026-05-18
updated: 2026-05-18
---

# 存档系统

## 概述

基于 localStorage 的多槽位存档/读档系统，支持手动存档、继续游戏和存档管理。

## 存储方案

所有数据存储在浏览器 localStorage 中，以 JSON 格式序列化。

### localStorage Key 分配

| Key | 用途 | 数据类型 |
|-----|------|----------|
| `trpg-character` | 当前活动角色数据 | Object |
| `trpg-saves` | 存档槽位数组 | Array |
| `trpg-api` | API 配置信息 | Object |
| `trpg-api-history` | 最近使用的 API Key 记录 | Array（上限 10） |
| `trpg-game-logs` | 错误/调试日志 | Array（上限 200） |

## 存档数据结构

```javascript
{
  id: timestamp,          // 存档唯一标识（时间戳）
  charName: "角色名",
  charJob: "职业",
  timestamp: "保存时间",
  character: {            // 完整角色数据
    name, job, gender, age, attrs, skills, background, hp, mp, san
  },
  gameState: {            // 完整游戏状态
    players: [],
    conversationHistory: [],
    playerLocations: {},
    declarations: {},
    clues: [],
    flags: {},
    currentScene: "S01",
    exploreMode: "together",
    currentSplitPlayer: 0,
    pendingCheck: null
  }
}
```

## 功能特性

### 存档
- 支持多槽位存档（无固定上限）
- 每个存档记录角色名、职业、保存时间
- 保存完整游戏状态（对话历史、场景位置、线索、标记等）

### 读档
- 继续游戏弹窗展示所有存档列表
- 显示角色名、职业和保存时间
- 单击即可加载存档恢复游戏

### 存档管理
- 支持删除单个存档
- 标题页显示"继续游戏"按钮（有存档时）

## 容量限制

- localStorage 一般限制 5MB
- 对话历史是最大的存储消耗项
- 通过限制保留 12 轮对话历史（AI DM 层面）控制单次存档大小

## 被引用于
- [[overview]]
- [[concepts/tech_stack]]
- [[concepts/core_loop]]
