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
  const requestBodies: string[] = [];
  let attempts = 0;

  await page.route('https://api.openai.com/v1/chat/completions', async (route) => {
    attempts += 1;
    requestBodies.push(route.request().postData() ?? '');
    const content = attempts === 1 ? malformed : repaired;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content } }] })
    });
  });

  await startGameWithApi(page);
  await page.locator('.action-input-grid input').nth(0).fill('Inspect the study.');
  await page.locator('.action-input-grid input').nth(1).fill('Watch the hallway.');
  await page.getByRole('button', { name: /提交本轮行动/ }).click();

  await expect.poll(() => attempts).toBe(2);
  expect(requestBodies[1]).toContain('JSON');
  await expect(page.locator('.story-message.dm p', { hasText: 'The repaired response is shown to the player.' })).toBeVisible();
  await expect(page.getByText('raw malformed output')).toHaveCount(0);
});
