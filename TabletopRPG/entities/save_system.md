---
type: entity
title: 存档系统
tags: [save, storage, localStorage]
sources: [project_plan.md, ../../docs/SPEC.md]
created: 2026-05-18
updated: 2026-09-09
---

# 存档系统

## 概述

Android 独立客户端通过同一存储端口使用本机 Keystore 加密保存，并额外自动记录续玩状态、待重试行动和已锁定骰点；原网页继续使用 localStorage。详见 [[concepts/android_app]]。

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
  moduleId: string;
  moduleVersion: string;
  contentHash: string;
  version: 8;
}
```

`gameState` 在保存和读取时都会经过 `hydrateGameState()`，用于补齐或修复：

- 缺失的 `messages` / `suggestions` / `actionLog` 等新字段。
- 角色字段缺失的 `id`、`currentHp`、`skills` 等。
- 非法场景、NPC、线索等引用。
- v7 案件板的稳定语义键、关系键和实体 insights。
- v6 案件板在读档时确定性折叠原子事实卡、重定向关系端点并归档低价值孤立卡；迁移不调用模型。
- v1-v7 根据场景、线索、flags 和事件历史恢复 `ScenarioProgress`；S04/S05 不补发 SAN、入场事件或奖励。
- 内容哈希不匹配且没有模组迁移函数时拒绝载入。

模组版本与推进状态定义详见 [[concepts/scenario_engine]]。

## 功能特性

### 存档
- 游戏菜单中点击“保存游戏”。
- 新存档写入 `trpg-saves-v2`。
- 最多保留 12 条。
- 保存后刷新标题页“最近存档”状态。
- 同毫秒连续保存使用递增 ID；写入或删除失败时显示提示，不假报成功。
- 未完成 AI 回合保留 `pendingDmActions` 与本地确认骰果，可读档后“重试本轮”，不会重复声明或重掷。
- 骰子动画及待确认结果期间禁止存档；结束结局不恢复遗留检定。
- `summarizedTurnCount` 保留摘要移除的正式回合数，避免长局读档后回合倒退。

### 读档
- 标题页“继续游戏”读取最新有效存档。
- 游戏菜单“读取存档”也读取最新有效存档。
- 游戏菜单“存档管理”打开存档列表，可指定载入任一有效存档。
- 读取 `trpg-saves-v2`，按时间倒序去重。

### 删除
- 存档管理弹窗提供“删除存档”。
- 删除后重读 `trpg-saves-v2`，空列表显示“暂无存档”。

### API 配置
- `trpg-api` 保存 provider、protocol、apiKey、endpoint、model。
- 开发环境可同步写入 `.env.local`，保留无关配置和注释；写入不触发游戏刷新。生产版本只提示已保存到当前浏览器。

## 当前限制

- 存档依赖浏览器 localStorage，换浏览器/清缓存会丢失。
- localStorage 容量通常约 5MB，长对话仍需注意。

## Backlog

- 存档导入/导出。
- 长期部署时考虑服务端存储或文件下载。

## 被引用于
- [[concepts/android_app]]
- [[overview]]
- [[concepts/tech_stack]]
- [[concepts/core_loop]]
