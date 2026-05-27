import type { JobDefinition, SkillDefinition } from '../types/game';

export const jobs: JobDefinition[] = [
  {
    id: 'detective',
    name: '私家侦探',
    stars: 5,
    desc: '追踪线索的专家，社交与观察并重。',
    skills: ['法律', '图书馆', '侦查', '聆听', '心理学', '话术', '说服', '母语'],
    eduMult: 4
  },
  {
    id: 'police',
    name: '警察',
    stars: 5,
    desc: '执法经验丰富，战斗与社交兼备。',
    skills: ['急救', '法律', '格斗（拳）', '射击（手枪）', '侦查', '心理学', '潜行', '母语'],
    eduMult: 4
  },
  {
    id: 'doctor',
    name: '医生',
    stars: 4,
    desc: '救死扶伤，对生物与心理有深刻认知。',
    skills: ['急救', '医学', '心理学', '生物学', '图书馆', '说服', '聆听', '母语'],
    eduMult: 4
  },
  {
    id: 'journalist',
    name: '记者',
    stars: 4,
    desc: '善于调查与采访，消息灵通。',
    skills: ['历史', '图书馆', '母语', '心理学', '侦查', '话术', '说服', '摄影'],
    eduMult: 4
  },
  {
    id: 'scholar',
    name: '学者',
    stars: 3,
    desc: '学识渊博，擅长研究古籍与神秘学。',
    skills: ['考古学', '历史', '图书馆', '神秘学', '母语', '外语', '侦查'],
    eduMult: 4
  }
];

export const allSkills: SkillDefinition[] = [
  { name: '侦查', base: 25, group: 'observe' },
  { name: '聆听', base: 20, group: 'observe' },
  { name: '心理学', base: 10, group: 'social' },
  { name: '说服', base: 10, group: 'social' },
  { name: '话术', base: 5, group: 'social' },
  { name: '恐吓', base: 15, group: 'social' },
  { name: '图书馆', base: 20, group: 'know' },
  { name: '历史', base: 5, group: 'know' },
  { name: '神秘学', base: 5, group: 'know' },
  { name: '法律', base: 5, group: 'know' },
  { name: '医学', base: 1, group: 'know' },
  { name: '生物学', base: 1, group: 'know' },
  { name: '考古学', base: 1, group: 'know' },
  { name: '母语', base: 'EDU', group: 'know' },
  { name: '格斗（拳）', base: 25, group: 'combat' },
  { name: '闪避', base: 'DEX×2', group: 'combat' },
  { name: '射击（手枪）', base: 20, group: 'combat' },
  { name: '急救', base: 30, group: 'action' },
  { name: '潜行', base: 20, group: 'action' },
  { name: '驾驶（汽车）', base: 20, group: 'action' },
  { name: '机械维修', base: 10, group: 'action' },
  { name: '摄影', base: 5, group: 'action' },
  { name: '幸运', base: 0, group: 'special' },
  { name: '克苏鲁神话', base: 0, group: 'special' }
];

export const jobSkillMap = Object.fromEntries(jobs.map((job) => [job.id, job.skills]));
