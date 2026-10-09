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

## 文字安全区与状态

骰子底图 1062×1481 与原 639:890 布局相符：上方标签和点数、居中原 426×246 骰子、下部唯一结果签牌由真实控件叠放；文字未烘焙。分隔线已在图片编辑中下移，避免顶到三位点数。所有骰子文字继续使用字魂云雀宋，结果不再叠加通用成功/失败或十位/个位。保持原动画、锁定骰点、焦点和只确认一次的结算。

场景、人物、骰子、字体、图标和音频不被重绘。两张旧简版扩展由同名精绘资源替换，不保留平行皮肤；旧黄铜/皮革控件可从 Git 历史恢复，介绍页仍使用的场景资源保留。
