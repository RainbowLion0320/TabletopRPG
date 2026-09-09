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
- 默认单人，支持 1–4 人；手机横屏、触摸、系统安全区、键盘和返回键单独适配。
- Android Keystore / AES-GCM 保存 API、手动存档、音量与自动续玩；既有网页继续 localStorage。
- 自动续玩保留待重试回合和已锁定骰点；恢复时不重掷、不自动重复请求 AI。
- 原生 HTTP 位于既有 LLM client/adapter 下方，支持两种协议、真实取消、超时和错误分类。
- Android 构建独立压缩 PNG 美术，保留原素材；构建拒绝带入开发者环境变量中的 AI Key。
- 正式 APK 使用持续复用的私有 release 密钥；密钥位于工程外并由开发者私下备份。

工程准备、构建与签名步骤见 [Android 开发与交付](../../docs/ANDROID.md)。相关机制见 [[concepts/tech_stack]]、[[entities/save_system]]、[[concepts/audio_system]]。

## 被引用于

- [[index]]
- [[overview]]
- [[concepts/tech_stack]]
