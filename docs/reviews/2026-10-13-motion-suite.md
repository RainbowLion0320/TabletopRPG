# 0.5.69 完整交互动效套件验收

0.5.69 一次交付四组交互动效精修：11个外层首次240ms、退出170ms连续过渡，同DOM快速反向接续当前姿态；档案退出尾部保留页签/各人读位、完整退出才重置，190ms正文切换沿当前姿态接续；存档确认自然收放，44px当前操作行稳定，取消即时归还焦点和AX；首页与局内短反馈定位可见，160ms入场/150ms淡出、170ms尾部释放，同节点替换和尾部重来保持。原银蓝美术、手机竖屏布局、原1800/4000ms通知期限、骰子160ms揭晓与游戏规则保持。

## 1. 外层连续开合

声音、AI设置、菜单、存档、日志、实体、档案、退出、骰子、抽屉、案件11个外层采用首次240ms/退出170ms连续过渡，冷开案件详情的优先级覆盖已修。浏览器11面板样本分别24RAF及三次反向；菜单含三个尺寸。关闭立即inert/AX释放和焦点归还，同DOM不重设起点；常驻抽屉按真实呈现周期重新入场。图是实际手机/桌面外观，逐帧证据另存。

![1. 外层连续开合](../../output/ui-motion-suite-2026-10-13/01-outer-phone.png)

![1. 外层连续开合](../../output/ui-motion-suite-2026-10-13/02-outer-desktop.png)

## 2. 档案页签与各人阅读接续

170ms退出尾部内复开同档案保持页签与各队员各页读位，真正结束后新会话从属性页/零读位开始；浏览器运行中同动画身份及当前姿态接续已有真实帧。原生快速Back/复开验证稳态正文不重播和精确读位，不外推原生运行中Animation身份。查看队友不改变行动队员、多行草稿或队伍。图展示真实返回后的行动/队伍，独立读位及切换连续性见JSON。

![2. 档案页签与各人阅读接续](../../output/ui-motion-suite-2026-10-13/03-reading-two.png)

![2. 档案页签与各人阅读接续](../../output/ui-motion-suite-2026-10-13/04-reading-four.png)

## 3. 存档确认自然高度与当前操作行

确认提示自然展开42px后收回0，操作行始终44px且只暴露当前一组按钮；取消即时还焦点并退出AX。浏览器三次快速反向高度差0、卡片及后继位置误差0；原生中途反向在真实running grid中间帧触发，同时严格验证取消当帧AX/焦点，不用固定35ms假定已绘制。短窗最后一行按钮命中，取消/返回/失败保留/单次删除/读取及最后记录焦点保持，真实原生加密记录12→11只移除一份。

![3. 存档确认自然高度与当前操作行](../../output/ui-motion-suite-2026-10-13/05-save-short.png)

![3. 存档确认自然高度与当前操作行](../../output/ui-motion-suite-2026-10-13/06-save-desktop-short.png)

## 4. 首页与局内反馈可见、连续淡出

修前首页反馈被页面overflow裁出视口；修后网页和真实Android开发入口复用银蓝画框、15px正文、单一polite/atomic通知区，始终被动且不取焦点。160ms入场、150ms退出、170ms画面尾部释放；同通知重新计时、新文字原地替换、退出中重来沿同节点接续。实际短期限1797.4–1798.8ms，Android浏览器长反馈4000.5ms；320×568四边20px安全区的展开长提示与NPC间距23px，读位240px保持。最终target的notice-navigation.json在离屏120.6ms记录旧画面count0（独立命名after另有自己的时间，不能混用）。这里只使用最终results中的after图，before不作修后证据。

![4. 首页与局内反馈可见、连续淡出](../../output/ui-motion-suite-2026-10-13/07-home-feedback.png)

![4. 首页与局内反馈可见、连续淡出](../../output/ui-motion-suite-2026-10-13/08-short-game-feedback.png)

![4. 首页与局内反馈可见、连续淡出](../../output/ui-motion-suite-2026-10-13/09-long-feedback.png)

## 5. 真正APK与验证边界

正式签名APK覆盖原生触摸、系统Back、真实IME恢复和各组1/2/4人。短序列程序按钮调用与真实触摸分开记录；自然可用高度/IME下降与随后固定320×300分开。外层样本逐帧范围、档案稳态读位、存档反向及原生持久化、通知短TTL分别有实际证据，长4000ms由真实浏览器失败反馈与单元期限验证。浏览器Android入口与受控hidden从不冒充安装包/真实后台。图全部实际pull自suite/qa。

![5. 真正APK与验证边界](../../output/ui-motion-suite-2026-10-13/qa/panel-reverse-native.png)

![5. 真正APK与验证边界](../../output/ui-motion-suite-2026-10-13/qa/dossier-reading-native-return.png)

![5. 真正APK与验证边界](../../output/ui-motion-suite-2026-10-13/qa/save-confirmation-native.png)

![5. 真正APK与验证边界](../../output/ui-motion-suite-2026-10-13/qa/save-confirmation-native-short.png)

![5. 真正APK与验证边界](../../output/ui-motion-suite-2026-10-13/qa/passive-feedback-native-short.png)

## 6. 一次完整交付

768项逻辑（15.09秒）、网页生产构建、245项浏览器（3.4m）及正式签名APK 25组原生回归（744.3秒）通过。四组先分别完成隔离定向：外层17项/9项Presence组件、阅读21项/6项档案组件、存档29项/4项原存档组件、通知16项（47.3秒，4新加12相关旧）；通知组件以同一768项正式全量日志为交付证据，没有伪造独立组件日志。最终只在同一次0.5.69实际交付统一完整验收。浏览器真实24RAF与中间帧/反向记录保留，再等待实际有限动效自然完成作终态；不把24帧等同完整时长，也不伪造结束事件。单/双/四人、手机/桌面/300px短窗、草稿、角色、焦点、AX与操作结果保持。

首次整合检查的原架构守卫指出App引用了游戏目录中的无业务通知组件；没有改写或放宽守卫，将GameNotice与其样式迁到shared，并更新各入口和组件引用，功能/CSS保持。首次网页失败日志保留为web-before-shared-notice.log。首轮原生25组实际运行721.215秒，唯一失败是旧结局回顾关闭夹具仍要求抽屉横移到屏外，而本次已采用opacity退场；原始失败保留为native-before-ending-close-check.log。仅Java验收检查改为严格的非open、inert、aria-hidden=true、无dialog role、无data-ui-phase、opacity=0及结局回顾按钮持焦点，生产源码未为此更改。修后结局单项实际原生复测1项通过（73.739秒），日志为ending-target-check.log；单项复测不代替完整验收，通过结论只来自最后一轮25组正式签名APK全绿日志，不称首轮已全绿。

交付 `output/apk/Fog-TRPG-0.5.69.apk` / versionCode117，11,480,722字节，SHA256 `462f7f015aa6b45205610a98e12f9cd337efe4215798c567ca837f5f3f537df3`，原证书 `2347007fe8a1255ed1cea1867ac18533112c7c275ae41f46c11bbd72408f2f1f`。76项内容标记、17项原UI资源、22个原图标源文件和15张编译图标像素/15项绑定、网页图标一致；源码/网页无真实密钥，授权MiMo默认仅在APK，自定义连接优先，map/env为零。清理6个过期/临时交付文件、23,731,892字节，只保留0.5.69/0.5.68。

四组是在隔离副本中先验证的实施记录，正式发布只有本次0.5.69。外层浏览器11个面板样本包括菜单三个尺寸，不等于11种外层均有同等原生逐帧证据；原生新增连续开合覆盖菜单、声音、档案、资料四类及1/2/4人，冷开单独采样和反向序列范围分开。档案和存档的原生短序列明确使用原按钮程序.click()，不能称物理极速连击。通知实际首次保存/短屏保存/导航与Back由真实原生触摸及系统返回验证；只有退出尾部重来调用准备好的原保存按钮handler。浏览器/mobile/index.html是实际AndroidApp异步入口、桌面Capacitor非native分支，不是已安装APK/WebView；受控document.hidden加实际visibilitychange监听不能称真实浏览器切后台。原生通知另恢复真实WebView可用尺寸并验证IME自然下降/Back隐藏，再独立设置320×300；存档短窗在真实IME已隐藏后明确固定尺寸，不外推所有实体机自然压缩。截图只呈现实际外观，连续性由真实逐帧JSON证明，修前首页不可见截图不作修后证据。业务失败保留及重复删除防护沿用原组件/网页路径，不声称新增原生存储失败注入；没有新增模型调用或玩家设置。



四组隔离目标的截图和真实帧先验证各自实施，最终主线只产生本次实际0.5.69交付；生产包、完整检查、签名和QA设备由统一交付流程验证。证据：[外层汇总](../../output/ui-overlay-transitions-2026-10-13/evidence-summary.json)、[阅读汇总](../../output/ui-reading-continuity-2026-10-13/evidence-summary.json)、[存档汇总](../../output/ui-save-confirmation-motion-2026-10-13/evidence-summary.json)、[通知汇总](../../output/ui-notice-motion-2026-10-13/evidence-summary.json)、[首轮网页架构守卫失败](../../output/ui-motion-suite-2026-10-13/web-before-shared-notice.log)、[完整网页日志](../../output/ui-motion-suite-2026-10-13/web-check.log)、[首轮原生旧结局关闭夹具失败](../../output/ui-motion-suite-2026-10-13/native-before-ending-close-check.log)、[修后结局单项原生复测](../../output/ui-motion-suite-2026-10-13/ending-target-check.log)、[最后完整原生日志](../../output/ui-motion-suite-2026-10-13/native-check.log)、[包审计](../../output/ui-motion-suite-2026-10-13/release-audit-final.json)、[读位原生](../../output/ui-motion-suite-2026-10-13/qa/dossier-reading-native-party-2.json)、[存档原生](../../output/ui-motion-suite-2026-10-13/qa/save-confirmation-native-party-2.json)、[通知原生](../../output/ui-motion-suite-2026-10-13/qa/passive-feedback-native-party-2.json)。
