/**
 * 《雾中消逝》场景 - 公开面（玩家可见）+ 关联 secret id。
 *
 * public.desc 必须是玩家初次到达即可观察到的客观描述，禁止包含模组答案。
 */

import sceneMain from '../../../../assets/scenes/scene_main_fog_london.gif';
import sceneS02 from '../../../../assets/scenes/scene_s02.svg';
import sceneS03 from '../../../../assets/scenes/scene_s03.svg';
import sceneS04 from '../../../../assets/scenes/scene_s04.svg';
import sceneS05 from '../../../../assets/scenes/scene_s05.svg';
import type { LayeredEntity, ScenePublic } from '../../../dm/types';
import type { SceneId } from '../../../types/game';

export const scenes: Record<SceneId, LayeredEntity<ScenePublic>> = {
  S01: {
    public: {
      id: 'S01',
      name: '摩勒住宅',
      desc: '纽伦上街101-102号，维多利亚式别墅。委托人伊莎贝拉·摩勒小姐在此等候。',
      image: sceneMain,
      npcs: ['伊莎贝拉·摩勒'],
      items: ['I01', 'I02', 'I03', 'I04', 'I05', 'I06']
    }
  },
  S02: {
    public: {
      id: 'S02',
      name: '上城区第二分局',
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
