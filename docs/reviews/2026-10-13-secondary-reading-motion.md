# 0.5.70 次级资料阅读接续验收

0.5.70 对齐资料抽屉、剧情资料详情和案件资料详情的正文阅读会话：170ms退出尾部内复开保留同一正文、正在运行的190ms动画和原读位；完整关闭后仍按原会话重置。资料抽屉将既有opening编号纳入阅读页面键，确保真正换出的新正文获得自己的首入动画。三处沿用原动效组件，美术、CSS、自由行动和故事规则保持。

## 1. 先证实真正新正文的首入遗漏

初版仅对齐三个enabled条件，实际3组候选均在资料首开失败：旧正文已离树，换出的新正文连续24个真实RAF没有190ms动画。补入既有opening编号后，新正文拥有自身190ms effect和中间帧；没有放宽断言。这两张真实静态图仅记录首开外观，缺失/修复动效由对应JSON和trace证明。

![1. 先证实真正新正文的首入遗漏](../../output/ui-secondary-reading-motion-2026-10-13/01-info-before.png)

![1. 先证实真正新正文的首入遗漏](../../output/ui-secondary-reading-motion-2026-10-13/02-info-after.png)

## 2. 三类阅读退出尾部接续

320×568单人和390×300四人各覆盖资料、案件、剧情实体。真实正文running帧关闭，观察closing/inert/AX/focus后于17.9–21.5ms复开，保留同DOM、同正文、同Animation与非零读位；关闭/复开当任务opacity和Y差均为0。完整退出才开始新会话，新正文再次拥有190ms首入。图展示实际资料外观，时序和身份只以实帧数据认定。

![2. 三类阅读退出尾部接续](../../output/ui-secondary-reading-motion-2026-10-13/03-case-after.png)

![2. 三类阅读退出尾部接续](../../output/ui-secondary-reading-motion-2026-10-13/04-entity-after.png)

## 3. 短窗、来源读位与媒体偏好

390×300四人短窗三处非零读位保留，案件来源展开在尾部复开保持、完整关闭后按原规则重置。390×844双人代表验证减少动态和受控document.hidden即时收束、焦点释放和前台新首入；受控隐藏不称原生后台。原行动角色、完整多行草稿和队伍均由实际UI检查。

![3. 短窗、来源读位与媒体偏好](../../output/ui-secondary-reading-motion-2026-10-13/05-case-short-after.png)

## 4. 安装包中的实际阅读证据

首次完整原生26组实际运行752.929秒，唯一失败来自新增阅读夹具：它把下一次RAF误当作必然已进入动画中间帧。原始单人JSON的info-first冷开已有完整24帧、真实中间进度和自然finished；日志页的first与beforeClose仍是同一个running=1的190ms Animation，currentTime/progress均为0，只有2个采样帧，尚未发生关闭/复开。此记录不能解释为游戏动效未启动，也不是24帧完整通过。生产三个TSX不变，仅Java helper改为等待原动画真实0<progress<1；时长、身份、AX、焦点和连续性严格断言保持。修后同一原生目标实际1项通过（44.727秒），随后最后完整26组重新验收；正式通过结论只来自最终完整日志。

正式安装APK的一个新增原生Test内部表驱动单/双/四人；每队伍各走资料日志、剧情摩勒住宅标记和顶级案件摩勒住宅卡，合计9个实际运行中返回样本。初次入口及日志页签由真实原生触摸启动，精确尾部关闭/复开在实际RAF中调用现有按钮handler，最终完整退出及新会话返回使用真实系统Back。固定390×430 WebView CSS像素明确记录，不是自然键盘可用高度；真实加密checkpoint恢复后只呈现原有场景公开描述和重复玩家可见日志，不修改DOM正文。新Info keyed正文与fresh正文均保存自身190ms Animation、24真实RAF、中间帧和自然finished；运行中返回保留身份、读位、即时AX和焦点，草稿/角色/队伍/地点时间/已提交行动保持，模型调用0。三张图为双人实际QA pull，固定范围之外不作设备适配或后台推论。

![4. 安装包中的实际阅读证据](../../output/ui-secondary-reading-motion-2026-10-13/qa/secondary-reading-native-info.png)

![4. 安装包中的实际阅读证据](../../output/ui-secondary-reading-motion-2026-10-13/qa/secondary-reading-native-entity.png)

![4. 安装包中的实际阅读证据](../../output/ui-secondary-reading-motion-2026-10-13/qa/secondary-reading-native-case.png)

## 5. 本轮完整验收与交付

768项逻辑（14.67秒）、网页生产构建、248项浏览器（3.4m）及正式签名APK 26组原生回归（795.22秒）通过。隔离准备复用原四个组件文件39项，初版和补token后均实际通过；TypeScript成功时的空输出不作为独立日志证据，最终静态检查以完整流水线为准。新增3组浏览器在三enabled候选首开时全部失败，补既有opening token后相同严格3组通过（17.7秒）。全量验收与这3项隔离证据分开记录。

交付 `output/apk/Fog-TRPG-0.5.70.apk` / versionCode118，11,480,722字节，SHA256 `8a68311e70854d3995b04f53784119b3c83bbb8c7345bd2211b89830c69c29c3`，原证书 `2347007fe8a1255ed1cea1867ac18533112c7c275ae41f46c11bbd72408f2f1f`。76项内容标记、17项原资源、22个原图标源文件、15张编译图标像素与绑定均通过；源码/网页无真实密钥，授权MiMo默认仅进入APK，自定义连接优先，map/env为零。清理6个过期/临时交付文件（23,736,000字节），保留0.5.70/0.5.69。

本轮是0.5.69之后的一个最小阅读接续修复，不把之前四个实施分组再次当作新发布。浏览器覆盖320×568单人、390×300四人三处正文，390×844双人用于减少动态/受控document.hidden分支；受控隐藏不是原生后台证据。快速关闭/复开明确调用实际按钮handler并观察真实Animation和closing帧，不称物理极速连击。截图来自实际结果，只展示外观；190ms、动画身份与连续性由原始逐帧JSON证明。完整关闭、关系返回、队伍和多行草稿仍保持原语义，未修改资料内容、剧情限制、模型调用或玩家设置。



证据：[真实浏览器汇总](../../output/ui-secondary-reading-motion-2026-10-13/evidence-summary.json)、[初版3项失败](../../output/ui-secondary-reading-motion-2026-10-13/candidate-target.log)、[补token后相同3项](../../output/ui-secondary-reading-motion-2026-10-13/repaired-target.log)、[原39项组件](../../output/ui-secondary-reading-motion-2026-10-13/component-check.log)、[补token后39项组件](../../output/ui-secondary-reading-motion-2026-10-13/component-token-check.log)、[最终完整网页日志](../../output/ui-secondary-reading-motion-2026-10-13/web-check.log)、[首轮完整26组夹具失败](../../output/ui-secondary-reading-motion-2026-10-13/native-before-running-frame-check.log)、[首轮原始单人JSON](../../output/ui-secondary-reading-motion-2026-10-13/candidate-native/secondary-reading-native-party-1.json)、[修后实际单项原生复测](../../output/ui-secondary-reading-motion-2026-10-13/targeted-native-check.log)、[最后完整26组原生日志](../../output/ui-secondary-reading-motion-2026-10-13/native-check.log)、[正式包审计](../../output/ui-secondary-reading-motion-2026-10-13/release-audit-final.json)、[原生单人](../../output/ui-secondary-reading-motion-2026-10-13/qa/secondary-reading-native-party-1.json)、[原生双人](../../output/ui-secondary-reading-motion-2026-10-13/qa/secondary-reading-native-party-2.json)、[原生四人](../../output/ui-secondary-reading-motion-2026-10-13/qa/secondary-reading-native-party-4.json)。
