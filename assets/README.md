# 美术资源目录

本目录存放所有美术资源文件。**茉莉直接提交到此目录。**

正式 PNG 背景/立绘保持为美术事实源；新版网页与 APK 共用 `scripts/runtime-art.ts` 生成 WebP，不裁切构图，保留透明边缘。生成图共用忽略目录 `output/android-art/`，成功资源构建只清理过时缓存。无引用的旧「暗-」背景副本已由运行时阴影替代，需要历史资源可从 Git 恢复；不要将生成缓存、原始设计稿或制作中间文件提交到这里。

## 命名规范

| 类型 | 命名格式 | 示例 |
|------|----------|------|
| 场景背景 | `描述.png` | `客厅.png` |
| 调查员立绘 | `角色名拼音.png` | `henry_gray.png` |
| 后续 NPC 专属立绘 | `npc_名称.png` | `npc_bartender.png` |
| UI 元素 | `ui_描述.png` | `ui_dialog_bg.png` |
| 道具图标 | `item_名称.png` | `item_sword.png` |

## 尺寸规范

当前运行时沿用正式原图比例：场景主要为 1896×1080，首页原稿为 2048×1136；透明立绘按原比例叠放。手机场景完整 contain，不为填满竖屏而裁掉左右画面。

```
主视觉/场景背景: 优先 16:9，目标展示 1920x1080
调查员/NPC 立绘: 透明背景 PNG 优先
UI 元素:  按实际组件需求补充
```

## 目录规划

```
assets/
├── scenes/         # 场景背景图
├── investigators/  # 预设调查员立绘
├── ui/dice/        # 原百分骰静态图与透明动画帧图
├── ui/artist/      # 当前美术原稿首页、金/蓝按钮与配套面板/图标底板
├── ui/chrome/      # 已退役方案的来源记录，历史文件可从 Git 恢复
├── ui/app-icon/    # 美术交付的游戏图标与平台输出说明
└── fonts/          # 骰子界面字魂云雀宋 WOFF2
```

## 注意事项

- 优先使用 `.png` 格式（支持透明通道）
- 大图压缩后再提交。主视觉使用保留原画面/时长的 WebM 和同画面静态封面，旧 GIF 及占位 SVG 已从当前工作区清理，原件可从 Git 历史恢复。
- 原始设计稿（PSD/AI）不需要提交到仓库

## 骰子弹窗的运行时资源

骰子资源的来源、坐标和动画处理见 [骰子美术说明](ui/dice/README.md)，字体范围及原许可标注见 [字体说明](fonts/README.md)。骰子弹窗全部文字统一使用美术提供的字魂云雀宋。

## 共享交互 UI

0.4.1 的应用桌面图标、系统启动图标和网页 favicon 见 [图标资源说明](ui/app-icon/README.md)。

0.5.0 的按钮、页签、表单、开关、弹窗和档案使用美术原稿冷蓝风格，见 [交互 UI 规范](../docs/UI_SYSTEM.md) 和 [原稿资源](ui/artist/README.md)。首页原标题/三项按钮直接使用成品，其余按钮从 PSD 只读分离文字层；缺失面板和方形图标底板按原稿补齐。原始设计稿保留在用户交付目录，不提交。完全替换的旧黄铜/皮革控件、古铜骰子面板与专用制作脚本已移除，历史来源记录保留。

## 当前首页动画与介绍页历史动画

当前标题页播放 `ui/artist/title-rain.webm`，从美术原 `动态bg.mp4` 移除音轨并压缩，搭配 `title-background.webp`；标题与按钮单独绘制。页面隐藏或用户选择减少动态效果时暂停播放，转换见 [原稿资源](ui/artist/README.md)。

`scenes/scene_main_fog_london.webm` 及 29KB 同画面 WebP 仍由 `docs/ai-game-contest-pitch.html` 的展示区引用，因此保留；它们不再是游戏首页。原 GIF 不再常驻当前工作区，重编码时从 Git 历史恢复到忽略的 `output/`。下列命令用于这组历史展示资源。

使用 FFmpeg 可复现编码：

```sh
ffmpeg -i output/scene_main_fog_london.gif -an -c:v libvpx-vp9 -b:v 0 -crf 32 -deadline good -cpu-used 3 -row-mt 1 -threads 4 -pix_fmt yuv420p assets/scenes/scene_main_fog_london.webm
ffmpeg -i assets/scenes/scene_main_fog_london.webm -frames:v 1 -vf scale=1280:-2 -quality 86 assets/scenes/scene_main_fog_london.webp
```
