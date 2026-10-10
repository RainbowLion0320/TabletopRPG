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
| archive-file.webp | 内置 Image Gen 精绘（0.5.16） | 64×96，2,584 字节；物证/事件的通用档案夹，手机原槽内 42×58px、网页原 16×16px 图标位等比例显示；0.5.22 保存入口 20px；不代表具体物证 |
| archive-theory.webp | 内置 Image Gen 精绘（0.5.17） | 64×96，3,196 字节；推测通用灯泡，手机原槽内 42×58px、网页原 16×16px 图标位等比例显示；原类别和待验证含义保持 |
| journal.webp | 内置 Image Gen 精绘（0.5.19） | 64×58，2,418 字节；资料入口和 0.5.22 读取标题 24px，读档/结案回顾/线索进度 20px 等比例书册，原按钮和可访问名称保持 |
| action-pen.webp | 内置 Image Gen 精绘（0.5.21） | 64×64，1,896 字节；提交/下一位原按钮内 24px 等比例银蓝钢笔，空 alt 与无命中，原文字和流程保持 |
| case-seal.webp | 内置 Image Gen 精绘（0.5.23） | 64×64，3,166 字节；三种结案卡片共用的中性银蓝归档徽记，28px contain，不命中和独立朗读，不代表胜利或奖励 |
| tuning-dial.webp | 内置 Image Gen 精绘（0.5.24） | 64×63，2,974 字节；通用银蓝调节盘，AI 设置/连接设置 20px、AI/声音配置标题 24px contain；装饰无命中/独立朗读，不代表剧情物件 |
| music-gramophone.webp | 内置 Image Gen 精绘（0.5.26） | 64×64，3,116 字节；背景音乐原图标位 24px contain，银蓝留声机；空 alt、无命中，不代表剧情物件 |
| sound-emblem.webp | 内置 Image Gen 精绘（0.5.26） | 64×64，2,890 字节；声音入口 20/24px、音效原图标位 24px contain；银蓝声音徽记，空 alt、无命中 |
| investigation-lens.webp | 内置 Image Gen 精绘（0.5.29） | 64×65，2,148 字节；调查目标 24px、技能/案件搜索 16px、日志搜索 17px contain；空 alt、无命中，不代表剧情物证 |
| pocket-watch.webp | 内置 Image Gen 精绘（0.5.29） | 64×65，2,778 字节；已公开局势标题 24px contain，银蓝怀表；空 alt、无命中，不新增时钟或改变数值 |
| dice-emblem.webp | 内置 Image Gen 精绘（0.5.35） | 59×64，2,344 字节；原掷骰按钮 24px contain，象牙色十面骰；空 alt、无独立命中，不表示点数 |
| home-emblem.webp | 内置 Image Gen 精绘（0.5.38） | 64×64，3,126 字节；调查菜单/结案返回首页原按钮内共用 20px contain，银蓝伦敦宅邸；空 alt、无独立命中，不表示剧情地点 |
| clock-gauge.webp | 内置 Image Gen 精绘（0.5.42） | 512×72，15,092 字节；已公开局势原量条，28px 高、两端 25px 整段切片，中段伸缩；原生 progress 动态填充/可访问名称与读数保持，无命中、新时钟或规则变更 |

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
| case-seal | `3a35edc6e259ee78f5abc332d364678bc7a6f41a3fbf97d285d7f9d90e581d9d` | `f22dca2363eb027ce888f814bc14286545a4d0aab0849e1771e9d74ad5c3df6f` |
| tuning-dial | `ef7083f9f9adf3903f77ede99ba0fe32133235e4380edd780befc8b148cd5fe2` | `54f2a193c37151d2e8904667d8f325191e099bd5d7248185122ecbd703a18be7` |
| music-gramophone | `34817f4327a08ad1de568e85c119d85c0b6a0e848f5e5c699a9fb71b2cd56ef1` | `b21f0e9cbf191decac24e884522ac2baf368ef797a072454ab8e2d76a6506d15` |
| sound-emblem | `d47bfc21497847875a4a99439018051cf76953147e30db4360a6bb4cb5dfda95` | `df88ebd50782343fcc918d4c6be9718e2451ef965937a8ca65dae65e6d1d504a` |
| investigation-lens | `e86401ab66b8b1c59802e647049cba5bc828d890994d79c9d100b7b7a33f10e0` | `de012c8fd9ab188b0be7a39abbd41ff647a9690d16a1ac2540f6a13a2a1e41f8` |
| pocket-watch | `5c538107779eedcbac5adb0e2ac64df6c29ebcd126751959b066696321559d07` | `cbd6919d2b98903cdabd6c1680a0e6bde19ddf2971e816e6825746da7fed0559` |
| home-emblem | `946abd3c07227f8b07a8b797567a8cc35a6d7696be4caa28ad83d2374a2082d7` | `2879b0a485f7c56fbd74d90829d4ad46fee8436713ffa3ac5ca24e0bc81f5797` |

0.5.9 的钢笔尖源 PNG 为 1145×1374，透明空边裁为 `(321,98,504,1174)`，仅等比例缩至高 128px 和 WebP 编码（quality 92 / alphaQuality 100 / effort 6）。原像素有 1,244,366 个 alpha 0，半透明边保留；未修改原图颜色或绘制形状。运行时字句静止，只有笔尖 3.6 秒明暗变化，减少动态时静止；等待行仍 36px，固定在剧情页脚，原标题线画在已有留白内；不额外增加整张面板高度。

0.5.14 的空白调查册先生成，再由内置 Image Gen 清理外部透明区域。最终源 PNG 为 1536×1024，709,809 个像素为 alpha 0，原 alpha 最大为 254；保留其自然半透明边，不将源图误称为全不透明。只裁掉透明右/下空边为 `(0,0,1514,961)`，等比例缩至宽 256px 并编码 WebP（quality 92 / alphaQuality 100 / effort 6），未程序绘画或修改颜色。插画为无命中、无访问名称的装饰，状态文字仍由真实控件呈现；没有结果时在原日志阅读区居中，空存档沿用原 120px 区域；窗口高度不超过 500px 时隐藏插画，仅保留原状态和操作。

## 文字安全区与状态

0.5.29 两张调查图均由内置 Image Gen 各一次新图生成，无参考图与后续编辑。investigation-lens 源 PNG 1254×1254，1,235,140 个 alpha 0 像素、最大 255，实际裁框 (0,0,1196,1210)，缩为 64×65 WebP、2,148 字节。 pocket-watch 源 PNG 1254×1254，1,035,497 个 alpha 0 像素、最大 255，实际裁框 (0,8,1220,1246)，缩为 64×65 WebP、2,778 字节。 仅裁检测到的外透明空白、保留 12px 余量（到画布边界时截取到边界），等比例缩放与 WebP quality 92 / alphaQuality 100 / effort 6。自然半透明边保持，未程序绘画、去底、改色或加字。共十九张实际采用精绘图；结案进度同时复用已有中性归档徽记，不改变三种结局含义。

0.5.26 两张声音图均由内置 Image Gen 各一次新图生成，无参考图与后续编辑。music-gramophone 源 PNG 1254×1254，949,668 个 alpha 0 像素、最大 255，裁框 (0,25,1218,1210)，缩为 64×64 WebP、3,116 字节。 sound-emblem 源 PNG 1254×1254，1,070,171 个 alpha 0 像素、最大 255，裁框 (0,0,1254,1254)，缩为 64×64 WebP、2,890 字节。 仅裁外透明空白并保留 12px 余量、等比例缩放和 WebP quality 92 / alphaQuality 100 / effort 6，声音图实际裁框为整张画布。没有程序绘画、去底、改色或添加文字。十七张实际采用图沿用原稿银蓝风格，原控件名称/范围/行为保持。

0.5.24 调节盘由内置 Image Gen 一次新图生成，无参考图和后续编辑。源 PNG 1254×1254，828,112 个 alpha 0 像素、最大 alpha 255；只裁外透明空白并保留 12px 余量，实际裁框 (0,59,1214,1195)，等比例缩至 64×63，WebP quality 92 / alphaQuality 100 / effort 6。未程序绘画、去底、改色或添加文字。银色滚花轮缘、冷蓝漆面、银指针和克制金点沿用原稿风格，20/24px 装饰共用于设置控件，不新增剧情事实。共十五张实际采用的精绘图。

0.5.23 归档徽记由内置 Image Gen 一次新图生成，无参考图和后续编辑。源 PNG 1254×1254，961,519 个 alpha 0 像素、最大 alpha 255；只裁掉外透明空白并保留 12px 余量，实际裁框 (0,43,1204,1199)，等比例缩至 64×64，WebP quality 92 / alphaQuality 100 / effort 6。未程序绘画、去底、改色或添加文字。银框、冷蓝蜡面、四芒星与浅蓝短带沿用原稿风格，28px 装饰用于三种结局，不改变结果含义。共十四张实际采用的精绘图。

0.5.21 行动钢笔由内置 Image Gen 一次新图生成，无参考图和后续编辑。源 PNG 1254×1254，1,361,145 个 alpha 0 像素、最大 alpha 255。仅裁掉最外透明空白、保留 12px 余量，裁框 (60,70,1100,1096)，等比例缩至 64×64，WebP quality 92 / alphaQuality 100 / effort 6；未程序绘画、去底、改色或添加文字。冷蓝漆面、银笔尖与克制金圈用于书写行动的通用标识，共十三张精绘图。按钮内 24px contain，不命中、不独立朗读；提交/下一位文字和手机换行、逐人提交及原 48px 触控高度保持。

0.5.19 调查书册由内置 Image Gen 一次新图生成，无参考图和后续编辑。源 PNG 1254×1254，748,029 个 alpha 0 像素、最大 alpha 255。仅裁掉画布最外透明空白并保留 12px 余量，实际裁框 (0,8,1254,1146)，等比例缩至 64×58；WebP quality 92 / alphaQuality 100 / effort 6。未程序绘画、去底、改色或添加文字。资料入口 24px、读档/结案回顾/线索进度 20px object-fit:contain，装饰不命中、无独立访问名称；原点击、返回、44px 命中和草稿保持。共十二张实际采用的精绘图，图形是通用操作标识，不代表新增书册物证。

小图可能被构建器内嵌为 data URL。交付核对使用源 WebP 的完整字节/base64 或外部资源的 SHA256，不把缺少独立图片文件名当作丢失资源。0.5.17 APK 中档案夹与灯泡的字节内容均已匹配。

0.5.17 推测灯泡使用内置 Image Gen 一次生成，源 PNG 为 1024×1536、1,008,903 个 alpha 0 像素、最大 alpha 254。原图已具备原生透明度；保留完整画布和自然边缘，只等比例缩至 64×96px、WebP quality 92 / alphaQuality 100 / effort 6，未进行图片编辑、程序绘画、去底或改色。与档案夹共用 ArchiveRecordArt 的原手机/网页尺寸，旧的同形显示组件与样式收拢；没有额外触摸区域、访问名称、文字或剧情事实。

0.5.16 通用档案夹同样先生成，再由内置 Image Gen 编辑外部透明度。最终源 PNG 为 1024×1536，610,900 个像素为 alpha 0、最大 alpha 254；保留自然半透明边和完整画布，不裁剪、不程序去底或改色，只等比例缩至 64×96px、WebP quality 92 / alphaQuality 100 / effort 6。原生成 PNG 留在本机生成目录，不提交；完整实际提示词及编辑关系见 PROMPTS.md。手机显示于原装裱槽，网页保持原图标占位与节点尺寸，装饰不命中、无独立访问名称；人物/场景图及已有文字类别保持。

骰子底图 1062×1481 与原 639:890 布局相符：上方标签和点数、居中原 426×246 骰子、下部唯一结果签牌由真实控件叠放；文字未烘焙。分隔线已在图片编辑中下移，避免顶到三位点数。所有骰子文字继续使用字魂云雀宋，结果不再叠加通用成功/失败或十位/个位。保持原动画、锁定骰点、焦点和只确认一次的结算。

场景、人物、骰子、字体、游戏启动图标和音频不被重绘。两张旧简版扩展由同名精绘资源替换，不保留平行皮肤；旧黄铜/皮革控件可从 Git 历史恢复，介绍页仍使用的场景资源保留。


0.5.35 掷骰徽记使用内置 Image Gen 一次新图生成，无参考图与后续编辑，生成 ID `exec-ac8929ff-3a94-4a09-9f55-a812d3369949`。源 PNG 1254×1254，1,041,592 个 alpha 0 像素、最大 alpha 255。仅裁检测到的外透明空白并保留 12px 余量，到画布边界时截取到边界，裁框 (0,0,1119,1218)，等比例缩为 59×64；WebP quality 92 / alphaQuality 100 / effort 6。未程序绘画、去底、改色或加字。原掷骰按钮内 24px contain、自然半透明边保留、不命中、不独立朗读；源 PNG 留在本机生成目录，不提交。徽记沿用原象牙骰的雕纹和银蓝反光，是操作装饰，不表示新物品或掷出点数。原骰面/动画/字魂云雀宋、锁定结果、确认一次的结算不变；共二十张实际采用精绘图。


0.5.38 返回首页徽记由内置 Image Gen 一次新图生成，无参考图与后续编辑，生成 ID `exec-f6fc45f6-0f67-4963-b40a-a61837b645f2`。源 PNG 1254×1254，769,015 个 alpha 0 像素；只裁检测到的外透明空边，裁框 (0,0,1246,1242)，保留最多 12px 余量，等比例缩为 64×64，WebP quality 92 / alphaQuality 100 / effort 6，3,126 字节。未程序绘画、改色或去底，自然 alpha 保留，原 PNG 留在本机生成目录，不提交。20px contain 共用于调查菜单与结案的原返回首页按钮，空 alt、装饰无独立命中；宅邸是导航图标，不代表剧情地点、已解锁场景或故事物件。共二十一张实际采用精绘图。

## 局势量条精绘（0.5.42）

单次内置 Image Gen，生成 ID `exec-9b2b5584-326c-428c-948c-f09b9dbdeb4e`，真实透明背景，原 PNG 2172×724 / 905,941 字节留在默认 generated_images 目录，不提交。PNG SHA256 `678bd19fb178cadc04b07f3dad1fc2d72f30fb0f5a519a62a6f91159ae748eb7`；裁除透明留白，以 alpha≥4 定界并保留 12px 缓冲，裁区 (20,212,2131,300)，仅做等比例压缩，WebP quality 94 / alphaQuality 100 / effort 6。运行时图 SHA256 `5af8aa630043a656dbed90444a846ea80ae66c19148e581e4db1f3a72c526b75`，512×72 / 15,092 字节，保留自然 alpha（原图 0–254）；没有抠图、重绘或颜色修改。量条使用左右 64px 的完整高度切片映射为 25×28px 两端，空白凹槽中段横向延展，动态数值仍由原生 progress 负责，不烘焙填充值或数字。见 [实际提示词](PROMPTS.md)。
