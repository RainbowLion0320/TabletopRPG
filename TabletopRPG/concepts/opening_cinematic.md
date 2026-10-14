---
type: concept
title: 美术开场动画
tags: [art, cinematic, mobile, audio, accessibility]
sources: [../../assets/cinematics/README.md, ../../assets/cinematics/manifest.json, ../../docs/plans/2026-10-14-opening-cinematic.md, ../../src/components/setup/OpeningCinematic.tsx]
created: 2026-10-14
updated: 2026-10-14
---

# 美术开场动画

0.5.73 使用美术提供的伦敦雨雾短片：首次启动在首页前自动播放，结束/主动跳过后记住，首页44px的小图标可主动回看。该频率经用户确认。片尾按美术备注叠化到首页，保留完整横、竖构图与原片节奏；不改变故事设定、调查进度或模型调用。

APK 只打包竖版、首帧和共用声音；网页根据进入时横竖屏选片，旋转不重置播放。H.264、fast-start与本地首帧兼顾设备兼容、加载及完整构图。音效采用纯音效版，音乐由对齐混音减去纯音效后派生，遵守[[concepts/audio_system]]的两个独立开关及音量。播放期间首页音乐/环境声停止，避免叠音。

结束650ms叠化，跳过/异常240ms退出；逻辑退出即时归还首页操作和焦点。后台暂停画面及声音，前台接续。系统减少动态效果时直接进入首页，主动回看仍可用。浏览器声音被拒绝时继续画面，并提供轻量「开启声音」；文件失败或前台等待8秒后返回首页，不显示技术诊断、不写成已看标记，后续可重试。

首次标记 `trpg-opening-v1` 使用现有[[entities/save_system]]的存储适配器；Android沿用加密偏好，回看不重复写已看标记。运行资源来源、原片及采用文件哈希见 `assets/cinematics/manifest.json`，母版只读且不提交。实际验证和包记录见[开场接入验收](../../docs/reviews/2026-10-14-opening-cinematic.md)。

## 被引用于

- [[concepts/game_ui]]
- [[concepts/android_app]]
- [[concepts/audio_system]]
- [内容目录](../index.md)
