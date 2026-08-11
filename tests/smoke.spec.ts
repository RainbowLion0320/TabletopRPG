import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { rollD100 } from '../src/services/dice';
import type { CheckRequest, GameState, ScenarioProgress } from '../src/types/game';
import { makeInvestigator } from './dm/fixtures';

const hasEnvDefaultApiKey =
  Boolean(process.env.VITE_AI_API_KEY) ||
  (existsSync('.env.local') && /^VITE_AI_API_KEY=.+$/m.test(readFileSync('.env.local', 'utf8')));
const generatedScenarioRuntime = readFileSync(
  'src/data/scenarios/wuzhongxiaoshi/runtime.generated.ts',
  'utf8'
);
const scenarioContentHash = /scenarioContentHash = "([^"]+)"/.exec(generatedScenarioRuntime)?.[1] ?? '';
const scenarioContentVersion = /"contentVersion": "([^"]+)"/.exec(generatedScenarioRuntime)?.[1] ?? '';

function createSmokeScenarioProgress(): ScenarioProgress {
  return {
    moduleId: 'wuzhongxiaoshi', moduleVersion: scenarioContentVersion, contentHash: scenarioContentHash,
    worldTime: '1920-07-13T17:30', activeActId: 'A01',
    beatStates: { B01: 'active', B02: 'locked', B03: 'locked', B04: 'locked', B05: 'locked', B06: 'locked' },
    objectiveStates: { O01: 'active', O02: 'locked', O03: 'locked', O04: 'locked', O05: 'locked', O06: 'locked', O07: 'locked', O08: 'locked' },
    knownFactIds: [],
    clueStates: { I01: 'unknown', I02: 'unknown', I03: 'unknown', I04: 'unknown', I05: 'unknown', I06: 'unknown', I07: 'unknown', I08: 'unknown' },
    firedEventIds: [], settledEndingIds: [],
    variables: { commissionAccepted: false, oldHethLead: false, metMontreal: false, hybridEscaped: false, thugAlert: false, finaleRoute: 'undecided', ericRescued: false },
    clocks: {},
    encounters: {
      ENC01: { state: 'inactive', round: 0, defeated: 0, opponentHp: 44 },
      ENC02: { state: 'inactive', round: 0, defeated: 0, opponentHp: 45 }
    },
    lastCheckOutcomes: {}, visitedSceneIds: ['S01'], lastProgressTurn: 0, idleTurns: 0,
    endingId: null, migrationLog: []
  };
}

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

function createDynamicCaseBoardSave(): GameState {
  const players = [
    makeInvestigator({ id: 'inspector', name: '亨利·格雷' }),
    makeInvestigator({ id: 'nurse', name: '艾达·华莱士', gender: '女' })
  ];
  return {
    players,
    exploreMode: 'together',
    currentSplitPlayer: 0,
    currentActorIndex: 0,
    playerLocations: { inspector: 'S01', nurse: 'S01' },
    declarations: {},
    pendingCheck: null,
    currentScene: 'S01',
    activeNpcName: '伊莎贝拉·摩勒',
    clues: [],
    flags: {},
    actionLog: [{ time: '20:00', text: '游戏开始 · 摩勒住宅' }],
    conversationHistory: [],
    messages: [{ id: 'm1', type: 'dm', text: '浓雾压在摩勒住宅的窗外。', npcName: null }],
    suggestions: [],
    suggestionsByPlayerId: {},
    isThinking: false,
    longTermMemorySummary: '',
    summarizedUntilIndex: 0,
    eventLog: [{ id: 'e1', turn: 1, kind: 'narrative', description: '玩家发现药店后门有被撬痕迹' }],
    pendingConsequences: [],
    atomicFacts: [],
    npcMindModels: {},
    prospectiveIntents: [],
    episodicMemory: [],
    caseBoard: {
      nodes: [
        {
          id: 'ai-backdoor-mark',
          type: 'event',
          title: '药店后门被撬',
          subtitle: '来自本轮现场观察',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        },
        {
          id: 'ai-inside-help',
          type: 'theory',
          title: '可能有内应协助',
          subtitle: '根据后门痕迹推测',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          sourceClueIds: [],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      edges: [
        {
          id: 'ai-edge-backdoor-help',
          from: 'ai-backdoor-mark',
          to: 'ai-inside-help',
          label: '推测',
          tone: 'suspicion',
          source: 'ai',
          certainty: 'hypothesis',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        },
        {
          id: 'ai-edge-scene-help',
          from: 'scene-s01',
          to: 'ai-inside-help',
          label: '与现场相符',
          tone: 'evidence',
          source: 'ai',
          certainty: 'confirmed',
          sourceFactIds: [],
          sourceEventIds: ['e1'],
          createdTurn: 1,
          updatedTurn: 1,
          status: 'active'
        }
      ],
      lastUpdatedTurn: 1
    }
  };
}

async function gotoWithSave(page: Page, gameState: GameState) {
  await page.addInitScript((serializedState) => {
    window.localStorage.clear();
    window.localStorage.setItem('trpg-saves-v2', JSON.stringify([{
      id: 1718400000000,
      savedAt: '2026/6/15 20:00:00',
      scene: '摩勒住宅',
      players: '亨利·格雷、艾达·华莱士',
      gameState: serializedState,
      moduleId: serializedState.scenarioProgress?.moduleId,
      moduleVersion: serializedState.scenarioProgress?.moduleVersion,
      contentHash: serializedState.scenarioProgress?.contentHash,
      version: serializedState.scenarioProgress ? 8 : 6
    }]));
  }, gameState);
  await page.goto('/');
}

function createV8EndingSave(): GameState {
  const state = createDynamicCaseBoardSave();
  const progress = createSmokeScenarioProgress();
  progress.activeActId = 'A03';
  progress.endingId = 'END_C';
  progress.settledEndingIds = ['END_C'];
  progress.beatStates.B01 = 'completed';
  progress.beatStates.B02 = 'completed';
  progress.beatStates.B05 = 'completed';
  progress.beatStates.B06 = 'completed';
  progress.objectiveStates.O01 = 'completed';
  progress.objectiveStates.O02 = 'completed';
  progress.objectiveStates.O05 = 'completed';
  progress.objectiveStates.O06 = 'completed';
  progress.objectiveStates.O08 = 'completed';
  progress.knownFactIds = ['F04', 'F06', 'F09'];
  progress.clueStates.I04 = 'analyzed';
  progress.clueStates.I07 = 'analyzed';
  return {
    ...state,
    currentScene: 'S05',
    playerLocations: { inspector: 'S05', nurse: 'S05' },
    activeNpcId: 'N02',
    activeNpcName: '埃里克·摩勒',
    scenarioProgress: progress
  };
}

function createPendingCheckSave(): GameState {
  return {
    ...createDynamicCaseBoardSave(),
    pendingCheck: {
      player: '艾达·华莱士',
      skill: '侦查',
      difficulty: '普通',
      skillVal: 60,
      threshold: 60,
      continuationActions: []
    }
  };
}

function createPoliceStationSave(): GameState {
  const state = createDynamicCaseBoardSave();
  const progress = createSmokeScenarioProgress();
  progress.activeActId = 'A02';
  progress.beatStates.B01 = 'completed';
  progress.beatStates.B02 = 'completed';
  progress.beatStates.B03 = 'active';
  progress.objectiveStates.O01 = 'completed';
  progress.objectiveStates.O02 = 'completed';
  progress.objectiveStates.O03 = 'active';
  progress.knownFactIds = ['F04', 'F05'];
  progress.visitedSceneIds = ['S01', 'S02'];
  return {
    ...state,
    currentScene: 'S02',
    playerLocations: { inspector: 'S02', nurse: 'S02' },
    activeNpcId: 'N03',
    activeNpcName: '洛夫·蒙特利尔',
    scenarioProgress: progress
  };
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
  const portraitAssets = await page.locator('.preset-card-modern img').evaluateAll((images) => images.map((image) => {
    const portrait = image as HTMLImageElement;
    return {
      alt: portrait.alt,
      file: new URL(portrait.currentSrc).pathname.split('/').pop(),
      naturalWidth: portrait.naturalWidth,
      naturalHeight: portrait.naturalHeight
    };
  }));
  expect(portraitAssets).toEqual([
    { alt: '亨利·格雷 立绘', file: 'henry_gray.png', naturalWidth: 1600, naturalHeight: 2000 },
    { alt: '艾达·华莱士 立绘', file: 'ada_wallace.png', naturalWidth: 1600, naturalHeight: 2000 },
    { alt: '托马斯·贝尔 立绘', file: 'thomas_bell.png', naturalWidth: 1600, naturalHeight: 2000 },
    { alt: '罗伯特·肖 立绘', file: 'robert_shaw.png', naturalWidth: 1600, naturalHeight: 2000 }
  ]);
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

test('reference panel opens a fullscreen case board and keeps the log tab', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: '资料', exact: true }).click();

  const drawer = page.locator('.info-drawer-react.open');
  await expect(drawer).toBeVisible();
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox?.width ?? 0).toBeGreaterThanOrEqual(1100);
  expect(drawerBox?.height ?? 0).toBeGreaterThanOrEqual(650);
  await expect(drawer).toHaveClass(/fullscreen/);
  await expect(drawer.locator('.case-board-view')).toBeVisible();
  await expect(page.getByRole('button', { name: '案件板' })).toHaveClass(/active/);
  const board = page.locator('.case-board-flow-wrap');
  await expect(board).toBeVisible();
  await expect(board.locator('.case-flow-node.scene', { hasText: '摩勒住宅' })).toBeVisible();
  await expect(board.locator('.case-flow-node.npc', { hasText: '伊莎贝拉·摩勒' })).toBeVisible();
  await expect(board.locator('.case-flow-node.npc', { hasText: '埃里克·摩勒' })).toBeVisible();
  await expect(board.getByText('卡森其药店')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '线索' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '人物' })).toHaveCount(0);

  await page.getByRole('button', { name: '日志' }).click();
  await expect(page.getByRole('heading', { name: '行动日志' })).toBeVisible();
});

test('progress tab shows authored objectives, clue counts, and world time', async ({ page }) => {
  await startNewGame(page);
  await expect(page.locator('.world-time')).toHaveText('1920-07-13 17:30');
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await page.getByRole('button', { name: '进度' }).click();
  await expect(page.getByRole('heading', { name: '调查目标' })).toBeVisible();
  await expect(page.getByText('与伊莎贝拉确认委托和埃里克失踪的基本情况。')).toBeVisible();
  await expect(page.getByText(/已发现 0 \/ 8/)).toBeVisible();
});

test('v8 ending save locks the action area and preserves the authored ending', async ({ page }) => {
  await gotoWithSave(page, createV8EndingSave());
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('.ending-dock')).toBeVisible();
  await expect(page.getByText('结局C：和平交涉')).toBeVisible();
  await expect(page.getByText('调查员听懂并说服深潜者释放埃里克，扶桑花号随后和平离港。')).toBeVisible();
  await expect(page.locator('.dock-input')).toHaveCount(0);
});

test('pending check plays the dice ritual before revealing its result', async ({ page }) => {
  await gotoWithSave(page, createPendingCheckSave());
  await page.getByRole('button', { name: '继续游戏' }).click();

  await page.getByRole('button', { name: '掷骰' }).click();
  const ritual = page.getByRole('dialog', { name: '命运检定' });
  await expect(ritual).toHaveClass(/rolling/);
  await expect(ritual.getByText('艾达·华莱士 · 侦查')).toBeVisible();
  await expect(ritual.getByText('普通难度')).toBeVisible();
  await expect(ritual.getByText('目标值 60')).toBeVisible();
  await expect(ritual.getByText('骰面翻滚中')).toBeVisible();
  await expect(page.getByRole('button', { name: '掷骰中' })).toBeDisabled();
  await expect(page.getByText(/检定结果：/)).toHaveCount(0);
});

test('legacy internal progression prompts stay hidden after loading a save', async ({ page }) => {
  const state = createDynamicCaseBoardSave();
  state.messages.push({
    id: 'legacy-progression-prompt',
    type: 'system',
    text: '推进提示：从书桌抽屉中选择一处给出明确可调查迹象。'
  });
  await gotoWithSave(page, state);
  await page.getByRole('button', { name: '继续游戏' }).click();

  await expect(page.getByText(/推进提示：/)).toHaveCount(0);
  await expect(page.getByText('浓雾压在摩勒住宅的窗外。')).toBeVisible();
});

test('second-act scene loads its authored backdrop and NPC portrait together', async ({ page }) => {
  await gotoWithSave(page, createPoliceStationSave());
  await page.getByRole('button', { name: '继续游戏' }).click();

  await expect(page.locator('.brand-title')).toHaveText('第二幕：街区调查');
  await expect(page.locator('.brand-scene')).toHaveText('上城区第二分局');
  await expect(page.locator('.scene-backdrop-img')).toHaveAttribute('src', /%E8%AD%A6%E5%B1%80\.png/i);
  await expect(page.locator('.scene-npc')).toHaveAttribute('src', /montreal\.png/);
});

test('reference panel renders saved dynamic case board hypotheses', async ({ page }) => {
  await gotoWithSave(page, createDynamicCaseBoardSave());

  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('.game-screen')).toBeVisible();
  await page.getByRole('button', { name: '资料', exact: true }).click();

  const drawer = page.locator('.info-drawer-react.open');
  const board = drawer.locator('.case-board-flow-wrap');
  await expect(board.locator('.case-flow-node.event.confirmed', { hasText: '药店后门被撬' })).toBeVisible();
  await expect(board.locator('.case-flow-node.theory.hypothesis', { hasText: '可能有内应协助' })).toBeVisible();
  await expect(board.locator('.react-flow__edge.case-flow-edge.dynamic.hypothesis')).toHaveCount(1);
  await board.locator('.case-flow-node.theory.hypothesis', { hasText: '可能有内应协助' }).click();
  const inspector = page.getByLabel('可能有内应协助详情');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText('第 1 回合：玩家发现药店后门有被撬痕迹')).toBeVisible();
  await expect(inspector.getByText(/e1/)).toHaveCount(0);
});

test('reference panel uses the compact case board without horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoWithSave(page, createDynamicCaseBoardSave());

  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.getByRole('button', { name: '资料', exact: true }).click();

  const drawer = page.locator('.info-drawer-react.open');
  await expect(drawer.locator('.case-board-mobile-list')).toBeVisible();
  await expect(drawer.locator('.case-board-flow-wrap')).toBeHidden();
  const hypothesis = drawer.locator('.case-board-mobile-card.theory.hypothesis', {
    hasText: '可能有内应协助'
  });
  await expect(hypothesis).toBeVisible();
  await hypothesis.click();
  await expect(page.getByRole('dialog', { name: '可能有内应协助详情' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    drawer: Math.max(0, (document.querySelector('.info-drawer-react')?.scrollWidth ?? 0) - window.innerWidth)
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.drawer).toBeLessThanOrEqual(1);
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
