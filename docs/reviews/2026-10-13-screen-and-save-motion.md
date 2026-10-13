# 0.5.72 首页与存档视觉衔接验收

0.5.72 完善首页与存档视觉衔接：首页背景与控件一起短淡入，删除记录后幸存卡片平滑补位，操作继续即时响应。

## 实际范围

修改首页既有淡入的作用范围与存档窗口的删除补位：220ms整页淡入、170ms同一幸存卡片衔接。本轮沿用原美术与现有回归。

- 首页在390×844、360×640及1440×900的独立浏览器中与背景一起220ms淡入；减少动态效果立即显示。入场期间设置仍可响应。
- 390×844的可见存档补位实际采到8个中间位置；短屏新焦点行立即就位，末条删除没有假补位。三次真实点击的72帧里，焦点按钮均可见且命中。
- 连续两次删除的同一卡片衔接差为0.078px；第一条为真实指针点击，第二条通过现有DOM按钮调用。失败保留原记录，减少动态效果及受控隐藏、关闭后无残留补位。

逐帧证据来自独立Chrome154网页上下文，存档采样为单人，不等同于Android动效逐帧采样；签名APK的单人、双人、四人流程由本轮完整原生回归验证。逻辑与构建在暂停前完成，源码保持冻结。继续后的首次浏览器检查在行动按钮点击处崩溃，原日志保留；该场景单独复测1/1通过，随后完整252项重跑通过。

## 正式交付

实际完整789项逻辑（15.81s）、网页生产构建、252项浏览器（3.4m）及安装签名APK的27组原生回归（816.705s）通过。最终原生日志文件时间：2026-10-13T06:33:17.885Z。

包：`output/apk/Fog-TRPG-0.5.72.apk`，versionCode120，11,480,722字节；SHA256 `c8f485582c4c317a81fc328e36bfe72dc84a59fbce9052925321991a322a1c2e`。原签名证书 `2347007fe8a1255ed1cea1867ac18533112c7c275ae41f46c11bbd72408f2f1f`，76项内容标记、17项运行资源、22个原图标文件与15张编译图标/绑定、网页与APK图标核验通过。源码与网页无真实密钥，授权默认连接只进入APK，map/env条目为零；保留0.5.72与0.5.71。

## 原始证据

[本轮冻结源码](../../output/ui-screen-and-save-motion-2026-10-13/source-freeze.json)、[存档观察范围](../../output/playwright/save-removal-observation-2026-10-13/evidence-summary.json)、[三次真实删除逐帧](../../output/playwright/save-removal-observation-2026-10-13/prototype-frames.json)、[连续删除逐帧](../../output/playwright/save-removal-observation-2026-10-13/prototype-rapid-frames.json)、[失败与动态设置观察](../../output/playwright/save-removal-observation-2026-10-13/prototype-guards.json)、[首页观察范围](../../output/ui-screen-entry-2026-10-13/evidence-summary.json)、[首页与选角逐帧](../../output/ui-screen-entry-2026-10-13/observation.json)、[浏览器首次崩溃原日志](../../output/ui-screen-and-save-motion-2026-10-13/browser-check-before-crash-rerun.log)、[浏览器崩溃场景复测](../../output/ui-screen-and-save-motion-2026-10-13/browser-crash-target.log)、[实际包内构建一致性](../../output/ui-screen-and-save-motion-2026-10-13/apk-current-bundle-proof.json)、[本轮原生存档证据](../../output/ui-screen-and-save-motion-2026-10-13/native-save-evidence.json)、[完整网页](../../output/ui-screen-and-save-motion-2026-10-13/web-check.log)、[完整原生](../../output/ui-screen-and-save-motion-2026-10-13/native-check.log)、[正式包审计](../../output/ui-screen-and-save-motion-2026-10-13/release-audit-final.json)、[图标审计](../../output/ui-screen-and-save-motion-2026-10-13/icon-package-proof.json)。
