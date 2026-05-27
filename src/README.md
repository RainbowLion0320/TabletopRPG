# 前端源码结构

本目录使用 Vite + React + TypeScript。

## 目录

```text
src/
├── app/          # 应用入口与页面级状态编排
├── components/   # React 组件
├── data/         # 剧本、角色、技能等静态数据
├── services/     # AI DM、存档、骰子等服务逻辑
├── state/        # game reducer 与状态转换
├── styles/       # 全局样式
├── types/        # 领域类型定义
└── main.tsx      # React 挂载入口
```

## 命令

```bash
npm run dev
npm run build
npm run preview
```

正式入口在项目根目录的 `index.html`。

## 当前运行事实

- 角色创建 UI 当前是 1-4 名预设调查员选择，不包含自定义 5 步创建。
- 存档服务使用 `trpg-saves-v2`。
- AI 系统提示词当前在 `services/aiDm.ts` 内动态构建。
- 游戏状态进入 UI 前应经过 `state/gameReducer.ts` 的水合/归一化逻辑。
