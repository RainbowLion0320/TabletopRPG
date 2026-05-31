/**
 * 《雾中消逝》模组的 KP 内幕清单。
 *
 * 每条 secret 是原子化、独立解锁的真相。
 * - revealOn 满足任一条件即解锁；解锁后才会被 ContextBuilder 喂给 Narrator。
 * - 玩家面 UI 不会读取本文件；这里的内容仅供 AI 在合规情境下"知情"。
 */

import type { SecretDefinition } from '../../../dm/types';

export const secrets: Record<string, SecretDefinition> = {
  // ----- NPC 真相 -----
  montreal_corruption: {
    id: 'montreal_corruption',
    content: '蒙特利尔局长与埃里克·摩勒存在私下勾连，曾参与毒品运输；他对调查保持警觉。语言类技能对其默认失败，心理学技能降为困难难度。',
    revealOn: [
      { type: 'flag', key: 'met_montreal' },
      { type: 'sceneVisited', sceneId: 'S02' }
    ]
  },
  montreal_thug_trigger: {
    id: 'montreal_thug_trigger',
    content: '调查员见过蒙特利尔后，若再于晚间前往贝尔街附近（S04），将触发暴徒袭击事件。',
    revealOn: [
      { type: 'flag', key: 'met_montreal' }
    ]
  },
  eric_smuggling: {
    id: 'eric_smuggling',
    content: '埃里克·摩勒是毒品运输商，被同伙背叛后绑架于扶桑花号上。他不是单纯的失踪者。',
    revealOn: [
      { type: 'flag', key: 'discovered_smuggling' },
      { type: 'itemFound', itemId: 'I05' }
    ]
  },
  rat_intel: {
    id: 'rat_intel',
    content: '老赫特酒吧酒保掌握"老鼠"（街区线人代称）的信息；以酒水或金钱贿赂可换取贝尔街相关线索。',
    revealOn: [
      { type: 'sceneVisited', sceneId: 'S03' }
    ]
  },
  hybrid_fog_spell: {
    id: 'hybrid_fog_spell',
    content: '深潜者（混种）会使用克苏鲁咒术召唤浓雾。遭遇其真容可能触发理智检定，建议困难难度。',
    revealOn: [
      { type: 'flag', key: 'encountered_hybrid' },
      { type: 'sceneVisited', sceneId: 'S04' }
    ]
  },
  fusang_escape_timer: {
    id: 'fusang_escape_timer',
    content: '扶桑花号启动倒计时：进入战斗后 6-7 轮内若调查员未阻止，深潜者群体将载船逃脱，本场调查失败。',
    revealOn: [
      { type: 'sceneVisited', sceneId: 'S05' }
    ]
  },

  // ----- 物品真相 -----
  note_resentment: {
    id: 'note_resentment',
    content: '便签的笔迹分析（侦查/心理学）显示"别来找我"中"找"字的笔触异常加重，暗示书写时情绪激动或被胁迫。',
    revealOn: [
      { type: 'itemFound', itemId: 'I01' }
    ]
  },
  photo_montreal_eric: {
    id: 'photo_montreal_eric',
    content: '合影中蒙特利尔与埃里克的姿态过于亲密，暗示两人并非仅有公务关系。',
    revealOn: [
      { type: 'itemFound', itemId: 'I02' }
    ]
  },
  pamphlet_hidden_writing: {
    id: 'pamphlet_hidden_writing',
    content: '小册子是普通书目，但夹页用米水写有隐写文字，火烤后会显出"卡森其·贝尔14"。',
    revealOn: [
      { type: 'itemFound', itemId: 'I04' }
    ]
  },
  opium_sample_id: {
    id: 'opium_sample_id',
    content: '车库暗格中的白色粉末，经医学/化学检定确认为高纯度鸦片。',
    revealOn: [
      { type: 'itemFound', itemId: 'I05' }
    ]
  },
  newspaper_montreal_story: {
    id: 'newspaper_montreal_story',
    content: '报纸残片刊载蒙特利尔近期的"扫毒英雄"通稿，与暗格鸦片样品形成讽刺呼应，可作为对其施压的证据。',
    revealOn: [
      { type: 'itemFound', itemId: 'I06' }
    ]
  },
  map_fusang_location: {
    id: 'map_fusang_location',
    content: '潮湿地图笔记标注泰晤士港深潜者据点"扶桑花号"的精确停泊位置，是前往 S05 的关键线索。',
    revealOn: [
      { type: 'itemFound', itemId: 'I07' }
    ]
  },
  cigar_eric_presence: {
    id: 'cigar_eric_presence',
    content: '雪茄头品牌与埃里克书房雪茄盒一致，可证明埃里克近日曾在卡森其药店停留。',
    revealOn: [
      { type: 'itemFound', itemId: 'I08' }
    ]
  }
};

export const allSecretIds = Object.keys(secrets);
