# 游戏图标

0.5.48 按用户2026-10-10要求，替换旧眼睛/四向星抽象标识。新图标以原亨利立绘为人物参考：平顶猎帽、冷峻面孔、雾夜伦敦与煤气灯，肩旁保留跑团骰子；冷蓝和暖灯色呼应《雾中消逝》与现有UI。

内置 image_gen 编辑生成，参考旧图标及 `assets/investigators/henry_gray.png`。实际运行源为 `icon-square.png` / `icon-monochrome.png`，均512×512；之后只做平台尺寸与系统蒙版导出。旧圆角抽象源删除，不保留zip、AI原稿或重复大尺寸导出。旧图标来自2026-09-09的 `ICON.zip`，原版保留在Git历史与旧验收中。

已移除 13 个无引用的 Capacitor 模板启动图和旧矢量图标，共 117,133 字节。实际启动页仍由当前应用图标和深蓝背景组成，未删除游戏场景或美术原稿。

运行 `node scripts/prepare-app-icons.mjs` 可复现平台资源：

| 平台 | 资源 | 处理 |
| --- | --- | --- |
| Android 7 | `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` | 彩色画面施加平台圆角，输出48/72/96/144/192px |
| Android 7 圆形图标 | 同目录 `ic_launcher_round.png` | 对直角版施加圆形透明边缘 |
| Android 8+ | 同目录 `ic_launcher_foreground.png` + `mipmap-anydpi-v26` | 108dp图层中心72dp彩色画面，外侧18dp透明供系统蒙版与动效；不按双色素材分离 |
| Android 13+ 主题图标 | `mipmap-anydpi-v33` / `ic_launcher_monochrome.png` | 单独绘制透明人物/骰子剪影，裁去透明留白后居中置于66dp安全区，由系统着色 |
| 系统启动页 | `windowSplashScreenAnimatedIcon` | 与桌面共用实际应用图标 |
| 网页标签 | `public/icons/favicon.ico` | 新彩色图圆角16/32/48px，标准多分辨率ICO |
| 手机网页快捷图标 | `public/icons/apple-touch-icon.png` | 直角版 180px，平台负责圆角 |

依据 [Android官方自适应图标规范](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive) 设置图层和主题安全区。彩色画面保留原色、人物帽檐和表情；已检查圆角、圆形裁切和单色剪影，原生桌面和启动图随正式包验收。

生成提示摘要（实际采用方向）：

> Premium hand-painted Victorian detective game app icon. Henry's existing identity: stern clean-shaven middle-aged face, brown tweed flat cap, navy coat, white collar. Warm gaslight and cold fog-blue rim, rain-soaked London and distant clock tower, one small ivory antique-bronze-edged role-playing die. Square full bleed, clear at 48px, no text, badges, logo, frame, weapons or extra people. Essential face and cap readable under Android circular masks. Separate monochrome companion: opaque white detective-and-die silhouette on transparent background, crisp negative-space features, no text, border, shadow or old eye/star symbol; platform packaging centers it inside the66dp safe area.

Manifest、系统启动、网页标签和快捷图统一使用新图，无运行时下载。当前验收见 [design-qa](../../../design-qa.md)，历史来源见 [0.4.1图标检查](../../../docs/reviews/2026-09-09-app-icon.md)。
