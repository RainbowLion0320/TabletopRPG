# TabletopRPG

AI 驱动的跑团游戏，优先适配手机竖屏，兼顾桌面网页。当前项目采用 Vite + React + TypeScript 架构，主界面将资料、设置、存档等低频功能收进二级菜单。

## 技术栈

安卓版使用独立构建入口，运行 `npm run android:apk` 生成正式签名 APK。首次准备工具及安装说明见 [Android 开发与交付](docs/ANDROID.md)。按项目授权，正式 APK 从系统 `APIKEY_MIMO` 注入 MiMo Token Plan / `mimo-v2.6-pro` 默认连接，新安装可直接游玩；玩家已保存的连接优先，仍可在「AI 设置」修改。网页默认连接按下文的本地配置设置，真实默认密钥不进入 Git 或网页产物。

| 模块 | 方案 |
| --- | --- |
| 前端框架 | React 18 |
| 构建工具 | Vite |
| 语言 | TypeScript |
| 图标 | lucide-react |
| 存储 | localStorage |
| AI 接入 | OpenAI Responses API / OpenAI-compatible Chat Completions gateway |

## 快速开始

最简单方式（按系统选择）：

- Windows：双击项目根目录的 `start-game.bat`
- macOS：双击项目根目录的 `start-game.command`（首次使用如被 Gatekeeper 拦截，可在「系统设置 → 隐私与安全性」中允许，或在终端执行 `chmod +x start-game.command` 后再次双击）
- Linux：在终端执行 `bash scripts/start-game.sh`

脚本会检查依赖并自动打开浏览器。

命令行方式：

```bash
npm install
# Windows
npm start
# macOS / Linux
npm run start:game
```

构建生产版本：

```bash
npm run build
```

运行核心流程 smoke tests：

```bash
npx playwright install chromium
npm run test:smoke
```

合并前快速检查：

```bash
npm run check
```

## AI API 配置（推荐：本地环境变量）

为了避免每次启动都要在界面里手动填 API Key，推荐把密钥放在**本地 shell 环境变量**里，游戏启动时会自动读取作为默认值。密钥不会写入仓库（`.env*` 已在 `.gitignore` 中）。

### OpenAI 官方（默认，Responses API）

```bash
export VITE_AI_PROVIDER="openai"
export VITE_AI_PROTOCOL="responses"
export VITE_AI_API_KEY="<你的 OpenAI Key>"
# 可选；为空时默认 gpt-4o
# export VITE_AI_MODEL="gpt-4o"
```

### MiMo / 自定义 OpenAI-compatible 网关

这类网关通常兼容 Chat Completions，而不一定支持 OpenAI Responses API。需要显式配置 `chat-completions` 协议和 endpoint：

```bash
export VITE_AI_PROVIDER="mimo"
export VITE_AI_PROTOCOL="chat-completions"
export VITE_AI_ENDPOINT="https://你的网关域名/v1"
export VITE_AI_API_KEY="<你的 MiMo 或网关 Key>"
export VITE_AI_MODEL="<网关模型名>"
```

自定义网关可把 `VITE_AI_PROVIDER` 改成 `custom`。

### macOS / Linux（zsh / bash）

在 `~/.zshrc`（或 `~/.bashrc`）里追加：

```bash
# OpenAI 官方
export VITE_AI_PROVIDER="openai"
export VITE_AI_PROTOCOL="responses"
export VITE_AI_API_KEY="<你的 OpenAI Key>"
```

保存后执行 `source ~/.zshrc`，再运行 `npm run start:game` 即可。

### Windows（PowerShell）

```powershell
[Environment]::SetEnvironmentVariable("VITE_AI_PROVIDER", "openai", "User")
[Environment]::SetEnvironmentVariable("VITE_AI_PROTOCOL", "responses", "User")
[Environment]::SetEnvironmentVariable("VITE_AI_API_KEY", "<你的 OpenAI Key>", "User")
```

新开一个终端使变量生效，再 `npm start`。

### 备选：项目内 `.env.local`（仍不会进 git）

如果不想改 shell 配置，也可以在项目根目录新建 `.env.local`：

```env
VITE_AI_PROVIDER=openai
VITE_AI_PROTOCOL=responses
VITE_AI_API_KEY=<你的 OpenAI Key>
```

该文件已被 `.gitignore` 忽略，不会被提交。

### 优先级

1. UI 设置面板里手动保存的配置（写入浏览器 `localStorage`）—— 最高优先
2. `VITE_AI_*` 环境变量（构建/启动时注入）
3. 都没有时，启动会弹出配置面板

支持的环境变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `VITE_AI_API_KEY` | ✅ | API Key |
| `VITE_AI_PROVIDER` | 可选 | `openai` / `mimo` / `custom`，默认 `openai` |
| `VITE_AI_PROTOCOL` | 可选 | `responses` / `chat-completions`，默认由 provider 决定 |
| `VITE_AI_ENDPOINT` | 条件必填 | OpenAI 默认 `https://api.openai.com/v1`；MiMo/custom 必填 |
| `VITE_AI_MODEL` | 条件必填 | OpenAI 默认 `gpt-4o`；MiMo/custom 按网关要求填写 |


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
| 贡献规范 | `CONTRIBUTING.md` |
| 运行时代码 | `src/` |

## 项目规范

- 贡献、测试、Git 与文档同步要求见 `CONTRIBUTING.md`。
- Wiki 维护规则见 `AGENTS.md`，实际 wiki 目录为 `TabletopRPG/`。
- CI 会在 `main` push 和 PR 上运行 `npm test`、`npm run build`、`npm run test:smoke`。

## 当前 UI 结构

首屏优先服务横屏网页游戏体验：

- 顶部保留场景标题和一级菜单入口
- 中央展示场景图与叙事重点
- 左下角展示队伍成员状态
- 底部集中处理对话、行动建议与行动提交
- 右侧【资料】入口打开全屏混合调查台：桌面端展示自动关系图、调查脉络与实体档案，移动端展示分组列表；行动日志作为辅助页签保留
- AI 配置、存档、模式切换放入菜单，避免一级界面拥挤

## 资源说明

当前首屏使用 `assets/scenes/scene_main_fog_london.webm`，搭配 29KB 的同画面 WebP 静态封面；暂停动画或视频尚未开始时仍有完整场景。正式场景/人物 PNG 原图保留，新版网页与 APK 共用 WebP 处理，保持原构图、透明度与原 APK 品质；成功资源构建收拢过时缓存，继续复用 `output/android-art/`，不留两套生成图。旧 GIF、场景占位 SVG 和 7 张未引用的暗版背景已由现有素材/运行时阴影替代并从工作区移除，需要历史副本可从 Git 恢复。

正式 APK 成功签名及校验后，打包流程自动保留最新和上一版 APK/校验文件，清理更早版本与临时签名/对齐文件。`npm run clean:generated` 可再清理已完成音频制作的下载原包和中间 WAV；运行 MP3、授权文件、原始设计资料和其他交付文件保留。见 [Android 交付约定](docs/ANDROID.md)。
