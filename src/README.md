# 前端源码结构

本目录现在使用 Vite + React + TypeScript，不再维护旧的单文件 HTML 入口。

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
