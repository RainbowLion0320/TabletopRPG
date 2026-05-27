# Wiki 操作日志

> Append-only，只追加不修改。格式：`## [YYYY-MM-DD] 操作类型 | 描述`

---

## [2026-05-14] ingest | AI跑团游戏项目推进方案.html

- 导入原始资料：项目推进方案 v1.0
- 新建页面：
  - `wiki/overview.md` — 项目全局综述
  - `wiki/sources/project_plan.md` — 原始资料摘要
  - `wiki/entities/team.md` — 团队成员
  - `wiki/entities/ai_dm.md` — AI DM 系统（待决策）
  - `wiki/concepts/tech_stack.md` — 技术选型
  - `wiki/decisions/ai_role_decision.md` — AI 角色定位决策（未决）
- 更新：`wiki/index.md`
- Schema：`AGENTS.md` 初始化完成

## [2026-05-18] update | Wiki 全面同步至当前项目状态

- 背景：项目已完成大量核心功能开发，Wiki 仍停留在 5/14 立项阶段，严重滞后
- 更新已有页面：
  - `wiki/overview.md` — 更新项目状态为 Phase 2，补充已完成功能列表，更新时间节点状态
  - `wiki/entities/ai_dm.md` — 标记已实现，补充完整系统架构（多 Provider、JSON 格式、检定流程、上下文管理）
  - `wiki/decisions/ai_role_decision.md` — 标记已决定，记录选择方案 C（完整 TRPG + D100）及决策依据
  - `wiki/concepts/tech_stack.md` — 修正架构描述（分文件 -> 单文件），补充 localStorage Key 表、MiMo Provider、JSON 兜底逻辑
- 新建页面：
  - `wiki/entities/character_system.md` — 角色系统（6 职业、22 技能、4 预设、5 步创建流程）
  - `wiki/entities/save_system.md` — 存档系统（多槽位、数据结构、容量限制）
  - `wiki/concepts/core_loop.md` — 核心玩法循环（主循环流程、合作/分离模式、检定机制、剧本模块）
  - `wiki/concepts/prompt_engineering.md` — 提示词工程（版本化管理、系统提示词结构、多 Provider 适配）
  - `wiki/decisions/mvp_scope.md` — MVP 功能范围（已实现清单、待确认项、排除项）
- 更新：`wiki/index.md` — 全部状态标记刷新，所有引用链接指向已存在的文件
- 发现并修复问题 13 项（详见对话记录）

## [2026-05-27] update | PRD / SPEC / Wiki / Code 全量对齐

- 对齐基线：以当前 Vite + React + TypeScript 运行时代码为事实源。
- 新增文档：
  - `docs/PRD.md` — 当前 MVP 产品范围、用户流程、验收标准
  - `docs/SPEC.md` — 技术架构、状态、AI、存档、骰子契约
- 重写/同步：
  - `docs/GDD.md` / `docs/GDD.html` — 更新为 v0.3 当前实现版
  - `README.md`、`docs/README.md`、`assets/README.md`、`prompts/README.md`、`src/README.md`
  - `overview.md`、`index.md`
  - `entities/ai_dm.md`、`entities/character_system.md`、`entities/save_system.md`、`entities/team.md`
  - `concepts/core_loop.md`、`concepts/tech_stack.md`、`concepts/prompt_engineering.md`
  - `decisions/mvp_scope.md`、`decisions/ai_role_decision.md`
- 主要修正：移除旧“单文件 HTML / 5 步自定义创建 / 旧存档 key”为当前事实的描述，明确这些内容进入 backlog 或历史记录。

## [2026-05-27] update | AI DM 容错度决策落地

- GDD 锁定 AI DM 容错度为 2.5-3 档：宽容玩家方法，不宽容破坏世界逻辑和主线闭环。
- SPEC 和运行时 system prompt 同步加入容错执行规则。
- Wiki 同步更新 AI DM 系统、提示词工程和 AI 角色定位决策。

## [2026-05-27] update | 骰子权威性决策落地

- GDD 锁定骰子权威性：AI 不可以在任何情况下无视、推翻或改写前端骰子结果。
- SPEC、运行时 system prompt 和检定结果回传文本同步加入骰子权威规则。
- Wiki 同步更新 AI DM 系统、提示词工程和 AI 角色定位决策。

## [2026-05-27] update | 多玩家冲突处理决策落地

- GDD 锁定多玩家冲突处理：首次冲突允许玩家重输本轮行动，再次冲突用前端 `幸运` 检定仲裁。
- SPEC 和运行时 system prompt 同步加入冲突处理流程。
- 代码补充 `幸运` 检定按角色 Luck 值结算，用于冲突仲裁。
- Wiki 同步更新 AI DM 系统、提示词工程、核心玩法循环和 AI 角色定位决策。

## [2026-05-27] cleanup | 项目瘦身与旧方案清理

- 移除旧 `trpg-saves` / API `key` 字段兼容路径和未使用的 `deleteSave()` 服务函数。
- 移除 50MB 临时 GIF 主视觉，S01 改用轻量 `scene_s01.svg`。
- 将原始模组素材从 `src/modules/` 移至 `raw/`，避免被误认为运行时代码。
- 更新 PRD / SPEC / GDD / Wiki 中的旧单文件 HTML、旧存档兼容和临时素材描述。
