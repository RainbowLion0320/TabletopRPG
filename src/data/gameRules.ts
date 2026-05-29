import type { Attributes, CheckRequest, SkillDefinition } from '../types/game';

export const defaultAttributes: Attributes = {
  STR: 50,
  CON: 50,
  SIZ: 50,
  DEX: 50,
  APP: 50,
  INT: 50,
  POW: 50,
  EDU: 50,
  Luck: 50
};

export const gameRules = {
  defaultAttributes,
  derivedStats: {
    hp: { attributes: ['CON', 'SIZ'], divisor: 10, min: 1 },
    mp: { attribute: 'POW', divisor: 5, min: 0 },
    san: { attribute: 'POW', min: 0 },
    luck: { attribute: 'Luck' }
  },
  skills: {
    unknownSkillTotal: 25,
    luckSkillNames: ['幸运', 'luck', '运气']
  },
  dice: {
    sides: 100,
    fumbleMin: 96,
    difficultyDivisors: {
      普通: 1,
      困难: 2,
      极难: 5
    } satisfies Record<CheckRequest['difficulty'], number>
  }
};

export function deriveInvestigatorStats(attrs: Attributes) {
  const hpRaw = (attrs.CON + attrs.SIZ) / gameRules.derivedStats.hp.divisor;
  const mpRaw = attrs.POW / gameRules.derivedStats.mp.divisor;
  const sanRaw = attrs.POW;

  return {
    hp: Math.max(gameRules.derivedStats.hp.min, Math.floor(hpRaw)),
    mp: Math.max(gameRules.derivedStats.mp.min, Math.floor(mpRaw)),
    san: Math.max(gameRules.derivedStats.san.min, Math.floor(sanRaw)),
    luck: attrs.Luck
  };
}

export function resolveSkillBase(base: SkillDefinition['base'], attrs: Attributes) {
  if (typeof base === 'number') return base;
  if (base === 'EDU') return attrs.EDU;
  if (base === 'DEX×2') return attrs.DEX * 2;
  return 0;
}

export function normalizeDifficultyLabel(difficulty: CheckRequest['difficulty'] | string): CheckRequest['difficulty'] {
  if (difficulty.includes('极')) return '极难';
  if (difficulty.includes('困')) return '困难';
  return '普通';
}

export function getDifficultyThreshold(skillTotal: number, difficulty: CheckRequest['difficulty'] | string) {
  const label = normalizeDifficultyLabel(difficulty);
  const divisor = gameRules.dice.difficultyDivisors[label] ?? gameRules.dice.difficultyDivisors.普通;
  return Math.floor(skillTotal / divisor);
}

export function isLuckSkill(skill: string) {
  const normalized = skill.trim().toLowerCase();
  return gameRules.skills.luckSkillNames.some((name) => name.toLowerCase() === normalized);
}

export function isFumbleRoll(roll: number) {
  return roll >= gameRules.dice.fumbleMin;
}
