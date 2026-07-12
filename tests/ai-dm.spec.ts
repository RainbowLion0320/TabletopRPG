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
