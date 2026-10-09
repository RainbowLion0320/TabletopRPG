---
type: overview
title: 项目全局综述
tags: [overview, project, aligned]
sources: [project_plan.md, ../../docs/PRD.md, ../../docs/SPEC.md, ../../docs/GDD.md]
created: 2026-05-14
updated: 2026-10-09
---

# AI 跑团游戏 · 项目全局综述

## 项目定位

轻量级 Web 形式的 AI 驱动叙事跑团游戏（TRPG）。当前实现是 Vite + React + TypeScript 单页应用，由 AI 担任 DM，基于 COC 第七版风格的 D100 检定推进《雾中消逝》调查模组。

## 当前状态

- **Android 独立版本**：[[concepts/android_app]] 当前为 0.5.13 竖屏版，选角中文属性可直接阅读，选角档案字级与精绘数值格完善，地点横向精绘装裱保留全场景，网页关系卡与手机档案统一字级和人物构图，精绘等待笔尖与固定页脚保持完整可见，设置连接折叠栏补齐绘制控件，存档删除控件与确认保持统一美术/功能色，案件共享精绘照片档案与网页配套控件，短窗口技能档案优先正文，兼顾桌面短窗口的资料与长行动，组字候选不误关弹窗，沿用精绘 UI；七类专用控件图覆盖面板、立绘、输入、工具及声音，保留原首页/按钮；连续输入合并保存，关键操作和后台立即落盘；视觉沿用美术原稿，网页共享冷蓝雨雾、白蓝标题、原金/蓝按钮与配套面板/图标。覆盖选角、剧情/行动、属性/技能/背景、资料/案件、菜单、AI/声音、存档、检定、恢复和结案；默认单人、一行一卡，完整场景和 NPC、固定任务条、展开上限、多行草稿、头像属性和读档选择记录保持。320px 四人长输入保留全部队员与至少 140px 剧情。案件只落地 reducer 审核的已知事实，内部诊断不进入玩家剧情；原骰子、字体、图标、配乐、剧情与规则不变。原生网络、加密记录隔离/完整保存、确定性骰点恢复、音频设备恢复和闲置缓存释放保持；授权 MiMo 默认仅在 APK，玩家自定义优先，Git/网页不含密钥。旧控件完全替换后收拢，正式签名/原生验证成功后只保留最近两版交付；来源和当前证据见 [[concepts/game_ui]]。

- **阶段**：MVP 核心闭环已可运行，正在进行文档/规格/代码对齐与稳定化。
- **仓库**：[TabletopRPG](https://github.com/RainbowLion0320/TabletopRPG)（本地目录由各开发环境指定）
- **当前事实源**：
  - PRD：`docs/PRD.md`
  - 技术规格：`docs/SPEC.md`
  - 游戏设计：`docs/GDD.md`
  - 模组内容：`scenarios/wuzhongxiaoshi/*.yaml`
  - 运行时代码：`src/`

## 已实现功能

- React/Vite/TypeScript 前端架构。
- 标题页、预设调查员选择页、宽网页主界面与 APK / 窄网页共用的竖屏主界面。
- 0.5.2 在原稿基础上精绘专用骰子、银蓝档案、透明立绘框、输入槽、工具底板、标题线与珠光控件，详情见 [[concepts/game_ui]]。
- 0.5.0 美术原稿交互 UI：原首页与按钮、冷蓝阅读面板、方形工具底板、输入/页签/菜单/弹窗/开关及音量推子，手机竖屏优先兼顾网页，详见 [[concepts/game_ui]]。
- 4 个预设调查员，可选择 1-4 名进入游戏。
- AI DM 支持 OpenAI Responses、MiMo 和自定义 OpenAI-compatible Chat Completions endpoint。
- AI DM 响应进入游戏前执行 JSON 契约校验，格式无效时进行有上限的自动恢复；失败回合可保存、载入并重试。
- D100 技能检定系统，骰子由前端执行。
- 分场景背景音乐、环境声与界面/骰子音效；音乐和音效独立开关、音量记忆与后台暂停，详见 [[concepts/audio_system]]。
- 1-4 名调查员逐人声明、整队结算；所有成员始终共享同一场景并同步移动。
- AI 推荐行动建议。
- 对话富文本阅读层：人物稳定配色，地点/物证/技能/状态分类高亮，安全详情导航，以及可选的 Narrator 临时语义关键词。
- 全屏资料界面：默认展示玩家已知的混合调查台；静态主线、AI 审核核心关系和确定性实体档案共同组成案件板，桌面自动布局、移动端按调查脉络分组，行动日志作为辅助页签保留。
- localStorage v8 存档：记录模组版本、内容哈希和 `ScenarioProgress`，支持 v1-v7 确定性迁移。
- 首个 YAML 剧本模块「雾中消逝」：5 个场景、5 个稳定 NPC、8 个线索、6 个剧情节点和 3 个结局。
- 无脚本 Condition/Effect 推进引擎、条件出口、事件幂等、3/6 回合空转升级、可见目标/时钟与结局锁定。
- Playwright smoke tests：覆盖标题页、选角、主界面、无 API Key、存档/读档、非法存档和 D100 大失败优先规则。

## 当前未实现/不在 MVP 范围

- 自定义 5 步角色创建 UI。
- 完整战斗轮序、伤害骰、弹药、SAN 疯狂自动化。
- 局域网/在线多人。
- 多剧本导入或模组编辑器。
- 后端 API 代理、账号系统。

## 核心技术决策

- **前端**：React 18 + TypeScript + Vite。
- **AI 接入**：浏览器经统一 adapter 直调 OpenAI Responses、MiMo 或自定义 Chat-compatible endpoint。
- **异步一致性**：Narrator 前台完成即展示；总结、事实、心智、情景记忆和动态案件板在后台按回合落地，并受 session epoch 与 AbortSignal 保护。
- **数据存储**：localStorage + JSON，无后端。
- **状态管理**：`useReducer` + `GameState`，恢复存档时统一经过 `hydrateGameState()`。
- **案件板布局**：React Flow + ELK Layered；布局坐标不进入 AI 输出或存档，v6 案件板确定性迁移到 v7。
- **游戏规则**：COC 第七版风格 D100 技能检定。
- **模组事实源**：严格 Schema 校验的 YAML；运行代码、类型、KP 手册和案件板骨架自动生成。

详见 [[concepts/tech_stack]]

## 最大风险

1. **AI 输出不稳定** -> 已加入 JSON 契约校验、格式修复重试、状态归一化和核心 smoke tests；仍需扩大 AI 响应边界测试覆盖。
2. **浏览器直调 API Key 风险** -> 当前适合本地 Demo；公开部署前建议后端代理。
3. **文档漂移** -> 本次建立 `PRD.md` / `SPEC.md` / `GDD.md` / wiki / code 对齐基线。
4. **功能范围蔓延** -> 未实现功能统一进入 backlog。

## 相关页面

- [[entities/team]] -- 团队分工
- [[entities/ai_dm]] -- AI DM 系统
- [[entities/character_system]] -- 角色系统
- [[entities/save_system]] -- 存档系统
- [[decisions/ai_role_decision]] -- AI 角色定位决策
- [[decisions/mvp_scope]] -- MVP 功能范围
- [[concepts/core_loop]] -- 核心玩法循环
- [[concepts/tech_stack]] -- 技术选型
- [[concepts/prompt_engineering]] -- 提示词工程
- [[concepts/case_board]] -- 动态案件板与调查台
- [[concepts/scenario_engine]] -- 模组规范与剧情推进引擎
- [[sources/project_plan]] -- 原始推进方案
