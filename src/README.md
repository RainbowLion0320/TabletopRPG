# 游戏代码目录

本目录存放所有前端游戏代码。**无需构建环境，浏览器直接打开 `index.html` 即可运行。**

**主力开发：唐龙翔**；Robert 负责基础架构支持与代码审核（PR review）。

## 技术规范

- 纯原生 HTML + CSS + JavaScript，不引入框架
- API Key 通过页面输入框传入，**绝对不要硬编码进代码里提交**
- 代码缩进：2 空格

## 目录规划

```
src/
├── index.html          # 游戏入口
├── css/
│   └── style.css       # 全局样式
├── js/
│   ├── main.js         # 主逻辑
│   ├── ai.js           # AI 接口封装（OpenAI / Claude）
│   ├── storage.js      # 存档 / 读档（localStorage）
│   └── dice.js         # 骰子系统（如有）
└── pages/
    ├── character.html  # 角色创建页
    └── game.html       # 游戏主界面
```
