/**
 * 《雾中消逝》NPC - 公开面（玩家可见）+ 关联 secret id。
 *
 * public.appearance 必须是玩家见到 NPC 时可观察到的外观/态度，
 * 禁止包含 KP 视角的真相（动机、阴谋、关系网等）。
 */

import type { LayeredEntity, NpcPublic } from '../../../dm/types';
import portraitIsabella from '../../../../assets/avatars/isabella.png';
import portraitMontreal from '../../../../assets/avatars/montreal.png';
import portraitEric from '../../../../assets/avatars/eric.png';
import portraitBartender from '../../../../assets/avatars/bartender.png';
import portraitDeepOne from '../../../../assets/avatars/deep_one.svg';
import portraitDeepOnes from '../../../../assets/avatars/deep_ones.svg';

export const npcs: Record<string, LayeredEntity<NpcPublic>> = {
  '伊莎贝拉·摩勒': {
    public: {
      name: '伊莎贝拉·摩勒',
      role: '委托人',
      attitude: '友好',
      appearance: '约二十出头的年轻女子，神情焦虑，反复整理桌上的文件。其父埃里克·摩勒于7月10日失踪，她以重金请求调查员查明下落。',
      hp: 10,
      portrait: portraitIsabella
    }
  },

  '洛夫·蒙特利尔': {
    public: {
      name: '洛夫·蒙特利尔',
      role: '警察局长',
      attitude: '警惕',
      appearance: '中年男子，制服笔挺，眼神锐利。对外人态度礼貌但保留，谈到摩勒一案时眉头紧锁。',
      hp: 13,
      portrait: portraitMontreal
    },
    secretIds: ['montreal_corruption', 'montreal_thug_trigger']
  },

  '埃里克·摩勒': {
    public: {
      name: '埃里克·摩勒',
      role: '失踪者',
      attitude: '未知',
      appearance: '中年绅士，西装考究，伊莎贝拉书房里有他的肖像。',
      hp: 10,
      portrait: portraitEric
    },
    secretIds: ['eric_smuggling']
  },

  '老赫特之家酒保': {
    public: {
      name: '老赫特之家酒保',
      role: '酒吧老板',
      attitude: '中立',
      appearance: '皮肤粗糙的中年男子，擦着永远擦不干净的酒杯。客人不少但他基本沉默。',
      hp: 10,
      portrait: portraitBartender
    },
    secretIds: ['rat_intel']
  },

  '深潜者（混种）': {
    public: {
      name: '深潜者（混种）',
      role: '不明生物',
      attitude: '敌对',
      appearance: '披着潮湿斗篷的人形身影，脸藏在阴影里，行动异常迅捷。',
      hp: 11,
      portrait: portraitDeepOne
    },
    secretIds: ['hybrid_fog_spell']
  },

  '深潜者×4': {
    public: {
      name: '深潜者×4',
      role: '不明群体',
      attitude: '敌对',
      appearance: '从浓雾中缓步走出的若干人形剪影，身高异于常人，皮肤反射着鱼鳞般的光泽。',
      hp: 44,
      portrait: portraitDeepOnes
    },
    secretIds: ['fusang_escape_timer']
  }
};
