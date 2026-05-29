import { expect, test, type Page } from '@playwright/test';
import { rollD100 } from '../src/services/dice';
import type { CheckRequest } from '../src/types/game';

async function gotoClean(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');
}

async function startNewGame(page: Page) {
  await gotoClean(page);
  await expect(page.getByRole('heading', { name: '雾中消逝' })).toBeVisible();
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await expect(page.getByRole('heading', { name: '选择调查员' })).toBeVisible();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(2);
  await page.getByRole('button', { name: /进入游戏/ }).click();
  await expect(page.locator('.game-screen')).toBeVisible();
}

test('new game reaches the main game screen with preset investigators', async ({ page }) => {
  await startNewGame(page);

  await expect(page.getByText('等待所有玩家输入行动...')).toBeVisible();
  await expect(page.getByPlaceholder('亨利·格雷 想要做什么...')).toBeVisible();
  await expect(page.getByPlaceholder('艾达·华莱士 想要做什么...')).toBeVisible();
  await expect(page.getByText('伊莎贝拉·摩勒').first()).toBeVisible();
});

test('investigator setup shows portraits and full attribute blocks', async ({ page }) => {
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();

  await expect(page.getByRole('heading', { name: '选择调查员' })).toBeVisible();
  await expect(page.locator('.preset-card-modern img')).toHaveCount(4);
  const firstCard = page.locator('.preset-card-modern').first();
  const portraitRatio = await firstCard.locator('.preset-portrait-frame').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(portraitRatio).toBeGreaterThan(0.78);
  expect(portraitRatio).toBeLessThan(0.82);
  const attrBlock = firstCard.locator('.preset-attrs');
  for (const attr of ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU', 'Luck']) {
    await expect(attrBlock.getByText(attr, { exact: true })).toBeVisible();
  }
  const vitals = firstCard.locator('.preset-vitals');
  await expect(vitals.getByText('HP', { exact: true })).toBeVisible();
  await expect(vitals.getByText('12', { exact: true })).toHaveCount(2);
  await expect(vitals.getByText('MP', { exact: true })).toBeVisible();
  await expect(vitals.getByText('SAN', { exact: true })).toBeVisible();
  await expect(vitals.getByText('60', { exact: true })).toHaveCount(1);
});

test('investigator setup scrolls vertically on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();

  const setupScreen = page.locator('.setup-screen');
  await expect(setupScreen).toBeVisible();
  const metrics = await setupScreen.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await setupScreen.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => setupScreen.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('submitting an action without an API key opens AI settings instead of crashing', async ({ page }) => {
  await startNewGame(page);

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('检查书房桌面。');
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('安抚并询问伊莎贝拉。');
  await page.getByRole('button', { name: /提交本轮行动/ }).click();

  await expect(page.getByText('请先在菜单中配置 AI API Key。')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI DM 配置' })).toBeVisible();
});

test('saving a game enables continuing the latest save from the title screen', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /保存游戏/ }).click();
  await expect(page.getByText('已保存')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /返回首页/ }).click();

  await expect(page.getByRole('heading', { name: '雾中消逝' })).toBeVisible();
  await expect(page.getByText(/最近存档：/)).toBeVisible();
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeEnabled();

  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('.game-screen')).toBeVisible();
  await expect(page.getByText('等待所有玩家输入行动...')).toBeVisible();
});

test('save manager can load and delete explicit save slots', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /保存游戏/ }).click();
  await expect(page.getByText('已保存')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: '分头探索' }).click();
  await expect(page.getByText('分头探索将单独结算当前调查员。')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /存档管理/ }).click();
  const saveManager = page.getByRole('dialog', { name: '存档管理' });
  await expect(saveManager).toBeVisible();
  await expect(saveManager.getByText('摩勒住宅')).toBeVisible();
  await expect(saveManager.getByText('亨利·格雷、艾达·华莱士')).toBeVisible();

  await page.getByRole('button', { name: /载入存档/ }).click();
  await expect(page.getByText('等待所有玩家输入行动...')).toBeVisible();
  await expect(page.getByText('已载入存档')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /存档管理/ }).click();
  await page.getByRole('button', { name: /删除存档/ }).click();
  await expect(page.getByRole('dialog', { name: '存档管理' }).getByText('暂无存档')).toBeVisible();
});

test('invalid save payloads are ignored on the title screen', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem('trpg-saves-v2', JSON.stringify([
      { id: 1, savedAt: 'broken', gameState: { players: [] } },
      'not-a-save'
    ]));
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '雾中消逝' })).toBeVisible();
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeDisabled();
  await expect(page.getByText(/最近存档：/)).toHaveCount(0);
});

test('D100 fumble has priority over success thresholds', () => {
  const originalRandom = Math.random;
  const check: CheckRequest = {
    player: '亨利·格雷',
    skill: '幸运',
    difficulty: '普通',
    skillVal: 100,
    threshold: 100
  };

  try {
    Math.random = () => 0.95;
    expect(rollD100(check)).toMatchObject({
      roll: 96,
      level: 'fumble'
    });
  } finally {
    Math.random = originalRandom;
  }
});
