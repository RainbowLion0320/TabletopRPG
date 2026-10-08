import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { rollD100 } from '../src/services/dice';
import type { CheckRequest, GameState, ScenarioProgress } from '../src/types/game';
import { makeInvestigator } from './dm/fixtures';
import { parse as parseYaml } from 'yaml';
import sharp from 'sharp';

const artThumbnail = (input: Buffer) => sharp(input).flatten({ background: '#1c1914' }).resize(32, 40).raw().toBuffer();
const artDistance = (picture: Buffer, master: Buffer) => picture.reduce((sum, value, pixel) => sum + Math.abs(value - master[pixel]), 0) / picture.length;

const hasEnvDefaultApiKey =
  Boolean(process.env.VITE_AI_API_KEY) ||
  (existsSync('.env.local') && /^VITE_AI_API_KEY=.+$/m.test(readFileSync('.env.local', 'utf8')));
const generatedScenarioRuntime = readFileSync(
  'src/data/scenarios/wuzhongxiaoshi/runtime.generated.ts',
  'utf8'
);
const scenarioContentHash = /scenarioContentHash = "([^"]+)"/.exec(generatedScenarioRuntime)?.[1] ?? '';
const scenarioContentVersion = /"contentVersion": "([^"]+)"/.exec(generatedScenarioRuntime)?.[1] ?? '';
const scenarioEndings = (parseYaml(readFileSync('scenarios/wuzhongxiaoshi/progression.yaml', 'utf8')) as {
  endings: Array<{ id: string; title: string; summary: string }>;
}).endings;

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
    const header = page.locator('.narrative-header');
    const headerMetrics = await header.evaluate(e => {
      const h = e.getBoundingClientRect();
      return [...e.querySelectorAll('button')].map(b => {
        const r = b.getBoundingClientRect();
        return { width: r.width, height: r.height, inside: r.left >= h.left && r.right <= h.right + .5 && r.top >= h.top && r.bottom <= h.bottom + .5,
          hit: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
    });
    for (const control of headerMetrics) { expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44); expect(control.inside).toBe(true); expect(control.hit).toBe(true); }
    expect(await newContent.evaluate(e => getComputedStyle(e, '::before').borderImageSource)).toContain('brass-frame');
    expect(await header.locator('.npc-nameplate').evaluate(e => getComputedStyle(e).borderImageSource)).toContain('dossier-mount');
    expect(await header.locator('.npc-nameplate strong').evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
    await expect(page.getByRole('button', { name: '收起剧情', exact: true })).toHaveAttribute('aria-expanded', 'true');
    const storyBeforeDetails = await scroll.evaluate(e => e.scrollTop);
    await header.getByRole('button', { name: '查看伊莎贝拉·摩勒详情', exact: true }).click();
    const npcDetail = page.getByRole('dialog', { name: '伊莎贝拉·摩勒' }); await expect(npcDetail).toBeVisible();
    await npcDetail.getByRole('button', { name: '关闭详情', exact: true }).click();
    await expect(header.getByRole('button', { name: '查看伊莎贝拉·摩勒详情', exact: true })).toBeFocused();
    await expect(scroll).toHaveJSProperty('scrollTop', storyBeforeDetails); await expect(newContent).toBeVisible();
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

test('a 200-entry four-player history keeps all prose and marks while typing, inspecting and changing actor', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = createDynamicCaseBoardSave();
  state.players.push(makeInvestigator({ id: 'reporter', name: '托马斯·贝尔' }), makeInvestigator({ id: 'officer', name: '罗伯特·肖' }));
  state.scenarioProgress = createSmokeScenarioProgress();
  const text = '伊莎贝拉·摩勒与亨利·格雷站在摩勒住宅，艾达·华莱士查看求助信。托马斯·贝尔记录谈话，罗伯特·肖留意窗台，调查员决定进行心理学检定。\n\n';
  state.messages = Array.from({ length: 200 }, (_, index) => ({ id: `history-${index}`, type: 'dm' as const, text: `${text}记录 ${index + 1}。`, keywords: [{ text: '求助信', kind: 'clue' as const }] }));
  let modelCalls = 0;
  page.on('request', request => { if (request.url().startsWith('https://ui-dm.test/')) modelCalls++; });
  await gotoWithSave(page, state, { provider: 'custom', protocol: 'responses', endpoint: 'https://ui-dm.test/v1', apiKey: 'ui-qa-only-token', model: 'test-model' });
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await page.getByRole('button', { name: '展开剧情', exact: true }).click();
  const scroll = page.getByRole('region', { name: '剧情记录', exact: true });
  await expect(scroll.locator('.story-message.dm')).toHaveCount(200);
  const original = await scroll.locator('.story-message.dm p').allTextContents();
  expect(original).toEqual(state.messages.map(message => message.text));
  const colors = await scroll.locator('.story-message.dm').first().locator('.narrative-mark-person').evaluateAll(elements => elements.map(e => ({ name: e.textContent, color: (e as HTMLElement).style.getPropertyValue('--person-color') })));
  expect(colors).toHaveLength(5); expect(new Set(colors.map(person => person.color)).size).toBe(5);
  await scroll.evaluate(element => element.scrollTo({ top: 100, behavior: 'instant' }));
  const input = page.locator('.dock-input');
  await input.fill('把信中的日期记下来。'); await input.press('Enter'); await input.pressSequentially('随后检查门廊。');
  await expect(input).toHaveValue('把信中的日期记下来。\n随后检查门廊。');
  await expect(scroll).toHaveJSProperty('scrollTop', 100);
  expect(await scroll.locator('.story-message.dm p').allTextContents()).toEqual(original);
  expect(await scroll.locator('.story-message.dm').first().locator('.narrative-mark-person').evaluateAll(elements => elements.map(e => ({ name: e.textContent, color: (e as HTMLElement).style.getPropertyValue('--person-color') })))).toEqual(colors);
  await page.locator('.npc-nameplate').click();
  const npc = page.getByRole('dialog', { name: '伊莎贝拉·摩勒' }); await expect(npc).toBeVisible();
  await npc.getByRole('button', { name: '关闭详情', exact: true }).click();
  await expect(scroll).toHaveJSProperty('scrollTop', 100);
  await expect(input).toHaveValue('把信中的日期记下来。\n随后检查门廊。');
  await page.getByRole('button', { name: '下一位', exact: true }).click();
  await expect(input).toHaveAttribute('placeholder', '艾达·华莱士 想要做什么...');
  await expect(input).toBeFocused(); await expect(scroll).toHaveJSProperty('scrollTop', 100);
  await expect(scroll.locator('.story-message.player')).toHaveCount(1);
  expect(await scroll.locator('.story-message.dm p').allTextContents()).toEqual(original);
  await expect(page.getByRole('button', { name: '查看新剧情', exact: true })).toBeVisible();
  expect(modelCalls).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('long-history-input.png') });
});

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
    expect(await sheet.evaluate(e => getComputedStyle(e).borderImageSource.includes('dossier-mount'))).toBe(true);
    for (const selector of ['.investigator-tabs button', '.investigator-party button']) {
      expect(await sheet.locator(selector).evaluateAll(elements => elements.every(e => e.getBoundingClientRect().height >= 44))).toBe(true);
    }
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
    const clear = sheet.getByRole('button', { name: '清除技能搜索' });
    expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await sheet.getByRole('button', { name: '清除技能搜索' }).click();
    await expect(search).toBeFocused();
    expect(await sheet.locator('tbody th').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(15);
    await sheet.locator('.investigator-body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(search).toBeInViewport();
    await expect(sheet.getByRole('columnheader', { name: '困难' })).toBeInViewport();
    await expect(sheet.getByRole('button', { name: '关闭调查员档案' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('sheet-skills.png') });
    const readingPosition = await sheet.locator('.investigator-body').evaluate(e => e.scrollTop);
    await sheet.getByRole('tab', { name: '随身与背景' }).click();
    await expect(sheet).toContainText('苏格兰场徽章');
    await sheet.getByRole('tab', { name: '技能', exact: true }).click();
    await expect.poll(() => sheet.locator('.investigator-body').evaluate(e => e.scrollTop)).toBe(readingPosition);
    if (size.width <= 700) {
      await search.fill('侦查');
      expect(await sheet.locator('.investigator-body').evaluate(e => e.scrollTop)).toBe(0);
      await page.setViewportSize({ width: size.width, height: 300 });
      await search.click();
      await expect(clear).toBeInViewport(); await expect(sheet.getByRole('button', { name: '关闭调查员档案' })).toBeInViewport();
      if (size.party > 1) {
        await sheet.getByRole('button', { name: '罗伯特·肖', exact: true }).click();
        await expect(search).toHaveValue('侦查'); await expect(sheet).toHaveAccessibleName('罗伯特·肖');
        await sheet.getByRole('button', { name: '亨利·格雷', exact: true }).click();
      }
      const keyboardLayout = await sheet.evaluate(e => {
        const body = e.querySelector('.investigator-body')!.getBoundingClientRect(), field = e.querySelector('.investigator-search')!.getBoundingClientRect();
        const buttons = Array.from(e.querySelectorAll('.investigator-close,.investigator-tabs button,.investigator-search button'));
        return { bodyHeight: body.height, searchAbove: field.bottom <= body.top + 1,
          targets: buttons.every(b => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.height >= 44 && !!hit && b.contains(hit); }),
          overflow: e.scrollWidth > e.clientWidth, outerScroll: e.scrollTop };
      });
      expect(keyboardLayout.bodyHeight).toBeGreaterThanOrEqual(70);
      expect(keyboardLayout).toMatchObject({ searchAbove: true, targets: true, overflow: false, outerScroll: 0 });
      await clear.click(); await expect(search).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath('sheet-keyboard.png') });
      await page.setViewportSize(size);
    }
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
      url: portrait.currentSrc,
      naturalWidth: portrait.naturalWidth,
      naturalHeight: portrait.naturalHeight
    };
  }));
  expect(portraitAssets.map(({ alt, naturalWidth, naturalHeight }) => ({ alt, naturalWidth, naturalHeight }))).toEqual([
    { alt: '亨利·格雷 立绘', naturalWidth: 900, naturalHeight: 1125 },
    { alt: '艾达·华莱士 立绘', naturalWidth: 900, naturalHeight: 1125 },
    { alt: '托马斯·贝尔 立绘', naturalWidth: 900, naturalHeight: 1125 },
    { alt: '罗伯特·肖 立绘', naturalWidth: 900, naturalHeight: 1125 }
  ]);
  expect(portraitAssets.every(portrait => portrait.file?.endsWith('.webp'))).toBe(true);
  expect(new Set(portraitAssets.map(portrait => portrait.url)).size).toBe(4);
  // Verify each compressed picture against all four masters, rather than relying
  // on the old PNG filename to detect a swapped investigator portrait.
  const masters = await Promise.all(['henry_gray', 'ada_wallace', 'thomas_bell', 'robert_shaw']
    .map(name => artThumbnail(readFileSync(`assets/investigators/${name}.png`))));
  for (let index = 0; index < portraitAssets.length; index++) {
    const response = await page.request.get(portraitAssets[index].url); expect(response.ok()).toBe(true);
    const delivered = await artThumbnail(await response.body());
    const distances = masters.map(master => artDistance(delivered, master));
    expect(distances[index]).toBeLessThan(6);
    expect(distances.indexOf(Math.min(...distances))).toBe(index);
  }
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
  await expect(page.getByRole('tab', { name: '案件板' })).toHaveClass(/active/);
  const board = page.locator('.case-board-flow-wrap');
  await expect(board).toBeVisible();
  await expect(board.locator('.case-flow-node.scene', { hasText: '摩勒住宅' })).toBeVisible();
  await expect(board.locator('.case-flow-node.npc', { hasText: '伊莎贝拉·摩勒' })).toBeVisible();
  await expect(board.locator('.case-flow-node.npc', { hasText: '埃里克·摩勒' })).toBeVisible();
  await expect(board.getByText('卡森其药店')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '线索' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '人物', exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: '日志' }).click();
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
  await page.getByRole('tab', { name: '进度' }).click();
  await expect(page.getByRole('heading', { name: '调查目标' })).toBeVisible();
  await expect(page.getByText('与伊莎贝拉确认委托和埃里克失踪的基本情况。')).toBeVisible();
  await expect(page.locator('.progress-stat')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '线索进度' })).toHaveCount(0);
});

for (const size of [{ width: 320, height: 568, party: 1 }, { width: 390, height: 844, party: 4 }, { width: 1440, height: 900, party: 2 }]) {
  test(`investigation records preserve readable goals and searchable log position at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const state = createDynamicCaseBoardSave();
    state.players = ['亨利·格雷', '艾达·华莱士', '托马斯·贝尔', '罗伯特·肖'].slice(0, size.party)
      .map((name, index) => makeInvestigator({ name, id: `records-player-${index}` }));
    state.scenarioProgress = createSmokeScenarioProgress();
    state.scenarioProgress.beatStates.B01 = 'completed'; state.scenarioProgress.beatStates.B02 = 'active';
    state.scenarioProgress.objectiveStates.O01 = 'completed'; state.scenarioProgress.objectiveStates.O02 = 'active';
    state.scenarioProgress.variables.commissionAccepted = true;
    state.scenarioProgress.clueStates.I04 = 'analyzed'; state.scenarioProgress.clueStates.I05 = 'discovered';
    state.actionLog = Array.from({ length: 60 }, (_, index) => ({ time: `21:${String(59 - index).padStart(2, '0')}`,
      text: `调查记录${index + 1}：查看门槛与窗框，再询问失踪前发生的事情。\n把看到的痕迹记在随身本上。` }));
    state.actionLog.splice(1, 0, { time: '21:58', text: '剧情事件：EV_HIDDEN_RECORD' },
      { time: '21:58', text: 'AI DM 返回格式无效：未解锁地点的内部诊断' });
    await gotoWithSave(page, state); await page.getByRole('button', { name: '继续游戏' }).click();
    const draft = page.locator('.dock-input'); await draft.fill('继续查看门廊上的痕迹。');
    await page.getByRole('button', { name: '资料', exact: true }).click();
    await page.getByRole('tab', { name: '进度' }).click();
    const current = page.getByText('在摩勒住宅寻找能指向下一处调查地点的证据。');
    await expect(current).toBeVisible();
    expect(await current.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
    await expect(page.locator('.progress-stat')).toHaveText('已发现 2 · 已分析 1');
    await expect(page.locator('.investigation-history')).not.toHaveAttribute('open');
    await expect(page.getByText('与伊莎贝拉确认委托和埃里克失踪的基本情况。')).not.toBeVisible();
    await expect(page.getByText('先听懂对方诉求，再说服其释放埃里克。')).toHaveCount(0);
    await page.locator('.investigation-history summary').click();
    await expect(page.getByText('与伊莎贝拉确认委托和埃里克失踪的基本情况。')).toBeVisible();
    await page.getByRole('tab', { name: '日志' }).click();
    const list = page.getByRole('list', { name: '行动记录' });
    await expect(list.locator('li')).toHaveCount(60);
    await expect(list.locator('li').first()).toContainText('调查记录1：');
    const header = page.locator('.info-drawer-react > header'); const headerTop = (await header.boundingBox())!.y;
    await list.evaluate(el => { el.scrollTop = 720; });
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(500);
    const position = await list.evaluate(el => el.scrollTop);
    await page.getByRole('tab', { name: '进度' }).click(); await expect(current).toBeVisible();
    await page.getByRole('tab', { name: '日志' }).click();
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeCloseTo(position, 0);
    expect((await header.boundingBox())!.y).toBeCloseTo(headerTop, 0);
    const search = page.getByRole('searchbox', { name: '搜索行动日志' });
    await search.fill('调查记录60'); await expect(list.locator('li')).toHaveCount(1);
    await expect(list.locator('p')).toContainText('把看到的痕迹记在随身本上。');
    expect(await list.locator('p').evaluate(el => getComputedStyle(el).whiteSpace)).toBe('pre-wrap');
    expect(await list.locator('p').evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(15);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(0);
    await page.getByRole('tab', { name: '进度' }).click(); await page.getByRole('tab', { name: '日志' }).click();
    await expect(search).toHaveValue('调查记录60');
    await search.fill('EV_HIDDEN_RECORD'); await expect(list.getByRole('status')).toHaveText('没有找到相关记录。');
    await expect(page.getByText('剧情事件：EV_HIDDEN_RECORD')).toHaveCount(0);
    await expect(page.getByText('AI DM 返回格式无效：未解锁地点的内部诊断')).toHaveCount(0);
    await page.getByRole('button', { name: '清空日志搜索' }).click(); await expect(search).toBeFocused();
    await expect(list.locator('li')).toHaveCount(60); await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(0);
    await search.fill('21:00'); await expect(list.locator('li')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('investigation-records.png') });
    await page.setViewportSize({ width: Math.min(size.width, 390), height: 300 });
    await expect(page.getByRole('button', { name: '关闭资料' })).toBeVisible();
    const bounds = () => list.evaluate(el => {
      const listRect = el.getBoundingClientRect(), inputRect = document.querySelector('.record-log-search')!.getBoundingClientRect();
      const closeRect = document.querySelector('[aria-label="关闭资料"]')!.getBoundingClientRect();
      return { listInside: listRect.y >= inputRect.bottom && listRect.bottom <= innerHeight + 1 && listRect.height > 60,
        inputInside: inputRect.x >= 0 && inputRect.right <= innerWidth && inputRect.height >= 44,
        closeInside: closeRect.y >= 0 && closeRect.bottom <= innerHeight && closeRect.width >= 44,
        noOverflow: document.documentElement.scrollWidth <= innerWidth };
    });
    await expect.poll(bounds).toEqual({ listInside: true, inputInside: true, closeInside: true, noOverflow: true });
    await page.getByRole('button', { name: '关闭资料' }).click(); await expect(draft).toHaveValue('继续查看门廊上的痕迹。');
    await page.setViewportSize(size); await page.getByRole('button', { name: '资料', exact: true }).click();
    await page.getByRole('tab', { name: '日志' }).click(); await expect(search).toHaveValue('');
    await expect(list.locator('li')).toHaveCount(60);
  });
}

for (const size of [{ width: 320, height: 568, party: 1, endingId: 'END_C' }, { width: 320, height: 568, party: 4, endingId: 'END_B' }, { width: 390, height: 844, party: 4, endingId: 'END_C' }, { width: 430, height: 932, party: 2, endingId: 'END_A' }, { width: 1440, height: 900, party: 4, endingId: 'END_C' }]) {
  test(`completed investigation keeps its outcome, records, party and return path at ${size.width}px with ${size.party} players`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    const state = createV8EndingSave();
    state.scenarioProgress!.endingId = size.endingId; state.scenarioProgress!.settledEndingIds = [size.endingId];
    const outcome = scenarioEndings.find(e => e.id === size.endingId)!;
    state.players = [...state.players, makeInvestigator({ id: 'reporter', name: '托马斯·贝尔' }), makeInvestigator({ id: 'police', name: '罗伯特·肖' })].slice(0, size.party);
    const resources = state.players.map(p => [p.currentHp, p.currentMp, p.currentSan]);
    let aiCalls = 0; await page.route('**/chat/completions', route => { aiCalls++; return route.abort(); });
    await gotoWithSave(page, state);
    const reviewOnTitle = page.getByRole('button', { name: '回顾调查', exact: true });
    await expect(reviewOnTitle).toHaveClass(/primary-btn/);
    await expect(page.getByRole('region', { name: '继续调查摘要' })).toContainText('已结案');
    await reviewOnTitle.click();
    const ending = page.getByRole('region', { name: '游戏结局' });
    await expect(ending).toContainText(outcome.title);
    await expect(ending).toContainText(outcome.summary);
    await expect(page.locator('.dock-input, .scene-npc, .npc-nameplate, .party-action-status')).toHaveCount(0);
    await expect(ending.locator('.party-compact')).toHaveCount(size.party);
    await expect.poll(() => page.locator('.scene-backdrop-img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('ending-layout.png') });
    writeFileSync(testInfo.outputPath('ending-layout.json'), JSON.stringify(await ending.evaluate(el => ({
      viewport: [innerWidth, innerHeight], dock: [el.clientHeight, el.scrollHeight],
      dockStyle: { height: getComputedStyle(el).height, min: getComputedStyle(el).minHeight, max: getComputedStyle(el).maxHeight, flex: getComputedStyle(el).flex },
      grid: getComputedStyle(document.querySelector('.game-screen')!).gridTemplateRows,
      children: Array.from(document.querySelector('.game-screen')!.children).map(e => ({ tag: e.className, height: e.getBoundingClientRect().height, row: getComputedStyle(e).gridRow, position: getComputedStyle(e).position })),
      elements: Array.from(el.querySelectorAll('button, .ending-copy, .ending-copy p, .party-strip-compact')).map(e => {
        const r = e.getBoundingClientRect(), style = getComputedStyle(e);
        return { tag: e.className, text: e.textContent, rect: [r.x, r.y, r.width, r.height], clamp: style.webkitLineClamp, minHeight: style.minHeight,
          target: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.className };
      })
    }))));
    const bounds = () => ending.evaluate(el => {
      const r = el.getBoundingClientRect(), story = document.querySelector('.narrative-panel')!.getBoundingClientRect();
      const controls = Array.from(el.querySelectorAll('button')).filter(b => b.getBoundingClientRect().height > 0);
      return { inside: r.top >= 0 && r.bottom <= innerHeight + 1, reading: story.height >= 140,
        noOverlap: story.bottom <= r.top + 1, noOverflow: document.documentElement.scrollWidth <= innerWidth,
        controls: controls.every(b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight + 1 && b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }) };
    });
    await expect.poll(bounds).toEqual({ inside: true, reading: true, noOverlap: true, noOverflow: true, controls: true });
    await page.locator('.narrative-toggle-btn').click(); await expect(page.locator('.narrative-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(bounds).toEqual({ inside: true, reading: true, noOverlap: true, noOverflow: true, controls: true });
    await expect.poll(() => page.locator('.narrative-panel').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('.game-top')!.getBoundingClientRect().bottom - 1)).toBe(true);
    await page.locator('.narrative-toggle-btn').click(); await expect(page.locator('.narrative-toggle-btn')).toHaveAttribute('aria-expanded', 'false');
    await ending.locator('.party-compact').last().click();
    await expect(page.getByRole('dialog', { name: state.players.at(-1)!.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭调查员档案' }).click(); await expect(ending.locator('.party-compact').last()).toBeFocused();
    const review = page.getByRole('button', { name: '调查回顾', exact: true });
    await review.click(); await expect(page.getByRole('tab', { name: '进度' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.investigation-ending')).toContainText(outcome.summary);
    const skippedObjective = page.locator('.objective-row').filter({ hasText: '调查蒙特利尔与埃里克的关系' });
    await expect(skippedObjective).toContainText('未完成'); await expect(skippedObjective).not.toContainText('进行中');
    await page.getByRole('tab', { name: '日志' }).click(); await page.getByRole('button', { name: '关闭资料' }).click();
    await expect(review).toBeFocused();
    await page.getByRole('button', { name: '资料', exact: true }).click();
    await expect(page.getByRole('tab', { name: '案件板' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: '关闭资料' }).click();
    await expect.poll(() => page.locator('.info-drawer-react').evaluate(el => el.getBoundingClientRect().left >= innerWidth - 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('ending-review.png') });
    if (size.width === 390) await page.screenshot({ path: 'output/ui-2026-10-08/41-ending-after.png' });
    if (size.width < 600) {
      await page.setViewportSize({ width: size.width, height: 300 }); await expect.poll(bounds).toEqual({ inside: true, reading: true, noOverlap: true, noOverflow: true, controls: true });
      await review.click(); await expect(page.locator('.investigation-ending')).toContainText(outcome.summary);
      await page.getByRole('button', { name: '关闭资料' }).click(); await expect(review).toBeFocused(); await page.setViewportSize(size);
    }
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await expect(reviewOnTitle).toBeFocused(); await reviewOnTitle.click();
    await expect(ending.locator('.party-compact')).toHaveCount(size.party);
    await expect(ending).toContainText(outcome.title); await expect(page.locator('.dock-input')).toHaveCount(0);
    await page.getByRole('button', { name: '菜单', exact: true }).click(); await page.getByRole('button', { name: '保存游戏', exact: true }).click();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('trpg-saves-v2')!)[0].gameState as GameState);
    expect(stored.players.map(p => [p.currentHp, p.currentMp, p.currentSan])).toEqual(resources);
    expect(stored.scenarioProgress?.settledEndingIds).toEqual([size.endingId]); expect(aiCalls).toBe(0);
  });
}

for (const size of [{ width: 320, height: 568, party: 4 as const }, { width: 390, height: 844, party: 1 as const }, { width: 562, height: 1000, party: 4 as const }, { width: 1440, height: 900, party: 4 as const }]) {
  for (const expanded of [false, true]) {
    test(`save feedback leaves the party and action unobscured at ${size.width}px with story ${expanded ? 'expanded' : 'normal'}`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      await startNewGame(page, size.party);
      const draft = '先记录信上的日期。\n请她继续讲述。';
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole('textbox', { name: '亨利·格雷的行动' }).fill(draft);
      if (expanded) await page.getByRole('button', { name: '展开剧情', exact: true }).click();
      const reading = await page.locator('.narrative-scroll').evaluate(element => element.getBoundingClientRect().height);
      await page.getByRole('button', { name: '菜单', exact: true }).click();
      await page.getByRole('button', { name: '保存游戏', exact: true }).click();
      const status = page.locator('.game-notice[role="status"]');
      await expect(status).toHaveText('已保存');
      async function verifyNotice() {
        const bounds = await status.evaluate(element => {
          const notice = element.querySelector('.toast')!, r = notice.getBoundingClientRect();
          const dock = document.querySelector('.action-dock')!.getBoundingClientRect();
          const top = document.querySelector('.game-top')!.getBoundingClientRect();
          const visibleParty = innerHeight > 300 ? Array.from(document.querySelectorAll('.party-compact')) : [];
          const caption = document.querySelector('.npc-nameplate')!.getBoundingClientRect();
          const shortConfirmation = notice.textContent === '已保存';
          return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= top.bottom && r.bottom <= dock.top,
            readable: parseFloat(getComputedStyle(notice).fontSize) >= 15 && notice.scrollWidth <= notice.clientWidth + 1,
            drawn: getComputedStyle(notice).borderImageSource.includes('dossier-mount'),
            passive: getComputedStyle(element).pointerEvents === 'none',
            caption: !shortConfirmation || r.right <= caption.left || r.left >= caption.right || r.bottom <= caption.top || r.top >= caption.bottom,
            party: visibleParty.every(e => { const b = e.getBoundingClientRect(); return b.bottom <= innerHeight && e.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)); }),
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
        });
        expect(bounds).toEqual({ inside: true, readable: true, drawn: true, passive: true, caption: true, party: true, horizontalOverflow: false });
      }
      await verifyNotice();
      expect(await page.locator('.narrative-scroll').evaluate(element => element.getBoundingClientRect().height)).toBe(reading);
      await page.screenshot({ path: testInfo.outputPath('save-feedback.png') });
      if (size.width === 320 && !expanded) await page.screenshot({ path: 'output/ui-2026-10-08/62-save-notice-four-player.png' });
      if (size.width === 1440 && !expanded) await page.screenshot({ path: 'output/ui-2026-10-08/63-action-desktop-after.png' });
      await page.locator('.party-compact').last().click();
      await expect(page.locator('.investigator-sheet[role="dialog"]')).toBeVisible();
      await page.getByRole('button', { name: '关闭调查员档案' }).click();
      await expect(page.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue(draft);
      await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('trpg-saves-v2')!)[0];
        saved.gameState.scenarioProgress.moduleVersion = '99.99.99';
        saved.gameState.scenarioProgress.contentHash = 'INTERNAL_HASH';
        localStorage.setItem('trpg-saves-v2', JSON.stringify([saved]));
      });
      await page.getByRole('button', { name: '菜单', exact: true }).click();
      await page.getByRole('button', { name: '读取存档', exact: true }).click();
      await expect(status).toHaveText('存档与当前剧情版本不兼容，请在存档管理中查看。');
      await page.getByRole('button', { name: '关闭调查菜单' }).click();
      await verifyNotice();
      if (size.width < 600) {
        await page.setViewportSize({ width: size.width, height: 300 });
        await verifyNotice();
      }
      await expect(page.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue(draft);
      await expect(page.locator('.game-screen')).not.toContainText('INTERNAL_HASH');
    });
  }
}

for (const size of [{ width: 320, height: 568, party: 4 }, { width: 390, height: 844, party: 1 }, { width: 562, height: 1000, party: 4 }, { width: 1440, height: 900, party: 4 }]) {
  for (const mode of ['check', 'retry'] as const) {
    test(`turn prompt stays readable and actionable at ${size.width}px with ${size.party} players and ${mode}`, async ({ page }, testInfo) => {
      await page.setViewportSize(size);
      const state = createPendingCheckSave();
      const names = ['亨利·格雷', '艾达·华莱士', '托马斯·贝尔', '罗伯特·肖'];
      const ids = ['inspector', 'nurse', 'reporter', 'constable'];
      state.players = names.slice(0, size.party).map((name, index) => makeInvestigator({ id: ids[index], name }));
      state.declarations = Object.fromEntries(state.players.map((p, index) => [p.id, `询问失踪经过，记录${index + 1}。\n请她继续说明。`]));
      state.pendingCheck = mode === 'check' ? { player: names[size.party - 1], skill: '格斗（拳）', difficulty: '困难', skillVal: 50, threshold: 25, batchIndex: 1, batchTotal: size.party, continuationActions: [] } : null;
      if (mode === 'retry') {
        state.pendingDmActions = state.players.map(p => ({ player: p.name, action: state.declarations[p.id] }));
        state.messages.push({ id: 'private-turn-diagnostic', type: 'system', text: 'AI DM 返回格式无效：private-turn-diagnostic' });
      }
      let narratorCalls = 0;
      await page.route('https://turn-test.invalid/v1/**', async route => {
        const narrator = (route.request().postData() ?? '').includes('COC 第七版 AI DM Agent');
        if (narrator) narratorCalls++;
        const content = JSON.stringify(narrator ? { narrative: '回应恢复，原行动已得到回应。', activeNpc: null, nextPrompt: '', playerChoices: {} } : { facts: [], nodes: [], edges: [] });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output_text: content, output: [] }) });
      });
      await gotoWithSave(page, state, { provider: 'custom', protocol: 'responses', endpoint: 'https://turn-test.invalid/v1', apiKey: 'test-key', model: 'test-model' });
      await page.getByRole('button', { name: '继续游戏' }).click();
      const card = page.locator('.check-card'), action = card.getByRole('button', { name: mode === 'check' ? '掷骰' : '重试本轮', exact: true });
      const bounds = () => card.evaluate(el => {
        const r = el.getBoundingClientRect(), b = el.querySelector('button')!, br = b.getBoundingClientRect();
        const dock = el.closest('.action-dock')!.getBoundingClientRect(), story = document.querySelector('.narrative-panel')!.getBoundingClientRect();
        return {
          inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && br.bottom <= dock.bottom,
          touch: br.width >= 44 && br.height >= 44 && b.contains(document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2)),
          reading: story.height >= 140 && story.bottom <= dock.top + .5,
          party: innerHeight <= 300 || Array.from(document.querySelectorAll('.party-compact')).every(e => { const r = e.getBoundingClientRect(); return r.top >= dock.top && r.bottom <= dock.bottom + .5 && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }),
          font: Array.from(el.querySelectorAll('strong, span, button')).every(e => parseFloat(getComputedStyle(e).fontSize) >= 15),
          drawn: getComputedStyle(el).borderImageSource.includes('dossier-mount'),
          overflow: document.documentElement.scrollWidth <= innerWidth && el.scrollWidth <= el.clientWidth + 1
        };
      });
      await expect.poll(bounds).toEqual({ inside: true, touch: true, reading: true, party: true, font: true, drawn: true, overflow: true });
      await expect(page.locator('.party-compact')).toHaveCount(size.party);
      await expect(page.getByText('private-turn-diagnostic', { exact: false })).toHaveCount(0);
      if (mode === 'check') await expect(card).toContainText('难度：困难，阈值 25');
      else await expect(card).toContainText('已确认的骰点无需重掷');
      await page.screenshot({ path: testInfo.outputPath('turn-prompt.png') });
      if (size.width === 390) await page.screenshot({ path: `output/ui-2026-10-08/59-turn-${mode}-after.png` });
      if (size.width < 600) {
        await page.setViewportSize({ width: size.width, height: 300 });
        await expect.poll(bounds).toEqual({ inside: true, touch: true, reading: true, party: true, font: true, drawn: true, overflow: true });
        await page.setViewportSize(size);
      }
      expect(narratorCalls).toBe(0);
      await action.click();
      if (mode === 'check') await expect(page.getByRole('dialog', { name: '命运检定' })).toHaveClass(/rolling/);
      else { await expect(page.getByText('回应恢复，原行动已得到回应。')).toBeVisible(); expect(narratorCalls).toBe(1); }
    });
  }
}

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
  await page.getByRole('tab', { name: '日志', exact: true }).click();
  await expect(page.getByText(/剧情事件：EV_ACCEPT_COMMISSION/)).toHaveCount(0);
});

test('second-act scene loads its authored backdrop and NPC portrait together', async ({ page }) => {
  await gotoWithSave(page, createPoliceStationSave());
  await page.getByRole('button', { name: '继续游戏' }).click();

  await expect(page.locator('.brand-title')).toHaveText('第二幕：街区调查');
  await expect(page.locator('.brand-scene')).toHaveText('上城区第二分局');
  for (const [selector, master] of [['.scene-backdrop-img', 'assets/scenes/警局.png'], ['.scene-npc', 'assets/avatars/montreal.png']]) {
    const picture = page.locator(selector);
    await expect(picture).toHaveAttribute('src', /\.webp$/);
    await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const response = await page.request.get(await picture.evaluate((image: HTMLImageElement) => image.currentSrc));
    expect(response.ok()).toBe(true);
    expect(artDistance(await artThumbnail(await response.body()), await artThumbnail(readFileSync(master)))).toBeLessThan(6);
  }
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
  await inspector.getByText('信息来源', { exact: true }).click();
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

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 780, height: 1000 }]) {
  test(`case archive keeps photos, filters and nested return usable at ${size.width}px without loading graph code`, async ({ page }, testInfo) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.setViewportSize(size);
    const state = createDynamicCaseBoardSave();
    state.caseBoard!.nodes.push(...Array.from({ length: 14 }, (_, index) => ({
      ...state.caseBoard!.nodes[0], id: `qa-record-${index}`, title: `现场记录 ${index + 1}`
    })));
    state.caseBoard!.edges.push(...Array.from({ length: 14 }, (_, index) => ({
      ...state.caseBoard!.edges[0], id: `qa-relation-${index}`, from: 'scene-s01', to: `qa-record-${index}`, label: '现场观察', certainty: 'confirmed' as const
    })));
    await gotoWithSave(page, state);
    await page.getByRole('button', { name: '继续游戏' }).click();
    const opener = page.getByRole('button', { name: '资料', exact: true });
    await opener.click();
    const drawer = page.getByRole('dialog', { name: '资料', exact: true });
    const card = drawer.getByRole('button', { name: '人物 伊莎贝拉·摩勒', exact: true });
    await expect(card).toBeVisible();
    await expect.poll(() => card.locator('img').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const scenePhoto = drawer.getByRole('button', { name: '地点 摩勒住宅' }).locator('img');
    await expect.poll(() => scenePhoto.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(scenePhoto).toHaveCSS('object-fit', 'contain');
    await expect(drawer.locator('.react-flow')).toHaveCount(0);
    expect(requests.filter((url) => /CaseBoardFlow|caseBoardLayout|elk-worker/.test(url))).toEqual([]);
    expect(page.workers()).toHaveLength(0);
    await expect(drawer.locator('.case-board-heading')).not.toContainText('0 个');
    const header = drawer.locator(':scope > header');
    const headerTop = (await header.boundingBox())!.y;
    const workspace = drawer.locator('.case-board-workspace');
    await expect.poll(() => workspace.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await workspace.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await header.boundingBox())!.y).toBe(headerTop);
    await expect(drawer.getByRole('button', { name: '关闭资料', exact: true })).toBeInViewport();
    await expect(drawer.getByRole('searchbox', { name: '搜索案件资料' })).toBeInViewport();
    expect(await drawer.evaluate((element) => element.scrollTop)).toBe(0);
    await page.setViewportSize({ width: size.width, height: 300 });
    const search = drawer.getByRole('searchbox', { name: '搜索案件资料' });
    await search.fill('不存在的调查记录');
    await expect(drawer.getByText('当前筛选条件下没有匹配资料。')).toBeVisible();
    await expect(drawer.getByRole('button', { name: '关闭资料', exact: true })).toBeInViewport();
    await drawer.getByRole('button', { name: '清除案件搜索' }).click();
    await expect(search).toHaveValue(''); await expect(search).toBeFocused();
    await page.setViewportSize(size);
    await drawer.getByRole('combobox', { name: '资料类型' }).selectOption('npc');
    await card.click();
    const detail = page.getByRole('dialog', { name: '伊莎贝拉·摩勒详情', exact: true });
    await expect(detail.getByRole('button', { name: '关闭资料详情' })).toBeFocused();
    await expect(detail).not.toContainText(/I0[1-8]|鸦片运输/);
    await expect.poll(() => detail.locator('.record-detail-media img').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(drawer.getByRole('combobox', { name: '资料类型' })).toHaveValue('npc');
    await detail.getByRole('button', { name: '查看摩勒住宅资料' }).click();
    const sceneDetail = page.getByRole('dialog', { name: '摩勒住宅详情', exact: true });
    await expect(sceneDetail.locator('.record-detail-media img')).toHaveCSS('object-fit', 'contain');
    await sceneDetail.getByRole('button', { name: '返回上一份资料' }).click();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: '查看摩勒住宅资料' }).click();
    await page.keyboard.press('Escape'); await expect(detail).toBeVisible();
    await page.setViewportSize({ width: size.width, height: 300 });
    await expect(detail.getByRole('button', { name: '关闭资料详情' })).toBeInViewport();
    await expect(detail.locator('.record-detail-media')).toBeHidden();
    await page.setViewportSize(size);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0); await expect(drawer).toBeVisible(); await expect(card).toBeFocused();
    await expect(drawer.getByRole('combobox', { name: '资料类型' })).toHaveValue('npc');
    await expect(search).toHaveValue('');
    await drawer.getByRole('combobox', { name: '资料类型' }).selectOption('all');
    await drawer.getByRole('tab', { name: '进度' }).click();
    await expect(drawer.getByRole('tabpanel')).not.toContainText(/已发现\s+0\s*\/\s*8/);
    await drawer.getByRole('tab', { name: '案件板' }).click();
    await page.screenshot({ path: testInfo.outputPath('case-archive.png') });
    await drawer.getByRole('button', { name: '关闭资料', exact: true }).click(); await expect(opener).toBeFocused();
  });
}

for (const size of [{ width: 320, height: 568, party: 1 }, { width: 390, height: 844, party: 4 }] as const) {
  test(`fixed phone reference entry tolerates a small pointer drift with ${size.party} player(s)`, async ({ page }, testInfo) => {
    await page.setViewportSize(size); await startNewGame(page, size.party);
    const draft = page.locator('.dock-input'); await draft.fill('打开资料后继续这段行动。');
    const entry = page.getByRole('button', { name: '资料', exact: true });
    const box = (await entry.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 6, { steps: 3 }); await page.mouse.up();
    const drawer = page.getByRole('dialog', { name: '资料', exact: true }); await expect(drawer).toBeVisible();
    await expect(entry).not.toHaveClass(/dragging|draggable/); await expect(entry).toHaveAttribute('title', '资料');
    expect(await entry.evaluate((element) => (element as HTMLElement).style.top)).toBe('');
    await page.screenshot({ path: testInfo.outputPath('fixed-reference-entry.png') });
    await page.keyboard.press('Escape'); await expect(drawer).toBeHidden(); await expect(entry).toBeFocused();
    await expect(draft).toHaveValue('打开资料后继续这段行动。');
    await page.keyboard.press('Enter'); await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape'); await expect(entry).toBeFocused();
  });
}

test('desktop reference drag moves its tab without opening and resets before click or keyboard activation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await startNewGame(page);
  const entry = page.getByRole('button', { name: '资料', exact: true });
  const box = (await entry.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 100, { steps: 10 });
  await expect(entry).toHaveClass(/dragging/); await page.mouse.up();
  const drawer = page.getByRole('dialog', { name: '资料', exact: true }); await expect(drawer).toHaveCount(0);
  await expect(entry).not.toHaveClass(/dragging/);
  expect((await entry.boundingBox())!.y).toBeGreaterThan(box.y + 80);
  await entry.click(); await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape'); await expect(entry).toBeFocused();
  await page.keyboard.press('Space'); await expect(drawer).toBeVisible();
});

test('moving the desktop case board to a phone preserves search and removes the hidden thread filter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWithSave(page, createDynamicCaseBoardSave());
  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.getByRole('button', { name: '资料', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '资料', exact: true });
  await expect(drawer.locator('.react-flow')).toBeVisible();
  await drawer.locator('.case-board-threads button').filter({ hasText: '埃里克·摩勒' }).click();
  await drawer.getByRole('combobox', { name: '资料类型' }).selectOption('npc');
  await drawer.getByRole('searchbox', { name: '搜索案件资料' }).fill('伊莎贝拉');
  await expect(drawer.getByText('当前筛选条件下没有匹配资料。')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(drawer.getByRole('button', { name: '人物 伊莎贝拉·摩勒', exact: true })).toBeVisible();
  await expect(drawer.getByRole('searchbox', { name: '搜索案件资料' })).toHaveValue('伊莎贝拉');
  await expect(drawer.getByRole('combobox', { name: '资料类型' })).toHaveValue('npc');
  await expect(drawer.locator('.react-flow')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer.locator('.case-flow-node.npc', { hasText: '伊莎贝拉·摩勒' })).toBeVisible();
});

for (const size of [{ width: 980, height: 640 }, { width: 1440, height: 900 }]) {
  test(`desktop case camera fits details and filters while restoring the player's view at ${size.width}px`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(size);
    await gotoWithSave(page, createDynamicCaseBoardSave());
    await page.getByRole('button', { name: '继续游戏' }).click();
    await page.getByRole('button', { name: '资料', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '资料', exact: true });
    const graph = drawer.locator('.case-board-flow-wrap');
    const viewport = graph.locator('.react-flow__viewport');
    const view = () => viewport.evaluate((element) => (element as HTMLElement).style.transform);
    const inside = (selector: string) => graph.locator(selector).evaluate((element) => {
      const card = element.getBoundingClientRect();
      const pane = element.closest('.case-board-flow-wrap')!.getBoundingClientRect();
      return card.left >= pane.left + 4 && card.top >= pane.top + 4 && card.right <= pane.right - 4 && card.bottom <= pane.bottom - 4;
    });
    const node = drawer.getByRole('button', { name: '人物 伊莎贝拉·摩勒', exact: true });
    await expect.poll(view).not.toBe('translate(0px, 0px) scale(1)');
    const firstView = await view();
    const zoomOut = drawer.getByRole('button', { name: '缩小关系图', exact: true });
    const tools = drawer.getByRole('group', { name: '关系图视角', exact: true });
    for (const button of await tools.getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await zoomOut.click(); await expect.poll(view).not.toBe(firstView);
    const originalView = await view();
    await node.focus(); await page.keyboard.press('Enter');
    const detail = drawer.getByRole('dialog', { name: '伊莎贝拉·摩勒详情', exact: true });
    await expect(detail).toBeVisible();
    await expect.poll(() => inside('.case-flow-node.npc.selected')).toBe(true);
    await detail.getByRole('button', { name: '查看摩勒住宅资料' }).click();
    const scene = drawer.getByRole('dialog', { name: '摩勒住宅详情', exact: true });
    await expect.poll(() => inside('.case-flow-node.scene.selected')).toBe(true);
    await scene.getByRole('button', { name: '返回上一份资料' }).click();
    await expect(detail).toBeVisible();
    await expect.poll(() => inside('.case-flow-node.npc.selected')).toBe(true);
    await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0);
    await expect.poll(view).toBe(originalView); await expect(node).toBeFocused();
    const paneBox = (await graph.boundingBox())!;
    await page.mouse.move(paneBox.x + 20, paneBox.y + 20);
    await page.mouse.down(); await page.mouse.move(paneBox.x + 180, paneBox.y + 90, { steps: 8 }); await page.mouse.up();
    await expect.poll(view).not.toBe(originalView);
    const pannedView = await view();
    await drawer.getByRole('searchbox', { name: '搜索案件资料' }).focus();
    await viewport.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await view()).toBe(pannedView);
    await drawer.getByRole('button', { name: '查看全部关系', exact: true }).click();
    await expect.poll(() => graph.locator('.case-flow-node').evaluateAll((elements) => elements.every((element) => {
      const card = element.getBoundingClientRect(); const pane = element.closest('.case-board-flow-wrap')!.getBoundingClientRect();
      return card.left >= pane.left && card.top >= pane.top && card.right <= pane.right && card.bottom <= pane.bottom;
    }))).toBe(true);
    await drawer.getByRole('combobox', { name: '资料类型' }).selectOption('npc');
    const search = drawer.getByRole('searchbox', { name: '搜索案件资料' }); await search.fill('伊莎贝拉');
    await expect(graph.locator('.case-flow-node')).toHaveCount(1);
    await expect.poll(() => inside('.case-flow-node.npc')).toBe(true);
    await search.fill('没有这种资料'); await expect(graph.getByText('当前筛选条件下没有匹配资料。')).toBeVisible();
    await search.fill('伊莎贝拉'); await expect(graph.locator('.case-flow-node')).toHaveCount(1);
    await expect.poll(() => inside('.case-flow-node.npc')).toBe(true);
    await node.click();
    await page.setViewportSize({ width: size.width - 40, height: size.height - 30 });
    await expect.poll(() => inside('.case-flow-node.npc.selected')).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('case-camera.png') });
    await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0);
    await expect(search).toHaveValue('伊莎贝拉');
    await expect(drawer.getByRole('combobox', { name: '资料类型' })).toHaveValue('npc');
  });
}

test('desktop case details own Escape while keyboard navigation stays in the enclosing archive', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWithSave(page, createDynamicCaseBoardSave());
  await page.getByRole('button', { name: '继续游戏' }).click();
  const draft = page.locator('.dock-input'); await draft.fill('查看资料时保留这段行动。');
  const opener = page.getByRole('button', { name: '资料', exact: true }); await opener.click();
  const drawer = page.getByRole('dialog', { name: '资料', exact: true });
  const node = drawer.getByRole('button', { name: '人物 伊莎贝拉·摩勒', exact: true });
  await node.focus(); await page.keyboard.press('Enter');
  const detail = drawer.getByRole('dialog', { name: '伊莎贝拉·摩勒详情', exact: true });
  await expect(detail).not.toHaveAttribute('aria-modal', 'true');
  await expect(detail.getByRole('button', { name: '关闭资料详情' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0); await expect(drawer).toBeVisible(); await expect(node).toBeFocused();
  await node.focus(); await page.keyboard.press('Space');
  const search = drawer.getByRole('searchbox', { name: '搜索案件资料' }); await search.focus();
  await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0); await expect(search).toBeFocused();
  await page.keyboard.press('Escape'); await expect(drawer).toBeHidden(); await expect(opener).toBeFocused();
  await expect(draft).toHaveValue('查看资料时保留这段行动。');
});

for (const size of [{ width: 320, height: 568, party: 1 }, { width: 390, height: 844, party: 2 }, { width: 1440, height: 900, party: 4 }] as const) {
  test(`entity record title and close stay fixed above long known information at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size); await startNewGame(page, size.party);
    const draft = page.locator('.dock-input'); await draft.fill('阅读档案不会改变行动。');
    await page.locator('.npc-nameplate').click();
    const detail = page.getByRole('dialog', { name: '伊莎贝拉·摩勒', exact: true });
    await expect.poll(() => detail.locator('.record-detail-media img').evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const header = detail.locator('.entity-detail-header');
    await detail.locator('.entity-detail-known p').first().evaluate((element) => { element.textContent = '长篇公开调查记录，门廊下留有雨水与细微划痕。'.repeat(160); });
    const top = (await header.boundingBox())!.y;
    const body = detail.locator('.entity-detail-body'); await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await header.boundingBox())!.y).toBe(top);
    await expect.poll(() => body.evaluate((element) => element.scrollTop > 0)).toBe(true);
    expect(await detail.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(detail.getByRole('button', { name: '关闭详情', exact: true })).toBeInViewport();
    expect(await detail.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('entity-record.png') });
    if (size.width < 700) {
      await page.setViewportSize({ width: size.width, height: 300 });
      await expect(detail.getByRole('button', { name: '关闭详情', exact: true })).toBeInViewport();
      await expect(detail.locator('.record-detail-media')).toBeHidden();
    }
    await page.keyboard.press('Escape'); await expect(detail).toHaveCount(0); await expect(draft).toHaveValue('阅读档案不会改变行动。');
  });
}

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

for (const width of [320, 390, 562, 1440]) {
  test(`AI configuration repairs the relevant field within its body at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
    await gotoClean(page);
    await page.getByRole('button', { name: 'AI 设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'AI DM 配置' });
    const save = dialog.getByRole('button', { name: '保存', exact: true });
    await dialog.getByLabel('API Key', { exact: true }).fill('ui-qa-only-token');
    await dialog.getByLabel('服务商', { exact: true }).selectOption('custom');
    await dialog.getByLabel('Endpoint').fill('https://ui-qa.example/v1');
    await dialog.getByText('连接设置', { exact: true }).click();
    await save.click();
    const model = dialog.getByLabel('模型');
    await expect(model).toBeFocused(); await expect(model).toHaveAttribute('aria-invalid', 'true');
    await expect(model).toHaveAccessibleDescription('请填写模型名。');
    await expect(dialog.locator('.api-connection')).not.toHaveAttribute('open');
    await save.click(); await expect(model).toBeFocused();
    await page.setViewportSize({ width, height: 300 });
    const verify = async (field: string) => {
      await expect.poll(() => dialog.evaluate((element, id) => {
        const body = element.querySelector('.api-config-fields')!.getBoundingClientRect();
        const target = element.querySelector<HTMLElement>(`#${id}`)!;
        const input = target.getBoundingClientRect();
        const error = element.querySelector('[role="alert"]')!.getBoundingClientRect();
        const footer = element.querySelector('footer')!.getBoundingClientRect();
        const header = element.querySelector('.api-config-header')!.getBoundingClientRect();
        return input.top >= body.top && input.bottom <= body.bottom && error.top >= body.top && error.bottom <= body.bottom
          && footer.top >= body.bottom && footer.bottom <= innerHeight && header.top >= 0 && header.bottom <= body.top
          && element.scrollTop === 0 && target.contains(document.elementFromPoint(input.x + input.width / 2, input.y + input.height / 2));
      }, field)).toBe(true);
      await expect(dialog.getByRole('button', { name: '关闭 AI DM 配置' })).toBeInViewport();
      expect(await dialog.locator('label, summary, footer button, [role="alert"]').evaluateAll(elements => elements.every(element => parseFloat(getComputedStyle(element).fontSize) >= 15))).toBe(true);
    };
    await verify('api-model');
    await model.fill('ui-qa-model'); await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByText('连接设置', { exact: true }).click();
    const endpoint = dialog.getByLabel('Endpoint');
    await endpoint.fill('bad-address');
    await dialog.getByText('连接设置', { exact: true }).click();
    await save.click();
    await expect(endpoint).toBeFocused(); await expect(dialog.locator('.api-connection')).toHaveAttribute('open');
    await expect(endpoint).toHaveAccessibleDescription('请输入完整的 HTTP(S) 服务地址。');
    await verify('api-endpoint');
    await page.screenshot({ path: testInfo.outputPath('api-repair-short.png') });
    await expect(model).toHaveValue('ui-qa-model');
    await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('ui-qa-only-token');
    await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute('type', 'password');
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

for (const scenario of [
  { width: 320, height: 568, partySize: 1 as const },
  { width: 390, height: 844, partySize: 4 as const },
  { width: 1440, height: 900, partySize: 2 as const }
]) {
  test(`current investigation resumes drafts and survives cancelled selection at ${scenario.width}px with ${scenario.partySize} players`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario);
    await startNewGame(page, scenario.partySize);
    const names = ['亨利·格雷', '艾达·华莱士', '托马斯·贝尔', '罗伯特·肖'];
    for (let i = 0; i < scenario.partySize - 1; i++) {
      await page.getByRole('textbox', { name: `${names[i]}的行动` }).fill(`${names[i]}先记录门廊的痕迹。`);
      await page.getByRole('button', { name: '下一位', exact: true }).click();
    }
    const actor = names[scenario.partySize - 1];
    const input = page.getByRole('textbox', { name: `${actor}的行动` });
    await input.fill('保存时的旧草稿。');
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '保存游戏', exact: true }).click();
    const savedLibrary = await page.evaluate(() => localStorage.getItem('trpg-saves-v2'));
    const draft = '当前的草稿。\n先记下日期，再查看窗框。';
    await input.fill(draft);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    const resume = page.getByRole('button', { name: '继续游戏', exact: true });
    const preview = page.getByRole('region', { name: '继续调查摘要' });
    await expect(preview).toContainText('当前调查'); await expect(preview).toContainText('摩勒住宅');
    for (let i = 0; i < scenario.partySize; i++) await expect(preview).toContainText(names[i]);
    await expect(resume).toHaveClass('primary-btn'); await expect(resume).toBeFocused();
    expect(await page.locator('.title-actions > button').first().innerText()).toBe('继续游戏');
    expect(await page.evaluate(() => localStorage.getItem('trpg-saves-v2'))).toBe(savedLibrary);
    expect(await preview.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await expect(resume).toBeInViewport(); await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('current-investigation-title.png') });
    if (scenario.width < 700) {
      await page.setViewportSize({ width: scenario.width, height: 300 });
      await expect(resume).toBeInViewport();
      expect(await page.locator('.title-content').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
      await page.setViewportSize(scenario);
    }
    await resume.click(); await expect(input).toHaveValue(draft);
    expect(await page.locator('.party-compact').count()).toBe(scenario.partySize);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await resume.click(); await expect(input).toHaveValue(draft);
    await expect(page.locator('.party-compact.active strong')).toHaveText(actor);
    await expect(page.locator('.party-compact.acted')).toHaveCount(scenario.partySize - 1);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '重新开始', exact: true }).click();
    await page.getByRole('button', { name: '进入游戏', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('');
    await expect(page.locator('.party-compact')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('trpg-saves-v2'))).toBe(savedLibrary);
  });
}

test('saving a game enables continuing the latest save after reloading the title screen', async ({ page }) => {
  await startNewGame(page);

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /保存游戏/ }).click();
  await expect(page.getByText('已保存')).toBeVisible();

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /返回首页/ }).click();

  await expect(page.getByRole('heading', { name: '雾中消逝' })).toBeVisible();
  await expect(page.getByRole('region', { name: '继续调查摘要' })).toContainText('当前调查');
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeEnabled();

  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.locator('.game-screen')).toBeVisible();
  await expect(page.getByPlaceholder('亨利·格雷 想要做什么...')).toBeVisible();
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  // Web navigation keeps a live checkpoint only for this page; a fresh page uses the explicit manual save.
  const reopened = await page.context().newPage();
  try {
    // This page has no gotoClean init script that erases localStorage on navigation.
    await reopened.goto('/');
    await expect(reopened.getByRole('region', { name: '继续调查摘要' })).toContainText('最近存档');
    await reopened.getByRole('button', { name: '继续游戏', exact: true }).click();
    await expect(reopened.getByRole('textbox', { name: '亨利·格雷的行动' })).toBeVisible();
  } finally { await reopened.close(); }
});

for (const party of [1, 2, 4] as const) {
  test(`pre-update portrait URLs recover every ${party}-player investigator without resetting their save`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startNewGame(page, party);
    await page.getByRole('textbox', { name: '亨利·格雷的行动' }).fill('先记录门廊\n再询问访客');
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '保存游戏', exact: true }).click();
    const state = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('trpg-saves-v2')!)[0].gameState;
      saved.players.forEach((player: { portrait: string }, index: number) => { player.portrait = `/assets/${String(index + 1).padStart(16, '0')}-oldBuild.webp`; });
      saved.players[0].currentHp = 9; saved.players[0].currentSan = 53;
      return saved;
    }) as GameState;
    await gotoWithSave(page, state);
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('先记录门廊\n再询问访客');
    await expect.poll(() => page.locator('.dock-actor-avatar img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: '查看亨利·格雷的属性', exact: true }).click();
    const sheet = page.locator('.investigator-sheet');
    await expect(sheet.locator('[data-stat="hp"] dd')).toHaveText('9 / 12');
    await expect(sheet.locator('[data-stat="san"] dd')).toHaveText('53 / 60');
    const portraitFiles: Record<string, string> = { inspector: 'henry_gray', nurse: 'ada_wallace', reporter: 'thomas_bell', constable: 'robert_shaw' };
    for (const player of state.players) {
      if (party > 1) await sheet.getByRole('button', { name: player.name, exact: true }).click();
      await expect.poll(() => sheet.locator('.investigator-portrait img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      const response = await page.request.get(await sheet.locator('.investigator-portrait img').evaluate((image: HTMLImageElement) => image.currentSrc));
      expect(response.ok()).toBe(true);
      const file = portraitFiles[player.id];
      expect(artDistance(await artThumbnail(await response.body()), await artThumbnail(readFileSync(`assets/investigators/${file}.png`)))).toBeLessThan(6);
    }
    await sheet.getByRole('button', { name: '关闭调查员档案' }).click();
    await expect(page.getByRole('textbox', { name: '亨利·格雷的行动' })).toHaveValue('先记录门廊\n再询问访客');
  });
}

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
  await expect(page.getByRole('button', { name: '保留存档' })).toBeFocused();
  await page.getByRole('button', { name: '保留存档' }).click();
  await expect(saveManager.getByText('摩勒住宅')).toBeVisible();
  await page.getByRole('button', { name: /删除存档/ }).click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('dialog', { name: '存档管理' }).getByText('暂无存档')).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
});

for (const size of [{ width: 320, height: 568, party: 4 as const }, { width: 390, height: 844, party: 2 as const }, { width: 1440, height: 900, party: 1 as const }]) {
  test(`save records scroll independently and confirm deletion at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await startNewGame(page, size.party);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '保存游戏', exact: true }).click();
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('trpg-saves-v2')!)[0];
      localStorage.setItem('trpg-saves-v2', JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ ...saved, id: saved.id - index, savedAt: `2026/10/8 12:00:${String(59 - index).padStart(2, '0')}` }))));
    });
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '存档管理', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '存档管理' });
    await expect(dialog.getByRole('article')).toHaveCount(12);
    await expect(dialog.getByText('最近保存', { exact: true })).toHaveCount(1);
    const last = dialog.getByRole('article').last();
    await last.getByRole('button', { name: /^删除存档/ }).click();
    await expect(last.getByRole('button', { name: '保留存档' })).toBeFocused();
    async function verifyLayout() {
      const layout = await dialog.evaluate((element) => {
        const card = element.getBoundingClientRect(), header = element.querySelector('header')!.getBoundingClientRect();
        const list = element.querySelector('.save-list')!.getBoundingClientRect(), footer = element.querySelector('footer')!.getBoundingClientRect();
        const button = element.querySelector('.save-delete-confirmation .danger')!.getBoundingClientRect();
        const center = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
        return { inside: card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight,
          ordered: header.bottom <= list.top + 1 && list.bottom <= footer.top + 1,
          reachable: button.top >= list.top && button.bottom <= list.bottom + 1 && !!center?.closest('.save-delete-confirmation'),
          touch: button.height >= 44, horizontalOverflow: element.scrollWidth > element.clientWidth };
      });
      expect(layout).toEqual({ inside: true, ordered: true, reachable: true, touch: true, horizontalOverflow: false });
    }
    await verifyLayout();
    await page.screenshot({ path: testInfo.outputPath('save-records-confirmation.png') });
    if (size.width < 700) {
      await page.setViewportSize({ width: size.width, height: 300 });
      // Refocus the confirmation after reducing the usable viewport.
      await last.getByRole('button', { name: '保留存档' }).click();
      await last.getByRole('button', { name: /^删除存档/ }).click();
      await verifyLayout();
    }
    await last.getByRole('button', { name: '确认删除' }).click();
    await expect(dialog.getByRole('article')).toHaveCount(11);
    await expect(dialog.getByRole('article').last().getByRole('button', { name: '载入存档' })).toBeFocused();
    await page.setViewportSize({ width: size.width, height: size.height });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('button', { name: '菜单', exact: true })).toBeFocused();
  });
}

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
  await expect(page.getByRole('region', { name: '继续调查摘要' })).toHaveCount(0);
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
