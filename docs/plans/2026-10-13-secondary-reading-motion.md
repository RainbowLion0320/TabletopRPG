# 0.5.70 资料正文动效接续

## 目标与依据

资料抽屉、剧情资料详情和案件资料详情的外层已能在 170ms 退出尾部快速复开时接续当前画面，但正文的 190ms 阅读动画仍以逻辑 open 启停。逻辑关闭会取消正文动画并清除接续姿态；外层仍然保留，同 DOM 复开正文却从默认 `.45 / 3px` 重播，使两层视觉会话脱节。

本批将三处正文的动画生命周期对齐保留画面的生命周期，沿用调查员档案的既有方案。资料内容、读位、焦点、返回键、无障碍语义及原银蓝美术均保持既有定义，不增加玩家控件、提示或配置。

隔离基线为 `7d41b4693f2dd53b76e0a61da15948620fdd009d`，与冻结的 0.5.69 源码一致，包含 `shared/GameNotice` 迁移。源码依据另留于内部 `output/ui-motion-suite-2026-10-13/next-reading-audit.md`；该文件不提交。

## 最小实现

| 组件 | 正文节点与页面键 | 动画启用条件 |
| --- | --- | --- |
| `InfoDrawer` | `.info-drawer-page`；`${opening}:${activeTab}` | `motion.present` |
| `EntityDetailModal` | `.entity-detail-body`；retained `detail.name` | `motion.present && Boolean(detail)` |
| `CaseBoardInspector` | `.case-board-inspector-scroll`；retained `node.id` | `motion.present && Boolean(node)` |

三处调整 `useReadingMotion` 的 enabled 参数；资料抽屉另将既有 opening 会话编号加入阅读 page token，使真正的新正文节点获得首入动画。保留现有 `useOverlayPresence`、`useOverlayEntry` 和共用阅读 hook，不新增状态、控制器或依赖。

逻辑关闭仍立即释放 dialog、焦点与 AX，退出内容立即 inert；动画不阻塞操作。正常尾部复开保留同一正文节点及正在运行的动画。真正关闭完成后按各组件原有新会话定义处理：资料抽屉的 opening key、页签与读位恢复，案件资料的记录读位/来源状态，剧情资料的实体解析与内容均不改变。

资料抽屉首开边界已由实际浏览器证实：阅读 hook 的 layout effect 先运行，随后新会话的 `setOpening` 替换正文 key。320×568 单人、390×300 四人以及媒体偏好分支的 3 个新增候选回归均在首开失败。新 body 确实替换旧 body，旧 body 已离树；新 body 初帧及 24 个真实 RAF 始终 opacity 1 / y 0 / active false / durations 空，没有自身 190ms 动画。证据保留在 `output/ui-secondary-reading-motion-2026-10-13/candidate-failures/` 的 JSON、PNG、trace 和 `candidate-target.log`。经根代理授权，最小补充 page token `${opening}:${activeTab}` 已落；正常尾部复开 opening 不变，仍保持同正文/动画会话，不重播。相同 3 个严格回归修后全部实际通过，保留新 body 自身 190ms 首入断言和真实中间帧，未放宽原断言。

## 验证安排

1. 先运行现有 `InfoDrawer`、`EntityDetailModal` 及共用 presence/focus 组件测试和 TypeScript 静态检查，记录实际结果。`InfoDrawer` 现有用例也覆盖真实案件资料关联及 Escape 返回。组件测试验证语义/内容，不能代替实际画面证据。
2. 浏览器阶段须先得到正文真实 running 动画帧，再关闭并在真实 closing 尾部复开。记录同 DOM、同正文、页签与读位，以及同任务 opacity/DOMMatrix 的连续性。24 真实 RAF 后再等待有限动画自然完成，不伪造完成事件，也不以固定帧数猜时长。
3. 完全关闭后再次打开，明确记录真实新正文节点/新会话；尤其资料抽屉 opening key 替换应观察新 body，不能将旧节点的动画当作新节点首入证据。
4. 保留关闭后立即焦点/AX 释放、现有 Back 行为和入口可操作性；验证草稿、队伍、行动角色和剧情读位不受影响。覆盖单人、双人、四人以及实际竖屏/短窗，并分别标明真实原生触摸/系统 Back 与快速时序的真实按钮 handler 点击。
5. 减少动态与切后台按原契约即时收束。快速重复切页、关联返回、关闭/复开不积累动画、不残留 inert/focus/dialog。减少动态的即时完成不应强行断言存在中间动画帧。

## 阶段状态

- 已落最小生产修改：三个 enabled 参数和资料抽屉既有 opening 阅读页面 token。
- 已实际运行现有四个组件测试文件：`InfoDrawer`、`EntityDetailModal`、`useOverlayPresence`、`useDialogFocus`，39/39 通过（2026-10-13 12:13:10，5.82s）。记录：`output/ui-secondary-reading-motion-2026-10-13/component-check.log`。没有改写或新增组件测试。
- 已直接执行并通过 TypeScript no-emit 静态检查（`--incremental false --composite false`，工具返回 exit 0），未生成构建产物。编译器成功时无输出；没有保存独立类型检查日志，不引用不存在的日志文件。
- 补充 opening token 后，同四文件 39/39 再次实际通过（2026-10-13 12:21:43，6.97s），实际组件记录为相同内部证据目录的 `component-token-check.log`。修后 no-emit TypeScript 的直接执行工具也返回 exit 0，没有独立持久日志；此阶段没有新增或改写组件测试。
- 已保留首次浏览器候选 3/3 失败的原始首开证据。修后同 3 项隔离浏览器回归实际 3/3 通过（17.7s，workers 1）：320×568 单人正常竖屏、390×300 四人短窗和媒体偏好/受控后台代表分支。真实 Info 新节点首次及完整关闭后的新会话均有自身 190ms 阅读动画和中间帧；三处快速关闭后小于 170ms 的复开保持同 DOM、同正文、同 Animation、读位及案件来源状态。证据为 `repaired-target.log`、`results/` 与 `evidence-summary.json`，位于相同内部证据目录，已由根代理实际复制到主线 ignored output。服务已停止。本结果只属于隔离浏览器，尚非原生 WebView 验收；不能将原始失败记录当作通过结果。
- Android 原生 WebView、构建、完整回归与正式 APK：尚未执行本批，待根代理授权及主线 0.5.69 验收结束后进行。
- 此阶段不提交、推送或改主工作区。


## 实际交付验收（0.5.70）

0.5.70 对齐资料抽屉、剧情资料详情和案件资料详情的正文阅读会话：170ms退出尾部内复开保留同一正文、正在运行的190ms动画和原读位；完整关闭后仍按原会话重置。资料抽屉将既有opening编号纳入阅读页面键，确保真正换出的新正文获得自己的首入动画。三处沿用原动效组件，美术、CSS、自由行动和故事规则保持。

768项逻辑（14.67秒）、网页生产构建、248项浏览器（3.4m）及正式签名APK 26组原生回归（795.22秒）通过。隔离准备复用原四个组件文件39项，初版和补token后均实际通过；TypeScript成功时的空输出不作为独立日志证据，最终静态检查以完整流水线为准。新增3组浏览器在三enabled候选首开时全部失败，补既有opening token后相同严格3组通过（17.7秒）。全量验收与这3项隔离证据分开记录。

交付 `output/apk/Fog-TRPG-0.5.70.apk` / versionCode118，11,480,722字节，SHA256 `8a68311e70854d3995b04f53784119b3c83bbb8c7345bd2211b89830c69c29c3`，原证书 `2347007fe8a1255ed1cea1867ac18533112c7c275ae41f46c11bbd72408f2f1f`。76项内容标记、17项原资源、22个原图标源文件、15张编译图标像素与绑定均通过；源码/网页无真实密钥，授权MiMo默认仅进入APK，自定义连接优先，map/env为零。清理6个过期/临时交付文件（23,736,000字节），保留0.5.70/0.5.69。

首次完整原生26组实际运行752.929秒，唯一失败来自新增阅读夹具：它把下一次RAF误当作必然已进入动画中间帧。原始单人JSON的info-first冷开已有完整24帧、真实中间进度和自然finished；日志页的first与beforeClose仍是同一个running=1的190ms Animation，currentTime/progress均为0，只有2个采样帧，尚未发生关闭/复开。此记录不能解释为游戏动效未启动，也不是24帧完整通过。生产三个TSX不变，仅Java helper改为等待原动画真实0<progress<1；时长、身份、AX、焦点和连续性严格断言保持。修后同一原生目标实际1项通过（44.727秒），随后最后完整26组重新验收；正式通过结论只来自最终完整日志。

正式安装APK的一个新增原生Test内部表驱动单/双/四人；每队伍各走资料日志、剧情摩勒住宅标记和顶级案件摩勒住宅卡，合计9个实际运行中返回样本。初次入口及日志页签由真实原生触摸启动，精确尾部关闭/复开在实际RAF中调用现有按钮handler，最终完整退出及新会话返回使用真实系统Back。固定390×430 WebView CSS像素明确记录，不是自然键盘可用高度；真实加密checkpoint恢复后只呈现原有场景公开描述和重复玩家可见日志，不修改DOM正文。新Info keyed正文与fresh正文均保存自身190ms Animation、24真实RAF、中间帧和自然finished；运行中返回保留身份、读位、即时AX和焦点，草稿/角色/队伍/地点时间/已提交行动保持，模型调用0。三张图为双人实际QA pull，固定范围之外不作设备适配或后台推论。

本轮是0.5.69之后的一个最小阅读接续修复，不把之前四个实施分组再次当作新发布。浏览器覆盖320×568单人、390×300四人三处正文，390×844双人用于减少动态/受控document.hidden分支；受控隐藏不是原生后台证据。快速关闭/复开明确调用实际按钮handler并观察真实Animation和closing帧，不称物理极速连击。截图来自实际结果，只展示外观；190ms、动画身份与连续性由原始逐帧JSON证明。完整关闭、关系返回、队伍和多行草稿仍保持原语义，未修改资料内容、剧情限制、模型调用或玩家设置。

先前准备段落为实施历史；最终通过结论只以上述实际完整验收为准。见 [五步真实评审](../reviews/2026-10-13-secondary-reading-motion.md)。
