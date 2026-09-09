# 美术资源目录

本目录存放所有美术资源文件。**茉莉直接提交到此目录。**

## 命名规范

| 类型 | 命名格式 | 示例 |
|------|----------|------|
| 场景背景 | `scene_描述.(png/svg/gif)` | `scene_s02.svg` |
| 调查员立绘 | `角色名拼音.png` | `henry_gray.png` |
| 后续 NPC 专属立绘 | `npc_名称.png` | `npc_bartender.png` |
| UI 元素 | `ui_描述.png` | `ui_dialog_bg.png` |
| 道具图标 | `item_名称.png` | `item_sword.png` |

## 尺寸规范

> ⚠️ 尺寸标准在 Phase 1（05/21前）由茉莉 & Robert 确认，确认后填写在此处。

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
├── ui/dice/        # 骰子弹窗面板、静态骰子和透明动画帧图
├── ui/chrome/      # 共享交互 UI 黄铜框与轻皮革纹理
└── fonts/          # 骰子界面字魂云雀宋 WOFF2
```

## 注意事项

- 优先使用 `.png` 格式（支持透明通道）
- 大图压缩后再提交。`scene_main_fog_london.gif` 属于高表现力主视觉资源，不按单纯体积冗余处理；替换时应以美术表现和加载体验共同评估。
- 原始设计稿（PSD/AI）不需要提交到仓库

## 骰子弹窗的运行时资源

骰子资源的来源、坐标和动画处理见 [骰子美术说明](ui/dice/README.md)，字体范围及原许可标注见 [字体说明](fonts/README.md)。骰子弹窗全部文字统一使用美术提供的字魂云雀宋。

## 共享交互 UI

0.4.0 的按钮、页签、表单、开关、弹窗和档案风格见 [交互 UI 规范](../docs/UI_SYSTEM.md)，新增材质来源及生成提示见 [黄铜 UI 资源](ui/chrome/README.md)。

## 标题动画的运行时版本

标题页播放 `scenes/scene_main_fog_london.webm`，保留原 GIF 的画面与时长；原 GIF 作为美术源文件保留，不再随网页构建发布。页面隐藏或用户选择减少动态效果时暂停播放。

使用 FFmpeg 可复现编码：

```sh
ffmpeg -i assets/scenes/scene_main_fog_london.gif -an -c:v libvpx-vp9 -b:v 0 -crf 32 -deadline good -cpu-used 3 -row-mt 1 -threads 4 -pix_fmt yuv420p assets/scenes/scene_main_fog_london.webm
```
