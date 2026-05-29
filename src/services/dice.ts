import type { CheckRequest, DiceResult, Investigator } from '../types/game';
import {
  gameRules,
  getDifficultyThreshold,
  isFumbleRoll,
  isLuckSkill,
  normalizeDifficultyLabel
} from '../data/gameRules';

export function getSkillTotal(player: Investigator, skill: string) {
  if (isLuckSkill(skill)) {
    return player.luck ?? player.attrs.Luck;
  }
  const value = player.skills[skill];
  return value ? value.base + value.added : gameRules.skills.unknownSkillTotal;
}

export function prepareCheck(check: CheckRequest, players: Investigator[]): CheckRequest {
  const player = players.find((item) => item.name === check.player) ?? players[0];
  const skillVal = player ? getSkillTotal(player, check.skill) : gameRules.skills.unknownSkillTotal;
  const difficulty = normalizeDifficultyLabel(check.difficulty);
  return { ...check, difficulty, skillVal, threshold: getDifficultyThreshold(skillVal, difficulty) };
}

export function rollD100(check: CheckRequest): DiceResult {
  const roll = Math.floor(Math.random() * gameRules.dice.sides) + 1;
  const skillVal = check.skillVal ?? check.threshold ?? gameRules.skills.unknownSkillTotal;

  if (isFumbleRoll(roll)) {
    return { roll, level: 'fumble', label: `大失败（${roll}）` };
  }
  if (roll <= getDifficultyThreshold(skillVal, '极难')) {
    return { roll, level: 'crit', label: `极难成功（${roll}）` };
  }
  if (roll <= getDifficultyThreshold(skillVal, '困难')) {
    return { roll, level: 'hard', label: `困难成功（${roll}）` };
  }
  if (roll <= getDifficultyThreshold(skillVal, '普通')) {
    return { roll, level: 'success', label: `普通成功（${roll}）` };
  }
  return { roll, level: 'fail', label: `失败（${roll}）` };
}
