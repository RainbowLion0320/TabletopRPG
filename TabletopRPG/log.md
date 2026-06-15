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

## [2026-05-27] update | P0 smoke tests 落地

- 新增 Playwright smoke tests，覆盖标题页、预设选角、主界面、无 API Key 防崩溃、保存/继续、非法存档过滤和 D100 大失败优先规则。

## [2026-06-15] update | 资料界面案件板全屏化

- 资料入口改为全屏资料界面，默认展示案件板。
- 移除独立线索/人物页签，行动日志作为唯一辅助页签保留。
- 同步 `README.md`、`docs/PRD.md`、`docs/SPEC.md`、`docs/GDD.md` 与 wiki overview。
- 新增 `npm run test:smoke` 命令。
- 同步 PRD / SPEC / GDD / Wiki，将自动化 smoke tests 从开放 P0 移入已实现质量护栏。

## [2026-05-29] update | P1 存档管理落地

- 新增存档管理弹窗，支持列出有效存档、指定载入和删除单个本地存档。
- 新增 `deleteSave()` 存档服务函数。
- 扩展 Playwright smoke tests 覆盖存档管理载入/删除流程。
- 同步 PRD / SPEC / GDD / Wiki，将“存档列表与删除 UI”从 backlog 移入已实现范围。

## [2026-05-29] update | AI DM 响应格式护栏落地

- AI DM 响应进入 reducer 前必须通过 JSON 契约校验。
- 首次格式无效时自动向同一 Provider 发起一次修复重试；第二次仍无效则拦截原始输出。
- 新增 Playwright 回归测试，覆盖坏 JSON 不会作为 DM 叙事展示。
- 同步 PRD / SPEC / GDD / Wiki 中的 AI 输出稳定性描述。

## [2026-05-29] refactor | 游戏数值规则配置集中化

- 新增 `src/data/gameRules.ts`，集中 HP/MP/SAN、技能基础值、难度阈值、未知技能兜底和大失败阈值。
- 角色生成、存档水合、选角 UI 和骰子服务改为引用统一规则配置。
- 新增 Playwright 规则配置测试，防止数值公式再次分散。
- 同步 PRD / SPEC / GDD / Wiki 中的数值事实源说明。

## [2026-05-29] update | 选角页信息展示增强

- 预设调查员增加 portrait 字段，选角页展示现有立绘资产。
- 选角卡显示完整 9 项属性、HP/MP/SAN/Luck、技能值和背景摘要。
- 队伍条头像改为读取角色数据，不再用 CSS 索引硬绑定图片。
- 新增 Playwright 回归测试覆盖选角页立绘和完整属性展示。

## [2026-05-29] refactor | 调查员立绘资源命名对齐

- 将 `assets/npcs/` 下 4 张预设调查员立绘迁移到 `assets/investigators/`。
- 资源文件按角色名重命名为 `henry_gray.png`、`ada_wallace.png`、`thomas_bell.png`、`robert_shaw.png`。
- NPC 数据不再复用调查员立绘；NPC portrait 改为可选字段。
- 同步代码、资源 README、PRD/GDD、Wiki 和比赛 pitch 页面中的资源路径与表述。

## [2026-06-14] lint | 发现 5 类问题

- `AGENTS.md` 仍使用历史占位目录 `wiki/`，已修正为当前实际目录 `TabletopRPG/`。
- 项目缺少统一贡献规范、编辑器基础配置、PR 模板、Issue 模板和 CI，已补充 `CONTRIBUTING.md`、`.editorconfig` 与 `.github/` 工作流/模板。
- `docs/SPEC.md` 的 AI Provider 表仍描述 OpenAI Chat Completions 和 Anthropic，已修正为当前 Responses / Chat Adapter 架构。
- `prompts/README.md` 仍指向旧的 `src/services/aiDm.ts` 提示词位置，已修正为当前 `src/dm/` 管线。
- `TabletopRPG/` wiki 和 `docs/PRD.md` 仍有旧 AI Provider / 提示词模块路径，已同步到当前 LLM adapter 与 DM 管线。
