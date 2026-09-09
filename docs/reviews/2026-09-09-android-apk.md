# Android APK 交付检查 · 2026-09-09

目标：保留当前网页目录与主分支，在独立 `codex/android-apk` 分支构建可安装游玩的 Android 版本。实现与构建说明见 [ANDROID.md](../ANDROID.md)。

## 交付

- 应用：《雾中消逝》，`com.rainbowlion.fogtrpg`，版本 0.2.0 / versionCode 1。
- 产物：`output/apk/Fog-TRPG-0.2.0.apk`，约 11.5 MiB，RSA 3072 正式签名，APK Signature v2/v3 校验通过。对应 SHA-256 由每次构建写入同名校验文件。
- 最低 Android 7 / API 24，目标 API 36，WebView 110 起；资源本地随包，AI 推进按玩家配置联网。
- 包内没有开发者密钥、测试凭据、`.env`、源映射或开发服务器；正式版本关闭 WebView 调试和 Capacitor 日志。构建时注入了测试用 `VITE_AI_*` 哨兵值，解包扫描确认没有泄漏。
- 声明联网权限及 AndroidX 内部动态接收器签名权限；不请求相机、麦克风或共享存储权限。

## 已通过的验证

| 范围 | 结果 |
| --- | --- |
| `npm test` | 41 文件、530 项通过，包括原生存储写入失败/重试、请求取消和 1/2/4 人骰点恢复单测 |
| `npm run build` | 网页生产构建通过 |
| `npm run test:smoke` | 60 项通过，覆盖网页选角、AI、骰子、存档、案件板与音频 |
| `npm run android:apk` | Android 构建、对齐、正式签名、签名校验及包内容检查通过 |
| 实际正式 APK 包内测试 | 4 组通过（将测试 runner 使用相同 release 密钥签名后运行），涵盖 1/2/4 人与两种协议 |
| 独立 Android 15 模拟器 | 安装、真实 WebView/HTTP/Keystore、真实触摸启动 WebAudio、资源解码、音量开关持久化通过 |
| 中断恢复 | 100 点大失败保留原值且只显示一个等级；确认后断网行动保留；系统返回键可打开菜单 |
| 进程与覆盖安装 | 强制停止进程、同签名 APK 覆盖安装、再次继续后，四人进度、叙事和 API 设置仍保留 |
| 手机布局 | 800×360 CSS 横屏、缩小一半的原生 WebView 可见区域、骰子和案件板实览通过；较大横屏也已验证 |

两种 AI 协议使用 Android 设备内的可控 HTTP 服务验证完整请求链路，不消费玩家 API 额度。软键盘测试模拟原生 WebView 缩小后的空间；MuMu 输入法将输入转给宿主机，无法代表所有真机输入法，正式发行前仍应在目标手机验收输入法和刘海屏差异。

修复了一处既有网页测试竞态：读取立绘 `currentSrc` 前等待图片加载完成，避免高并发时对空 URL 做解析；没有改变网页立绘或选角行为。

## 工程隔离

原目录 `G:\TabletopRPG` 保持 `main` / `118cf49`，工作区干净。所有源码改造、工具准备与构建产物在独立 Android worktree 或 `G:\tools\tabletop-android` 中完成，未更改 Unity 安装及原游戏服务。
