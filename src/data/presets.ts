import type { Investigator, PresetInvestigator, SkillValue } from '../types/game';
import { deriveInvestigatorStats, resolveSkillBase } from './gameRules';
import { allSkills, jobSkillMap, jobs } from './skills';

export const presets: PresetInvestigator[] = [
  {
    id: 'inspector',
    name: '亨利·格雷',
    role: '前苏格兰场侦探',
    job: 'detective',
    gender: '男',
    age: 42,
    hometown: '伦敦',
    attrs: { STR: 65, CON: 60, SIZ: 65, DEX: 60, APP: 55, INT: 75, POW: 60, EDU: 80, Luck: 55 },
    skills: { 侦查: 75, 聆听: 65, 心理学: 70, 说服: 60, 话术: 55, 法律: 50, 图书馆: 65, 母语: 80, '格斗（拳）': 50, 恐吓: 45, 潜行: 40, '驾驶（汽车）': 40 },
    desc: '十年苏格兰场生涯，人心如书般可读。',
    background: {
      importantPerson: '已故搭档汤姆',
      belief: '真相从不会真正消失，只是被掩盖',
      meaningfulItem: '苏格兰场徽章',
      trait: '习惯性观察每个人的手部动作'
    }
  },
  {
    id: 'nurse',
    name: '艾达·华莱士',
    role: '战地护士出身的医生',
    job: 'doctor',
    gender: '女',
    age: 35,
    hometown: '爱丁堡',
    attrs: { STR: 45, CON: 65, SIZ: 50, DEX: 70, APP: 65, INT: 80, POW: 70, EDU: 85, Luck: 60 },
    skills: { 急救: 80, 医学: 75, 心理学: 65, 生物学: 55, 图书馆: 70, 说服: 60, 聆听: 65, 母语: 85, 侦查: 50, 历史: 35, 神秘学: 20 },
    desc: '一战护士经历让她对生死处之泰然。',
    background: {
      importantPerson: '弟弟罗伯特',
      belief: '生命高于一切',
      meaningfulItem: '战地急救包',
      trait: '遇事冷静，但对谎言极度敏感'
    }
  },
  {
    id: 'reporter',
    name: '托马斯·贝尔',
    role: '《每日电讯》调查记者',
    job: 'journalist',
    gender: '男',
    age: 30,
    hometown: '曼彻斯特',
    attrs: { STR: 55, CON: 55, SIZ: 60, DEX: 65, APP: 70, INT: 85, POW: 65, EDU: 75, Luck: 65 },
    skills: { 历史: 55, 图书馆: 70, 母语: 75, 心理学: 60, 侦查: 65, 话术: 65, 说服: 65, 摄影: 55, 聆听: 55, 神秘学: 25, 法律: 30, 潜行: 40 },
    desc: '笔锋犀利，无孔不入。',
    background: {
      importantPerson: '主编海伦',
      belief: '公众有权知道真相',
      meaningfulItem: '磨损的皮质笔记本',
      trait: '对人天然好奇'
    }
  },
  {
    id: 'constable',
    name: '罗伯特·肖',
    role: '伦敦警察厅老牌巡警',
    job: 'police',
    gender: '男',
    age: 38,
    hometown: '伦敦东区',
    attrs: { STR: 75, CON: 70, SIZ: 75, DEX: 60, APP: 55, INT: 60, POW: 55, EDU: 65, Luck: 50 },
    skills: { 急救: 55, 法律: 45, '格斗（拳）': 70, '射击（手枪）': 60, 侦查: 55, 心理学: 45, 潜行: 45, 母语: 65, 恐吓: 55, 聆听: 50, 闪避: 50 },
    desc: '街头磨砺的老警察，话不多，但出手利落。',
    background: {
      importantPerson: '妻子玛格丽特',
      belief: '规则是文明的最后防线',
      meaningfulItem: '警用警棍',
      trait: '对可疑之人保持本能警觉'
    }
  }
];

export function createInvestigatorFromPreset(preset: PresetInvestigator): Investigator {
  const job = jobs.find((item) => item.id === preset.job);
  const jobSkills = new Set(jobSkillMap[preset.job] ?? []);
  const skills = Object.fromEntries(
    allSkills.map((skill): [string, SkillValue] => {
      const base = resolveSkillBase(skill.base, preset.attrs);
      const total = preset.skills[skill.name] ?? base;
      return [skill.name, { base, added: Math.max(0, total - base), isJob: jobSkills.has(skill.name) }];
    })
  );
  const derived = deriveInvestigatorStats(preset.attrs);

  return {
    id: preset.id,
    name: preset.name,
    gender: preset.gender,
    age: preset.age,
    hometown: preset.hometown,
    job: job?.name ?? preset.job,
    role: preset.role,
    attrs: preset.attrs,
    hp: derived.hp,
    mp: derived.mp,
    san: derived.san,
    luck: derived.luck,
    currentHp: derived.hp,
    currentMp: derived.mp,
    currentSan: derived.san,
    skills,
    background: preset.background
  };
}
