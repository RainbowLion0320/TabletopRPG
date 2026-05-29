import type { StoryData } from '../types/game';
import sceneMain from '../../assets/scenes/scene_main_fog_london.gif';
import sceneS02 from '../../assets/scenes/scene_s02.svg';
import sceneS03 from '../../assets/scenes/scene_s03.svg';
import sceneS04 from '../../assets/scenes/scene_s04.svg';
import sceneS05 from '../../assets/scenes/scene_s05.svg';

export const storyData: StoryData = {
  title: '雾中消逝',
  era: '1920年7月13日，英国伦敦',
  scenes: {
    S01: {
      id: 'S01',
      name: '摩勒住宅',
      desc: '纽伦上街101-102号，维多利亚式别墅。委托人伊莎贝拉在此等候。',
      image: sceneMain,
      npcs: ['伊莎贝拉·摩勒'],
      items: ['I01', 'I02', 'I03', 'I04', 'I05', 'I06']
    },
    S02: {
      id: 'S02',
      name: '上城区第二分局',
      desc: '步行约10分钟。警察局长洛夫·蒙特利尔在此。',
      image: sceneS02,
      npcs: ['洛夫·蒙特利尔'],
      items: []
    },
    S03: {
      id: 'S03',
      name: '老赫特酒吧',
      desc: '本街区内，昏暗嘈杂。可获取关于“老鼠”的信息。',
      image: sceneS03,
      npcs: ['老赫特之家酒保'],
      items: []
    },
    S04: {
      id: 'S04',
      name: '卡森其药店',
      desc: '贝尔街14号，废弃药店。核心场景，必经之地。',
      image: sceneS04,
      npcs: ['深潜者（混种）'],
      items: ['I07', 'I08']
    },
    S05: {
      id: 'S05',
      name: '泰晤士港',
      desc: '港口偏僻角落，扶桑花号停泊于雾中。',
      image: sceneS05,
      npcs: ['深潜者×4', '埃里克·摩勒'],
      items: []
    }
  },
  npcs: {
    '伊莎贝拉·摩勒': {
      role: '委托人',
      attitude: '友好',
      hp: 10,
      notes: '父亲7月10日失踪，提供初始任务。'
    },
    '洛夫·蒙特利尔': {
      role: '警察局长',
      attitude: '警惕',
      hp: 13,
      notes: '语言类技能对其默认失败，心理学降为困难难度。见过他后，调查员晚上去贝尔街会触发暴徒。'
    },
    '埃里克·摩勒': {
      role: '失踪者',
      attitude: '未知',
      hp: 10,
      notes: '毒品运输商，被绑架于扶桑花号。'
    },
    '老赫特之家酒保': {
      role: '酒吧老板',
      attitude: '中立',
      hp: 10,
      notes: '老赫特酒吧的酒保，可能知道一些关于“老鼠”的信息。'
    },
    '深潜者（混种）': {
      role: '神话生物',
      attitude: '敌对',
      hp: 11,
      notes: '可使用咒术召唤浓雾，遭遇真容可能触发 SAN 检定。'
    },
    '深潜者×4': {
      role: '敌方群体',
      attitude: '敌对',
      hp: 44,
      notes: '扶桑花号启动倒计时：6-7轮战斗后逃脱。'
    }
  },
  items: {
    I01: { id: 'I01', name: '便签', scene: 'S01', desc: '书房桌面上写有“别来找我”的便签，笔触在关键字处明显加重。' },
    I02: { id: 'I02', name: '合影照片', scene: 'S01', desc: '蒙特利尔与埃里克的旧合影，暗示两人并非普通关系。' },
    I03: { id: 'I03', name: '名片', scene: 'S01', desc: '一张旧公司名片，印刷精致但信息有些过时。' },
    I04: { id: 'I04', name: '小册子', scene: 'S01', desc: '夹在书架缝隙里的小册子，火烤后可能显出隐写内容。' },
    I05: { id: 'I05', name: '鸦片样品', scene: 'S01', desc: '车库暗格中发现的样品，需要医学检定确认。' },
    I06: { id: 'I06', name: '报纸残片', scene: 'S01', desc: '书房垃圾桶里的报纸残片，含有蒙特利尔相关信息。' },
    I07: { id: 'I07', name: '深潜者地图笔记', scene: 'S04', desc: '标注扶桑花号位置的潮湿地图笔记。' },
    I08: { id: 'I08', name: '雪茄头', scene: 'S04', desc: '柜台附近的雪茄头，能确认埃里克曾在此停留。' }
  }
};

export const sceneList = Object.values(storyData.scenes);
