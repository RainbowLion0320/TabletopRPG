---
type: concept
title: Android 游戏客户端
tags: [android, apk, capacitor, storage, release]
sources: [../../docs/ANDROID.md, ../../docs/SPEC.md, ../../docs/PRD.md]
created: 2026-09-09
updated: 2026-09-09
---

# Android 游戏客户端

安卓版用独立入口与构建配置复用当前 React/TypeScript 游戏。原网页版本保持原目录和主分支；当前 Android 工程在 `codex/android-apk`。使用 Capacitor 原生 Android 容器，复用游戏规则、剧情、资料、音乐、骰子和美术，不重做 Unity 游戏逻辑。

## 运行行为

- 安装 APK 即可启动；资源随包提供，AI 推进需要网络和玩家手动填写 API。首次进入主游戏显示配置。
- 默认单人，支持 1–4 人；手机竖屏、触摸、系统安全区、键盘和返回键单独适配。
- 0.2.1 按短横屏视口重排字号、间距、选角、游戏、菜单与全部弹窗；顶部导航/弹窗关闭及保存常驻，长内容内部滚动。资料详情通过返回键回到案件板，180px 键盘占位后仍可输入与保存。
- 0.3.0 默认锁定竖屏：上方展示 NPC，中部阅读剧情，底部操作；15px 正文，多人状态两列。选角为纵向列表和固定人数/进入按钮。设置、资料、存档、骰子全部重排；展开阅读、无 NPC 或键盘占位时回收展示区。
- Android Keystore / AES-GCM 保存 API、手动存档、音量与自动续玩；既有网页继续 localStorage。
- 自动续玩保留待重试回合和已锁定骰点；恢复时不重掷、不自动重复请求 AI。
- 原生 HTTP 位于既有 LLM client/adapter 下方，支持两种协议、真实取消、超时和错误分类。
- Android 构建独立压缩 PNG 美术，保留原素材；构建拒绝带入开发者环境变量中的 AI Key。
- 正式 APK 使用持续复用的私有 release 密钥；密钥位于工程外并由开发者私下备份。

工程准备、构建与签名步骤见 [Android 开发与交付](../../docs/ANDROID.md)。相关机制见 [[concepts/tech_stack]]、[[entities/save_system]]、[[concepts/audio_system]]。

手机布局回归使用实际 CSS 视口与原生 WebView 控件裁切/命中检查，不能仅以桌面烟测代替。检查记录见 [0.2.1 横屏审查](../../docs/reviews/2026-09-09-android-landscape.md)。

当前竖屏重构与立绘不遮挡检查见 [0.3.0 竖屏验收](../../docs/reviews/2026-09-09-android-portrait.md)。

## 被引用于

- [[index]]
- [[overview]]
- [[concepts/tech_stack]]
