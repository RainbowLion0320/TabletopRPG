/**
 * 《雾中消逝》场景 - 公开面（玩家可见）+ 关联 secret id。
 *
 * public.desc 必须是玩家初次到达即可观察到的客观描述，禁止包含模组答案。
 */

import sceneS01 from '../../../../assets/scenes/客厅.png';
import sceneS02 from '../../../../assets/scenes/警局.png';
import sceneS03 from '../../../../assets/scenes/酒吧.png';
import sceneS04 from '../../../../assets/scenes/药店.png';
import sceneS05 from '../../../../assets/scenes/码头.png';
import type { LayeredEntity, ScenePublic } from '../../../dm/types';
import type { SceneId } from '../../../types/game';

export const scenes: Record<SceneId, LayeredEntity<ScenePublic>> = {
  S01: {
    public: {
      id: 'S01',
      name: '摩勒住宅',
      chapterTitle: '第一幕：接受委托',
      desc: '纽伦上街101-102号，维多利亚式别墅。委托人伊莎贝拉·摩勒小姐在此等候。',
      image: sceneS01,
      npcs: ['伊莎贝拉·摩勒'],
      items: ['I01', 'I02', 'I03', 'I04', 'I05', 'I06']
    }
  },
  S02: {
    public: {
      id: 'S02',
      name: '上城区第二分局',
      chapterTitle: '第二幕：街区调查',
      desc: '步行约10分钟即可抵达。警察局长洛夫·蒙特利尔在此办公。',
      image: sceneS02,
      npcs: ['洛夫·蒙特利尔'],
      items: []
    },
    secretIds: ['montreal_corruption']
  },
  S03: {
    public: {
      id: 'S03',
      name: '老赫特酒吧',
      chapterTitle: '第二幕：街区调查',
      desc: '本街区内的小酒馆，昏暗嘈杂，烟味浓重。',
      image: sceneS03,
      npcs: ['老赫特之家酒保'],
      items: []
    },
    secretIds: ['rat_intel']
  },
  S04: {
    public: {
      id: 'S04',
      name: '卡森其药店',
      chapterTitle: '第二幕：街区调查',
      desc: '贝尔街14号，废弃多年的药店，门面破败但门锁仍在。',
      image: sceneS04,
      npcs: [],
      items: ['I07', 'I08']
    },
    secretIds: ['hybrid_fog_spell', 'montreal_thug_trigger']
  },
  S05: {
    public: {
      id: 'S05',
      name: '泰晤士港',
      chapterTitle: '终幕：扶桑花号',
      desc: '港口偏僻角落，浓雾笼罩水面，远处停泊着一艘货船。',
      image: sceneS05,
      npcs: [],
      items: []
    },
    secretIds: ['fusang_escape_timer']
  }
};

/**
 * 场景邻接图。
 * 现阶段除 S05 外街区内全连通；S05 通常需要 I07 笔记才能找到，但我们仍允许移动尝试，由 Director 在 secret 未解锁时拒绝。
 */
export const sceneGraph: Record<SceneId, SceneId[]> = {
  S01: ['S02', 'S03', 'S04'],
  S02: ['S01', 'S03', 'S04'],
  S03: ['S01', 'S02', 'S04'],
  S04: ['S01', 'S02', 'S03', 'S05'],
  S05: ['S04']
};
