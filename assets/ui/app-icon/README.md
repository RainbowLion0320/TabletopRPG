# 游戏图标

来源：2026-09-09 用户提供的 `ICON.zip`。使用其中的「直角.png」和「圆角.png」，整理为 `icon-square.png` / `icon-rounded.png`（均为 1418×1418）。保留美术的白色眼睛与四向尖角、深蓝底色 `#13253A`。压缩包和 `.ai` 原始设计稿不入库。

运行 `node scripts/prepare-app-icons.mjs` 可复现平台资源：

| 平台 | 资源 | 处理 |
| --- | --- | --- |
| Android 7 | `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` | 使用圆角版，输出 48/72/96/144/192px |
| Android 7 圆形图标 | 同目录 `ic_launcher_round.png` | 对直角版施加圆形透明边缘 |
| Android 8+ | 同目录 `ic_launcher_foreground.png` + `mipmap-anydpi-v26` | 从白色/深蓝双色素材分离前景透明度；背景原色，108dp 图层中心 66dp 安全区 |
| Android 13+ 主题图标 | `mipmap-anydpi-v33` | 复用透明白色前景作为 monochrome，由系统着色 |
| 系统启动页 | `windowSplashScreenAnimatedIcon` | 与桌面共用实际应用图标 |
| 网页标签 | `public/icons/favicon.ico` | 圆角版 16/32/48px，合并为标准多尺寸 ICO |
| 手机网页快捷图标 | `public/icons/apple-touch-icon.png` | 直角版 180px，平台负责圆角 |

分离前景仅恢复源图的白色覆盖率与抗锯齿边缘，不重画图形；保留原图眼孔。直角导出最底部的透明像素在需要实色底的版本中填为原深蓝。依据 [Android 官方自适应图标规范](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive) 设置安全区及系统图层。

Manifest 和启动主题均已移除临时骰子图标引用。入口仍分为网页与 APK，图标随包提供，无运行时下载。验收见 [0.4.1 图标检查](../../../docs/reviews/2026-09-09-app-icon.md)。
