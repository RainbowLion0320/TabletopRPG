---
type: concept
title: 共享交互 UI
tags: [ui, art, mobile, android, web, accessibility]
sources: [../../docs/UI_SYSTEM.md, ../../assets/ui/chrome/README.md, ../../src/styles/game-ui.css]
created: 2026-09-09
updated: 2026-09-09
---

# 共享交互 UI

0.4.0 延续骰子美术与 1920 年伦敦调查故事，采用旧黄铜铭牌、深色皮革、档案标签与字魂云雀宋标题。统一主次按钮、图标、表单、选角标记、页签、菜单、弹窗、开关和音量推子。正文保持清晰，场景与 NPC 使用原有素材。

手机优先：主输入/提交 44px、首页主要操作 52px、菜单 48px，建议和展开等紧凑操作 40px。选角列表滚动、底部操作常驻；游戏保留上方完整场景、中部剧情和底部操作。活动、聚焦、按下和禁用都有明确反馈，图标保留可访问名称。

`game-ui.css` 管主题，`portrait.css` 管共享布局。APK 总是启用 `portrait-ui`，本分支新版网页不超过 700 CSS px 时启用相同布局，切换尺寸保留角色和输入草稿。宽网页采用独立顶栏和 NPC 区。原网页工作目录及 main 留存旧发布版。

规范见 [UI_SYSTEM.md](../../docs/UI_SYSTEM.md)，新增运行时材质、生成提示和转换步骤见 [UI 资源](../../assets/ui/chrome/README.md)，验证见 [0.4.0 检查记录](../../docs/reviews/2026-09-09-ui-system.md)。客户端与音频机制见 [[concepts/android_app]]、[[concepts/audio_system]]。

0.4.1 加入美术提供的应用图标，覆盖安卓桌面、启动页、网页标签及手机快捷图标，保持源图配色和形状；见 [图标说明](../../assets/ui/app-icon/README.md)。

## 被引用于

- [[index]]
- [[overview]]
- [[concepts/android_app]]
- [[concepts/tech_stack]]
