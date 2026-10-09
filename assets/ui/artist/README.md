# 美术原稿 UI 运行时资源

2026-10-09 用户指定 `D:\首图素材（这版为准）` 为视觉事实源。首页原标题、金色/浅蓝按钮及伦敦雨雾直接使用原稿；0.5.2 将缺失控件精绘成七张专用图，采用层叠银框、冷蓝纸料、克制金节点、四芒星及成对珠点。原 PSD/AI/GIF/MP4 与生成 PNG 不提交，只导入实际采用的压缩资源。

| 文件 | 来源 | 用途与导出 |
| --- | --- | --- |
| title-background.webp | 底图2.png | 2048×1136 无标题背景，WebP quality 94 |
| title-rain.webm | 动态bg.mp4 | 1920×1080 VP9，4.542 秒，无音轨，353,221 字节；静音循环，后台及减少动态时暂停 |
| title-logo.webp | 首页.psd 的 disappear 图层、首页.png | 原稿变换后的 674×325 标题，画布坐标 (687,140)，保留原白到蓝渐变与透明边缘 |
| home-new.webp | bottom1.png | 498×127，美术原「新游戏」含字切图 |
| home-continue.webp | bottom 2.png | 498×127，美术原「继续游戏」含字切图 |
| home-settings.webp | bottom 3.png | 498×127，美术原「设置」含字切图 |
| button-primary.webp | 首页.psd 的 bottom 组 | 498×127，内存中隐藏文字层，原金色无字底板 |
| button-secondary.webp | 首页.psd 的 bottom 拷贝组 | 498×127，同法导出浅蓝无字底板 |
| panel-frame.webp | 内置 Image Gen 精绘 | 768×768，42,536 字节；阅读/档案/菜单/设置/资料/卡片；96px 九宫格 |
| dice-panel.webp | 内置 Image Gen 精绘 | 1062×1481，129,864 字节；独立命运面板；固定比例，运行时点数/骰面/结果 |
| portrait-mount.webp | 内置 Image Gen 精绘 | 768×960，44,504 字节；真实透明中心，装裱原立绘与头像；图层不命中 |
| input-frame.webp | 内置 Image Gen 精绘 | 768×278，19,666 字节；行动/配置/技能/案件/日志输入与选择；90/100px 切片 |
| control-stud.webp | 内置 Image Gen 精绘 | 128×125，8,102 字节；24px 音量推子、16px 开关珠头；contain |
| heading-rule.webp | 内置 Image Gen 精绘 | 768×30，12,136 字节；既有标题及底部留白的 7px 分隔，不额外增高 |
| icon-frame.webp | 内置 Image Gen 精绘 | 256×256，11,962 字节；44px 菜单/资料/声音/关闭/清空的真实图标底板 |
| waiting-nib.webp | 内置 Image Gen 精绘（0.5.9） | 55×128，4,778 字节；24×24px 容器内等比例显示的银蓝钢笔尖，用于长等待状态，无命中/文字 |
| archive-empty.webp | 内置 Image Gen 精绘（0.5.14） | 256×162，14,954 字节；空日志/搜索/存档及技能/案件空记录共用的银蓝调查册和放大镜，112×72px 等比例显示；短窗口收起装饰 |
| archive-file.webp | 内置 Image Gen 精绘（0.5.16） | 64×96，2,584 字节；物证/事件的通用档案夹，手机原槽内 42×58px、网页原 16×16px 图标位等比例显示；不代表具体物证 |
| archive-theory.webp | 内置 Image Gen 精绘（0.5.17） | 64×96，3,196 字节；推测通用灯泡，手机原槽内 42×58px、网页原 16×16px 图标位等比例显示；原类别和待验证含义保持 |
| journal.webp | 内置 Image Gen 精绘（0.5.19） | 64×58，2,418 字节；资料入口 24px，读档/结案回顾/线索进度 20px 等比例书册，原按钮和可访问名称保持 |
| action-pen.webp | 内置 Image Gen 精绘（0.5.21） | 64×64，1,896 字节；提交/下一位原按钮内 24px 等比例银蓝钢笔，空 alt 与无命中，原文字和流程保持 |

原首页含字切图放在真实按钮内，保留原动作和可访问名称；实时文字使用原 PSD 无字底板。原按钮切片 `12 108 12 108` 映射为 `6px 18px`，图标底板完整缩放。阅读框源 1024px 的 128px 护角对应运行时 768px / 96px；中间边不含星珠，伸缩不会把节点拉成长条。头像与立绘沿用原人物和比例，空心装裱不盖住人物中心。

## 原稿导出

PSD 用 psd-tools 只读解析，按钮组 `composite(viewport=group.bbox, force=False, color=0, alpha=0)` 保留缓存的原效果。隐藏组内文字只发生在内存中，不保存回 PSD。无字蓝底直接对应「继续游戏」，设置使用同一原底板。

`disappear` 是位于 `(687,-68)-(1361,591)` 的智能图层；通用 PSD 渲染器不完整复现其渐变。使用该图层的原透明度，按 `首页.png` 与 `底图2.png` 的合成关系提取成稿标题 RGB，再裁为画布 `(687,140)-(1361,465)`。这是分离原有图层，字形和渐变均来自美术成稿。导出前重合成的通道平均误差为 0.101/255 以下；WebP 使用 quality 94、alphaQuality 100。备用标题 PNG 的字形比例与成稿不同，未用于当前版本。

视频用已有 FFmpeg：

```sh
ffmpeg -i "动态bg.mp4" -an -c:v libvpx-vp9 -crf 28 -b:v 0 -deadline good -cpu-used 3 title-rain.webm
```


## 精绘来源与导出

七类图全部使用内置 `image_gen.imagegen`，无 CLI、程序绘画或新主题。只做透明阈值清理、去除画布透明空边、等比例缩放及 WebP 编码（quality 92 / alphaQuality 100 / effort 6），不把程序边框冒充绘制图。输入槽、圆珠及标题线仅裁掉外部透明空白；立绘中心保持真 alpha 0，档案正文保持 alpha 255。全部完整最终提示词、原生成 ID 和编辑关系见 [PROMPTS.md](PROMPTS.md)。

| 采用图 | 源 PNG SHA256 | 运行时 WebP SHA256 |
| --- | --- | --- |
| dossier-frame | `f353beeef780722881366ccd31a5c2b011a54f88a0fd2c0e57b1253ece278e4d` | `e270985214036f2091575dbf15584feeabe08da4c885c6f341826ffe2eeb60a1` |
| dice-panel | `eba6c6f73818604f6f7c727b4bfa2f08c3452c8763f6b63b16c9aa8d06e00d5c` | `cfe364405c3a44465bc0a67f4cb28a26955041371f607b9a8ddbba2c12198cd4` |
| portrait-mount | `4f4ddac629e4dfa5992da4e67d0be62f19c79445203eb8276ec75ac43fc8ce4c` | `06bb9864b0f0460ccb83094b3c5cbe33fe6f18154e233ce1d07fb3ed7b9bab7c` |
| input-frame | `9ad68aa4d6963880b1d71121c2b37d9fa5049076df03ac89f1e81f0f3a1e506e` | `76494579d421df720db91ac27ea0eb1434c4265bae777c5467765424627254a2` |
| control-stud | `032bee386f4021bbc67dafda7f0a2d0f0dbc0d715eeb4f77e0d5ba6116610e4c` | `b6217aed992b692e92a9c90b238a7584cfe89c03bcbebde45895371d65be8fa3` |
| heading-rule | `2372cf2200ddd844d3890c72c13885026811d79ed6418578a2d03933d0e90680` | `b0afd1578041411b8f26899b0117c1c2793440129a1d6e2d9ff8cd6b16dcbaef` |
| tool-button | `c581f3a39c71473c2fbe80de782f0ab824d4a3590bb673ff72f502b1d48bd959` | `deb4e74641a3f2220371f066ac81cb8395b2c5a2a865f0458f2cad1a54f25bd8` |
| waiting-nib | `665949ed1b3c67db1d822836053f2bede51a333e9d35d6d3a8ca9a6166475753` | `09db1848a12aae0c38693d9978120af68b3ea3aa35f2b35a197d27f4ad0a5637` |
| archive-empty | `470e679b15d55af6e7df6d3cfc3c6852e20e09d3414a6aa35446cead8e8ea457` | `575d8b06de0fc6c4b781e8da3a253d47039c2986b7d633a647a97546ecfb5b32` |
| archive-file | `ec66e58802e69fe3986f3a957add33c2313aaa030f4331e04a82098ff5f6a381` | `32b55b32b264a25b745c1b0760ac97691fd155fd3f43126c074aeca2c777f80a` |
| archive-theory | `1b051da9c6263daab8a1316cdaa85f219bebca338640171cab0db7733bc60d15` | `7f47c086fc8cfe87cc6049d0b5ae8d9c36822b5e7dc10158bcf76109acfb246c` |
| journal | `2a5f4ed099f68b63e925336f529c1a23f1b85fc9dc5f1edd08bc097e2708a44d` | `c86ba25e7147932c76c9d2e6dcce244776f1cab0b9e80a54dbecda8e197daf9f` |
| action-pen | `053730a6b20a740df84e9dd5afdca96c2e5cb386cc32e34ba03d7f2e5c9bcf48` | `00c8ad248b70103685463faa2cbd72cbe68e71377da2e4ad3f3c44c3f99251c7` |

0.5.9 的钢笔尖源 PNG 为 1145×1374，透明空边裁为 `(321,98,504,1174)`，仅等比例缩至高 128px 和 WebP 编码（quality 92 / alphaQuality 100 / effort 6）。原像素有 1,244,366 个 alpha 0，半透明边保留；未修改原图颜色或绘制形状。运行时字句静止，只有笔尖 3.6 秒明暗变化，减少动态时静止；等待行仍 36px，固定在剧情页脚，原标题线画在已有留白内；不额外增加整张面板高度。

0.5.14 的空白调查册先生成，再由内置 Image Gen 清理外部透明区域。最终源 PNG 为 1536×1024，709,809 个像素为 alpha 0，原 alpha 最大为 254；保留其自然半透明边，不将源图误称为全不透明。只裁掉透明右/下空边为 `(0,0,1514,961)`，等比例缩至宽 256px 并编码 WebP（quality 92 / alphaQuality 100 / effort 6），未程序绘画或修改颜色。插画为无命中、无访问名称的装饰，状态文字仍由真实控件呈现；没有结果时在原日志阅读区居中，空存档沿用原 120px 区域；窗口高度不超过 500px 时隐藏插画，仅保留原状态和操作。

## 文字安全区与状态

0.5.21 行动钢笔由内置 Image Gen 一次新图生成，无参考图和后续编辑。源 PNG 1254×1254，1,361,145 个 alpha 0 像素、最大 alpha 255。仅裁掉最外透明空白、保留 12px 余量，裁框 (60,70,1100,1096)，等比例缩至 64×64，WebP quality 92 / alphaQuality 100 / effort 6；未程序绘画、去底、改色或添加文字。冷蓝漆面、银笔尖与克制金圈用于书写行动的通用标识，共十三张精绘图。按钮内 24px contain，不命中、不独立朗读；提交/下一位文字和手机换行、逐人提交及原 48px 触控高度保持。

0.5.19 调查书册由内置 Image Gen 一次新图生成，无参考图和后续编辑。源 PNG 1254×1254，748,029 个 alpha 0 像素、最大 alpha 255。仅裁掉画布最外透明空白并保留 12px 余量，实际裁框 (0,8,1254,1146)，等比例缩至 64×58；WebP quality 92 / alphaQuality 100 / effort 6。未程序绘画、去底、改色或添加文字。资料入口 24px、读档/结案回顾/线索进度 20px object-fit:contain，装饰不命中、无独立访问名称；原点击、返回、44px 命中和草稿保持。共十二张实际采用的精绘图，图形是通用操作标识，不代表新增书册物证。

小图可能被构建器内嵌为 data URL。交付核对使用源 WebP 的完整字节/base64 或外部资源的 SHA256，不把缺少独立图片文件名当作丢失资源。0.5.17 APK 中档案夹与灯泡的字节内容均已匹配。

0.5.17 推测灯泡使用内置 Image Gen 一次生成，源 PNG 为 1024×1536、1,008,903 个 alpha 0 像素、最大 alpha 254。原图已具备原生透明度；保留完整画布和自然边缘，只等比例缩至 64×96px、WebP quality 92 / alphaQuality 100 / effort 6，未进行图片编辑、程序绘画、去底或改色。与档案夹共用 ArchiveRecordArt 的原手机/网页尺寸，旧的同形显示组件与样式收拢；没有额外触摸区域、访问名称、文字或剧情事实。

0.5.16 通用档案夹同样先生成，再由内置 Image Gen 编辑外部透明度。最终源 PNG 为 1024×1536，610,900 个像素为 alpha 0、最大 alpha 254；保留自然半透明边和完整画布，不裁剪、不程序去底或改色，只等比例缩至 64×96px、WebP quality 92 / alphaQuality 100 / effort 6。原生成 PNG 留在本机生成目录，不提交；完整实际提示词及编辑关系见 PROMPTS.md。手机显示于原装裱槽，网页保持原图标占位与节点尺寸，装饰不命中、无独立访问名称；人物/场景图及已有文字类别保持。

骰子底图 1062×1481 与原 639:890 布局相符：上方标签和点数、居中原 426×246 骰子、下部唯一结果签牌由真实控件叠放；文字未烘焙。分隔线已在图片编辑中下移，避免顶到三位点数。所有骰子文字继续使用字魂云雀宋，结果不再叠加通用成功/失败或十位/个位。保持原动画、锁定骰点、焦点和只确认一次的结算。

场景、人物、骰子、字体、游戏启动图标和音频不被重绘。两张旧简版扩展由同名精绘资源替换，不保留平行皮肤；旧黄铜/皮革控件可从 Git 历史恢复，介绍页仍使用的场景资源保留。
