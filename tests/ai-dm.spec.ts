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

test('AI DM thinking state blocks the game with a full-screen overlay while the turn is running', async ({ page }) => {
  const narrator = JSON.stringify({
    narrative: 'The delayed narrator response is shown after the overlay.',
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
  const overlay = page.getByRole('status', { name: 'AI DM 正在推演下一幕' });
  await expect(overlay).toBeVisible();
  await expect(page.locator('.thinking-line')).toHaveCount(0);
  const overlayBox = await overlay.boundingBox();
  const viewport = page.viewportSize();
  expect(overlayBox?.x).toBeLessThanOrEqual(1);
  expect(overlayBox?.y).toBeLessThanOrEqual(1);
  expect(overlayBox?.width).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 2);
  expect(overlayBox?.height).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 2);
  const overlayBackground = await overlay.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(overlayBackground).toMatch(/rgba\(.+,\s*0\.\d+\)/);

  releaseNarrator();
  await expect(page.locator('.story-message.dm p', { hasText: 'The delayed narrator response is shown after the overlay.' })).toBeVisible();
  await expect(overlay).toHaveCount(0);
});
