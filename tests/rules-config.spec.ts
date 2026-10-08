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
  expect(resolveSkillBase('DEX÷2', attrs)).toBe(30);
  expect(resolveSkillBase('DEX÷2', { ...attrs, DEX: 65 })).toBe(32);
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

test('an old four-player save shows corrected Dodge and preserves the authored constable allocation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const [{ presets, createInvestigatorFromPreset }, { createInitialGameState, gameReducer }] = await Promise.all([
      import('/src/data/presets.ts'), import('/src/state/gameReducer.ts')
    ]);
    const players = presets.map(createInvestigatorFromPreset);
    players.forEach(player => { player.skills['闪避'] = { base: player.attrs.DEX * 2, added: 0 }; });
    const gameState = gameReducer(createInitialGameState([]), { type: 'start', players });
    localStorage.setItem('trpg-saves-v2', JSON.stringify([{ id: 1770000000000, version: 8, gameState }]));
    localStorage.setItem('trpg-api', JSON.stringify({ provider: 'custom', protocol: 'responses', apiKey: 'smoke-only', endpoint: 'https://unit.test/v1', model: 'smoke-only' }));
  });
  await page.reload();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.getByRole('button', { name: '查看亨利·格雷的属性', exact: true }).click();
  const sheet = page.locator('.investigator-sheet');
  await sheet.getByRole('tab', { name: '技能', exact: true }).click();
  await sheet.getByRole('searchbox', { name: '搜索技能' }).fill('闪避');
  await expect(sheet.locator('tbody td')).toHaveText(['30', '15', '6']);
  await sheet.getByRole('button', { name: '罗伯特·肖', exact: true }).click();
  await expect(sheet.locator('tbody td')).toHaveText(['50', '25', '10']);
});
