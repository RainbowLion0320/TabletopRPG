/**
 * 《雾中消逝》物品 - 公开面（玩家可见）+ 关联 secret id。
 *
 * public.appearance 是玩家拾起/看到该物时的客观描述，
 * 禁止包含通过检定才能确认的内容或解谜答案。
 */

import type { ItemPublic, LayeredEntity } from '../../../dm/types';

export const items: Record<string, LayeredEntity<ItemPublic>> = {
  I01: {
    public: {
      id: 'I01',
      name: '便签',
      scene: 'S01',
      appearance: '书房桌面上写有"别来找我"的便签，纸张普通，墨迹未干透。'
    },
    secretIds: ['note_resentment']
  },
  I02: {
    public: {
      id: 'I02',
      name: '合影照片',
      scene: 'S01',
      appearance: '相框里是一张旧合影，画面中是一名中年男子与一位身着制服的人。'
    },
    secretIds: ['photo_montreal_eric']
  },
  I03: {
    public: {
      id: 'I03',
      name: '名片',
      scene: 'S01',
      appearance: '一张旧公司名片，印刷精致但纸张泛黄，信息看起来已过时多年。'
    }
  },
  I04: {
    public: {
      id: 'I04',
      name: '小册子',
      scene: 'S01',
      appearance: '夹在书架缝隙里的小册子，封面普通看不出特别之处。'
    },
    secretIds: ['pamphlet_hidden_writing']
  },
  I05: {
    public: {
      id: 'I05',
      name: '白色粉末样品',
      scene: 'S01',
      appearance: '车库一处暗格中发现的小袋白色粉末样品，颗粒细腻，气味淡苦。'
    },
    secretIds: ['opium_sample_id', 'eric_smuggling']
  },
  I06: {
    public: {
      id: 'I06',
      name: '报纸残片',
      scene: 'S01',
      appearance: '书房垃圾桶里的报纸残片，可见标题与一段被撕掉的人物照片。'
    },
    secretIds: ['newspaper_montreal_story']
  },
  I07: {
    public: {
      id: 'I07',
      name: '潮湿的地图笔记',
      scene: 'S04',
      appearance: '用油布包裹的手绘地图，纸张潮湿带有水渍，标注潦草。'
    },
    secretIds: ['map_fusang_location']
  },
  I08: {
    public: {
      id: 'I08',
      name: '雪茄头',
      scene: 'S04',
      appearance: '柜台附近残留的雪茄头，仍带有未燃尽的香气，品牌标记清晰。'
    },
    secretIds: ['cigar_eric_presence']
  }
};
