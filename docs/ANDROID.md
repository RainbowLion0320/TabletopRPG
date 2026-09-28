# Android APK 开发与交付

安卓版独立于网页入口，复用 React/TypeScript 游戏、COC 规则与剧情引擎，通过 Capacitor 原生 Android 容器安装运行。首页、选角、剧情、骰子、案件板、音乐和音效都随 APK 打包；AI DM 推进需要联网和玩家自己的 API 配置。没有内置开发者 API Key，也不依赖电脑启动网页服务。

## 安装游玩

安装 `output/apk/Fog-TRPG-0.4.6.apk`，打开《雾中消逝》，开始游戏并选择调查员（默认单人，可选 1–4 人）。首次进入主游戏会显示 **AI DM 配置**，填写 Provider、协议、Endpoint、API Key 和模型后保存。之后可以在游戏菜单的「AI 设置」中修改。已安装 0.2.0–0.4.5 的玩家直接覆盖安装，沿用原签名和本机数据。

- Android 7.0 / API 24 及以上，Android System WebView 110 及以上；过旧的 WebView 会显示更新指引。
- 0.4.6 修复严格 API schema、失败骰果否定句、将来/无需检定和多人部分检定漏接；质量诊断不再额外生成。KP 笔记只留开发侧，接口原文不展示给玩家，检定记录标明角色与技能。见 [回合流畅性验收](reviews/2026-09-28-turn-smoothness.md)。
- 0.4.5 减少自由叙事误拦，允许局部道具/痕迹和未证实猜测；识别“不需要检定”等文案，并为明确但漏工具的检定补接真实骰子入口。自动恢复携带纠错原因，最终失败只显示一条简洁重试提示，不刷内部规则或隐藏地点。详见 [自由行动验收](reviews/2026-09-10-roleplay-freedom.md)。
- 0.4.4 竖屏选角始终一行一名调查员，取消 600 CSS px 起的双列切换；立绘在左、人物信息在右，宽设备居中并限制列表宽度为 720px。列表独立滚动，人数与进入按钮固定在底部。见 [选角验收](reviews/2026-09-09-portrait-selection.md)。
- 0.4.3 点击行动头像、任意队员卡或正文玩家姓名，可查看完整调查员档案：实时 HP/MP/SAN/幸运、基础属性、可搜索的技能及检定阈值、随身装备和背景。多人查看不改变行动顺序或草稿，系统返回可关闭。见 [档案验收](reviews/2026-09-09-investigator-sheet.md)。
- 0.4.2 展开阅读保留顶部章节/地点栏，面板不会超过其下边界；NPC 信息与收起按钮固定在正文上方，只有剧情内容滚动。底部行动区保持可用，收起恢复场景。见 [展开阅读修复](reviews/2026-09-09-expanded-reading.md)。
- 0.4.1 应用美术提供的游戏图标，覆盖桌面、系统启动画面和网页标签；适配圆形/圆角及系统主题图标。见 [图标资源](../assets/ui/app-icon/README.md)。
- 手机默认锁定竖屏，适配系统安全区和键盘占位；平板沿用相同的上下布局。
- 当前竖屏：上方独立展示完整场景与 NPC，中部滚动阅读剧情，底部固定行动输入。场景画幅按原图 1896:1080 铺满手机宽度，等比例显示，底边不超过屏幕上半区；宽屏受高度上限约束时完整容纳图片。没有 NPC 也保留场景。正文为 15px；建议横向滑动，多人状态按两列排列。展开阅读或窗口高度不超过 500px 时收回展示区，300px 及以下时进一步收起顶部和辅助信息，保留输入及提交。选角列表纵向滚动，已选人数和进入游戏按钮固定在底部。
- 0.4.0 统一黄铜档案风格：主次按钮、图标、建议页签、输入、选角标记、开关推子、菜单、弹窗与资料卡共享材质和反馈；手机优先，兼顾新版网页。完整规范见 [UI_SYSTEM.md](UI_SYSTEM.md)。
- API、存档和音量偏好加密保存在本机；不跟网页浏览器同步。首次安装不携带任何玩家存档。
- 自动续玩包含输入草稿、待重试行动及已锁定骰点。被系统结束进程后，从首页「继续游戏」恢复。已掷出但未确认的骰子直接展示原结果，不重新掷骰；已经提交的 AI 行动由玩家选择重试。
- 手动存档仍可通过菜单保存、读取、管理。覆盖安装同签名新版 APK 会保留数据；卸载或清除应用数据会移除本机数据。
- 音乐和音效分别开关、调音量，设置自动记住；进入后台停止声音。首次真实触摸后开始播放。
- 系统返回键依次关闭弹窗/资料、切换游戏菜单、返回首页；首页退出前确认。

## 当前工程与分支

安卓版此前在独立 worktree `G:\TabletopRPG-android`、分支 `codex/android-apk` 开发。2026-09-28 经用户确认，0.4.5 及此前的 Android、共享 UI 和 AI DM 修复合入 `main`；`G:\TabletopRPG` 现在是包含网页与 Android 入口的主工程。旧网页版本保留在 Git 历史提交 `118cf49`。

`src/main.tsx` / `src/app/App.tsx` 和网页构建入口继续保留。安卓版入口为 `mobile/index.html` → `src/android/main.tsx` → `AndroidApp.tsx`；`vite.android.config.ts` 单独产生 `dist-android/`。网页入口与 APK 共用 `src/styles/game-ui.css` 视觉和 `src/styles/portrait.css` 手机布局，Android 的 `mobile.css` 仅作导入桥。`html.fog-ui` 标记共享主题；APK 总是启用 `html.portrait-ui`，网页宽度不超过 700 CSS px 时启用。共享层的存储/请求适配接口在网页上默认仍使用 `localStorage` / `fetch`。

## Windows 一键构建

需要 Node.js 22.12+。首次准备：

```powershell
npm ci
npm run android:setup
npm run android:apk
```

`android:setup` 将校验过的 Temurin JDK 21、Gradle 8.14.3、Google Android 命令行工具和 SDK 36 安装到独立工具目录，不改变 Unity SDK、系统 Java、全局 PATH 或其他项目设置。Google SDK 许可由其安装器显示并接受。AGP 8.13 默认需要 Build Tools 35，签名和校验工具固定为 36，因此两者均安装。

默认工具目录为 `%LOCALAPPDATA%\TabletopRPG\AndroidTools`；可通过 `TABLETOP_ANDROID_TOOLS` 或不入库的 `.android-local.json` 指定。当前电脑已经准备在 `G:\tools\tabletop-android`，无需再次下载。脚本只为当前子进程设置 Java/SDK/Gradle 缓存路径。

`android:apk` 完成剧本同步检查、TypeScript 检查、安卓版资源构建、Capacitor 同步、Gradle release、zipalign、正式签名及签名校验，输出 APK 与同名 `.sha256`。不是 debug 签名，也不加载远程网页。

| 命令 | 用途 |
| --- | --- |
| `npm run android:dev` | 5275 端口预览手机布局，浏览器预览仍走浏览器存储/网络 |
| `npm run build:android:web` | 只构建安卓静态资源 |
| `npm run android:sync` | 构建并同步原生工程 |
| `npm run android:debug` | 本地调试 APK |
| `npm run android:apk` | 正式签名 APK |
| `$env:ANDROID_SERIAL='设备序列号'; npm run android:test` | 在指定专用测试设备安装 debug 包及运行包内测试 |

原生测试会重置指定设备上 **本游戏的测试数据**，请使用独立模拟器，不要指向正在游玩的手机。当前测试专用 MuMu 实例为 `Fog TRPG APK QA`（Android 15），与原有实例分离。

## 签名与升级

首次 release 构建生成长期 RSA 3072 签名密钥，以后重复使用；更新应用时必须使用同一密钥并递增 `android/app/build.gradle` 中的 `versionCode` / `versionName`。

**请私下备份整个工具目录中的 `signing/` 文件夹**，当前路径为 `G:\tools\tabletop-android\signing`，内含 `fog-trpg-release.p12` 与 `release-password.txt`。丢失密钥将无法覆盖升级已经发出的安装包。这些文件、构建产物和 API 配置均禁止入库。

签名密码由安全随机数生成；构建使用密码文件，不将其写到源码、控制台或命令行参数中。脚本发现密钥/密码缺一时会停止，避免悄悄生成新签名破坏覆盖升级。

## 原生边界与资源

- `src/platform/storage.ts`：存储端口。Android 启动先载入加密缓存，再加载游戏模块；写入按顺序落盘，失败保留待写数据，保存确认等待真实磁盘提交。
- `GameStoragePlugin.java`：Android Keystore + AES-GCM，应用私有存储，关闭系统备份；密钥不进入 WebView localStorage。
- `src/dm/llm/transport.ts`：协议适配器下方的 HTTP 端口；模型业务模块仍只能通过现有 `client.ts`，没有额外 endpoint 直调。
- `AiTransportPlugin.java`：OkHttp 请求，不受浏览器 CORS 限制；支持取消、超时、响应大小上限，保留 HTTP 状态分类，禁止自动跨地址重定向。HTTPS 使用系统证书校验；允许玩家显式配置本地 HTTP 网关。
- `src/android/session.ts`：自动续玩版本与检定一致性检查、已有剧本迁移链、确定性恢复骰点。
- Android 构建不加载 `.env*`，也不采纳 `VITE_AI_*`。APK 不包含个人密钥、开发服务器地址、源映射或测试代码。
- PNG 美术在 Android 构建时缩放并转换 WebP，缓存于忽略目录 `output/android-art/`。原网页素材、骰子美术、字体和音频源文件不改动；音乐/音效许可与游戏内鸣谢继续保留。

## 验证

0.4.0 的布局基准以 CSS 视口为准：320×568、360×640、390×844、412×915、430×932、600×960，而非直接使用手机面板的物理分辨率。Android 入口保留 `html.android-app` 平台标记，手机 CSS 改用 APK / 窄网页共用的 `html.portrait-ui` 作用域，主题使用 `html.fog-ui`。通过安全区变量和动态视口高度分配空间，不使用全局缩放。

包内 `portraitDialogsAndReadingStayWithinPhoneViewport` 在四个竖屏尺寸检查方向锁定、选角及展开属性、单人/双人/四人主界面、AI 表单、长人物资料、案件板/详情/进度/日志、声音与鸣谢、多个存档，以及 300px 剩余高度的行动输入和 API 输入；玩家菜单不包含 KP 笔记。检查包括屏幕边界、滚动容器裁切和控件中心命中；关闭/保存放在滚动内容之外。资料详情的返回键应保留案件板。尺寸探针需至少 860×1864 物理像素、density 320 的专用模拟器承载，不改变玩家手机的显示设置。截图输出到测试设备应用外部目录 `files/qa/`。

包内检查场景画幅与原图比例一致、铺满宽度、底边在屏幕上半区，立绘与剧情/操作区不重叠、面板对齐及底部留白、无 NPC 时保留背景、展开阅读和键盘切换；额外检查 320×568 四人状态卡。API 表单纵向排列、声音设置上下排列、人物详情采用上图下文、骰子采用上方检定信息/中部美术/底部确认、案件板采用竖向卡片。记录见 [竖屏重构验收](reviews/2026-09-09-android-portrait.md) 与 [0.3.1 场景画幅修复](reviews/2026-09-09-android-scene-frame.md)。

0.4.0 追加首页、表单、选角、菜单、音量、案件板的交互和视觉检查，以及窄网页与桌面切换时的队伍/草稿保留。桌面顶栏与立绘分区，避免新顶栏遮住人物。记录见 [统一 UI 验收](reviews/2026-09-09-ui-system.md)。

0.4.2 追加展开阅读的顶部边界、独立正文滚动与固定 NPC 信息条检查。网页覆盖 20 条单人/多人历史的顶部、中间、底部及最新消息定位，包内覆盖四种竖屏尺寸与键盘占位。530 项单元测试、63 项网页流程和最终正式 APK 的 5 组原生测试通过，见 [展开阅读验收](reviews/2026-09-09-expanded-reading.md)。

0.4.3 追加头像/队员卡及正文姓名入口、实时属性、技能阈值/搜索、队友查看、长背景、系统返回、键盘占位和草稿保留；四人最小屏幕优先保留至少 140px 剧情面板。534 项单元测试、66 项网页流程和最终正式 APK 的 5 组包内测试通过，见 [调查员档案验收](reviews/2026-09-09-investigator-sheet.md)。

网页回归为 `npm test`、`npm run build`、`npm run test:smoke`。原生测试运行实际 APK 内的 WebView、HTTP 与 Keystore，覆盖 1/2/4 人、两种协议、加密保存/恢复、取消请求、骰点恢复、返回键、音量开关和系统键盘占位后的输入区边界。手机输入法差异仍建议在目标真机做发行前验收。

0.4.4 追加 `portraitSelectionStaysSingleColumnOnWidePhones`，覆盖 562/599/600/601/700px 宽竖屏选角、展开属性、底部操作及多人选择保留；需至少 1400×2000 物理像素、density 320 的专用测试画布。534 项单元测试、67 项网页流程和正式 APK 的 6 组原生测试通过，见 [选角验收](reviews/2026-09-09-portrait-selection.md)。

正式交付前校验 release 签名、应用 id、SDK 版本、权限与压缩包内容，并在独立 Android 15 模拟器安装正式包。构建日志、截图和测试报告只放 `output/` / Android `build/`，不入 Git。

0.4.5 的自由行动容错验证：554 项单元测试、69 项网页流程、正式包 7 组原生测试通过。新增连续语义失败后的纠错保留、内部信息隔离、单条恢复提示，以及缺少工具的明确自由检定衔接；模拟响应与截图记录见 [自由行动验收](reviews/2026-09-10-roleplay-freedom.md)。
