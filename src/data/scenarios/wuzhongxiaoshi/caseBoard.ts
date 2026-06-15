import type { CaseBoardDefinition } from '../../../types/game';

export const caseBoard: CaseBoardDefinition = {
  summary: '埃里克·摩勒的失踪与街区鸦片运输、蒙特利尔关系网和泰晤士港货船线索逐步交汇。',
  nodes: [
    {
      id: 'scene-s01',
      type: 'scene',
      refId: 'S01',
      title: '摩勒住宅',
      subtitle: '委托起点',
      x: 16,
      y: 22,
      revealWhen: { sceneVisited: 'S01' }
    },
    {
      id: 'npc-isabella',
      type: 'npc',
      refId: '伊莎贝拉·摩勒',
      title: '伊莎贝拉·摩勒',
      subtitle: '委托人',
      x: 13,
      y: 46,
      revealWhen: { npcKnown: '伊莎贝拉·摩勒' }
    },
    {
      id: 'item-i01',
      type: 'item',
      refId: 'I01',
      title: '便签',
      subtitle: '“别来找我”',
      x: 31,
      y: 18,
      revealWhen: { itemFound: 'I01' }
    },
    {
      id: 'item-i02',
      type: 'item',
      refId: 'I02',
      title: '合影照片',
      subtitle: '蒙特利尔与埃里克',
      x: 40,
      y: 28,
      revealWhen: { itemFound: 'I02' }
    },
    {
      id: 'npc-montreal',
      type: 'npc',
      refId: '洛夫·蒙特利尔',
      title: '洛夫·蒙特利尔',
      subtitle: '警察局长',
      x: 58,
      y: 22,
      revealWhen: { anyOf: [{ npcKnown: '洛夫·蒙特利尔' }, { itemFound: 'I02' }, { itemFound: 'I06' }] }
    },
    {
      id: 'npc-eric',
      type: 'npc',
      refId: '埃里克·摩勒',
      title: '埃里克·摩勒',
      subtitle: '失踪者',
      x: 78,
      y: 30,
      revealWhen: { anyOf: [{ itemFound: 'I02' }, { itemFound: 'I05' }, { itemFound: 'I08' }] }
    },
    {
      id: 'item-i05',
      type: 'item',
      refId: 'I05',
      title: '白色粉末样品',
      subtitle: '暗格中的可疑粉末',
      x: 35,
      y: 52,
      revealWhen: { itemFound: 'I05' }
    },
    {
      id: 'item-i06',
      type: 'item',
      refId: 'I06',
      title: '报纸残片',
      subtitle: '扫毒英雄通稿',
      x: 54,
      y: 54,
      revealWhen: { itemFound: 'I06' }
    },
    {
      id: 'theory-smuggling',
      type: 'theory',
      title: '走私嫌疑',
      subtitle: '失踪案背后可能有鸦片运输',
      x: 64,
      y: 43,
      revealWhen: { anyOf: [{ itemFound: 'I05' }, { itemFound: 'I06' }] }
    },
    {
      id: 'item-i04',
      type: 'item',
      refId: 'I04',
      title: '小册子',
      subtitle: '隐写文字指向贝尔街14号',
      x: 22,
      y: 70,
      revealWhen: { itemFound: 'I04' }
    },
    {
      id: 'scene-s04',
      type: 'scene',
      refId: 'S04',
      title: '卡森其药店',
      subtitle: '贝尔街14号',
      x: 44,
      y: 77,
      revealWhen: { anyOf: [{ itemFound: 'I04' }, { sceneVisited: 'S04' }] }
    },
    {
      id: 'npc-bartender',
      type: 'npc',
      refId: '老赫特之家酒保',
      title: '老赫特之家酒保',
      subtitle: '线人消息来源',
      x: 18,
      y: 88,
      revealWhen: { npcKnown: '老赫特之家酒保' }
    },
    {
      id: 'theory-rat',
      type: 'theory',
      title: '“老鼠”线索',
      subtitle: '可换取贝尔街相关消息',
      x: 36,
      y: 90,
      revealWhen: { sceneVisited: 'S03' }
    },
    {
      id: 'item-i08',
      type: 'item',
      refId: 'I08',
      title: '雪茄头',
      subtitle: '与埃里克书房品牌一致',
      x: 62,
      y: 78,
      revealWhen: { itemFound: 'I08' }
    },
    {
      id: 'item-i07',
      type: 'item',
      refId: 'I07',
      title: '潮湿的地图笔记',
      subtitle: '标注港口货船位置',
      x: 76,
      y: 70,
      revealWhen: { itemFound: 'I07' }
    },
    {
      id: 'scene-s05',
      type: 'scene',
      refId: 'S05',
      title: '扶桑花号',
      subtitle: '泰晤士港终幕地点',
      x: 86,
      y: 88,
      revealWhen: { itemFound: 'I07' }
    }
  ],
  edges: [
    { id: 's01-isabella', from: 'scene-s01', to: 'npc-isabella', label: '委托', tone: 'evidence', revealWhen: 'bothNodesVisible' },
    { id: 'photo-montreal', from: 'item-i02', to: 'npc-montreal', label: '关系异常', tone: 'suspicion', revealWhen: 'bothNodesVisible' },
    { id: 'photo-eric', from: 'item-i02', to: 'npc-eric', label: '同框', tone: 'evidence', revealWhen: 'bothNodesVisible' },
    { id: 'powder-smuggling', from: 'item-i05', to: 'theory-smuggling', label: '指向走私', tone: 'danger', revealWhen: 'bothNodesVisible' },
    { id: 'paper-smuggling', from: 'item-i06', to: 'theory-smuggling', label: '形成证据压力', tone: 'suspicion', revealWhen: 'bothNodesVisible' },
    { id: 'smuggling-eric', from: 'theory-smuggling', to: 'npc-eric', label: '并非单纯受害者', tone: 'danger', revealWhen: 'bothNodesVisible' },
    { id: 'pamphlet-pharmacy', from: 'item-i04', to: 'scene-s04', label: '指向地址', tone: 'route', revealWhen: 'bothNodesVisible' },
    { id: 'bartender-rat', from: 'npc-bartender', to: 'theory-rat', label: '掌握线人', tone: 'suspicion', revealWhen: 'bothNodesVisible' },
    { id: 'rat-pharmacy', from: 'theory-rat', to: 'scene-s04', label: '贝尔街', tone: 'route', revealWhen: 'bothNodesVisible' },
    { id: 'cigar-eric', from: 'item-i08', to: 'npc-eric', label: '到过药店', tone: 'evidence', revealWhen: 'bothNodesVisible' },
    { id: 'map-fusang', from: 'item-i07', to: 'scene-s05', label: '定位', tone: 'route', revealWhen: 'bothNodesVisible' },
    { id: 'pharmacy-map', from: 'scene-s04', to: 'item-i07', label: '找到地图', tone: 'route', revealWhen: 'bothNodesVisible' }
  ]
};
