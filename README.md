# TabletopRPG

AI 驱动的横屏网页跑团游戏。当前项目已经迁移为 Vite + React + TypeScript 架构，主界面采用简洁的一级游戏界面，将资料、设置、存档等低频功能收进二级菜单。

## 技术栈

| 模块 | 方案 |
| --- | --- |
| 前端框架 | React 18 |
| 构建工具 | Vite |
| 语言 | TypeScript |
| 图标 | lucide-react |
| 存储 | localStorage |
| AI 接入 | OpenAI / Anthropic / MiMo / 兼容 OpenAI 的自定义接口 |

## 快速开始

```bash
npm install
npm run dev
```

构建生产版本：

```bash
npm run build
```

## 目录结构

```text
TabletopRPG/
├── index.html              # Vite 应用入口
├── src/
│   ├── app/                # React 应用装配
│   ├── components/         # 界面组件
│   ├── data/               # 剧本、角色、技能等静态数据
│   ├── services/           # AI、骰子、存档等服务
│   ├── state/              # 游戏状态 reducer
│   ├── styles/             # 全局样式
│   └── types/              # TypeScript 类型
├── assets/                 # 场景、NPC、UI 临时资源
├── docs/                   # 策划文档
├── prompts/                # AI 提示词资料
└── TabletopRPG/            # 项目 wiki
```

## 文档对齐

当前项目以这几份文件作为事实源：

| 模块 | 文件 |
| --- | --- |
| PRD | `docs/PRD.md` |
| 技术规格 | `docs/SPEC.md` |
| 游戏设计 | `docs/GDD.md` |
| Wiki 索引 | `TabletopRPG/index.md` |
| 运行时代码 | `src/` |

## 当前 UI 结构

首屏优先服务横屏网页游戏体验：

- 顶部保留场景标题和一级菜单入口
- 中央展示场景图与叙事重点
- 左下角展示队伍成员状态
- 底部集中处理对话、行动建议与行动提交
- 右侧抽屉承载线索、NPC、行动日志等二级信息
- AI 配置、存档、模式切换放入菜单，避免一级界面拥挤

## 资源说明

当前首屏使用 `assets/scenes/scene_main_fog_london.gif` 作为高表现力场景资源。后续美术可替换为同等横屏规格的场景图，建议主视觉按 16:9 准备，目标展示尺寸以 1920x1080 为基准。
