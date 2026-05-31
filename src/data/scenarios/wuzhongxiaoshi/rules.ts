/**
 * 《雾中消逝》模组特定规则。
 *
 * 这些规则供 Director 在 Phase 4 落地为代码护栏；
 * 当前阶段先以声明形式记录，方便审视。
 */

import type { ScenarioRule } from '../../../dm/types';

export const rules: ScenarioRule[] = [
  {
    id: 'montreal_language_default_fail',
    trigger: 'preCheck',
    description: '面对洛夫·蒙特利尔时，"汉语/英语/拉丁语/克苏鲁神话"等语言类技能默认失败；心理学技能降为"困难"难度。'
  },
  {
    id: 'montreal_thug_ambush',
    trigger: 'sceneEnter',
    description: '玩家在 flag.met_montreal=true 之后，于晚间进入 S04 时，触发暴徒袭击事件（Director 应改写或追加场景描述）。'
  },
  {
    id: 'fusang_combat_timer',
    trigger: 'postAction',
    description: '一旦在 S05 进入战斗，每轮递增 fusangCombatTurn；超过 7 轮则深潜者载船逃脱，主线判定失败。'
  },
  {
    id: 'hybrid_san_check',
    trigger: 'sceneEnter',
    description: '调查员首次目睹深潜者（混种）真容时强制 SAN 检定（建议困难难度，损失 1/1d6）。'
  },
  {
    id: 'opening_brief',
    trigger: 'sceneEnter',
    description: '游戏开始于 S01，伊莎贝拉提供初始任务说明；调查员可拒绝/接受/讨论酬金。'
  }
];
