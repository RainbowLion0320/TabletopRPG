import { expect, test, type Page } from '@playwright/test';

async function startGameWithApi(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem('trpg-api', JSON.stringify({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'test-model'
    }));
  });

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

test('AI DM retries malformed model output instead of returning raw text as narrative', async ({ page }) => {
  const malformed = '```json\n{\n  "narrative": "raw malformed output",\n  "stateUpdate": {\n```';
  const repaired = JSON.stringify({
    narrative: 'The repaired response is shown to the player.',
    activeNpc: null,
    check: null,
    stateUpdate: { hp: {}, san: {}, flags: {}, newItems: [], sceneChange: null },
    nextPrompt: 'Choose the next lead.',
    playerChoices: ['Inspect the desk', 'Read the note', 'Ask the others']
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
