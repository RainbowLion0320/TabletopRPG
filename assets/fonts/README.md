# 骰子界面字体

`zihun-yunquesong.woff2` 来自用户提供的 `字魂云雀宋(商用需授权).TTF`，字体内部名称为 `zihunyunquesong`。

- 用 fontTools 将原 TTF 转为 WOFF2，保留完整字符集及原字体名称、版权和许可元数据；从 2,432,216 字节压缩为 1,142,728 字节。
- 应用于骰子弹窗的全部文字，包括检定人、技能、难度、目标值、队列序号、总点数、骰面、状态提示、结果等级和确认按钮。
- 0.4.0 同时用于共享交互 UI 的按钮、标题和选中标记，使其与骰子美术一致；剧情正文和 API 配置值保留原有字体栈，详见 [UI 规范](../../docs/UI_SYSTEM.md)。
- 生产页面通过 `@font-face` 加载；尚未加载或缺字时使用系统宋体回退。原 TTF 不重复入库。
- 原文件明确标注「商用需授权」。原字体许可字段：`Commercial use requires purchase authorization. Please go to: https://izihun.com/`。本目录记录交付信息，不代表已取得商业授权，也不将该字体标注为开源或免费商用。

复现格式转换：

```python
from fontTools.ttLib import TTFont
font = TTFont("字魂云雀宋(商用需授权).TTF")
font.flavor = "woff2"
font.save("zihun-yunquesong.woff2")
```
