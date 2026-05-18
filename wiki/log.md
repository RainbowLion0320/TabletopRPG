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
