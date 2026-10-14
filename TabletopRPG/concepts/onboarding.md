---
type: concept
title: 首次调查轻量引导
tags: [gameplay, onboarding, mobile, accessibility, save]
sources: [../../scenarios/wuzhongxiaoshi/world.yaml, ../../scenarios/wuzhongxiaoshi/progression.yaml, ../../src/services/onboarding.ts, ../../src/app/useGameController.ts, ../../docs/PRD.md, ../../docs/UI_SYSTEM.md]
created: 2026-10-14
updated: 2026-10-14
---

# 首次调查轻量引导

新用户第一次新建调查时自动进入一段短调查；旧存档与已有调查不插入教程。界面只给出当前操作的一两句边注，指向原有控件；可随时跳过。完成或跳过写入独立本机偏好，正在进行的进度属于调查存档，读档后继续。

## 实际体验

1. 点建议填入接受委托的行动，再点提交。多人逐人点下一位，最后共同结算一次。伊莎贝拉固定提供剧本已经定义的失踪日期、警方无进展和老赫特酒吧线索。
2. 第二轮检查书桌抽屉，其余队友负责询问、记录和警戒。首位调查员按自己的真实侦查值掷D100；确认结果后发现合影，失败同样推进，但额外花费十分钟。
3. 点书本打开案件板，合影可以查看详情；关闭资料后认识输入框左侧的头像，查看属性、技能和随身物品。
4. 最后认识保存、读档、声音与AI设置的菜单入口。可以保存完成引导，也可直接开始自由调查。

前两轮不请求模型，不添加额外负向提示词。结果使用已有事件`EV_ACCEPT_COMMISSION`、`EV_FIND_I02`或`EV_FAIL_I02`，没有固定成功或提前透露秘密。正常的每轮五分钟代价仍然生效，失败的额外十分钟独立叠加。

## 接续与边界

查阅阶段已经可以自由输入，不需要完成全部提示才继续调查。跳过保留队友已经声明的行动和已请求的真实检定；已掷但未确认的骰子恢复后不会重掷。成功保存时写入完成状态，保存失败保留最后提示供重试；完成和跳过后不再重复出现。两轮与骰果保留在正常历史中，之后交回第三轮AI DM。

存档继续采用v8及当前剧本哈希，缺少引导字段的旧存档不迁入引导。字段损坏或不适用时忽略引导元数据，原有调查和待检定不删除。手机窄屏、短窗口、桌面与减少动态沿用 [[concepts/game_ui]]；存档行为沿用 [[entities/save_system]]。

实现见 [本地引导内容](../../src/services/onboarding.ts)、[控制器](../../src/app/useGameController.ts) 和 [实施计划](../../docs/plans/2026-10-14-first-investigation-guide.md)，实际验证见 [引导验收](../../docs/reviews/2026-10-14-first-investigation-guide.md)。

## 被引用于

- [[index]]
- [[overview]]
- [[concepts/core_loop]]
- [[concepts/game_ui]]
- [[concepts/android_app]]
