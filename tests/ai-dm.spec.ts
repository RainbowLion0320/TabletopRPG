import { expect, test, type Page } from '@playwright/test';

async function startGameWithApi(page: Page, config: Record<string, string> = {
  provider: 'openai',
  protocol: 'responses',
  apiKey: 'test-key',
  model: 'test-model'
}) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.addInitScript((apiConfig) => {
    window.localStorage.setItem('trpg-api', JSON.stringify(apiConfig));
  }, config);

  await page.goto('/');
  await page.getByRole('button', { name: /开始游戏/ }).click();
  await page.getByRole('button', { name: /进入游戏/ }).click();
  await expect(page.locator('.game-screen')).toBeVisible();
}

function responseBody(content: string) {
  return {
    output_text: content,
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: content }]
      }
    ]
  };
}

function responseBodyWithToolCall(
  content: string,
  name: string,
  args: Record<string, unknown>
) {
  return {
    output_text: content,
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: content }]
      },
      {
        type: 'function_call',
        id: 'fc-scene-change',
        call_id: 'call-scene-change',
        name,
        arguments: JSON.stringify(args)
      }
    ]
  };
}

function chatBody(content: string) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content
        }
      }
    ]
  };
}

test('AI DM retries malformed model output instead of returning raw text as narrative', async ({ page }) => {
  const malformed = '```json\n{\n  "narrative": "raw malformed output",\n  "stateUpdate": {\n```';
  const repaired = JSON.stringify({
    narrative: 'The repaired response is shown to the player.',
    activeNpc: null,
    check: null,
    stateUpdate: { hp: {}, san: {}, flags: {}, newItems: [], sceneChange: null },
    nextPrompt: 'Choose the next lead.',
    playerChoices: {
      '亨利·格雷': ['Inspect the desk', 'Read the note', 'Ask Isabella'],
      '艾达·华莱士': ['Watch the hallway', 'Check the windows', 'Calm Isabella']
    }
  });
  const narratorRequestBodies: string[] = [];
  let narratorAttempts = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const postData = route.request().postData() ?? '';
    const body = JSON.parse(postData) as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      narratorRequestBodies.push(postData);
      content = narratorAttempts === 1 ? malformed : repaired;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the study.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the hallway.');
  await page.getByRole('button', { name: '提交' }).click();

  await expect.poll(() => narratorAttempts).toBe(2);
  expect(narratorRequestBodies[1]).toContain('JSON');
  expect(narratorRequestBodies[1]).toContain('Previous Narrator response was invalid JSON');
  await expect(page.locator('.story-message.dm p', { hasText: 'The repaired response is shown to the player.' })).toBeVisible();
  await expect(page.getByText('raw malformed output')).toHaveCount(0);
});

test('AI DM recovers an exhausted malformed turn without duplicating player history', async ({ page }) => {
  const malformed = '{"narrative":"truncated';
  const recovered = JSON.stringify({
    narrative: 'The turn recovered without asking the players to submit twice.',
    activeNpc: '伊莎贝拉·摩勒',
    check: null,
    stateUpdate: { hp: {}, san: {}, flags: {}, newItems: [], sceneChange: null },
    nextPrompt: 'Continue the investigation.',
    playerChoices: {
      '亨利·格雷': ['Inspect the desk', 'Read the note'],
      '艾达·华莱士': ['Watch the hallway', 'Calm Isabella']
    }
  });
  let narratorAttempts = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      content = narratorAttempts <= 2 ? malformed : recovered;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the study.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the hallway.');
  await page.getByRole('button', { name: '提交' }).click();

  await expect(page.getByText('The turn recovered without asking the players to submit twice.')).toBeVisible();
  expect(narratorAttempts).toBe(3);
  await expect(page.locator('.story-message.player')).toHaveCount(2);
  await expect(page.getByText(/AI DM 返回格式无效/)).toHaveCount(0);

  await page.getByRole('button', { name: /菜单/ }).click();
  await page.getByRole('button', { name: /保存游戏/ }).click();
  const historyRoles = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('trpg-saves-v2') || '[]')[0];
    return saved.gameState.conversationHistory.map((turn: { role: string }) => turn.role);
  });
  expect(historyRoles).toEqual(['user', 'assistant']);
});

test('AI DM repairs unescaped dialogue quotes locally without interrupting the turn', async ({ page }) => {
  const malformed = '{"narrative":"伊莎贝拉说父亲总提到"水里的东西"，随后沉默下来。","activeNpc":"伊莎贝拉·摩勒","nextPrompt":"继续追问吗？","playerChoices":{"亨利·格雷":["追问细节"],"艾达·华莱士":["观察她的反应"]}}';
  let narratorAttempts = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      content = malformed;
    } else if (system.includes('案件板合成助手')) {
      content = JSON.stringify({ nodes: [], edges: [] });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('追问那句话。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('记录她的反应。');
  await page.getByRole('button', { name: '提交' }).click();

  await expect(page.getByText('伊莎贝拉说父亲总提到"水里的东西"，随后沉默下来。')).toBeVisible();
  await expect(page.getByText(/AI DM 返回格式无效/)).toHaveCount(0);
  expect(narratorAttempts).toBe(1);
});

test('AI DM scene changes update the chapter, backdrop, party location, and resident NPC together', async ({ page }) => {
  const acceptedNarrator = JSON.stringify({
    narrative: '你们正式接受了伊莎贝拉的委托。',
    activeNpc: '伊莎贝拉·摩勒',
    nextPrompt: '可以从埃里克留下的物品开始。',
    playerChoices: {},
    keywords: []
  });
  const clueNarrator = JSON.stringify({
    narrative: '合影把埃里克与蒙特利尔联系起来，警察局成为了明确的去处。',
    activeNpc: '伊莎贝拉·摩勒',
    nextPrompt: '是否前往上城区第二分局？',
    playerChoices: {},
    keywords: []
  });
  const arrivalNarrator = JSON.stringify({
    narrative: '你们穿过雾气，抵达上城区第二分局。',
    activeNpc: null,
    nextPrompt: '蒙特利尔局长正在办公室里。',
    playerChoices: {
      '亨利·格雷': ['询问案件进展'],
      '艾达·华莱士': ['观察局长反应']
    },
    keywords: []
  });
  let sceneToolWasAvailable = false;
  let narratorAttempt = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      instructions?: string;
      tools?: Array<{ name?: string }>;
    };
    const system = body.instructions ?? '';
    let response = responseBody(JSON.stringify({ facts: [] }));
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempt += 1;
      sceneToolWasAvailable ||= body.tools?.some((tool) => tool.name === 'propose_scene_change') ?? false;
      if (narratorAttempt === 1) {
        response = responseBody(acceptedNarrator);
      } else if (narratorAttempt === 2) {
        response = responseBody(clueNarrator);
      } else {
        response = responseBodyWithToolCall(arrivalNarrator, 'propose_scene_change', {
          targetSceneId: 'S02',
          reason: '调查员明确前往警察局'
        });
      }
    } else if (system.includes('案件板合成助手')) {
      response = responseBody(JSON.stringify({ nodes: [], edges: [] }));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });

  await startGameWithApi(page);
  const initialBackdrop = await page.locator('.scene-backdrop-img').getAttribute('src');

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('我们接受这份委托。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('确认接受伊莎贝拉的委托。');
  await page.getByRole('button', { name: '提交' }).click();
  await expect(page.getByText('你们正式接受了伊莎贝拉的委托。')).toBeVisible();

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('我们找到埃里克与蒙特利尔的合影照片。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('收好这张合影。');
  await page.getByRole('button', { name: '提交' }).click();
  await expect(page.getByText('合影把埃里克与蒙特利尔联系起来，警察局成为了明确的去处。')).toBeVisible();

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('我们前往上城区第二分局。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('一起前往上城区第二分局。');
  await page.getByRole('button', { name: '提交' }).click();

  await expect(page.locator('.brand-title')).toHaveText('第二幕：街区调查');
  await expect(page.locator('.brand-scene')).toHaveText('上城区第二分局');
  await expect(page.locator('.npc-nameplate')).toContainText('洛夫·蒙特利尔');
  await expect(page.locator('.scene-backdrop-img')).not.toHaveAttribute('src', initialBackdrop ?? '');
  expect(sceneToolWasAvailable).toBe(true);
});

test('D100 check plays a locked-result roll and reveal before continuing the AI turn', async ({ page }) => {
  const resolvedNarrative = JSON.stringify({
    narrative: '骰子结果已经落定，门锁上的细小刮痕显露出来。',
    activeNpc: null,
    nextPrompt: '继续检查刮痕。',
    playerChoices: {
      '亨利·格雷': ['判断刮痕方向'],
      '艾达·华莱士': ['检查残留金属屑']
    },
    keywords: []
  });
  let narratorAttempt = 0;
  let resultTurnBody = '';

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const postData = route.request().postData() ?? '{}';
    const body = JSON.parse(postData) as { instructions?: string };
    const system = body.instructions ?? '';
    let response = responseBody(JSON.stringify({ facts: [] }));
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempt += 1;
      resultTurnBody = postData;
      response = responseBody(resolvedNarrative);
    } else if (system.includes('案件板合成助手')) {
      response = responseBody(JSON.stringify({ nodes: [], edges: [] }));
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('检查门锁。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('在旁观察。');
  await page.getByRole('button', { name: '提交' }).click();

  await expect(page.getByText('亨利·格雷 · 侦查')).toBeVisible();
  await expect(page.getByText('难度：普通，阈值 75')).toBeVisible();
  await page.evaluate(() => {
    Math.random = () => 0.41;
  });
  await page.getByRole('button', { name: '掷骰' }).click();

  const diceDialog = page.getByRole('dialog', { name: '命运检定' });
  const rollingDialog = page.locator('.dice-roll-overlay.rolling:not(:has(.dice-roll-total))', {
    hasText: '骰面翻滚中'
  });
  await expect(rollingDialog).toBeVisible();

  await page.setViewportSize({ width: 390, height: 700 });
  const fitsNarrowViewport = await diceDialog.evaluate((element) => (
    element.scrollWidth <= window.innerWidth && element.scrollHeight <= window.innerHeight
  ));
  expect(fitsNarrowViewport).toBe(true);

  await expect(diceDialog).toHaveClass(/revealed/, { timeout: 5_000 });
  await expect(diceDialog.locator('.dice-roll-total')).toHaveText('42');
  await expect(diceDialog.getByRole('heading', { name: '普通成功' })).toBeVisible();
  const confirmResult = diceDialog.getByRole('button', { name: '确认结果' });
  await expect(confirmResult).toBeFocused();
  const revealedFitsNarrowViewport = await diceDialog.evaluate((element) => (
    element.scrollWidth <= window.innerWidth && element.scrollHeight <= window.innerHeight
  ));
  expect(revealedFitsNarrowViewport).toBe(true);
  await page.waitForTimeout(1_300);
  await expect(diceDialog).toBeVisible();
  expect(narratorAttempt).toBe(0);
  await confirmResult.click();
  await expect(diceDialog).toHaveCount(0);
  await expect(page.getByText('骰子结果已经落定，门锁上的细小刮痕显露出来。')).toBeVisible();
  expect(narratorAttempt).toBe(1);
  expect(resultTurnBody).toContain('掷出 42');
  expect(resultTurnBody).toContain('普通成功');
});

test('narrative highlights remain safe, clickable and stable across desktop and narrow layouts', async ({ page }) => {
  const narrator = JSON.stringify({
    narrative: '伊莎贝拉·摩勒指向水里的东西，建议进行心理学检定。',
    activeNpc: '伊莎贝拉·摩勒',
    nextPrompt: '要继续追问吗？',
    playerChoices: {
      '亨利·格雷': ['追问细节', '检查书房'],
      '艾达·华莱士': ['观察她的反应', '查看求助信']
    },
    keywords: [{ text: '水里的东西', kind: 'clue' }]
  });
  let narratorAttempts = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      content = narrator;
    } else if (system.includes('案件板合成助手')) {
      content = JSON.stringify({ nodes: [], edges: [] });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  const openingMessage = page.locator('.story-message.dm').first();
  const isabella = openingMessage.getByRole('button', { name: '查看伊莎贝拉·摩勒详情' });
  const eric = openingMessage.getByRole('button', { name: '查看埃里克·摩勒详情' });
  const [isabellaColor, ericColor] = await Promise.all([
    isabella.evaluate((element) => getComputedStyle(element).color),
    eric.evaluate((element) => getComputedStyle(element).color)
  ]);
  expect(isabellaColor).not.toBe(ericColor);

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('询问伊莎贝拉父亲的近况。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('记录伊莎贝拉的反应。');
  await page.getByRole('button', { name: '提交' }).click();

  await expect.poll(() => narratorAttempts).toBe(1);
  const response = page.locator('.story-message.dm', { hasText: '水里的东西' });
  const clueMark = response.getByRole('button', { name: '查看水里的东西详情' });
  await expect(clueMark).toHaveClass(/narrative-mark-inferred/);
  await clueMark.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('本轮线索标记');
  await expect(dialog).toContainText('伊莎贝拉·摩勒指向水里的东西');
  await expect(dialog).not.toContainText('条信息待探索');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(clueMark).toBeFocused();

  await page.setViewportSize({ width: 390, height: 700 });
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    panel: document.querySelector('.narrative-panel')
      ? document.querySelector('.narrative-panel')!.scrollWidth - document.querySelector('.narrative-panel')!.clientWidth
      : 0
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.panel).toBeLessThanOrEqual(1);
  await clueMark.click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box?.width ?? 999).toBeLessThanOrEqual(390);
});

test('AI DM handles first player action through a chat-compatible provider', async ({ page }) => {
  const narrator = JSON.stringify({
    narrative: 'The chat-compatible narrator response is shown.',
    activeNpc: null,
    nextPrompt: 'Choose the next lead.',
    playerChoices: {
      '亨利·格雷': ['Inspect the dock', 'Check the footprints', 'Read the letter'],
      '艾达·华莱士': ['Watch the fog', 'Listen at the door', 'Calm Isabella']
    }
  });
  let narratorAttempts = 0;

  await page.route('https://gateway.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as {
      messages?: Array<{ role?: string; content?: string }>;
    };
    const system = body.messages?.find((message) => message.role === 'system')?.content ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      content = narrator;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(chatBody(content))
    });
  });

  await startGameWithApi(page, {
    provider: 'custom',
    protocol: 'chat-completions',
    endpoint: 'https://gateway.test/v1',
    apiKey: 'test-key',
    model: 'gateway-model'
  });
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the dock.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the fog.');
  await page.getByRole('button', { name: '提交' }).click();

  await expect.poll(() => narratorAttempts).toBe(1);
  await expect(page.locator('.story-message.dm p', { hasText: 'The chat-compatible narrator response is shown.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect the dock' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Watch the fog' })).toHaveCount(0);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Prepare the next move.');
  await page.getByRole('button', { name: '下一位' }).click();
  await expect(page.getByRole('button', { name: 'Watch the fog' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect the dock' })).toHaveCount(0);
  await expect(page.getByText(/AI DM 返回格式无效/)).toHaveCount(0);
});

test('AI DM shows the narrator response before background memory synthesis finishes', async ({ page }) => {
  const narrator = JSON.stringify({
    narrative: 'The foreground narrator response appears before background memory is done.',
    activeNpc: null,
    nextPrompt: 'Choose the next lead.',
    playerChoices: {
      '亨利·格雷': ['Inspect the desk'],
      '艾达·华莱士': ['Watch the street']
    }
  });
  let releaseFacts!: () => void;
  const factsGate = new Promise<void>((resolve) => {
    releaseFacts = resolve;
  });
  let factsStarted = false;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ nodes: [], edges: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      content = narrator;
    } else if (system.includes('事实抽取助手')) {
      factsStarted = true;
      await factsGate;
      content = JSON.stringify({ facts: [] });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the study.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the street.');
  await page.getByRole('button', { name: '提交' }).click();

  await expect.poll(() => factsStarted).toBe(true);
  await expect(page.locator('.story-message.dm p', {
    hasText: 'The foreground narrator response appears before background memory is done.'
  })).toBeVisible();
  await expect(page.getByRole('status', { name: 'AI DM 正在推演下一幕' })).toHaveCount(0);
  await expect(page.getByText(/AI DM 连接失败/)).toHaveCount(0);

  releaseFacts();
});

test('case board records a meaningful fact when the AI proposes an empty patch', async ({ page }) => {
  const narrator = JSON.stringify({
    narrative: '亨利在门廊发现几道新鲜的拖拽刮痕，像是有人搬运过重物。',
    activeNpc: null,
    nextPrompt: '继续检查门廊。',
    playerChoices: {
      '亨利·格雷': ['检查刮痕方向'],
      '艾达·华莱士': ['检查残留物']
    }
  });

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ nodes: [], edges: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      content = narrator;
    } else if (system.includes('事实抽取助手')) {
      content = JSON.stringify({
        facts: [{
          actor: 'world',
          predicate: 'state',
          target: '',
          value: '门廊有拖拽痕迹'
        }]
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('留意门廊。');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('守在一旁。');
  await page.getByRole('button', { name: '提交' }).click();
  await expect(page.getByText('亨利在门廊发现几道新鲜的拖拽刮痕，像是有人搬运过重物。')).toBeVisible();

  await page.getByRole('button', { name: '资料', exact: true }).click();
  await expect(page.locator('.case-flow-node.event.confirmed', {
    hasText: '门廊有拖拽痕迹'
  })).toBeVisible();
});

test('AI DM opens settings when a chat-compatible provider is missing its endpoint', async ({ page }) => {
  await startGameWithApi(page, {
    provider: 'mimo',
    protocol: 'chat-completions',
    apiKey: 'test-key',
    model: 'mimo-v2.5'
  });

  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the study.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the hallway.');
  await page.getByRole('button', { name: '提交' }).click();

  const configDialog = page.getByRole('dialog', { name: 'AI DM 配置' });
  await expect(configDialog).toBeVisible();
  await expect(configDialog.getByLabel('Endpoint')).toBeVisible();
  await expect(page.getByText(/请补全 AI DM 配置/)).toBeVisible();
  await expect(page.getByText(/MiMo\/custom provider 必须配置 endpoint/)).toBeVisible();
});

test('AI DM thinking state shows an inline animated indicator while the turn is running', async ({ page }) => {
  const narrator = JSON.stringify({
    narrative: 'The delayed narrator response is shown after the indicator.',
    activeNpc: null,
    nextPrompt: 'Choose the next lead.',
    playerChoices: {
      '亨利·格雷': ['Inspect the locked drawer'],
      '艾达·华莱士': ['Watch the street']
    }
  });
  let releaseNarrator!: () => void;
  const narratorGate = new Promise<void>((resolve) => {
    releaseNarrator = resolve;
  });
  let narratorAttempts = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      await narratorGate;
      content = narrator;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    });
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the locked drawer.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the street.');
  await page.getByRole('button', { name: '提交' }).click();

  await expect.poll(() => narratorAttempts).toBe(1);
  const indicator = page.getByRole('status', { name: 'AI DM 正在推演下一幕' });
  await expect(indicator).toBeVisible();
  await expect(page.locator('.thinking-overlay')).toHaveCount(0);
  await expect(page.locator('.narrative-panel .thinking-line')).toHaveCount(1);
  await expect(page.locator('.action-dock')).toBeVisible();
  const indicatorBox = await indicator.boundingBox();
  const indicatorTextBox = await page.locator('.thinking-line-text').boundingBox();
  const viewport = page.viewportSize();
  expect(indicatorBox?.height).toBeLessThan((viewport?.height ?? 0) * 0.2);
  expect(indicatorTextBox?.width).toBeLessThan((viewport?.width ?? 0) * 0.7);
  expect(indicatorTextBox?.height).toBeLessThan(40);

  releaseNarrator();
  await expect(page.locator('.story-message.dm p', { hasText: 'The delayed narrator response is shown after the indicator.' })).toBeVisible();
  await expect(indicator).toHaveCount(0);
});

test('an aborted narrator request cannot write into a restarted game session', async ({ page }) => {
  const staleNarrative = 'This response belongs to the abandoned game session.';
  let releaseNarrator!: () => void;
  const narratorGate = new Promise<void>((resolve) => {
    releaseNarrator = resolve;
  });
  let narratorAttempts = 0;

  await page.route('https://api.openai.com/v1/responses', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { instructions?: string };
    const system = body.instructions ?? '';
    let content = JSON.stringify({ facts: [] });
    if (system.includes('COC 第七版 AI DM Agent')) {
      narratorAttempts += 1;
      await narratorGate;
      content = JSON.stringify({
        narrative: staleNarrative,
        activeNpc: null,
        nextPrompt: 'stale',
        playerChoices: {
          '亨利·格雷': ['stale'],
          '艾达·华莱士': ['stale']
        }
      });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseBody(content))
    }).catch(() => undefined);
  });

  await startGameWithApi(page);
  await page.getByPlaceholder('亨利·格雷 想要做什么...').fill('Inspect the study.');
  await page.getByRole('button', { name: '下一位' }).click();
  await page.getByPlaceholder('艾达·华莱士 想要做什么...').fill('Watch the street.');
  await page.getByRole('button', { name: '提交' }).click();
  await expect.poll(() => narratorAttempts).toBe(1);

  await page.getByTitle('菜单').click();
  await page.getByRole('button', { name: '重新开始' }).click();
  await expect(page.getByRole('heading', { name: '选择调查员' })).toBeVisible();
  releaseNarrator();
  await page.getByRole('button', { name: /进入游戏/ }).click();

  await expect(page.locator('.game-screen')).toBeVisible();
  await expect(page.getByText(staleNarrative)).toHaveCount(0);
  expect(narratorAttempts).toBe(1);
});
