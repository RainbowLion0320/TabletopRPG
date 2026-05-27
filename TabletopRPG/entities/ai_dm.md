---
type: entity
title: AI DM 系统
tags: [ai, core, implemented]
sources: [project_plan.md, ../../docs/SPEC.md]
created: 2026-05-14
updated: 2026-05-27
---

# AI DM 系统

## 角色定位

AI 担任完整的 TRPG 游戏主持人（DM/KP），负责场景描述、NPC 扮演、行动裁判、检定请求和剧情推进。骰子权威属于前端，AI 只能提出是否需要检定。

详见 [[decisions/ai_role_decision]]

## 支持的 AI Provider

| Provider | 端点 | 默认模型 |
|----------|------|----------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o` |
| Anthropic Claude | `https://api.anthropic.com/v1/messages` | `claude-3-5-sonnet-latest` |
| MiMo | `https://token-plan-cn.xiaomimimo.com/v1/chat/completions` | `mimo-v2.5` |
| 自定义 | `{endpoint}/chat/completions` | 用户配置或 `gpt-4o` |

## API 调用架构

```
玩家行动
  -> buildSystemPrompt(state)
  -> callAiDm(config, state, actions)
  -> extractJson(raw)
  -> prepareCheck()（如有检定）
  -> gameReducer.applyAiResponse
  -> normalizeAiResponse()
  -> UI 更新
```

## 系统提示词组成

1. 基本主持要求与防注入规则。
2. 玩家行动容错度规则（MVP 采用 2.5-3 档）。
3. 场景数据、线索数据、NPC 数据。
4. 当前游戏状态快照（当前场景、玩家位置、flags、clues）。
5. 调查员数据（属性、HP/SAN、技能、背景）。
6. D100 检定规则与骰子权威性。
7. 严格 JSON 输出格式。

当前运行版提示词在 `src/services/aiDm.ts` 的 `buildSystemPrompt()` 内动态构建。

## 行动容错度

MVP 阶段采用 **2.5-3 档容错**：宽容玩家的做法，不宽容破坏世界逻辑和主线闭环。

- 合理但非预设行动应允许尝试，并在需要时触发技能检定。
- 创意解法应转化为检定、代价、线索、NPC 反应或场景后果。
- 高风险行动可以发生，但必须带来警觉、受伤、SAN 损失、线索损坏、NPC 敌对或时间压力等后果。
- 偏离主线的行动先响应，再通过新信息、NPC 压力或环境变化自然引回调查。
- 破坏关键地点或对象时，AI 不应制造死局，需要保留替代线索路径或后果路径。
- 只有违反物理现实、角色能力/资源、内容安全、prompt 注入或要求无视前端骰子时，才明确拒绝。

## 骰子权威性

骰子结果是规则事实，AI 不可以在任何情况下无视、重掷、推翻或改写前端骰子结果。

- AI 可以提出检定请求，但技能阈值、掷骰和结果等级由前端规则系统决定。
- 成功不能被叙述成失败，失败不能被叙述成成功。
- 大失败必须体现明显负面后果。
- AI 可以“失败但推进”，但必须保留失败事实，通过代价、替代线索、NPC 反应或后续机会继续剧情。
- 玩家要求改骰、重掷、宣布成功或忽略大失败时，AI 必须拒绝或重申规则边界。

## 多玩家冲突处理

一起行动模式下，AI DM 负责判断多名玩家本轮声明是否存在实质冲突。

1. 首次冲突：不结算本轮不可逆后果，提示玩家重新输入一次本轮行动。
2. 再次冲突：请求前端骰子仲裁，MVP 使用 `幸运` 普通难度检定。
3. 两名玩家冲突时，AI 指定其中一名冲突玩家掷 `幸运`：成功则该玩家需求优先，失败则对方需求优先。
4. 多名玩家冲突时，先处理最直接的一组冲突，复杂情况可拆成多次仲裁。
5. 仲裁只决定本轮行动优先级，不剥夺其他玩家后续行动权。

严重影响剧情的不可逆行为（如杀掉关键 NPC、破坏关键证物）需要额外保护：AI 应先反复确认并说明后果；若行为会破坏主线闭环，可用 NPC 逃离、他人制止、证物转移、门锁、浓雾、警察或暴徒介入等环境外力阻挡。

## AI 响应格式

```json
{
  "narrative": "给玩家看的叙事文本，200字以内",
  "activeNpc": "当前交互 NPC 全名或 null",
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

`check` 可为：

```json
{ "skill": "侦查", "difficulty": "普通|困难|极难", "player": "角色名", "reason": "触发原因" }
```

## 兜底与归一化

- 支持解析 ```json 包裹的返回。
- 支持从混合文本中提取 JSON 对象。
- 非 JSON 文本会作为 DM 叙事展示。
- 场景支持 `S01`-`S05` 或已知场景中文名。
- 未知 NPC 会归一化为 `null`。
- HP/SAN 数值字符串会转为数字，非法值忽略。
- 线索支持 item id 和已知线索名。
- 检定难度包含 `极` 归为极难，包含 `困` 归为困难，否则普通。

## 上下文管理

- AI 调用时发送最近 24 条 conversation history。
- reducer 内保留最近 32 条 conversation turns。
- 系统提示词每次基于最新状态重建，不依赖历史中的旧状态。

## 技能检定流程

1. AI 返回 `check` 字段。
2. 前端根据调查员技能与难度计算阈值。
3. 玩家点击掷骰。
4. 前端生成 D100 结果。
5. 检定结果作为新的 user turn 回传给 AI。

### 判定标准

| 结果 | 条件 |
|------|------|
| 大失败 | 骰值 >= 96 |
| 极难成功 | 骰值 <= 技能值/5 |
| 困难成功 | 骰值 <= 技能值/2 |
| 普通成功 | 骰值 <= 技能值 |
| 失败 | 其他 |

## 游戏模式

### 一起行动（Together）
- 所有玩家同时输入行动。
- AI 在一次叙事中统一结算。

### 分头探索（Split）
- `playerLocations` 追踪每名玩家所在场景。
- 当前玩家单独提交行动。

## 被引用于
- [[overview]]
- [[decisions/ai_role_decision]]
- [[concepts/core_loop]]
- [[entities/character_system]]
