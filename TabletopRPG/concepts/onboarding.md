---
type: concept
title: 首次调查轻量引导
tags: [gameplay, onboarding, mobile, accessibility, save]
sources: [../../scenarios/wuzhongxiaoshi/world.yaml, ../../scenarios/wuzhongxiaoshi/progression.yaml, ../../src/services/onboarding.ts, ../../src/app/useGameController.ts, ../../docs/PRD.md, ../../docs/UI_SYSTEM.md]
created: 2026-10-14
updated: 2026-10-15
---

# 首次调查轻量引导

新用户第一次新建调查时自动进入一段短调查；旧存档与已有调查不插入教程。界面使用控件旁的一句小气泡、镂空高亮和点击小手，指向原有控件；移除阶段标题、步骤计数和重复的弹窗说明，不占用行动区高度；可随时跳过。完成或跳过写入独立本机偏好，正在进行的进度属于调查存档，读档后继续。

## 实际体验

1. 点建议填入接受委托的行动，再点提交。多人逐人点下一位，最后共同等待约1.4秒、显示推演动画后结算一次。伊莎贝拉固定提供剧本已经定义的失踪日期、警方无进展和老赫特酒吧线索；新对话高亮，一句气泡提醒先阅读，点「看完继续」再选择调查行动。
2. 第二轮检查书桌抽屉，其余队友负责询问、记录和警戒。共同提交后同样等待并阅读检定说明，再按首位调查员自己的真实侦查值掷D100。确认结果后先读发现合影的回应，再进入资料引导；失败同样推进，但额外花费十分钟。
3. 点书本打开案件板，合影可以查看详情；关闭资料后认识输入框左侧的头像，查看属性、技能和随身物品。
4. 最后认识保存、读档、声音与AI设置的菜单入口。可以保存完成引导，也可直接开始自由调查。

前两轮不请求模型，不添加额外负向提示词。结果使用已有事件`EV_ACCEPT_COMMISSION`、`EV_FIND_I02`或`EV_FAIL_I02`，没有固定成功或提前透露秘密。正常的每轮五分钟代价仍然生效，失败的额外十分钟独立叠加。

## 接续与边界

阅读阶段没有倒计时，下一行动和掷骰在点「看完继续」后开放；正文不显示点击小手。读完发现后已经可以自由输入，不需要完成全部查阅提示才继续调查。跳过保留队友已经声明的行动和已请求的真实检定；已掷但未确认的骰子恢复后不会重掷。成功保存时写入完成状态，保存失败保留最后提示供重试；完成和跳过后不再重复出现。两轮与骰果保留在正常历史中，之后交回第三轮AI DM。

0.5.78 在原存档v8、引导version1中增加可选`pendingTurn`和`readingMessageId`：前者保存已经共同提交的本地回合，后者指向最新的真实DM回应。读档接续等待或未读提示，重开/载入使旧计时失效。阅读只首次显露新对话，开关弹窗不重置读位。真实模型等待沿用原流程，1400ms只用于两轮本地回应。见 [回应节奏计划](../../docs/plans/2026-10-15-onboarding-reply-pacing.md) 与 [验收](../../docs/reviews/2026-10-15-onboarding-reply-pacing.md)。

存档继续采用v8及当前剧本哈希，缺少引导字段的旧存档不迁入引导。字段损坏或不适用时忽略引导元数据，原有调查和待检定不删除。提示随真实控件、安全边距、滚动和窗口更新；遮罩与小手透传触控，其他弹窗覆盖目标时让位。案件板首次合影只自动显露一次，之后允许玩家自由阅读；跳过按钮加入目标弹窗的键盘循环。手机窄屏、短窗口、桌面与减少动态沿用 [[concepts/game_ui]]；存档行为沿用 [[entities/save_system]]。

实现见 [本地引导内容](../../src/services/onboarding.ts)、[控制器](../../src/app/useGameController.ts) 和 [实施计划](../../docs/plans/2026-10-14-first-investigation-guide.md)，视觉实现见 [聚焦提示](../../src/components/game/OnboardingCoach.tsx) 与 [位置更新](../../src/components/game/onboardingFocus.ts)，实际验证见 [聚焦验收](../../docs/reviews/2026-10-14-onboarding-focus.md)。

## 被引用于

- [[index]]
- [[overview]]
- [[concepts/core_loop]]
- [[concepts/game_ui]]
- [[concepts/android_app]]
