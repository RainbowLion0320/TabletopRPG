import { expect, test } from '@playwright/test';
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

test('preset investigators use the centralized derived stat rules', async ({ page }) => {
  await page.goto('/');

  const results = await page.evaluate(async () => {
    const [{ createInvestigatorFromPreset, presets }, { deriveInvestigatorStats }] = await Promise.all([
      import('/src/data/presets.ts'),
      import('/src/data/gameRules.ts')
    ]);

    return presets.map((preset) => {
      const player = createInvestigatorFromPreset(preset);
      const derived = deriveInvestigatorStats(preset.attrs);
      return {
        hp: player.hp === derived.hp,
        mp: player.mp === derived.mp,
        san: player.san === derived.san,
        luck: player.luck === derived.luck,
        currentHp: player.currentHp === derived.hp,
        currentMp: player.currentMp === derived.mp,
        currentSan: player.currentSan === derived.san
      };
    });
  });

  expect(results).toHaveLength(4);
  for (const result of results) {
    expect(result).toEqual({
      hp: true,
      mp: true,
      san: true,
      luck: true,
      currentHp: true,
      currentMp: true,
      currentSan: true
    });
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
