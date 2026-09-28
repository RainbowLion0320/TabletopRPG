---
type: concept
title: Android 游戏客户端
tags: [android, apk, capacitor, storage, release]
sources: [../../docs/ANDROID.md, ../../docs/SPEC.md, ../../docs/PRD.md]
created: 2026-09-09
updated: 2026-09-28
---

# Android 游戏客户端

安卓版用独立入口与构建配置复用当前 React/TypeScript 游戏。2026-09-28 经用户确认，`codex/android-apk` 的 0.4.5 及此前改进合入 `main`，网页与 APK 共用主工程；旧网页版本保留在 Git 提交 `118cf49`。使用 Capacitor 原生 Android 容器，复用游戏规则、剧情、资料、音乐、骰子和美术，不重做 Unity 游戏逻辑。

## 运行行为

0.4.5 减少自由行动误拦：临时道具与痕迹允许即兴；检定否定/假设文案不触发强制掷骰，明确要求但漏工具时接上实际骰子。已讲过的地点可保持连续，玩家猜测仍保持未证实。失败只在底部显示一条简洁重试通知，内部规则与隐藏地点不泄露到剧情。见 [[entities/ai_dm]] 与 [自由行动验收](../../docs/reviews/2026-09-10-roleplay-freedom.md)。

0.4.4 将所有竖屏选角统一为单列，取消 600px 起的双列规则；立绘与资料并排，列表及上下操作栏居中、最大宽度 720px。卡片纵向滚动，人数和进入按钮常驻。见 [选角验收](../../docs/reviews/2026-09-09-portrait-selection.md)。

0.4.1 应用正式游戏图标：Android 7 密度资源、Android 8+ 自适应、Android 13+ 主题图标，系统启动页共用；网页标签/手机快捷图标也同步。来源和转换见 [图标资源](../../assets/ui/app-icon/README.md)。

0.4.2 修复展开故事遮挡：展开上限为章节/地点栏下沿，行动区保留；NPC 信息和收起按钮移出滚动区，正文独立滚动。小屏、多人与长记录检查见 [展开阅读验收](../../docs/reviews/2026-09-09-expanded-reading.md)。

0.4.3 新增局内调查员档案，头像/队员状态卡及正文玩家姓名均可打开；查看实时属性、技能检定值、装备与背景，队友查看和关闭保留原行动。手机安全区、内容滚动、技能搜索与系统返回共用客户端机制。见 [[entities/character_system]] 与 [档案验收](../../docs/reviews/2026-09-09-investigator-sheet.md)。

- 安装 APK 即可启动；资源随包提供，AI 推进需要网络和玩家手动填写 API。首次进入主游戏显示配置。
- 默认单人，支持 1–4 人；手机竖屏、触摸、系统安全区、键盘和返回键单独适配。
- 0.2.1 按短横屏视口重排字号、间距、选角、游戏、菜单与全部弹窗；顶部导航/弹窗关闭及保存常驻，长内容内部滚动。资料详情通过返回键回到案件板，180px 键盘占位后仍可输入与保存。
- 0.3.0 默认锁定竖屏：上方展示 NPC，中部阅读剧情，底部操作；15px 正文，多人状态两列。选角为纵向列表和固定人数/进入按钮。设置、资料、存档、骰子全部重排；展开阅读或键盘占位时回收展示区。
- 0.3.1 将背景移入顶部独立画幅，以原图 1896:1080 比例铺满手机宽度，画幅底边不超过上半屏；完整显示两侧场景并保留 NPC 叠加，没有 NPC 也显示背景。
- 0.4.0 统一黄铜档案交互 UI，手机优先；网页宽度不超过 700 CSS px 时共用竖屏布局，桌面保留宽屏结构。按钮、表单、选择、菜单、资料与开关状态见 [[concepts/game_ui]]。
- Android Keystore / AES-GCM 保存 API、手动存档、音量与自动续玩；既有网页继续 localStorage。
- 自动续玩保留待重试回合和已锁定骰点；恢复时不重掷、不自动重复请求 AI。
- 原生 HTTP 位于既有 LLM client/adapter 下方，支持两种协议、真实取消、超时和错误分类。
- Android 构建独立压缩 PNG 美术，保留原素材；构建拒绝带入开发者环境变量中的 AI Key。
- 正式 APK 使用持续复用的私有 release 密钥；密钥位于工程外并由开发者私下备份。

工程准备、构建与签名步骤见 [Android 开发与交付](../../docs/ANDROID.md)。相关机制见 [[concepts/tech_stack]]、[[entities/save_system]]、[[concepts/audio_system]]。

手机布局回归使用实际 CSS 视口与原生 WebView 控件裁切/命中检查，不能仅以桌面烟测代替。检查记录见 [0.2.1 横屏审查](../../docs/reviews/2026-09-09-android-landscape.md)。

竖屏重构与立绘不遮挡检查见 [0.3.0 竖屏验收](../../docs/reviews/2026-09-09-android-portrait.md)，当前背景适配见 [0.3.1 场景画幅修复](../../docs/reviews/2026-09-09-android-scene-frame.md)。

当前统一交互样式的检查见 [0.4.0 UI 验收](../../docs/reviews/2026-09-09-ui-system.md)。

## 被引用于

- [[index]]
- [[overview]]
- [[concepts/tech_stack]]
- [[concepts/game_ui]]
- [[entities/character_system]]
