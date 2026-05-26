import type { CheckRequest, DiceResult, Investigator } from '../types/game';

export function getSkillTotal(player: Investigator, skill: string) {
  const value = player.skills[skill];
  return value ? value.base + value.added : 25;
}

export function prepareCheck(check: CheckRequest, players: Investigator[]): CheckRequest {
  const player = players.find((item) => item.name === check.player) ?? players[0];
  const skillVal = player ? getSkillTotal(player, check.skill) : 25;
  const thresholds = {
    普通: skillVal,
    困难: Math.floor(skillVal / 2),
    极难: Math.floor(skillVal / 5)
  };
  return { ...check, skillVal, threshold: thresholds[check.difficulty] ?? skillVal };
}

export function rollD100(check: CheckRequest): DiceResult {
  const roll = Math.floor(Math.random() * 100) + 1;
  const skillVal = check.skillVal ?? check.threshold ?? 25;

  if (roll <= Math.floor(skillVal / 5)) {
    return { roll, level: 'crit', label: `极难成功（${roll}）` };
  }
  if (roll <= Math.floor(skillVal / 2)) {
    return { roll, level: 'hard', label: `困难成功（${roll}）` };
  }
  if (roll <= skillVal) {
    return { roll, level: 'success', label: `普通成功（${roll}）` };
  }
  if (roll >= 96) {
    return { roll, level: 'fumble', label: `大失败（${roll}）` };
  }
  return { roll, level: 'fail', label: `失败（${roll}）` };
}
