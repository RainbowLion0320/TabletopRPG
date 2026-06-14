# TabletopRPG 贡献规范

本项目是 Vite + React + TypeScript 的 AI 跑团游戏。任何代码、文档、素材改动都应保持运行时代码、产品文档、GDD 和项目 wiki 一致。

## 事实源

| 范围 | 事实源 |
| --- | --- |
| 产品范围和验收 | `docs/PRD.md` |
| 技术架构和接口契约 | `docs/SPEC.md` |
| 剧本、玩法和 backlog | `docs/GDD.md` |
| 结构化项目知识库 | `TabletopRPG/index.md` |
| 运行时事实 | `src/` |

修改其中任一事实源时，检查其他事实源是否需要同步。更新 `docs/GDD.md` 后运行 `npm run docs:gdd` 生成 `docs/GDD.html`。

## 本地开发

```bash
npm install
npm run dev
```

常用检查：

```bash
npm test
npm run build
npm run test:smoke
```

快速合并前检查：

```bash
npm run check
```

完整回归检查：

```bash
npm run check:full
```

第一次运行 Playwright 前需要安装浏览器：

```bash
npx playwright install chromium
```

## 代码规范

- TypeScript 使用 `strict` 模式，新增代码应保留明确的领域类型，不用 `any` 绕过契约。
- React 组件保持职责集中：页面编排放 `src/app/`，可复用 UI 放 `src/components/`，领域流程放 `src/dm/`、`src/state/`、`src/services/`。
- DM 业务模块不得直接调用模型 endpoint。模型访问只能通过 `src/dm/llm/client.ts` 和协议 adapter 完成。
- 只有 `src/dm/llm/*Adapter.ts` 可以包含 `/responses`、`/chat/completions` 和对应协议请求字段。
- AI 配置必须沿用 `ApiConfig` 的 `provider`、`protocol`、`endpoint`、`model` 链路，不做隐式协议猜测。
- API Key、`.env.local`、构建产物、测试报告、原始设计稿不得提交。

## 文档与 Wiki

- 项目 wiki 的实际目录是 `TabletopRPG/`，不是历史占位名 `wiki/`。
- 操作 wiki 时遵守 `AGENTS.md` 的 frontmatter、索引、反向链接和 append-only 日志规则。
- 原始素材放在 `raw/`，LLM Agent 不得修改 `raw/`。
- 新增或修改提示词资料时同步 `prompts/README.md` 和 `docs/SPEC.md` 中的接入说明。

## Git 工作流

日常协作参考 `docs/git使用指南.md`。代码改动建议走分支和 PR：

```bash
git checkout -b feature/short-name
git add .
git commit -m "feat: describe the change"
git push origin feature/short-name
```

提交信息尽量使用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:`、`chore:` 前缀。直接推 `main` 前必须确认本地检查已经通过。

## PR 要求

PR 描述需要包含：

- 改了什么。
- 如何验证。
- 是否同步了 PRD / SPEC / GDD / wiki。
- 是否涉及 AI Provider、存档、骰子、状态机或剧本事实。

涉及主流程、AI DM、存档、角色、骰子、布局的改动，至少运行 `npm test` 和 `npm run build`；涉及浏览器行为的改动再运行 `npm run test:smoke`。
