# 黄铜与皮革 UI 材质

此页仅保存 0.4.x 的来源和制作记录。0.5.0 按用户提供的首页美术原稿全面替换，当前规范见 [原稿资源](../artist/README.md) 和 [UI 规范](../../../docs/UI_SYSTEM.md)。下列旧运行时图片和专用制作脚本已移除，可从 Git 历史恢复，勿再用于新控件。

## 0.4.7 调查员档案与主按钮（2026-10-08）

内置 Image Gen 使用原骰子面板及本轮 390×844 选角实装截图作为参考，生成两张独立材质；原立绘不变。新增运行时文件合计 100,454 字节，不包含文字与图标。

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `dossier-mount.webp` | 768×512 | 档案卡九宫格，64px 切片对应手机 10px / 网页 12px 边缘 |
| `primary-brass.webp` | 960×278 | 实心黄铜主操作，80px 切片对应 12px 边缘；文字使用深墨色 |

转换：`node scripts/prepare-dossier-art.mjs <dossier.png> <primary.png>`。仅压缩/等比例缩放，并裁去主按钮生成稿外围的黑色留白（Sharp trim，阈值 15）。原始生成稿留在 Codex 生成目录，不进入 Git。选角样式在 `src/components/setup/character-setup.css`，通用主操作在 `src/styles/game-ui.css`。

档案生成提示词（内置工具，参考骰子及当前选角）：

> Create one production raster UI asset for the detective game Disappear in Fog, 1920 London / Call of Cthulhu. The first reference is the artist's existing bronze dice frame, the second shows our current small mobile investigator cards. This is a NEW EMPTY card surface to support their style, not an edit of either reference or a mockup. A wide front-facing horizontal investigator dossier mounting card, 3:2 aspect ratio, fills the canvas edge to edge. Deep warm charcoal fibrous paper and softly worn dark leather, quiet empty inner area. Very restrained authentic 1920 archive craftsmanship: thin aged brass edge, a small flat metal photo corner on each of the four corners, rubbed warm highlights, a subtle dark bound edge at left, shallow tangible bevel and finely visible paper grain. Keep corner details confined to outer 9% so this asset can be nine-sliced to fit rectangular cards on phones. Antique gold #8f734b, dark warm charcoal #1b1813, center slightly lighter #27221a. The inner 82% is calm and uniform for live investigator portraits and cream text placed by code. No text, symbols, portrait, illustration, divider, label or extra objects baked into the image. No outside margin, perspective or heavy ornamental fantasy border. The finished image should feel like an actual old investigation file on a dark desk, clearly crafted but subtle at 350 x 210 phone size. ONE card, not a sheet of options.

主按钮生成提示词（内置工具，参考骰子）：

> Create ONE production image asset for the primary action button of a polished 1920 London detective mobile game. Use the reference solely for the existing antique brass craftsmanship and restrained occult-era style. A single front-facing aged BRASS METAL PLAQUE button, horizontal 4:1 canvas, edge to edge, ready for nine-slice UI. The broad center is smooth muted warm brushed gold bronze #aa8952, softly lit from above, with fine authentic worn metal texture, gently concave with a darker lower edge; code will put dark ink lettering here, so the interior must be quiet and blank. Thin dark bronze outer bevel and finely rubbed pale-gold rim, small clipped corners, delicate small fan engraving confined to corner squares smaller than 10% of image height. A tangible sophisticated object designed to remain clear when rendered at 300 x 52 phone pixels. Let the solid brass fill distinguish this button from our dark leather secondary buttons. No baked-in lettering, symbol, icon or text; no jewels, extra objects, perspective, cast shadow beyond the canvas, outside margin or luminous fantasy glow. One asset only, not a mockup or sprite sheet.

## 0.4.0 次操作与基础纹理

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
