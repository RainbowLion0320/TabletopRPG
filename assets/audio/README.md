# 游戏音频与授权

2026-09-09 接入。运行时只使用本目录的 12 个 MP3（约 2.82 MiB），不请求第三方音频网站。
默认背景音乐音量 30%、音效 55%；环境层额外乘以 0.45，保持在阅读背景中。

## 配乐：Kevin MacLeod / Incompetech

以下三首作品由 **Kevin MacLeod (incompetech.com)** 创作，按
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) 授权。
可在游戏中使用及改编，须保留署名、许可链接和修改说明。游戏的「声音设置 → 音乐与音效鸣谢」提供可见署名。

| 运行文件 | 原作与作者页面 | 下载地址 | 本项目修改 |
| --- | --- | --- | --- |
| `music/fog-theme.mp3` | [Darkest Child](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100783) | [原始 MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Darkest%20Child.mp3) | 取 15–79 秒，4 秒交叉淡化接缝，60 秒循环，调整响度、重编码 |
| `music/quiet-investigation.mp3` | [Comfortable Mystery](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100287) | [原始 MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Comfortable%20Mystery.mp3) | 取 30–94 秒，4 秒交叉淡化接缝，60 秒循环，调整响度、重编码 |
| `music/approaching-darkness.mp3` | [Long note One](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100418) | [原始 MP3](https://incompetech.com/music/royalty-free/mp3-royaltyfree/Long%20Note%20One.mp3) | 取 60–124 秒，4 秒交叉淡化接缝，60 秒循环，调整响度、重编码 |

许可核验：2026-09-09 从作者网站的曲目页读取 CC BY 4.0 署名模板，并用
[官方曲库元数据](https://incompetech.com/music/royalty-free/pieces.json) 核对标题、ISRC 和下载文件名。
本游戏及音频改编不代表作者背书。

## 操作与骰子音效：Kenney

作者：**Kenney / Kenney Vleugels**。许可：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。
原包许可文本在 `licenses/` 中。处理包括端点短淡化、响度调整、重编码。

| 运行文件 | 素材包 | 原文件 |
| --- | --- | --- |
| `sfx/interface-click.mp3` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | `Audio/click_001.ogg` |
| `sfx/paper-open.mp3` | [RPG Audio](https://kenney.nl/assets/rpg-audio) | `Audio/bookFlip2.ogg` |
| `sfx/dice-shake.mp3` | [Casino Audio](https://kenney.nl/assets/casino-audio) | `Audio/dice-shake-1.ogg` |
| `sfx/dice-land.mp3` | [Casino Audio](https://kenney.nl/assets/casino-audio) | `Audio/dice-throw-1.ogg` |

## 项目合成

`ambience/rain-window.mp3`、`old-room.mp3`、`harbor-water.mp3` 是项目用带限噪声和缓慢包络合成的环境纹理，非实地录音；20 秒循环。
`sfx/check-success.mp3`、`check-failure.mp3` 是项目合成的柔和检定提示音，时长 1.25 秒。
这些文件不含第三方录音采样，生成代码随仓库分发。

## 复现与维护

1. 将三首原曲以 `darkest-child.mp3`、`comfortable-mystery.mp3`、`long-note-one.mp3` 保存到忽略目录 `output/audio-source/`。
2. 下载 Kenney 三个音效包，分别解压到该目录的 `interface/`、`rpg/`、`casino/`。
3. 安装 Python、numpy 和 ffmpeg，执行 `python scripts/build-audio.py`。
4. `manifest.json` 记录生成文件的来源、时长、字节数和 SHA-256。播放时不依赖 Python/ffmpeg。

不提交 ZIP、原始音轨或中间 WAV。替换音轨时同时更新本页和玩家可见的鸣谢。
音频属于表现层；文件损坏、下载失败、静音、后台暂停均不能改变骰子结果或阻塞 AI 回合。
