# 黄铜与皮革 UI 材质

2026-09-09，为《雾中消逝》0.4.0 制作。以美术提供的 [骰子面板](../dice/README.md) 为参考，用内置 Image Gen 生成独立黄铜框；原骰子美术不变。运行时两张 WebP 共 56,520 字节。

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `brass-frame.webp` | 960×313 | 九宫格边框；80px 角区映射为 10–14 CSS px，保留雕角 |
| `leather-grain.webp` | 128×128 | 同一材质的安静内区，低透明度平铺 |

文本与图标不烘焙进图片，使用真实控件、Lucide 和已有字体。图片缺失时仍有底色、线框、文字与交互。样式入口 `src/styles/game-ui.css`；规范见 [UI 系统](../../../docs/UI_SYSTEM.md)。

生成源为 1983×793。`scripts/prepare-ui-art.mjs <源图>` 去除外部黑边 `(0,74,1983,646)`，按比例缩至 960px；中部 `(900,310,256,256)` 缩为 128px 纹理。脚本只做裁边、缩放和编码，生成原图不入 Git。

## 最终生成提示词

参考图：`assets/ui/dice/ui_dice_panel.webp`；使用内置 Image Gen。

> Create ONE production game UI nine-slice button asset, not a mockup or sprite sheet. Reference supplied image is the game's existing bronze occult dice panel; match its muted aged brass, engraved craftsmanship and dark brown-black texture. Output a wide horizontal 4:1 image, ideally 1024x256. Exact composition: a single RECTANGULAR old brass nameplate button fills the entire canvas edge to edge, very small clipped corners, thin concentric beveled brass rims occupying at most 14% of the image height. A tiny restrained engraved scroll detail in each corner only; all decoration confined to the outer corner squares so they can be preserved in nine-slice resizing. Inner center is flat quiet warm charcoal leather, unmarked and empty for live cream-colored text. Perfect front view, symmetric, no perspective. Bronze rims warm antique gold #9b7848 with delicate pale rubbed highlights, center near #201b15. Fine tangible grain, subtle depth, premium 1920 London detective / occult investigation game aesthetic, readable at a 48 pixel tall phone control. No words, letters, numbers, icon, jewel, dice, chain, pendant, extra background, drop shadow beyond canvas, bright fantasy glow, high contrast center pattern. The entire image IS the usable control; no empty margin outside the border.
