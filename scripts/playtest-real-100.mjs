import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const root = resolve(import.meta.dirname, '..');
const targetTurns = Math.max(1, Number(process.env.PLAYTEST_TURNS ?? 100));
const endingTargets = (process.env.PLAYTEST_ENDINGS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const endingMode = endingTargets.length > 0;
const outputDir = resolve(
  root,
  process.env.PLAYTEST_OUTPUT ?? (endingMode
    ? 'test-results/playtest-to-endings'
    : `test-results/playtest-${targetTurns}`)
);
const resumeFromTurn = Math.max(0, Number(process.env.PLAYTEST_RESUME_FROM ?? 0));
const baseUrl = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:4173';
const backgroundSettleMs = Math.max(0, Number(process.env.PLAYTEST_BACKGROUND_SETTLE_MS ?? 2_500));
const checkpoints = new Set([10, 25, 50, 75, 100, 125, 150, 175, 200, 250, 500, 750, 1000]
  .filter((turn) => turn <= targetTurns));
checkpoints.add(targetTurns);
const world = parseYaml(readFileSync(resolve(root, 'scenarios/wuzhongxiaoshi/world.yaml'), 'utf8'));
const scenarioNpcs = world.npcs.map((npc) => ({
  id: npc.id,
  name: npc.name,
  aliases: Array.isArray(npc.aliases) ? npc.aliases : []
}));

if (!resumeFromTurn) rmSync(outputDir, { recursive: true, force: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

const metricsPath = join(outputDir, 'run-metrics.json');
const metrics = resumeFromTurn ? JSON.parse(readFileSync(metricsPath, 'utf8')) : [];
if (metrics.length !== resumeFromTurn) {
  throw new Error(`断点回合与已有指标不一致：resume=${resumeFromTurn}, metrics=${metrics.length}`);
}
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const issues = [];
const browserLogs = [];
let runNumber = resumeFromTurn
  ? Math.max(0, ...metrics.map((item) => item.run)) + 1
  : 1;
let runTurn = 0;
let lastScene = '';
let sceneTurn = 0;
const reportedIssueKeys = new Set();
const completedEndingIds = new Set(
  metrics.flatMap((item) => item.endingId ? [item.endingId] : [])
);
let currentRouteTarget = endingTargets.find((endingId) => !completedEndingIds.has(endingId)) ?? null;
let stopRequested = false;
let fatalError = null;

process.once('SIGINT', () => {
  stopRequested = true;
  console.log('[playtest] received SIGINT; stopping after the current browser operation');
});

page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    browserLogs.push({ at: new Date().toISOString(), type: message.type(), text: message.text().slice(0, 1200) });
  }
});
page.on('requestfailed', (request) => {
  browserLogs.push({ at: new Date().toISOString(), type: 'requestfailed', text: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}` });
});
page.on('response', (response) => {
  if (response.status() >= 400) browserLogs.push({ at: new Date().toISOString(), type: 'http', text: `${response.status()} ${response.url()}` });
});

async function startNewGame(first = false) {
  if (first) {
    await page.addInitScript((forceSuccess) => {
      localStorage.clear();
      if (forceSuccess) {
        let sequence = 0;
        Math.random = () => ((sequence++ % 50) + 1) / 10_000;
      }
    }, process.env.PLAYTEST_FORCE_SUCCESS === '1');
    await page.goto(baseUrl);
    await page.getByRole('button', { name: /开始游戏/ }).click();
  } else {
    await page.getByRole('button', { name: /菜单/ }).click();
    await page.getByRole('button', { name: /重新开始/ }).click();
  }
  await page.getByRole('button', { name: /进入游戏/ }).click();
  await page.locator('.game-screen').waitFor();
  runTurn = 0;
  lastScene = '';
  sceneTurn = 0;
}

function actionsFor(scene, turn, routeTarget) {
  if (scene.includes('摩勒住宅')) {
    const cycle = [
      ['接受伊莎贝拉的委托，确认埃里克失踪日期与常去地点。', '安抚伊莎贝拉，并记录警方无进展及老赫特酒吧线索。'],
      ['仔细检查书桌右侧抽屉，寻找埃里克与蒙特利尔的旧合影。', '协助辨认合影人物，并询问蒙特利尔与埃里克的关系。'],
      ['检查书架夹缝中的小册子，观察夹页是否有隐写痕迹。', '用安全加热和医学知识分析小册子夹页，寻找地址信息。'],
      ['根据贝尔街14号的线索，明确前往卡森其药店继续调查。', '与亨利一起离开住宅，前往贝尔街14号卡森其药店。']
    ];
    return cycle[(turn - 1) % cycle.length];
  }
  if (scene.includes('第二分局')) {
    return turn % 2
      ? ['出示合影并质询蒙特利尔与埃里克的关系，观察他的反应。', '用心理学观察蒙特利尔是否回避关键问题。']
      : ['结束质询，依据贝尔街线索前往卡森其药店。', '与亨利一起离开警局，前往贝尔街14号。'];
  }
  if (scene.includes('老赫特')) {
    return turn % 2
      ? ['请酒保喝一杯并说明正在寻找埃里克，询问“老鼠”和贝尔街的消息。', '以可信理由说服酒保透露卡森其药店的方向。']
      : ['根据酒保提供的贝尔街线索前往卡森其药店。', '与亨利一起去贝尔街14号调查废弃药店。'];
  }
  if (scene.includes('卡森其')) {
    return turn % 2
      ? ['进入药店后厅，检查油布包和潮湿地图，确认扶桑花号泊位。', '观察浓雾和撤离痕迹，收集地图笔记并照顾同伴。']
      : ['依据地图笔记立即前往泰晤士港的扶桑花号。', '与亨利一起赶往地图标注的偏僻泊位。'];
  }
  if (scene.includes('扶桑花号') || scene.includes('泰晤士港')) {
    const routeCycles = {
      END_C: [
        ['暂缓攻击，明确选择交涉路线并要求深潜者说明诉求。', '保持戒备，协助亨利尝试和平交涉。'],
        ['专注聆听深潜者的语调和重复词，理解它们真正的诉求。', '记录声调规律，协助完成聆听判断。'],
        ['在理解诉求后说服深潜者释放埃里克并和平离港。', '提出双方都可接受的条件，协助说服。'],
        ['继续以已知诉求为基础争取释放埃里克，不发动攻击。', '补充可执行的交换条件，维持和平交涉。']
      ],
      END_A: [
        ['明确选择战斗路线，阻止深潜者带走埃里克。', '寻找掩护并协助亨利投入战斗。'],
        ['集中攻击一名仍在抵抗的深潜者，确认其失去战斗能力。', '协助攻击同一目标并保护埃里克。'],
        ['继续攻击剩余深潜者，逐一确认敌方是否仍能作战。', '利用医疗知识判断倒地敌人并掩护亨利。'],
        ['在逃脱时钟耗尽前击败最后的深潜者并救出埃里克。', '协助控制甲板，确保埃里克安全获救。']
      ],
      END_B: [
        ['明确选择战斗路线，阻止深潜者带走埃里克。', '寻找掩护并协助亨利投入冲突。'],
        ['守住当前位置并观察船员收缆进度，暂不冒险突进。', '照看同伴并留意扶桑花号离港迹象。'],
        ['继续拖延并寻找安全接近埃里克的机会。', '维持掩护，记录逃脱时钟的变化。']
      ]
    };
    const cycle = routeCycles[routeTarget] ?? [
      ...routeCycles.END_C,
      ...routeCycles.END_A
    ];
    return cycle[(turn - 1) % cycle.length];
  }
  return ['根据当前已知线索继续正式调查。', '协助亨利核对证据并推进当前目标。'];
}

async function waitForAi(startDmCount, startSystemCount) {
  const outcome = await page.waitForFunction(
    ({ dmCount, systemCount }) => {
      if (document.querySelector('.thinking-line')) return null;
      if (document.querySelectorAll('.story-message.dm').length > dmCount) return 'dm';
      const systemMessages = Array.from(document.querySelectorAll('.story-message.system'));
      if (systemMessages.length <= systemCount) return null;
      const latest = systemMessages.at(-1)?.textContent ?? '';
      return /AI DM (?:连接|返回)/.test(latest) ? latest.trim() : null;
    },
    { dmCount: startDmCount, systemCount: startSystemCount },
    { timeout: 185_000 }
  );
  const value = await outcome.jsonValue();
  if (value !== 'dm') throw new Error(String(value));
}

async function waitForRollResolution(startDmCount, startSystemCount) {
  const outcome = await page.waitForFunction(
    ({ dmCount, systemCount }) => {
      const systemMessages = Array.from(document.querySelectorAll('.story-message.system'));
      if (systemMessages.length > systemCount) {
        const latest = systemMessages.at(-1)?.textContent ?? '';
        if (/AI DM (?:连接|返回)/.test(latest)) return latest.trim();
      }
      if (document.querySelector('.ending-dock')) return 'ending';
      const checkCard = document.querySelector('.check-card');
      const rollButton = checkCard
        ? Array.from(checkCard.querySelectorAll('button')).find((button) => /掷骰/.test(button.textContent ?? ''))
        : null;
      if (systemMessages.length > systemCount && rollButton && !rollButton.disabled) return 'check';
      if (document.querySelector('.thinking-line')) return null;
      if (document.querySelectorAll('.story-message.dm').length > dmCount) return 'dm';
      return null;
    },
    { dmCount: startDmCount, systemCount: startSystemCount },
    { timeout: 185_000 }
  );
  const value = await outcome.jsonValue();
  if (!['dm', 'check', 'ending'].includes(value)) throw new Error(String(value));
  return value;
}

async function resolveChecks(checks, context) {
  for (let guard = 0; guard < 6; guard += 1) {
    const card = page.locator('.check-card');
    if (!await card.isVisible().catch(() => false)) break;
    const request = (await card.innerText()).replace(/\s+/g, ' ').trim();
    if (/阈值\s*-/.test(request)) {
      reportIssue({
        severity: 'P1',
        turn: context.globalTurn,
        run: context.run,
        scene: context.scene,
        observation: `规则引擎发起的检定没有计算技能阈值：${request}`,
        evidence: `run-metrics.json#turn-${context.globalTurn}`
      }, `missing-check-threshold:${context.run}:${request}`);
    }
    const dmCount = await page.locator('.story-message.dm').count();
    const systemCount = await page.locator('.story-message.system').count();
    await card.getByRole('button', { name: /掷骰/ }).click();
    const resolution = await waitForRollResolution(dmCount, systemCount);
    const newSystemMessages = await page.locator('.story-message.system').evaluateAll(
      (items, start) => items.slice(start).map((item) => (item.textContent ?? '').replace(/\s+/g, ' ').trim()),
      systemCount
    );
    checks.push({
      request,
      result: newSystemMessages.find((text) => /^检定结果[：:]/.test(text)) ?? null,
      resolution
    });
    const recorded = checks.at(-1);
    const threshold = Number(/阈值\s*(\d+)/.exec(request)?.[1]);
    const roll = Number(/[（(](\d+)[）)]/.exec(recorded.result ?? '')?.[1]);
    const failed = /(?:大)?失败/.test(recorded.result ?? '');
    if (Number.isFinite(threshold) && Number.isFinite(roll)
      && ((roll > threshold && !failed) || (roll <= threshold && failed && roll < 96))) {
      reportIssue({
        severity: 'P1',
        turn: context.globalTurn,
        run: context.run,
        scene: context.scene,
        observation: `检定结果与难度阈值矛盾：阈值 ${threshold}，掷出 ${roll}，结果为 ${recorded.result}`,
        evidence: `run-metrics.json#turn-${context.globalTurn}`
      }, `check-threshold-mismatch:${context.run}:${context.globalTurn}:${request}:${recorded.result}`);
    }
    if (resolution === 'ending') break;
  }
  if (await page.locator('.check-card').isVisible().catch(() => false)) {
    throw new Error('同一正式回合连续检定超过6次，视为不可操作状态');
  }
  const skills = checks.map((check) =>
    check.request.match(/·\s*(.+?)\s+(?:普通|困难|极难)难度/)?.[1] ?? check.request
  );
  const repeatedSkill = skills.find((skill, index) => skills.indexOf(skill) !== index);
  if (repeatedSkill) {
    reportIssue({
      severity: 'P1',
      turn: context.globalTurn,
      run: context.run,
      scene: context.scene,
      observation: `同一组玩家行动被重复要求进行${repeatedSkill}检定。`,
      evidence: `run-metrics.json#turn-${context.globalTurn}`
    }, `duplicate-check:${context.run}:${context.globalTurn}:${repeatedSkill}`);
  }
}

function reportIssue(issue, key) {
  if (reportedIssueKeys.has(key)) return;
  reportedIssueKeys.add(key);
  issues.push(issue);
}

for (const item of metrics) {
  for (const npcName of item.missingMentionedNpcNames ?? []) {
    reportIssue({
      severity: 'P1', turn: item.turn, run: item.run, scene: item.sceneAfter,
      observation: `模组人物“${npcName}”已在玩家行动或 DM 叙事中明确出现，但案件板没有人物节点。`,
      evidence: `run-metrics.json#turn-${item.turn}`
    }, `missing-npc:${item.run}:${npcName}`);
  }
  if ((item.attempts ?? 1) > 1) {
    reportIssue({
      severity: 'P2', turn: item.turn, run: item.run, scene: item.sceneBefore,
      observation: `AI 请求失败后自动重试并在第 ${item.attempts} 次成功。`,
      evidence: `run-metrics.json#turn-${item.turn}`
    }, `request-recovered:${item.turn}`);
  }
}

function mentionedScenarioNpcs(...texts) {
  const haystack = texts.filter(Boolean).join('\n');
  return scenarioNpcs.filter((npc) => [npc.name, ...npc.aliases].some((term) => haystack.includes(term)));
}

async function readCaseBoard() {
  await page.getByTitle('资料（可拖拽）').click();
  const drawer = page.locator('.info-drawer-react');
  await page.waitForFunction(() => document.querySelector('.info-drawer-react')?.classList.contains('open'));
  await page.getByRole('button', { name: '案件板' }).click();
  await drawer.locator('.case-board-view').waitFor({ state: 'visible' });
  const nodes = await page.locator('.case-flow-node').evaluateAll((items) => items.map((item) => ({
    type: ['npc', 'scene', 'item', 'event', 'theory'].find((type) => item.classList.contains(type)) ?? 'unknown',
    text: (item.textContent ?? '').replace(/\s+/g, ' ').trim()
  })));
  await page.getByRole('button', { name: '关闭资料' }).click();
  return {
    nodes,
    npcNames: scenarioNpcs.filter((npc) => nodes.some((node) =>
      node.type === 'npc' && node.text.includes(npc.name)
    )).map((npc) => npc.name)
  };
}

async function saveCheckpoint(turn, captureScreenshot = true) {
  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /保存游戏/ }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('trpg-saves-v2') || '[]')[0] ?? null);
  const progress = saved?.gameState?.scenarioProgress;
  metrics.at(-1).checkpoint = progress ? {
    moduleId: progress.moduleId,
    moduleVersion: progress.moduleVersion,
    contentHash: progress.contentHash,
    worldTime: progress.worldTime,
    activeActId: progress.activeActId,
    beatStates: progress.beatStates,
    objectiveStates: progress.objectiveStates,
    knownFactIds: progress.knownFactIds,
    clueStates: progress.clueStates,
    firedEventIds: progress.firedEventIds,
    settledEndingIds: progress.settledEndingIds,
    variables: progress.variables,
    clocks: progress.clocks,
    encounters: progress.encounters,
    lastCheckOutcomes: progress.lastCheckOutcomes,
    idleTurns: progress.idleTurns,
    endingId: progress.endingId
  } : null;
  if (captureScreenshot) {
    await page.screenshot({ path: join(outputDir, 'screenshots', `turn-${String(turn).padStart(3, '0')}.png`), fullPage: true });
  }
  return saved?.gameState ?? null;
}

async function verifyLatestSave(expectedScene, expectedWorldTime, turn) {
  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /读取存档/ }).click();
  await page.locator('.game-screen').waitFor();
  const restoredScene = (await page.locator('.brand-scene').innerText()).trim();
  const restoredWorldTime = (await page.locator('.world-time').innerText()).trim();
  if (restoredScene !== expectedScene || restoredWorldTime !== expectedWorldTime) {
    reportIssue({
      severity: 'P0', turn, run: runNumber, scene: restoredScene,
      observation: `读取最新存档后状态不一致：预期 ${expectedScene} ${expectedWorldTime}，实际 ${restoredScene} ${restoredWorldTime}`,
      evidence: `turn-${String(turn).padStart(3, '0')}.png`
    }, `save-load-mismatch:${turn}`);
  }
}

try {
  await startNewGame(true);
  for (let globalTurn = resumeFromTurn + 1; globalTurn <= targetTurns; globalTurn += 1) {
    if (stopRequested) break;
    if (await page.locator('.ending-dock').isVisible().catch(() => false)) {
      const ending = (await page.locator('.ending-dock').innerText()).replace(/\s+/g, ' ').trim();
      metrics.at(-1).runEnding = ending;
      const endingId = metrics.at(-1).endingId ?? metrics.at(-1).checkpoint?.endingId ?? null;
      if (endingId) completedEndingIds.add(endingId);
      if (endingMode && endingTargets.every((target) => completedEndingIds.has(target))) break;
      runNumber += 1;
      currentRouteTarget = endingTargets.find((target) => !completedEndingIds.has(target)) ?? null;
      await startNewGame(false);
    }
    runTurn += 1;
    const sceneBefore = (await page.locator('.brand-scene').innerText()).trim();
    sceneTurn = sceneBefore === lastScene ? sceneTurn + 1 : 1;
    lastScene = sceneBefore;
    const actBefore = (await page.locator('.brand-title').innerText()).trim();
    const worldTimeBefore = (await page.locator('.world-time').innerText()).trim();
    const [henryAction, adaAction] = actionsFor(sceneBefore, sceneTurn, currentRouteTarget);
    const startedAt = Date.now();
    const checks = [];
    let attempts = 0;
    for (; attempts < 3; attempts += 1) {
      const dmCount = await page.locator('.story-message.dm').count();
      const systemCount = await page.locator('.story-message.system').count();
      try {
        await page.getByPlaceholder('亨利·格雷 想要做什么...').fill(henryAction);
        await page.getByRole('button', { name: '下一位' }).click();
        await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill(adaAction);
        await page.getByRole('button', { name: '提交' }).click();
        await waitForAi(dmCount, systemCount);
        await resolveChecks(checks, { globalTurn, run: runNumber, scene: sceneBefore });
        break;
      } catch (error) {
        const finalAttempt = attempts >= 2;
        const evidence = `failure-turn-${String(globalTurn).padStart(3, '0')}-attempt-${attempts + 1}.png`;
        await page.screenshot({ path: join(outputDir, 'screenshots', evidence), fullPage: true });
        reportIssue({
          severity: finalAttempt ? 'P0' : 'P2',
          turn: globalTurn,
          run: runNumber,
          scene: sceneBefore,
          observation: finalAttempt ? '同一回合连续三次无法取得 DM 回复。' : 'AI 请求失败后自动重试。',
          error: String(error),
          evidence
        }, `request-failure:${globalTurn}:${attempts + 1}`);
        if (finalAttempt) throw error;
        await page.waitForTimeout(1_000);
      }
    }
    const durationMs = Date.now() - startedAt;
    const sceneAfter = (await page.locator('.brand-scene').innerText()).trim();
    const actAfter = (await page.locator('.brand-title').innerText()).trim();
    const worldTimeAfter = (await page.locator('.world-time').innerText()).trim();
    const narratives = await page.locator('.story-message.dm p').allInnerTexts().catch(() => []);
    const narrative = narratives.at(-1)?.replace(/\s+/g, ' ').trim() ?? '';
    if (backgroundSettleMs) await page.waitForTimeout(backgroundSettleMs);
    const caseBoard = await readCaseBoard();
    const mentionedNpcs = mentionedScenarioNpcs(narrative);
    const missingMentionedNpcs = mentionedNpcs
      .filter((npc) => !caseBoard.npcNames.includes(npc.name))
      .map((npc) => npc.name);
    const ending = await page.locator('.ending-dock').isVisible().catch(() => false)
      ? (await page.locator('.ending-dock').innerText()).replace(/\s+/g, ' ').trim()
      : null;
    metrics.push({
      turn: globalTurn, run: runNumber, runTurn, henryAction, adaAction,
      sceneBefore, sceneAfter, actBefore, actAfter, worldTimeBefore, worldTimeAfter,
      checks, durationMs, narrative, ending,
      routeTarget: currentRouteTarget,
      attempts: attempts + 1,
      mentionedNpcNames: mentionedNpcs.map((npc) => npc.name),
      missingMentionedNpcNames: missingMentionedNpcs,
      caseBoard
    });
    for (const npcName of missingMentionedNpcs) {
      reportIssue({
        severity: 'P1',
        turn: globalTurn,
        run: runNumber,
        scene: sceneAfter,
        observation: `模组人物“${npcName}”已在玩家行动或 DM 叙事中明确出现，但案件板没有人物节点。`,
        evidence: `run-metrics.json#turn-${globalTurn}`
      }, `missing-npc:${runNumber}:${npcName}`);
    }
    if (sceneBefore === sceneAfter && runTurn >= 8 && sceneBefore.includes('摩勒住宅')) {
      reportIssue(
        { severity: 'P1', turn: globalTurn, run: runNumber, scene: sceneAfter, observation: '连续正式行动后仍停留在摩勒住宅，需核对事件工具调用与fail-forward。' },
        `stalled-residence:${runNumber}`
      );
    }
    const shouldCapture = checkpoints.has(globalTurn) || sceneBefore !== sceneAfter || Boolean(ending);
    const savedState = endingMode || checkpoints.has(globalTurn)
      ? await saveCheckpoint(globalTurn, shouldCapture)
      : null;
    const progress = savedState?.scenarioProgress;
    if (progress) {
      metrics.at(-1).endingId = progress.endingId;
      if (progress.endingId) completedEndingIds.add(progress.endingId);
      if (progress.endingId === 'END_A' && progress.encounters?.ENC01?.opponentHp > 0) {
        reportIssue({
          severity: 'P1', turn: globalTurn, run: runNumber, scene: sceneAfter,
          observation: `战斗胜利时敌方结构化 HP 仍为 ${progress.encounters.ENC01.opponentHp}，胜利没有由遭遇状态支撑。`,
          evidence: `run-metrics.json#turn-${globalTurn}`
        }, `combat-win-positive-hp:${runNumber}`);
      }
      const activeEndingClocks = progress.endingId
        ? Object.entries(progress.clocks ?? {}).filter(([, clock]) => clock.active).map(([id]) => id)
        : [];
      if (activeEndingClocks.length) {
        reportIssue({
          severity: 'P1', turn: globalTurn, run: runNumber, scene: sceneAfter,
          observation: `进入结局后仍有活动时钟：${activeEndingClocks.join('、')}`,
          evidence: `run-metrics.json#turn-${globalTurn}`
        }, `active-clock-after-ending:${runNumber}:${activeEndingClocks.join(',')}`);
      }
      const completedBeatsWithOpenRequiredObjectives = Object.entries(progress.beatStates)
        .filter(([, status]) => status === 'completed')
        .flatMap(([beatId]) => {
          const beatObjectives = {
            B01: ['O01'], B02: ['O02'], B03: [], B04: [], B05: ['O05'], B06: ['O06']
          }[beatId] ?? [];
          return beatObjectives.filter((objectiveId) => progress.objectiveStates?.[objectiveId] !== 'completed');
        });
      if (completedBeatsWithOpenRequiredObjectives.length) {
        reportIssue({
          severity: 'P1', turn: globalTurn, run: runNumber, scene: sceneAfter,
          observation: `已完成剧情节点仍有未完成必需目标：${completedBeatsWithOpenRequiredObjectives.join('、')}`,
          evidence: `run-metrics.json#turn-${globalTurn}`
        }, `beat-objective-mismatch:${runNumber}:${completedBeatsWithOpenRequiredObjectives.join(',')}`);
      }
      if (Boolean(progress.endingId) !== Boolean(ending)) {
        reportIssue({
          severity: 'P0', turn: globalTurn, run: runNumber, scene: sceneAfter,
          observation: `结构化结局与界面锁定不同步：state=${progress.endingId ?? 'null'}，ui=${ending ?? 'null'}`,
          evidence: `run-metrics.json#turn-${globalTurn}`
        }, `ending-ui-mismatch:${runNumber}:${globalTurn}`);
      }
    }
    if (checkpoints.has(globalTurn) && savedState && !ending) {
      await verifyLatestSave(sceneAfter, worldTimeAfter, globalTurn);
    }
    writeFileSync(join(outputDir, 'run-metrics.json'), JSON.stringify(metrics, null, 2));
    if (globalTurn === 1 || globalTurn % 5 === 0 || globalTurn === targetTurns) {
      console.log(`[playtest] ${globalTurn}/${targetTurns} turn(s), run ${runNumber}, scene ${sceneAfter}, issues ${issues.length}`);
    }
  }
} catch (error) {
  fatalError = error;
  browserLogs.push({ at: new Date().toISOString(), type: 'fatal', text: String(error) });
} finally {
  await browser.close();
  writeFileSync(join(outputDir, 'browser-log.json'), JSON.stringify(browserLogs, null, 2));
  writeFileSync(join(outputDir, 'issues.json'), JSON.stringify(issues, null, 2));
}

const durations = metrics.map((item) => item.durationMs).sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] ?? 0;
const endings = metrics.filter((item) => item.ending).map((item) => ({ turn: item.turn, run: item.run, ending: item.ending }));
const completedTargets = endingTargets.filter((endingId) => completedEndingIds.has(endingId));
const summary = `# 真实 MiMo ${endingMode ? '完整局结局覆盖' : `${targetTurns} 回合`}测试摘要

- 完成 DM 回合：${metrics.length} / 上限 ${targetTurns}
- 独立游戏局数：${Math.max(1, ...metrics.map((item) => item.run))}
- 目标结局：${endingTargets.join('、') || '未指定'}
- 已覆盖目标结局：${completedTargets.join('、') || '无'}
- 总耗时：${Math.round(durations.reduce((sum, value) => sum + value, 0) / 1000)} 秒
- 平均响应：${Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length))} ms
- P50 / P95 / 最大：${percentile(0.5)} / ${percentile(0.95)} / ${durations.at(-1) ?? 0} ms
- 检定次数：${metrics.reduce((sum, item) => sum + item.checks.length, 0)}
- 发生结局：${endings.length}
- 浏览器异常日志：${browserLogs.length}
- 记录问题：${issues.length}
- 人物提及未落板：${metrics.reduce((sum, item) => sum + item.missingMentionedNpcNames.length, 0)} 次

## 结局节点

${endings.length ? endings.map((item) => `- 总回合 ${item.turn}，第 ${item.run} 局：${item.ending}`).join('\n') : '- 未进入结局'}
`;
writeFileSync(join(outputDir, 'summary.md'), summary);
writeFileSync(join(outputDir, 'issues.md'), `# 问题清单\n\n${issues.length ? issues.map((item) => `- **${item.severity}** 回合 ${item.turn}：${item.observation ?? item.error}`).join('\n') : '未记录到可复现问题。'}\n`);
console.log(`playtest complete: ${metrics.length}/${targetTurns} turns, ${issues.length} issues`);
if (fatalError) throw fatalError;
