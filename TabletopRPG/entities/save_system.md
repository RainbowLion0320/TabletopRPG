---
type: entity
title: 存档系统
tags: [save, storage, localStorage]
sources: [project_plan.md, ../../docs/SPEC.md]
created: 2026-05-18
updated: 2026-05-29
---

# 存档系统

## 概述

当前存档系统基于 browser localStorage。UI 支持保存当前游戏、读取最近有效存档、标题页继续游戏、存档列表、指定载入和删除单个存档。

## localStorage Key 分配

| Key | 状态 | 用途 |
|-----|------|------|
| `trpg-saves-v2` | 当前 | 新版存档槽位数组，最多 12 条 |
| `trpg-api` | 当前 | AI Provider/API Key/endpoint/model |

## 存档数据结构

```ts
interface SaveSlot {
  id: number;
  savedAt: string;
  scene: string;
  players: string;
  gameState: GameState;
}
```

`gameState` 在保存和读取时都会经过 `hydrateGameState()`，用于补齐或修复：

- 缺失的 `messages` / `suggestions` / `actionLog` 等新字段。
- 角色字段缺失的 `id`、`currentHp`、`skills` 等。
- 非法场景、NPC、线索等引用。

## 功能特性

### 存档
- 游戏菜单中点击“保存游戏”。
- 新存档写入 `trpg-saves-v2`。
- 最多保留 12 条。
- 保存后刷新标题页“最近存档”状态。

### 读档
- 标题页“继续游戏”读取最新有效存档。
- 游戏菜单“读取存档”也读取最新有效存档。
- 游戏菜单“存档管理”打开存档列表，可指定载入任一有效存档。
- 读取 `trpg-saves-v2`，按时间倒序去重。

### 删除
- 存档管理弹窗提供“删除存档”。
- 删除后重读 `trpg-saves-v2`，空列表显示“暂无存档”。

### API 配置
- `trpg-api` 保存 provider、apiKey、endpoint、model。

## 当前限制

- 存档依赖浏览器 localStorage，换浏览器/清缓存会丢失。
- localStorage 容量通常约 5MB，长对话仍需注意。

## Backlog

- 存档导入/导出。
- 长期部署时考虑服务端存储或文件下载。

## 被引用于
- [[overview]]
- [[concepts/tech_stack]]
- [[concepts/core_loop]]
