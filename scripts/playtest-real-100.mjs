import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, process.env.PLAYTEST_OUTPUT ?? 'test-results/playtest-100');
const targetTurns = Math.max(1, Number(process.env.PLAYTEST_TURNS ?? 100));
const baseUrl = process.env.PLAYTEST_URL ?? 'http://127.0.0.1:4173';
const checkpoints = new Set([10, 25, 50, 75, 100].filter((turn) => turn <= targetTurns));

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const metrics = [];
const issues = [];
const browserLogs = [];
let runNumber = 1;
let runTurn = 0;
let lastScene = '';
let sceneTurn = 0;

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

function actionsFor(scene, turn) {
  if (scene.includes('摩勒住宅')) {
    const cycle = [
      ['接受伊莎贝拉的委托，确认埃里克失踪日期与常去地点。', '安抚伊莎贝拉，并记录警方无进展及老赫特酒吧线索。'],
      ['仔细检查书桌右侧抽屉，寻找埃里克与蒙特利尔的旧合影。', '协助辨认合影人物，并询问蒙特利尔与埃里克的关系。'],
      ['检查书架夹缝中的小册子，观察夹页是否有隐写痕迹。', '用安全加热和医学知识分析小册子夹页，寻找地址信息。'],
      ['根据已经取得的线索，明确前往老赫特酒吧继续调查。', '与亨利一起离开住宅，前往老赫特酒吧寻找知情者。']
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
    const cycle = [
      ['暂缓攻击，明确选择交涉路线并要求深潜者说明诉求。', '保持戒备，协助亨利尝试和平交涉。'],
      ['专注聆听深潜者的语调和重复词，理解它们真正的诉求。', '记录声调规律，协助完成聆听判断。'],
      ['在理解诉求后说服深潜者释放埃里克并和平离港。', '提出双方都可接受的条件，协助说服。'],
      ['如果交涉失败，立即选择战斗路线阻止扶桑花号离港。', '掩护亨利并攻击阻拦救援的深潜者。'],
      ['集中攻击剩余深潜者，争取在逃脱时钟结束前救出埃里克。', '协助战斗并保护埃里克。']
    ];
    return cycle[(turn - 1) % cycle.length];
  }
  return ['根据当前已知线索继续正式调查。', '协助亨利核对证据并推进当前目标。'];
}

async function waitForAi(startDmCount) {
  await page.waitForFunction(
    (before) => !document.querySelector('.thinking-line')
      && document.querySelectorAll('.story-message.dm').length > before,
    startDmCount,
    { timeout: 185_000 }
  );
}

async function resolveChecks(checks) {
  for (let guard = 0; guard < 3; guard += 1) {
    const card = page.locator('.check-card');
    if (!await card.isVisible().catch(() => false)) return;
    checks.push((await card.innerText()).replace(/\s+/g, ' ').trim());
    const dmCount = await page.locator('.story-message.dm').count();
    await card.getByRole('button', { name: /掷骰/ }).click();
    await waitForAi(dmCount);
  }
  if (await page.locator('.check-card').isVisible().catch(() => false)) throw new Error('连续检定超过3次，视为不可操作状态');
}

async function saveCheckpoint(turn) {
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
    clocks: progress.clocks,
    endingId: progress.endingId
  } : null;
  await page.screenshot({ path: join(outputDir, 'screenshots', `turn-${String(turn).padStart(3, '0')}.png`), fullPage: true });
}

try {
  await startNewGame(true);
  for (let globalTurn = 1; globalTurn <= targetTurns; globalTurn += 1) {
    if (await page.locator('.ending-dock').isVisible().catch(() => false)) {
      const ending = (await page.locator('.ending-dock').innerText()).replace(/\s+/g, ' ').trim();
      metrics.at(-1).runEnding = ending;
      runNumber += 1;
      await startNewGame(false);
    }
    runTurn += 1;
    const sceneBefore = (await page.locator('.brand-scene').innerText()).trim();
    sceneTurn = sceneBefore === lastScene ? sceneTurn + 1 : 1;
    lastScene = sceneBefore;
    const actBefore = (await page.locator('.brand-title').innerText()).trim();
    const worldTimeBefore = (await page.locator('.world-time').innerText()).trim();
    const [henryAction, adaAction] = actionsFor(sceneBefore, sceneTurn);
    const dmCount = await page.locator('.story-message.dm').count();
    const startedAt = Date.now();
    const checks = [];
    try {
      await page.getByPlaceholder('亨利·格雷 想要做什么...').fill(henryAction);
      await page.getByRole('button', { name: '下一位' }).click();
      await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill(adaAction);
      await page.getByRole('button', { name: '提交' }).click();
      await waitForAi(dmCount);
      await resolveChecks(checks);
    } catch (error) {
      const evidence = `failure-turn-${String(globalTurn).padStart(3, '0')}.png`;
      await page.screenshot({ path: join(outputDir, 'screenshots', evidence), fullPage: true });
      issues.push({ severity: 'P0', turn: globalTurn, run: runNumber, scene: sceneBefore, error: String(error), evidence });
      throw error;
    }
    const durationMs = Date.now() - startedAt;
    const sceneAfter = (await page.locator('.brand-scene').innerText()).trim();
    const actAfter = (await page.locator('.brand-title').innerText()).trim();
    const worldTimeAfter = (await page.locator('.world-time').innerText()).trim();
    const narratives = await page.locator('.story-message.dm p').allInnerTexts().catch(() => []);
    const narrative = narratives.at(-1)?.replace(/\s+/g, ' ').trim() ?? '';
    const ending = await page.locator('.ending-dock').isVisible().catch(() => false)
      ? (await page.locator('.ending-dock').innerText()).replace(/\s+/g, ' ').trim()
      : null;
    metrics.push({
      turn: globalTurn, run: runNumber, runTurn, henryAction, adaAction,
      sceneBefore, sceneAfter, actBefore, actAfter, worldTimeBefore, worldTimeAfter,
      checks, durationMs, narrative, ending
    });
    if (sceneBefore === sceneAfter && runTurn >= 8 && sceneBefore.includes('摩勒住宅')) {
      issues.push({ severity: 'P1', turn: globalTurn, run: runNumber, scene: sceneAfter, observation: '连续正式行动后仍停留在摩勒住宅，需核对事件工具调用与fail-forward。' });
    }
    if (checkpoints.has(globalTurn)) await saveCheckpoint(globalTurn);
    writeFileSync(join(outputDir, 'run-metrics.json'), JSON.stringify(metrics, null, 2));
  }
} finally {
  await browser.close();
  writeFileSync(join(outputDir, 'browser-log.json'), JSON.stringify(browserLogs, null, 2));
  writeFileSync(join(outputDir, 'issues.json'), JSON.stringify(issues, null, 2));
}

const durations = metrics.map((item) => item.durationMs).sort((a, b) => a - b);
const percentile = (p) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] ?? 0;
const endings = metrics.filter((item) => item.ending).map((item) => ({ turn: item.turn, run: item.run, ending: item.ending }));
const summary = `# 真实 MiMo 100 回合测试摘要

- 完成 DM 回合：${metrics.length} / ${targetTurns}
- 独立游戏局数：${Math.max(1, ...metrics.map((item) => item.run))}
- 总耗时：${Math.round(durations.reduce((sum, value) => sum + value, 0) / 1000)} 秒
- 平均响应：${Math.round(durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length))} ms
- P50 / P95 / 最大：${percentile(0.5)} / ${percentile(0.95)} / ${durations.at(-1) ?? 0} ms
- 检定次数：${metrics.reduce((sum, item) => sum + item.checks.length, 0)}
- 发生结局：${endings.length}
- 浏览器异常日志：${browserLogs.length}
- 记录问题：${issues.length}

## 结局节点

${endings.length ? endings.map((item) => `- 总回合 ${item.turn}，第 ${item.run} 局：${item.ending}`).join('\n') : '- 未进入结局'}
`;
writeFileSync(join(outputDir, 'summary.md'), summary);
writeFileSync(join(outputDir, 'issues.md'), `# 问题清单\n\n${issues.length ? issues.map((item) => `- **${item.severity}** 回合 ${item.turn}：${item.observation ?? item.error}`).join('\n') : '未记录到可复现问题。'}\n`);
console.log(`playtest complete: ${metrics.length}/${targetTurns} turns, ${issues.length} issues`);
