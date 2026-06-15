import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { rollD100 } from '../src/services/dice';
import type { CheckRequest } from '../src/types/game';

const hasEnvDefaultApiKey =
  Boolean(process.env.VITE_AI_API_KEY) ||
  (existsSync('.env.local') && /^VITE_AI_API_KEY=.+$/m.test(readFileSync('.env.local', 'utf8')));

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

async function submitTogetherActions(page: Page, firstAction: string, secondAction: string) {
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill(firstAction);
  await page.getByRole('button', { name: '下一位' }).click();
  await expect(page.getByPlaceholder('艾达·华莱士 想要做什么...')).toBeVisible();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill(secondAction);
  await page.getByRole('button', { name: '提交' }).click();
}

test('new game reaches the main game screen with preset investigators', async ({ page }) => {
  await startNewGame(page);

  await expect(page.getByPlaceholder('亨利·格雷 想要做什么...')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一位' })).toBeDisabled();
  await expect(page.locator('.brand-title')).toHaveText('第一幕：接受委托');
  await expect(page.locator('.brand-scene')).toHaveText('摩勒住宅');
  const brandPresentation = await page.locator('.game-top').evaluate((top) => {
    const title = top.querySelector('.brand-title');
    const scene = top.querySelector('.brand-scene');
    const titleStyle = title ? getComputedStyle(title) : null;
    const sceneStyle = scene ? getComputedStyle(scene) : null;
    return {
      sceneColor: sceneStyle?.color ?? '',
      sceneFontSize: Number.parseFloat(sceneStyle?.fontSize ?? '0'),
      titleColor: titleStyle?.color ?? '',
      titleFontSize: Number.parseFloat(titleStyle?.fontSize ?? '0')
    };
  });
  expect(brandPresentation.titleColor).toMatch(/rgba\(.+,\s*0\.\d+\)/);
  expect(brandPresentation.sceneColor).toMatch(/rgba\(.+,\s*0\.\d+\)/);
  expect(brandPresentation.titleFontSize).toBeLessThanOrEqual(30);
  expect(brandPresentation.sceneFontSize).toBeLessThanOrEqual(14);
  await expect(page.locator('.party-strip-compact .party-compact')).toHaveCount(2);
  await expect(page.getByText('伊莎贝拉·摩勒').first()).toBeVisible();

  const gameLayout = await page.locator('.game-screen').evaluate((screen) => {
    const viewportHeight = window.innerHeight;
    const party = screen.querySelector('.party-strip-compact')?.getBoundingClientRect();
    const partyCards = Array.from(screen.querySelectorAll('.party-compact')).slice(0, 2);
    const [firstPartyCard, secondPartyCard] = partyCards.map((card) => card.getBoundingClientRect());
    const narrative = screen.querySelector('.narrative-panel')?.getBoundingClientRect();
    const actionDock = screen.querySelector('.action-dock')?.getBoundingClientRect();
    return {
      actionDockBottomGap: Math.round(viewportHeight - (actionDock?.bottom ?? 0)),
      actionDockLeft: Math.round(actionDock?.left ?? 0),
      firstPartyCardLeft: Math.round(firstPartyCard?.left ?? 0),
      firstPartyCardTop: Math.round(firstPartyCard?.top ?? 0),
      narrativeBottom: Math.round(narrative?.bottom ?? 0),
      narrativeLeft: Math.round(narrative?.left ?? 0),
      actionDockTop: Math.round(actionDock?.top ?? 0),
      partyBottomGap: Math.round(viewportHeight - (party?.bottom ?? 0)),
      partyWidth: Math.round(party?.width ?? 0),
      partyHeight: Math.round(party?.height ?? 0),
      secondPartyCardLeft: Math.round(secondPartyCard?.left ?? 0),
      secondPartyCardTop: Math.round(secondPartyCard?.top ?? 0)
    };
  });
  expect(gameLayout.partyHeight).toBeGreaterThan(30);
  expect(gameLayout.partyHeight).toBeLessThanOrEqual(140);
  expect(gameLayout.partyBottomGap).toBeLessThanOrEqual(36);
  expect(gameLayout.secondPartyCardLeft).toBeGreaterThan(gameLayout.firstPartyCardLeft + 120);
  expect(Math.abs(gameLayout.secondPartyCardTop - gameLayout.firstPartyCardTop)).toBeLessThanOrEqual(8);
  expect(gameLayout.actionDockBottomGap).toBeLessThanOrEqual(36);
  expect(gameLayout.narrativeBottom).toBeLessThanOrEqual(gameLayout.actionDockTop + 24);
  expect(gameLayout.narrativeLeft).toBeGreaterThanOrEqual(0);
  expect(gameLayout.actionDockLeft).toBeGreaterThanOrEqual(0);
});

test('investigator setup shows portraits and full attribute blocks', async ({ page }) => {
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();

  await expect(page.getByRole('heading', { name: '选择调查员' })).toBeVisible();
  await expect(page.locator('.preset-card-modern img')).toHaveCount(4);
  const layoutMetrics = await page.locator('.preset-grid-modern').evaluate((grid) => {
    const cards = Array.from(grid.querySelectorAll('.preset-card-modern')).slice(0, 2);
    const gridRect = grid.getBoundingClientRect();
    const [firstCard, secondCard] = cards.map((card) => card.getBoundingClientRect());
    const firstPortrait = cards[0].querySelector('.preset-portrait-frame')?.getBoundingClientRect();
    return {
      gridWidth: gridRect.width,
      firstCardWidth: firstCard.width,
      firstCardTop: firstCard.top,
      firstCardLeft: firstCard.left,
      firstCardHeight: firstCard.height,
      secondCardTop: secondCard.top,
      secondCardLeft: secondCard.left,
      firstPortraitHeight: firstPortrait?.height ?? 0
    };
  });
  expect(layoutMetrics.firstCardWidth).toBeLessThan(layoutMetrics.gridWidth * 0.55);
  expect(Math.abs(layoutMetrics.secondCardTop - layoutMetrics.firstCardTop)).toBeLessThanOrEqual(4);
  expect(layoutMetrics.secondCardLeft).toBeGreaterThan(layoutMetrics.firstCardLeft + layoutMetrics.firstCardWidth * 0.75);
  expect(Math.abs(layoutMetrics.firstCardHeight - layoutMetrics.firstPortraitHeight)).toBeLessThanOrEqual(48);
  const firstCard = page.locator('.preset-card-modern').first();
  const portraitRatio = await firstCard.locator('.preset-portrait-frame').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width / rect.height;
  });
  expect(portraitRatio).toBeGreaterThan(0.78);
  expect(portraitRatio).toBeLessThan(0.82);
  const attrBlock = firstCard.locator('.preset-attrs');
  const skillList = firstCard.locator('.preset-skill-list');
  await expect(attrBlock).toBeHidden();
  await expect(skillList).toBeHidden();
  const backgroundNoteTops = await firstCard.locator('.preset-background-notes span').evaluateAll((items) =>
    items.map((item) => Math.round(item.getBoundingClientRect().top))
  );
  expect(backgroundNoteTops.length).toBe(3);
  expect(new Set(backgroundNoteTops).size).toBe(3);
  const collapsedLayout = await firstCard.evaluate((card) => {
    const notes = card.querySelector('.preset-background-notes')?.getBoundingClientRect();
    const vitalsRect = card.querySelector('.preset-vitals')?.getBoundingClientRect();
    const toggle = card.querySelector('.preset-attrs-toggle')?.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      notesTop: notes?.top ?? 0,
      notesBottom: notes?.bottom ?? 0,
      vitalsTop: vitalsRect?.top ?? 0,
      toggleTop: toggle?.top ?? 0
    };
  });
  expect(collapsedLayout.notesTop).toBeLessThan(collapsedLayout.vitalsTop);
  expect(collapsedLayout.vitalsTop - collapsedLayout.notesBottom).toBeGreaterThanOrEqual(16);
  expect(collapsedLayout.vitalsTop).toBeLessThan(collapsedLayout.toggleTop);
  const selectedBeforeAttrsToggle = await page.locator('.preset-card-modern.selected').count();
  await firstCard.locator('.preset-attrs-toggle').click();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(selectedBeforeAttrsToggle);
  await expect(firstCard).toHaveClass(/selected/);
  await expect(attrBlock).toBeVisible();
  await expect(skillList).toBeVisible();
  for (const attr of ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']) {
    await expect(attrBlock.getByText(attr, { exact: true })).toBeVisible();
  }
  for (const skill of ['侦查', '聆听', '心理学']) {
    await expect(skillList.getByText(skill, { exact: false })).toBeVisible();
  }
  const firstAttrTextAlign = await attrBlock.locator('span').first().evaluate((element) => getComputedStyle(element).textAlign);
  expect(firstAttrTextAlign).toBe('center');
  const vitals = firstCard.locator('.preset-vitals');
  const expandedLayout = await firstCard.evaluate((card) => {
    const panel = card.querySelector('.preset-other-panel')?.getBoundingClientRect();
    const toggle = card.querySelector('.preset-attrs-toggle')?.getBoundingClientRect();
    return {
      cardHeight: card.getBoundingClientRect().height,
      panelTop: panel?.top ?? 0,
      toggleBottom: toggle?.bottom ?? 0
    };
  });
  expect(Math.abs(expandedLayout.cardHeight - collapsedLayout.cardHeight)).toBeLessThanOrEqual(4);
  expect(expandedLayout.panelTop).toBeGreaterThanOrEqual(expandedLayout.toggleBottom + 4);
  const vitalBorderColors = await vitals.locator('span').evaluateAll((items) =>
    items.map((item) => getComputedStyle(item).borderTopColor)
  );
  expect(new Set(vitalBorderColors).size).toBe(4);
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

test('player action messages keep the player name and action on one line', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: '侦查门廊与窗边痕迹' }).click();
  await page.getByRole('button', { name: '下一位' }).click();

  const playerMessage = page.locator('.story-message.player', { hasText: '侦查门廊与窗边痕迹' });
  await expect(playerMessage).toHaveCount(1);
  const messageLayout = await playerMessage.evaluate((message) => {
    const directLabel = Array.from(message.children).some((child) => child.classList.contains('message-label'));
    const line = message.querySelector('.player-message-line');
    const name = message.querySelector('.player-inline-name');
    const text = message.querySelector('.player-message-text');
    const panel = message.closest('.narrative-panel');
    const nameBox = name?.getBoundingClientRect();
    const textBox = text?.getBoundingClientRect();
    const messageBox = message.getBoundingClientRect();
    const panelBox = panel?.getBoundingClientRect();
    return {
      directLabel,
      lineText: line?.textContent ?? '',
      messageWidth: Math.round(messageBox.width),
      panelWidth: Math.round(panelBox?.width ?? 0),
      sameLine: Math.max(nameBox?.top ?? 999, textBox?.top ?? 0) <= Math.min(nameBox?.bottom ?? 0, textBox?.bottom ?? 999)
    };
  });
  expect(messageLayout.directLabel).toBe(false);
  expect(messageLayout.lineText).toBe('亨利·格雷：侦查门廊与窗边痕迹');
  expect(messageLayout.messageWidth).toBeLessThan(messageLayout.panelWidth * 0.45);
  expect(messageLayout.sameLine).toBe(true);
});

test('info drawer opens the case board by default and keeps reference tabs', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: '资料' }).click();

  await expect(page.locator('.case-board-view')).toBeVisible();
  await expect(page.getByRole('button', { name: '案件板' })).toHaveClass(/active/);
  const board = page.locator('.case-board-canvas');
  await expect(board).toBeVisible();
  await expect(board.locator('.case-board-node', { hasText: '摩勒住宅' })).toBeVisible();
  await expect(board.locator('.case-board-node', { hasText: '伊莎贝拉·摩勒' })).toBeVisible();
  await expect(board.getByText('卡森其药店')).toHaveCount(0);

  await page.getByRole('button', { name: '线索' }).click();
  await expect(page.getByRole('heading', { name: '已获线索' })).toBeVisible();
  await page.getByRole('button', { name: '人物' }).click();
  await expect(page.getByRole('heading', { name: '人物' })).toBeVisible();
  await page.getByRole('button', { name: '日志' }).click();
  await expect(page.getByRole('heading', { name: '行动日志' })).toBeVisible();
});

test('submitting an action without an API key opens AI settings instead of crashing', async ({ page }) => {
  test.skip(hasEnvDefaultApiKey, 'requires no default API key from process env or .env.local');
  await startNewGame(page);

  await submitTogetherActions(page, '检查书房桌面。', '安抚并询问伊莎贝拉。');

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
  await expect(page.getByPlaceholder('亨利·格雷 想要做什么...')).toBeVisible();
});

test('save manager can load and delete explicit save slots', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /保存游戏/ }).click();
  await expect(page.getByText('已保存')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: '分头探索' }).click();
  await expect(page.getByText('切换为「分头探索」模式。')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /存档管理/ }).click();
  const saveManager = page.getByRole('dialog', { name: '存档管理' });
  await expect(saveManager).toBeVisible();
  await expect(saveManager.getByText('摩勒住宅')).toBeVisible();
  await expect(saveManager.getByText('亨利·格雷、艾达·华莱士')).toBeVisible();

  await page.getByRole('button', { name: /载入存档/ }).click();
  await expect(page.getByPlaceholder('亨利·格雷 想要做什么...')).toBeVisible();
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
