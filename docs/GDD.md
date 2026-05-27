# 《雾中消逝》AI 跑团 GDD

> Version: v0.3
> Updated: 2026-05-27
> Current implementation: Vite + React + TypeScript MVP
> Rules baseline: COC 第七版风格 D100 检定

## 1. Core Positioning

《雾中消逝》AI 跑团是一款本地浏览器 TRPG 原型。玩家选择预设调查员，在 AI DM 主持下探索 1920 年伦敦失踪案。当前版本优先保证核心闭环：场景叙事、玩家行动、AI 判定、D100 检定、状态更新、存档恢复。

更多产品范围见 [PRD.md](PRD.md)，技术实现见 [SPEC.md](SPEC.md)。

## 2. Current Playable Loop

```text
标题页
  ├─ 开始游戏 -> 选择预设调查员 -> 游戏主界面
  ├─ 继续游戏 -> 读取最近有效存档 -> 游戏主界面
  └─ AI 设置 -> 保存 provider / key / endpoint / model

游戏主界面
  AI 叙事 -> 玩家输入行动 -> AI JSON 响应
    ├─ 无检定：叙事、线索、场景、状态更新
    └─ 有检定：前端 D100 -> 检定结果回传 AI -> 继续叙事
```

## 3. Player Experience Goals

| Goal | Current Design |
| --- | --- |
| 快速开局 | 默认选中 2 名预设调查员，最多选择 4 名 |
| TRPG 规则感 | AI 只提出检定，骰子由前端执行 |
| 单屏可玩 | 场景图、叙事、行动、队伍状态和资料抽屉都在主界面 |
| 低成本部署 | 纯前端 Vite 构建，无后端依赖 |
| 可恢复会话 | localStorage 最新存档和旧格式存档水合 |

## 4. Current Feature Scope

### Implemented

- React/Vite/TypeScript 单页应用。
- 标题页、调查员选择页、游戏主界面。
- 4 个预设调查员。
- 5 个职业定义、23 个技能定义。
- Together / Split 两种探索模式。
- AI DM 支持 OpenAI、Anthropic、MiMo、自定义 OpenAI-compatible endpoint。
- AI 响应 JSON 解析、降级文本显示、状态归一化。
- D100 检定卡和检定结果回传。
- 线索、NPC、场景、HP/SAN、flags、行动建议更新。
- localStorage `trpg-saves-v2` 存档，兼容读取旧 `trpg-saves`。
- 5 个场景、6 个 NPC 条目、8 个线索物品。

### Not Implemented Yet

- 5 步自定义角色创建。
- 存档列表弹窗和删除 UI。
- 完整战斗轮序、伤害骰、弹药、SAN 疯狂自动化。
- 音效/BGM。
- 局域网或在线多人。
- 多模组导入。
- 后端 AI 代理。

## 5. Story Module

### Basic Information

| Item | Value |
| --- | --- |
| Module | 雾中消逝 |
| Era | 1920 年 7 月 13 日，英国伦敦 |
| Initial hook | 伊莎贝拉·摩勒请求调查员寻找失踪的父亲埃里克·摩勒 |
| Core truth | 埃里克卷入毒品运输，被深潜者混种绑架至扶桑花号相关事件 |

### Scenes

| ID | Scene | Current Use |
| --- | --- | --- |
| S01 | 摩勒住宅 | 开场场景，委托人与住宅线索 |
| S02 | 上城区第二分局 | 洛夫·蒙特利尔相关调查 |
| S03 | 老赫特酒吧 | “老鼠”信息与支线调查 |
| S04 | 卡森其药店 | 核心危险场景，深潜者痕迹与地图 |
| S05 | 泰晤士港 | 终幕地点，扶桑花号相关推进 |

### Clues

| ID | Name | Scene |
| --- | --- | --- |
| I01 | 便签 | S01 |
| I02 | 合影照片 | S01 |
| I03 | 名片 | S01 |
| I04 | 小册子 | S01 |
| I05 | 鸦片样品 | S01 |
| I06 | 报纸残片 | S01 |
| I07 | 深潜者地图笔记 | S04 |
| I08 | 雪茄头 | S04 |

### NPC Entries

| NPC | Role | Current Asset |
| --- | --- | --- |
| 伊莎贝拉·摩勒 | 委托人 | `assets/npcs/npc_isabella.png` |
| 洛夫·蒙特利尔 | 警察局长 | `assets/npcs/npc_montreal.png` |
| 埃里克·摩勒 | 失踪者 | `assets/npcs/npc_eric.png` |
| 老赫特之家酒保 | 酒吧老板 | `assets/npcs/npc_bartender.png` |
| 深潜者（混种） | 神话生物 | 临时复用 `npc_eric.png` |
| 深潜者×4 | 敌方群体 | 临时复用 `npc_eric.png` |

## 6. UI Layout

Current game screen is a horizontal visual-novel/TRPG hybrid:

```text
┌──────────────────────────────────────────────┐
│ Scene backdrop + active NPC                  │
│ TopBar: title, scene, menu                   │
│                                              │
│        NarrativePanel                        │
│        ActionDock / check card / suggestions │
│                                              │
│ PartyStrip                     InfoDrawer    │
└──────────────────────────────────────────────┘
```

Low-frequency actions are grouped under `GameMenu`: save, load latest, AI settings, mode switch, restart, home.

## 7. Investigator System

Current UI supports preset selection only.

| Investigator | Job | Role |
| --- | --- | --- |
| 亨利·格雷 | 私家侦探 | 前苏格兰场侦探 |
| 艾达·华莱士 | 医生 | 战地护士出身的医生 |
| 托马斯·贝尔 | 记者 | 《每日电讯》调查记者 |
| 罗伯特·肖 | 警察 | 伦敦警察厅老牌巡警 |

The code also defines a `学者` job for future use, but no scholar preset is exposed in the current setup UI.

## 8. D100 Rule Implementation

| Result | Current Rule |
| --- | --- |
| 大失败 | roll >= 96 |
| 极难成功 | roll <= skill / 5 |
| 困难成功 | roll <= skill / 2 |
| 普通成功 | roll <= skill |
| 失败 | otherwise |

The frontend performs all dice rolls. AI DM may request a check but does not roll dice.

## 9. Backlog

| Priority | Item | Notes |
| --- | --- | --- |
| P0 | Smoke tests | Cover title -> setup -> game -> action -> save/load |
| P1 | Save manager UI | Use existing `deleteSave(id)` service |
| P1 | Custom investigator creation | Restore only after current preset flow is stable |
| P1 | Prompt files | Externalize prompt variants from `buildSystemPrompt()` |
| P2 | Combat/SAN automation | Requires clearer product rules |
| P2 | Audio | BGM/SFX after UI and flow stabilize |
| P3 | Multiplayer | Needs server/API proxy architecture |

## 10. Source of Truth

| Area | File |
| --- | --- |
| Product requirements | `docs/PRD.md` |
| Technical spec | `docs/SPEC.md` |
| Runtime story data | `src/data/storyData.ts` |
| Runtime skills/presets | `src/data/skills.ts`, `src/data/presets.ts` |
| Runtime state | `src/state/gameReducer.ts` |
| Runtime AI | `src/services/aiDm.ts` |

Historical ideas removed from the current scope are preserved in Git history rather than in this file, so the live docs do not contradict the live code.
