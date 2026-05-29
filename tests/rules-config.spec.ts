import { expect, test } from '@playwright/test';
import { createInvestigatorFromPreset, presets } from '../src/data/presets';
import {
  deriveInvestigatorStats,
  getDifficultyThreshold,
  isFumbleRoll,
  resolveSkillBase
} from '../src/data/gameRules';

test('game rules centralize derived investigator stats and skill bases', () => {
  const attrs = { STR: 65, CON: 60, SIZ: 65, DEX: 60, APP: 55, INT: 75, POW: 60, EDU: 80, Luck: 55 };

  expect(deriveInvestigatorStats(attrs)).toEqual({
    hp: 12,
    mp: 12,
    san: 60,
    luck: 55
  });
  expect(resolveSkillBase('EDU', attrs)).toBe(80);
  expect(resolveSkillBase('DEX×2', attrs)).toBe(120);
  expect(resolveSkillBase(25, attrs)).toBe(25);
});

test('preset investigators use the centralized derived stat rules', () => {
  for (const preset of presets) {
    const player = createInvestigatorFromPreset(preset);
    const derived = deriveInvestigatorStats(preset.attrs);

    expect(player.hp).toBe(derived.hp);
    expect(player.mp).toBe(derived.mp);
    expect(player.san).toBe(derived.san);
    expect(player.luck).toBe(derived.luck);
    expect(player.currentHp).toBe(derived.hp);
    expect(player.currentMp).toBe(derived.mp);
    expect(player.currentSan).toBe(derived.san);
  }
});

test('game rules centralize D100 thresholds and fumble priority', () => {
  expect(getDifficultyThreshold(75, '普通')).toBe(75);
  expect(getDifficultyThreshold(75, '困难')).toBe(37);
  expect(getDifficultyThreshold(75, '极难')).toBe(15);
  expect(isFumbleRoll(95)).toBe(false);
  expect(isFumbleRoll(96)).toBe(true);
  expect(isFumbleRoll(100)).toBe(true);
});
