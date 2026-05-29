# 前端源码结构

本目录使用 Vite + React + TypeScript。

## 目录

```text
src/
├── app/          # App shell、GameScreen 与游戏流程 controller
├── components/   # React 组件
│   ├── setup/    # 标题页与角色选择
│   ├── game/     # 主游戏界面控件
│   └── shared/   # 跨屏复用组件
├── data/         # 剧本、角色、技能等静态数据
├── services/     # AI DM、存档、骰子等服务逻辑
├── state/        # game reducer 与状态转换
├── styles/       # 全局样式
├── types/        # 领域类型定义
└── main.tsx      # React 挂载入口
```

## 命令

```bash
npm start
npm run dev
npm run build
npm run preview
npm run test:smoke
```

正式入口在项目根目录的 `index.html`。

## 当前运行事实

- `app/App.tsx` 只负责标题页、角色选择页、游戏页的顶层切换。
- `app/GameScreen.tsx` 负责主游戏界面组合，`app/useGameController.ts` 负责运行时流程编排。
- `app/gameFlow.ts`、`app/useSaveSlots.ts`、`app/useToast.ts` 承接纯流程辅助、存档槽状态和 toast 状态。
- 角色创建 UI 当前是 1-4 名预设调查员选择，不包含自定义 5 步创建。
- 存档服务使用 `trpg-saves-v2`。
- AI 系统提示词当前在 `services/aiDm.ts` 内动态构建。
- 游戏状态进入 UI 前应经过 `state/gameReducer.ts` 的水合/归一化逻辑。
