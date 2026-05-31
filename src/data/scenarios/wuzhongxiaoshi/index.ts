/**
 * 《雾中消逝》模组入口。
 * 把分散的 scenes / npcs / items / secrets / rules 聚合为统一的 KnowledgeBase。
 */

import type { KnowledgeBase } from '../../../dm/types';
import { scenes, sceneGraph } from './scenes';
import { npcs } from './npcs';
import { items } from './items';
import { secrets } from './secrets';
import { rules } from './rules';

export const wuzhongxiaoshi: KnowledgeBase = {
  scenarioId: 'wuzhongxiaoshi',
  title: '雾中消逝',
  era: '1920年7月13日，英国伦敦',
  scenes,
  npcs,
  items,
  secrets,
  rules,
  sceneGraph
};

export { scenes, sceneGraph, npcs, items, secrets, rules };
