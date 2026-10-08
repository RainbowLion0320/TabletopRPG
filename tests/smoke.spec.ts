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

async function startNewGame(page: Page, partySize: 1 | 2 | 3 | 4 = 1) {
  await gotoClean(page);
  await expect(page.getByRole('heading', { name: '雾中消逝' })).toBeVisible();
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await expect(page.getByRole('heading', { name: '选择调查员' })).toBeVisible();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(1);
  for (let index = 1; index < partySize; index++) {
    await page.locator('.preset-card-modern').nth(index).locator('strong').click();
  }
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(partySize);
  await page.getByRole('button', { name: /进入游戏/ }).click();
  await expect(page.locator('.game-screen')).toBeVisible();
}

function createDynamicCaseBoardSave(): GameState {
  const players = [
    makeInvestigator({ id: 'inspector', name: '亨利·格雷' }),
    makeInvestigator({ id: 'nurse', name: '艾达·华莱士', gender: '女' })
  ];
  return {
    players,
    currentActorIndex: 0,
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

async function gotoWithSave(page: Page, gameState: GameState, apiConfig?: Record<string, string>) {
  await page.addInitScript(({ serializedState, apiConfig }) => {
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
    if (apiConfig) window.localStorage.setItem('trpg-api', JSON.stringify(apiConfig));
  }, { serializedState: gameState, apiConfig });
  await page.goto('/');
}

for (const size of [{ width: 320, height: 568, party: 4 as const }, { width: 390, height: 844, party: 2 as const }]) {
  test(`phone multiline actions stay compact and retain the correct actor at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await startNewGame(page, size.party);
    const input = page.locator('.dock-input');
    await expect(input).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(input).toHaveAttribute('enterkeyhint', 'enter');
    await input.fill('侦查门廊');
    await input.press('Enter');
    await expect(input).toHaveValue('侦查门廊\n');
    await expect(input).toHaveAttribute('aria-label', '亨利·格雷的行动');
    const longAction = '查看门槛与窗框，再询问失踪前发生的事情。\n'.repeat(8);
    await input.fill(longAction);
    const geometry = await input.evaluate((element) => {
      const r = element.getBoundingClientRect(), dock = document.querySelector('.action-dock')!.getBoundingClientRect();
      return { height: r.height, scrollable: element.scrollHeight > element.clientHeight, inside: r.top >= dock.top && r.bottom <= dock.bottom,
        storyHeight: document.querySelector('.narrative-panel')!.clientHeight,
        overflow: Array.from(document.querySelectorAll('.party-compact')).some(card => card.scrollWidth > card.clientWidth + 1) };
    });
    expect(geometry.height).toBeGreaterThan(44);
    expect(geometry.height).toBeLessThanOrEqual(96);
    expect(geometry.scrollable).toBe(true);
    expect(geometry.inside).toBe(true);
    expect(geometry.storyHeight).toBeGreaterThanOrEqual(140);
    expect(geometry.overflow).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('multiline-action.png') });
    await page.getByRole('button', { name: '下一位', exact: true }).click();
    await expect(input).toHaveAttribute('aria-label', '艾达·华莱士的行动');
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(page.locator('.party-compact').first()).toContainText('已提交');
    await expect(page.locator('.party-compact').nth(1)).toHaveAttribute('aria-current', 'step');
    await input.fill(longAction);
    await page.setViewportSize({ width: size.width, height: 300 });
    await expect.poll(() => input.evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(66);
    await expect(input).toBeInViewport();
    await expect(page.locator('.dock-submit')).toBeInViewport();
    await expect(page.locator('.narrative-toggle-btn')).toBeInViewport();
    await page.setViewportSize(size);
    await expect.poll(() => input.evaluate(element => element.getBoundingClientRect().height)).toBe(96);
    await expect(input).toHaveValue(longAction);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '保存游戏', exact: true }).click();
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '读取存档', exact: true }).click();
    await expect(input).toHaveValue(longAction);
    await expect(input).toHaveAttribute('aria-label', '艾达·华莱士的行动');
  });
}

test('desktop keeps Enter confirmation and Shift Enter multiline without advancing the wrong actor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startNewGame(page, 2);
  const input = page.locator('.dock-input');
  await expect(input).toHaveAttribute('enterkeyhint', 'send');
  await input.fill('检查门锁');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('检查门锁\n');
  await expect(input).toHaveAttribute('aria-label', '亨利·格雷的行动');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-label', '艾达·华莱士的行动');
  await expect(page.locator('.story-message.player')).toHaveCount(1);
});

for (const size of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
  test(`new DM replies preserve older reading and can be opened from their beginning at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    let releaseReply!: () => void;
    const replyGate = new Promise<void>(resolve => { releaseReply = resolve; });
    let narratorCalls = 0;
    const reply = '雨声仍在窗外回响。伊莎贝拉等你说完，轻轻点头，将目光投向门廊。\n\n'.repeat(18);
    await page.route('https://ui-dm.test/v1/**', async route => {
      const body = route.request().postDataJSON();
      const narrator = body.text?.format?.name === 'narrator_response';
      if (narrator) { narratorCalls++; await replyGate; }
      const content = JSON.stringify(narrator
        ? { narrative: reply, activeNpc: '伊莎贝拉·摩勒', nextPrompt: '', playerChoices: {}, keywords: [] }
        : { facts: [], nodes: [], edges: [] });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output_text: content }) });
    });
    const state = createDynamicCaseBoardSave();
    state.players = [state.players[0]];
    state.scenarioProgress = createSmokeScenarioProgress();
    state.messages = Array.from({ length: 12 }, (_, index) => ({ id: `old-${index}`, type: 'dm' as const, text: '以前的谈话记录，调查员回忆来到门廊时听到的雨声。\n\n'.repeat(4) }));
    await gotoWithSave(page, state, { provider: 'custom', protocol: 'responses', endpoint: 'https://ui-dm.test/v1', apiKey: 'ui-qa-only-token', model: 'test-model' });
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await page.locator('.narrative-toggle-btn').click();
    await page.locator('.dock-input').fill('原地思考');
    await page.getByRole('button', { name: '提交', exact: true }).click();
    await expect.poll(() => narratorCalls).toBe(1);
    const scroll = page.getByRole('region', { name: '剧情记录', exact: true });
    await scroll.evaluate(element => element.scrollTo({ top: 100, behavior: 'instant' }));
    await expect.poll(() => scroll.evaluate(element => element.scrollTop)).toBe(100);
    releaseReply();
    await expect(page.locator('.story-message.dm').last()).toContainText('雨声仍在窗外回响。');
    await expect(scroll).toHaveJSProperty('scrollTop', 100);
    const newContent = page.getByRole('button', { name: '查看新剧情', exact: true });
    await expect(newContent).toBeInViewport();
    await expect(page.locator('.narrative-toggle-btn')).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('older-reading-new-reply.png') });
    await newContent.click();
    await expect(newContent).toHaveCount(0);
    await expect(scroll).toBeFocused();
    const position = await scroll.evaluate(element => {
      const latest = element.querySelector<HTMLElement>('.story-message.dm:last-child')!;
      return { difference: Math.abs(element.scrollTop - latest.offsetTop), remaining: element.scrollHeight - element.clientHeight - element.scrollTop };
    });
    expect(position.difference).toBeLessThanOrEqual(1);
    expect(position.remaining).toBeGreaterThan(200);
    await page.locator('.dock-input').fill('原地思考');
    await page.getByRole('button', { name: '提交', exact: true }).click();
    await expect.poll(() => narratorCalls).toBe(2);
    await expect(page.locator('.dock-input')).toBeEnabled();
    await expect(newContent).toHaveCount(0);
    await expect.poll(() => scroll.evaluate(element => Math.abs(element.scrollTop - element.querySelector<HTMLElement>('.story-message.dm:last-child')!.offsetTop))).toBeLessThanOrEqual(1);
  });
}

function createV8EndingSave(): GameState {
  const state = createDynamicCaseBoardSave();
  const progress = createSmokeScenarioProgress();
  progress.activeActId = 'A02';
  progress.endingId = 'END_C';
  progress.settledEndingIds = ['END_C'];
  progress.beatStates.B01 = 'completed';
  progress.beatStates.B02 = 'completed';
  progress.beatStates.B03 = 'active';
  progress.beatStates.B05 = 'completed';
  progress.beatStates.B06 = 'completed';
  progress.objectiveStates.O01 = 'completed';
  progress.objectiveStates.O02 = 'completed';
  progress.objectiveStates.O03 = 'active';
  progress.objectiveStates.O05 = 'completed';
  progress.objectiveStates.O06 = 'completed';
  progress.objectiveStates.O08 = 'completed';
  progress.knownFactIds = ['F04', 'F06', 'F09'];
  progress.clueStates.I04 = 'analyzed';
  progress.clueStates.I07 = 'analyzed';
  return {
    ...state,
    currentScene: 'S05',
    activeNpcId: 'N02',
    activeNpcName: '埃里克·摩勒',
    scenarioProgress: progress
  };
}

function createPendingCheckSave(): GameState {
  const state = createDynamicCaseBoardSave();
  state.players[1] = makeInvestigator(
    { id: 'nurse', name: '艾达·华莱士', gender: '女' },
    { 侦查: 60 }
  );
  return {
    ...state,
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

function createNegotiationCheckSave(): GameState {
  const state = createDynamicCaseBoardSave();
  state.players[0] = makeInvestigator(
    { id: 'inspector', name: '亨利·格雷' },
    { 聆听: 65, 说服: 60 }
  );
  const progress = createSmokeScenarioProgress();
  progress.activeActId = 'A03';
  progress.beatStates = {
    B01: 'completed', B02: 'completed', B03: 'locked', B04: 'locked', B05: 'completed', B06: 'active'
  };
  progress.objectiveStates = {
    O01: 'completed', O02: 'completed', O03: 'locked', O04: 'locked',
    O05: 'completed', O06: 'completed', O07: 'locked', O08: 'active'
  };
  progress.knownFactIds = ['F04', 'F06', 'F09'];
  progress.variables.commissionAccepted = true;
  progress.variables.finaleRoute = 'negotiation';
  progress.visitedSceneIds = ['S01', 'S04', 'S05'];
  return {
    ...state,
    currentScene: 'S05',
    activeNpcId: 'N02',
    activeNpcName: '埃里克·摩勒',
    pendingCheck: {
      scenarioCheckId: 'CHECK_LISTEN',
      player: '亨利·格雷',
      skill: '聆听',
      difficulty: '普通',
      skillVal: 65,
      threshold: 65
    },
    scenarioProgress: progress
  };
}

function createBypassedNegotiationCheckSave(): GameState {
  const state = createNegotiationCheckSave();
  state.pendingCheck = {
    player: '亨利·格雷',
    skill: '说服',
    difficulty: '普通',
    skillVal: 60,
    threshold: 60
  };
  return state;
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
    activeNpcId: 'N03',
    activeNpcName: '洛夫·蒙特利尔',
    scenarioProgress: progress
  };
}

test('a selected two-investigator party reaches the main game with both status cards', async ({ page }) => {
  await startNewGame(page, 2);

  await expect(page.getByPlaceholder('亨利·格雷 想要做什么...')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一位' })).toBeDisabled();
  await expect(page.locator('.brand-title')).toHaveText('第一幕：接受委托');
  await expect(page.locator('.brand-scene')).toHaveText('摩勒住宅');
  const brandPresentation = await page.locator('.game-top').evaluate((top) => {
    const title = top.querySelector('.brand-title');
    const scene = top.querySelector('.brand-scene');
    const titleStyle = title ? getComputedStyle(title) : null;
    const sceneStyle = scene ? getComputedStyle(scene) : null;
    const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
    const background = rgb(getComputedStyle(top).backgroundColor);
    const luminance = (channels: number[]) => channels.slice(0, 3).map(value => {
      const linear = value / 255;
      return linear <= .04045 ? linear / 12.92 : ((linear + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    const contrast = (color: string) => {
      const channels = rgb(color), alpha = channels[3] ?? 1;
      const foreground = channels.slice(0, 3).map((value, index) => value * alpha + background[index] * (1 - alpha));
      return (luminance(foreground) + .05) / (luminance(background) + .05);
    };
    return {
      topBottom: top.getBoundingClientRect().bottom,
      npcTop: document.querySelector('.scene-npc')?.getBoundingClientRect().top ?? -1,
      sceneContrast: contrast(sceneStyle?.color ?? ''),
      sceneFontSize: Number.parseFloat(sceneStyle?.fontSize ?? '0'),
      titleContrast: contrast(titleStyle?.color ?? ''),
      titleFontSize: Number.parseFloat(titleStyle?.fontSize ?? '0')
    };
  });
  expect(brandPresentation.titleContrast).toBeGreaterThanOrEqual(4.5);
  expect(brandPresentation.sceneContrast).toBeGreaterThanOrEqual(4.5);
  expect(brandPresentation.titleFontSize).toBeLessThanOrEqual(30);
  expect(brandPresentation.sceneFontSize).toBeLessThanOrEqual(14);
  expect(brandPresentation.npcTop).toBeGreaterThanOrEqual(brandPresentation.topBottom);
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

for (const size of [{ width: 320, height: 568, party: 4 }, { width: 390, height: 844, party: 2 }, { width: 1440, height: 900, party: 1 }]) {
  test(`expanded story keeps navigation and its header above long history at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const state = createDynamicCaseBoardSave();
    state.players = Array.from({ length: size.party }, (_, index) => makeInvestigator({ id: `reader-${index}`, name: ['亨利·格雷', '艾达·华莱士', '托马斯·贝尔', '罗伯特·肖'][index] }));
    state.messages = Array.from({ length: 20 }, (_, index) => index % 2 === 0
      ? { id: `history-${index}`, type: 'player' as const, playerName: state.players[index % size.party].name, text: '仔细观察窗边的痕迹，向伊莎贝拉询问失踪前发生的事情。' }
      : { id: `history-${index}`, type: 'dm' as const, text: '浓雾压在摩勒住宅的窗外。伊莎贝拉停顿片刻，回忆起那天走廊里急促的脚步声。调查员沿着门廊仔细查看，斑驳的木板上留下了一道浅浅的划痕。\n\n'.repeat(4), npcName: null });
    await gotoWithSave(page, state);
    await page.getByRole('button', { name: '继续游戏' }).click();
    const toggle = page.locator('.narrative-toggle-btn');
    const scroll = page.getByRole('region', { name: '剧情记录', exact: true });
    await expect.poll(() => scroll.evaluate((element) => {
      const latest = element.querySelector<HTMLElement>('.story-message:last-child')!;
      return Math.abs(element.scrollTop - Math.min(latest.offsetTop, element.scrollHeight - element.clientHeight));
    })).toBeLessThanOrEqual(1);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const header = await page.locator('.narrative-header').boundingBox();
    expect(header).not.toBeNull();
    for (const fraction of [0, 0.5, 1]) {
      await scroll.evaluate((element, fraction) => element.scrollTo({ top: (element.scrollHeight - element.clientHeight) * fraction, behavior: 'instant' }), fraction);
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop / (element.scrollHeight - element.clientHeight))).toBeCloseTo(fraction, 2);
      const geometry = await scroll.evaluate((element) => {
        const panel = element.closest('.narrative-panel')!;
        const p = panel.getBoundingClientRect(), h = panel.querySelector('.narrative-header')!.getBoundingClientRect();
        const body = element.getBoundingClientRect(), nav = document.querySelector('.game-top')!.getBoundingClientRect(), dock = document.querySelector('.action-dock')!.getBoundingClientRect();
        return { headerTop: h.top, panelTop: p.top, navBottom: nav.bottom, bodyTop: body.top, headerBottom: h.bottom, bodyBottom: body.bottom, dockTop: dock.top, panelScroll: panel.scrollTop };
      });
      expect(geometry.panelTop).toBeGreaterThanOrEqual(geometry.navBottom);
      expect(geometry.headerTop).toBeCloseTo(header!.y, 0);
      expect(geometry.bodyTop).toBeGreaterThanOrEqual(geometry.headerBottom);
      expect(geometry.bodyBottom).toBeLessThanOrEqual(geometry.dockTop);
      expect(geometry.panelScroll).toBe(0);
      await expect(toggle).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath('expanded-long-story.png') });
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存游戏', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '继续调查', exact: true }).click();
    await page.getByRole('button', { name: '资料', exact: true }).click();
    await page.getByRole('button', { name: '关闭资料', exact: true }).click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.scene-stage')).toBeVisible();
    await expect(page.locator('.dock-input')).toBeInViewport();
    await expect(page.locator('.narrative-header')).toBeInViewport();
  });
}

for (const size of [{ width: 390, height: 844, party: 1 }, { width: 1440, height: 900, party: 2 }, { width: 320, height: 568, party: 4 }] as const) {
  test(`investigator sheets keep ${size.party}-player drafts and turns intact at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await startNewGame(page, size.party);
    if (size.width <= 700) {
      const layout = await page.locator('.game-screen').evaluate((screen) => {
        const panel = screen.querySelector('.narrative-panel')!, dock = screen.querySelector('.action-dock')!.getBoundingClientRect();
        return { readingHeight: panel.clientHeight, dockBottom: dock.bottom, viewport: innerHeight };
      });
      expect(layout.readingHeight).toBeGreaterThanOrEqual(140);
      expect(layout.dockBottom).toBeLessThanOrEqual(layout.viewport - 8);
    }
    const draft = '先记录窗边痕迹，再查看队友的技能。';
    await page.getByRole('textbox', { name: '亨利·格雷的行动' }).fill(draft);
    const avatar = page.getByRole('button', { name: '查看亨利·格雷的属性', exact: true });
    const avatarBox = await avatar.boundingBox();
    expect(avatarBox!.width).toBeGreaterThanOrEqual(44); expect(avatarBox!.height).toBeGreaterThanOrEqual(44);
    await avatar.click();
    const sheet = page.locator('.investigator-sheet');
    await expect(sheet).toHaveAccessibleName('亨利·格雷');
    await expect(sheet.locator('[data-stat="hp"] dd')).toHaveText('12 / 12');
    await expect(sheet.locator('.investigator-attributes > div')).toHaveCount(8);
    if (size.party > 1) {
      const teammate = size.party === 4 ? '罗伯特·肖' : '艾达·华莱士';
      await sheet.getByRole('button', { name: teammate, exact: true }).click();
      await expect(sheet).toHaveAccessibleName(teammate);
      await sheet.getByRole('button', { name: '亨利·格雷', exact: true }).click();
    }
    await page.screenshot({ path: testInfo.outputPath('sheet-attributes.png') });
    await sheet.getByRole('tab', { name: '技能', exact: true }).click();
    const search = sheet.getByRole('searchbox', { name: '搜索技能' });
    await search.fill('闪避');
    await expect(sheet.locator('tbody td')).toHaveText(['30', '15', '6']);
    await search.fill('侦查');
    await expect(sheet.locator('tbody tr')).toHaveCount(1);
    await expect(sheet.locator('tbody td')).toHaveText(['75', '37', '15']);
    await sheet.getByRole('button', { name: '清除技能搜索' }).click();
    await sheet.locator('.investigator-body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(search).toBeInViewport();
    await expect(sheet.getByRole('columnheader', { name: '困难' })).toBeInViewport();
    await expect(sheet.getByRole('button', { name: '关闭调查员档案' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('sheet-skills.png') });
    await sheet.getByRole('tab', { name: '随身与背景' }).click();
    await expect(sheet).toContainText('苏格兰场徽章');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0); await expect(avatar).toBeFocused();
    await expect(page.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue(draft);
    await expect(page.locator('.party-compact.active')).toContainText('亨利·格雷');
    await page.locator('.party-compact').last().click();
    await expect(sheet).toHaveAccessibleName(size.party === 4 ? '罗伯特·肖' : size.party === 2 ? '艾达·华莱士' : '亨利·格雷');
    await sheet.getByRole('button', { name: '关闭调查员档案' }).click();
    if (size.party > 1) {
      await page.getByRole('button', { name: '下一位', exact: true }).click();
      await page.getByRole('textbox', { name: '艾达·华莱士的行动' }).fill('继续查看房间');
      await page.locator('.story-message.player').getByRole('button', { name: '查看亨利·格雷详情' }).click();
      await expect(sheet).toHaveAccessibleName('亨利·格雷');
      await sheet.getByRole('button', { name: '关闭调查员档案' }).click();
      await expect(page.getByRole('textbox', { name: '艾达·华莱士的行动' })).toHaveValue('继续查看房间');
      await expect(page.locator('.party-compact.active')).toContainText('艾达·华莱士');
    }
  });
}

test('a solo player can replace the default investigator and cannot start an empty party', async ({ page }) => {
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();
  const cards = page.locator('.preset-card-modern');
  const start = page.getByRole('button', { name: /进入游戏/ });
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(1);
  await expect(cards.nth(0).getByRole('checkbox')).toBeChecked();
  await cards.nth(0).locator('strong').click();
  await expect(start).toBeDisabled();
  await cards.nth(1).locator('strong').click();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(1);
  await start.click();
  await expect(page.locator('.party-strip-compact .party-compact')).toHaveCount(1);
  await expect(page.getByPlaceholder('艾达·华莱士 想要做什么...')).toBeVisible();
  await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下一位', exact: true })).toHaveCount(0);
});

test('investigator setup shows portraits and full attribute blocks', async ({ page }) => {
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();

  await expect(page.getByRole('heading', { name: '选择调查员' })).toBeVisible();
  await expect(page.locator('.preset-card-modern img')).toHaveCount(4);
  await expect.poll(() => page.locator('.preset-card-modern img').evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
  )).toBe(true);
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
  expect(Math.abs(layoutMetrics.firstCardHeight - layoutMetrics.firstPortraitHeight)).toBeLessThanOrEqual(80);
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
  await expect(firstCard.locator('.preset-background-notes')).toBeHidden();
  await expect(firstCard.locator('.preset-specialties')).toContainText('侦查75');
  await expect(firstCard.locator('.preset-specialties')).toContainText('心理学70');
  const collapsedLayout = await firstCard.evaluate((card) => {
    const vitalsRect = card.querySelector('.preset-vitals')?.getBoundingClientRect();
    const toggle = card.querySelector('.preset-attrs-toggle')?.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      vitalsTop: vitalsRect?.top ?? 0,
      toggleTop: toggle?.top ?? 0
    };
  });
  expect(collapsedLayout.vitalsTop).toBeLessThan(collapsedLayout.toggleTop);
  const selectedBeforeAttrsToggle = await page.locator('.preset-card-modern.selected').count();
  await firstCard.locator('.preset-attrs-toggle').click();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(selectedBeforeAttrsToggle);
  await expect(firstCard).toHaveClass(/selected/);
  await expect(attrBlock).toBeVisible();
  await expect(skillList).toBeVisible();
  await expect(firstCard.locator('.preset-background-notes')).toBeVisible();
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
  expect(expandedLayout.cardHeight).toBeGreaterThan(collapsedLayout.cardHeight + 100);
  expect(expandedLayout.panelTop).toBeGreaterThanOrEqual(expandedLayout.toggleBottom);
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
  const cardList = setupScreen.locator('.preset-grid-modern');
  const metrics = await cardList.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await cardList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => cardList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: '进入游戏', exact: true })).toBeInViewport();
  await expect(setupScreen.locator('.preset-card-modern').last()).toBeInViewport();
});

test('investigator files support native keyboard selection without conflating details with the party', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();
  const henry = page.getByRole('checkbox', { name: '选择亨利·格雷', exact: true });
  const ada = page.getByRole('checkbox', { name: '选择艾达·华莱士', exact: true });
  await henry.focus();
  await henry.press('Space');
  await expect(henry).not.toBeChecked();
  await expect(page.getByRole('button', { name: '进入游戏', exact: true })).toBeDisabled();
  await ada.focus();
  await ada.press('Space');
  await expect(ada).toBeChecked();
  const card = page.locator('.preset-card-modern').filter({ has: ada });
  await card.getByRole('button', { name: '档案详情', exact: true }).click();
  await expect(card.locator('.preset-background-notes')).toBeVisible();
  await expect(ada).toBeChecked();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(1);
  const metrics = await card.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1);
  await expect(page.locator('.setup-footer .primary-btn')).toBeInViewport();
  await page.locator('.setup-footer .primary-btn').click();
  await expect(page.getByRole('textbox', { name: '艾达·华莱士的行动' })).toBeVisible();
});

test('portrait selection keeps one investigator per row across the former 600px breakpoint', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await gotoClean(page);
  await page.getByRole('button', { name: /开始游戏/ }).click();
  const cards = page.locator('.preset-card-modern');
  const list = page.locator('.preset-grid-modern');
  const start = page.locator('.setup-footer .primary-btn');
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(1);
  await cards.nth(1).locator('strong').click();
  for (const width of [390, 562, 599, 600, 601, 700]) {
    await page.setViewportSize({ width, height: 1000 });
    await list.evaluate(element => { element.scrollTop = 0; });
    const bounds = await cards.evaluateAll(elements => elements.map(element => {
      const r = element.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
    }));
    for (let index = 1; index < bounds.length; index++) {
      expect(bounds[index].left).toBeCloseTo(bounds[0].left, 0);
      expect(bounds[index].right).toBeCloseTo(bounds[0].right, 0);
      expect(bounds[index].top).toBeGreaterThanOrEqual(bounds[index - 1].bottom + 8);
    }
    expect(bounds[0].width).toBeGreaterThan(width * .9);
    await expect(page.locator('.preset-card-modern.selected')).toHaveCount(2);
    await cards.first().locator('.preset-attrs-toggle').click();
    await expect(page.locator('.preset-card-modern.selected')).toHaveCount(2);
    expect(await cards.first().locator('.preset-card-content').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await expect(start).toBeInViewport();
    await cards.first().locator('.preset-attrs-toggle').click();
    if (width === 600) await page.screenshot({ path: testInfo.outputPath('portrait-selection-600.png') });
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(cards.last()).toBeInViewport();
    await expect(start).toBeInViewport();
  }
  await cards.nth(2).locator('strong').click();
  await cards.nth(3).locator('strong').click();
  await expect(page.locator('.preset-card-modern.selected')).toHaveCount(4);
  await start.click();
  await expect(page.locator('.party-compact')).toHaveCount(4);
});

test('player action messages keep the player name and action on one line', async ({ page }) => {
  await startNewGame(page, 2);

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

  await page.getByRole('button', { name: '关闭资料' }).click();
  await expect(page.locator('.info-drawer-react')).not.toHaveClass(/open/);
  await expect(page.getByRole('button', { name: '资料', exact: true })).toBeFocused();
  await expect.poll(() => page.locator('.game-screen').evaluate((element) => element.scrollLeft)).toBe(0);
  await expect.poll(() => page.locator('.scene-stage').evaluate((element) => element.getBoundingClientRect().left)).toBe(0);
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
  await expect(page.locator('.scene-npc')).toHaveCount(0);
  await expect(page.locator('.npc-nameplate')).toHaveCount(0);
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await page.getByRole('button', { name: '进度' }).click();
  const skippedObjective = page.locator('.objective-row').filter({ hasText: '调查蒙特利尔与埃里克的关系' });
  await expect(skippedObjective).toContainText('未完成');
  await expect(skippedObjective).not.toContainText('进行中');
});

test('pending check plays the dice ritual before revealing its result', async ({ page }) => {
  await gotoWithSave(page, createPendingCheckSave());
  await page.getByRole('button', { name: '继续游戏' }).click();

  await page.getByRole('button', { name: '掷骰' }).click();
  const ritual = page.getByRole('dialog', { name: '命运检定' });
  await expect(ritual).toHaveClass(/rolling/);
  await expect(ritual.getByText('艾达·华莱士 · 侦查')).toBeVisible();
  await expect(ritual.getByText('难度：普通')).toBeVisible();
  await expect(ritual.getByText('目标值 60')).toBeVisible();
  await expect(ritual.getByText('骰面翻滚中')).toBeVisible();
  await expect(page.getByRole('button', { name: '掷骰中' })).toBeDisabled();
  await expect(page.locator('.story-message.system').filter({ hasText: /艾达·华莱士 · 侦查：/ })).toHaveCount(0);
});

for (const mode of ['animated', 'reduced motion', 'missing animation', 'missing audio'] as const) {
test(`dice art remains readable and confirms once with ${mode}`, async ({ page }) => {
  const audioRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/assets/audio/')) audioRequests.push(request.url()); });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: mode === 'reduced motion' ? 'reduce' : 'no-preference' });
  if (mode === 'missing animation') {
    await page.route('**/ui_dice_roll.webp', route => route.abort());
  }
  if (mode === 'missing audio') await page.route('**/assets/audio/**', route => route.abort());
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await gotoWithSave(page, createPendingCheckSave());
  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.getByRole('button', { name: '掷骰', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '命运检定' });
  await expect(dialog).toHaveClass(/rolling/);
  await page.keyboard.press('Tab');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveClass(/rolling/);
  if (mode === 'animated' || mode === 'missing audio') {
    await expect(dialog.locator('.dice-roll-sprite')).toHaveClass(/ready/);
    await expect(dialog.locator('.dice-roll-idle')).toBeHidden();
  } else {
    await expect(dialog.locator('.dice-roll-sprite')).toBeHidden();
    await expect(dialog.locator('.dice-roll-idle')).toBeVisible();
  }
  await expect(dialog).toHaveClass(/revealed/, { timeout: 5_000 });
  await expect(dialog.locator('.dice-roll-total')).toHaveText('100');
  await expect(dialog.locator('.dice-face.tens-die')).toHaveText('00');
  await expect(dialog.locator('.dice-face.ones-die')).toHaveText('0');
  await expect(dialog.getByRole('heading', { name: '大失败' })).toBeVisible();
  if (mode === 'animated') {
    for (const sound of ['dice-shake', 'dice-land', 'check-failure']) {
      await expect.poll(() => audioRequests.some(url => url.includes(sound))).toBe(true);
    }
  }
  const confirm = dialog.getByRole('button', { name: '确认结果' });
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  const appearance = await dialog.evaluate(async element => {
    await document.fonts.ready;
    const card = element.querySelector('.dice-roll-card')!.getBoundingClientRect();
    const controls = element.querySelectorAll('header p, .dice-roll-target span, .dice-roll-total-label, .dice-roll-total, .dice-face, .dice-roll-hint, h3, button');
    return {
      fontLoaded: document.fonts.check('16px "Zihun Yunque"', '总点数确认结果亨利侦查'),
      allUseFont: Array.from(controls).every(control => getComputedStyle(control).fontFamily.startsWith('"Zihun Yunque"')),
      fits: card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight,
      backdrop: getComputedStyle(element).backdropFilter,
      panelLoaded: (element.querySelector('.dice-roll-panel-art') as HTMLImageElement).naturalWidth === 639
    };
  });
  expect(appearance).toEqual({ fontLoaded: true, allUseFont: true, fits: true, backdrop: 'blur(4px)', panelLoaded: true });
  await page.screenshot({ path: `test-results/dice-${mode.replaceAll(' ', '-')}.png` });
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.story-message.system').filter({ hasText: '艾达·华莱士 · 侦查：大失败（100）' })).toHaveCount(1);
});
}

test('authored negotiation checks chain and settle the ending without another AI call', async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.01;
  });
  let aiRequests = 0;
  page.on('request', (request) => {
    if (/\/(?:responses|chat\/completions)$/.test(new URL(request.url()).pathname)) aiRequests += 1;
  });
  await gotoWithSave(page, createNegotiationCheckSave());
  await page.getByRole('button', { name: '继续游戏' }).click();

  await expect(page.locator('.check-card')).toContainText('亨利·格雷 · 聆听');
  await page.getByRole('button', { name: '掷骰' }).click();
  await expect(page.getByRole('dialog', { name: '命运检定' })).toHaveClass(/revealed/, { timeout: 5_000 });
  await page.getByRole('button', { name: '确认结果' }).click();
  await expect(page.locator('.check-card')).toContainText('亨利·格雷 · 说服', { timeout: 8_000 });
  await expect(page.locator('.check-card')).toContainText('难度：困难，阈值 30');

  await page.getByRole('button', { name: '掷骰' }).click();
  await expect(page.getByRole('dialog', { name: '命运检定' })).toHaveClass(/revealed/, { timeout: 5_000 });
  await page.getByRole('button', { name: '确认结果' }).click();
  await expect(page.locator('.ending-dock')).toContainText('结局C：和平交涉', { timeout: 8_000 });
  expect(aiRequests).toBe(0);
});

test('loading a bypassed finale persuasion restores the authored listen check', async ({ page }) => {
  await gotoWithSave(page, createBypassedNegotiationCheckSave());
  await page.getByRole('button', { name: '继续游戏' }).click();

  await expect(page.locator('.check-card')).toContainText('亨利·格雷 · 聆听');
  await expect(page.locator('.check-card')).toContainText('难度：普通，阈值 65');
});

test('legacy internal progression prompts stay hidden after loading a save', async ({ page }) => {
  const state = createDynamicCaseBoardSave();
  const cue = '伊莎贝拉确认委托，并提供父亲失踪日期、警方无进展以及老赫特酒吧这一生活线索。';
  state.messages.push({ id: 'legacy-event-cue', type: 'system', text: cue });
  state.messages.push({ id: 'dice-feedback', type: 'system', text: '检定结果：普通成功（42）' });
  state.actionLog.push({ time: '17:35', text: '剧情事件：EV_ACCEPT_COMMISSION' });
  state.messages.push({
    id: 'legacy-progression-prompt',
    type: 'system',
    text: '推进提示：从书桌抽屉中选择一处给出明确可调查迹象。'
  });
  await gotoWithSave(page, state);
  await page.getByRole('button', { name: '继续游戏' }).click();

  await expect(page.getByText(/推进提示：/)).toHaveCount(0);
  await expect(page.locator('.story-message.system').filter({ hasText: cue })).toHaveCount(0);
  await expect(page.locator('.story-message.system').filter({ hasText: '检定结果：普通成功（42）' })).toBeVisible();
  await expect(page.getByText('浓雾压在摩勒住宅的窗外。')).toBeVisible();
  await page.getByRole('button', { name: '资料', exact: true }).click();
  await page.getByRole('button', { name: '日志', exact: true }).click();
  await expect(page.getByText(/剧情事件：EV_ACCEPT_COMMISSION/)).toHaveCount(0);
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

test('submitting an action without an API key opens configuration and keeps validation local to the form', async ({ page }) => {
  test.skip(hasEnvDefaultApiKey, 'requires no default API key from process env or .env.local');
  await startNewGame(page);

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('检查书房桌面。');
  await page.getByRole('button', { name: '提交' }).click();

  await expect(page.getByRole('heading', { name: 'AI DM 配置' })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'AI DM 配置' });
  await expect(dialog.getByLabel('API Key', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('请输入 API Key');
  await expect(page.locator('.dock-input')).toHaveValue('检查书房桌面。');
});

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`investigation menu closes nested sheets and returns to the unchanged draft at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await startNewGame(page);
    const draft = page.locator('.dock-input');
    await draft.fill('留在门廊观察雨水。');
    const opener = page.getByRole('button', { name: '菜单', exact: true });
    await opener.click();
    const menu = page.getByRole('dialog', { name: '调查菜单', exact: true });
    await expect(opener).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('button', { name: '关闭调查菜单' })).toBeFocused();
    await expect(menu.getByRole('button', { name: '保存游戏' })).toBeInViewport();
    await expect(menu.getByRole('button', { name: '继续调查' })).toBeInViewport();
    await menu.getByRole('button', { name: '声音设置' }).click();
    await expect(page.getByRole('dialog', { name: '声音设置' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '声音设置' })).toHaveCount(0);
    await expect(menu.getByRole('button', { name: '声音设置' })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('investigation-menu.png') });
    await menu.getByRole('button', { name: '继续调查' }).click();
    await expect(menu).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(draft).toHaveValue('留在门廊观察雨水。');
    await opener.click(); await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(opener).toHaveAttribute('aria-expanded', 'false');
    await opener.click();
    await menu.getByRole('button', { name: 'AI 设置', exact: true }).click();
    await page.getByRole('dialog', { name: 'AI DM 配置' }).getByRole('button', { name: '关闭 AI DM 配置' }).click();
    await expect(opener).toBeFocused();
    await expect(draft).toHaveValue('留在门廊观察雨水。');
  });
}

test('phone AI configuration keeps core inputs concise and preserves explicit custom connections above the keyboard', async ({ page }, testInfo) => {
  // Save only into this disposable browser context; never alter a developer's env.
  await page.route('**/__api_config', (route) => route.fulfill({ status: 404, body: '' }));
  await page.setViewportSize({ width: 320, height: 568 });
  await gotoClean(page);
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'AI DM 配置' });
  await expect(dialog.getByRole('button', { name: '关闭 AI DM 配置' })).toBeFocused();
  await expect(dialog.locator('.api-connection')).not.toHaveAttribute('open');
  await expect(dialog.getByLabel('模型')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
  await dialog.getByLabel('API Key', { exact: true }).fill('ui-qa-only-token');
  await dialog.getByRole('button', { name: '显示 API Key' }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: '隐藏 API Key' }).click();
  await dialog.getByLabel('服务商', { exact: true }).selectOption('custom');
  await expect(dialog.locator('.api-connection')).toHaveAttribute('open');
  await expect(dialog.getByLabel('模型')).toHaveValue('');
  await dialog.getByLabel('Endpoint').fill('https://ui-qa.example/v1');
  await dialog.getByLabel('协议', { exact: true }).selectOption('responses');
  await dialog.getByLabel('模型').fill('ui-qa-model');
  await page.setViewportSize({ width: 320, height: 300 });
  await dialog.getByLabel('API Key', { exact: true }).click();
  await expect(dialog.getByLabel('API Key', { exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '关闭 AI DM 配置' })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeInViewport();
  const keyboardBounds = await dialog.evaluate((element) => {
    const h = element.querySelector('.api-config-header')!.getBoundingClientRect();
    const field = element.querySelector('#api-key')!.getBoundingClientRect();
    const body = element.querySelector('.api-config-fields')!.getBoundingClientRect();
    const f = element.querySelector('footer')!.getBoundingClientRect();
    return { header: h.top >= 0 && h.bottom <= innerHeight, key: field.top >= body.top && field.bottom <= body.bottom, footer: f.top >= body.bottom && f.bottom <= innerHeight, outerScroll: element.scrollTop };
  });
  expect(keyboardBounds).toEqual({ header: true, key: true, footer: true, outerScroll: 0 });
  await page.screenshot({ path: testInfo.outputPath('api-keyboard.png') });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  await expect(dialog.locator('.api-connection')).toHaveAttribute('open');
  await expect(dialog.getByLabel('Endpoint')).toHaveValue('https://ui-qa.example/v1');
  await expect(dialog.getByLabel('协议', { exact: true })).toHaveValue('responses');
  await expect(dialog.getByLabel('模型')).toHaveValue('ui-qa-model');
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute('type', 'password');
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
  await page.getByRole('button', { name: /存档管理/ }).click();
  const saveManager = page.getByRole('dialog', { name: '存档管理' });
  await expect(saveManager).toBeVisible();
  await expect(saveManager.getByText('摩勒住宅')).toBeVisible();
  await expect(saveManager.getByText('亨利·格雷', { exact: true })).toBeVisible();

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
