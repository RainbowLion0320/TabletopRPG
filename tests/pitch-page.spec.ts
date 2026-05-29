import { expect, test } from '@playwright/test';

test('AI game contest pitch page has the required presentation sections', async ({ page }) => {
  await page.goto('/docs/ai-game-contest-pitch.html');

  await expect(page).toHaveTitle(/AI Game Contest Pitch/);
  await expect(page.locator('[data-deck]')).toBeVisible();
  await expect(page.locator('[data-slide]')).toHaveCount(12);
  await expect(page.locator('[data-slide="hero"]')).toBeVisible();
  await expect(page.locator('[data-slide="demo-status"]')).toBeVisible();
  await expect(page.locator('[data-slide="prospect"]')).toBeVisible();
  await expect(page.locator('[data-slide="commercialization"]')).toBeVisible();
  await expect(page.locator('[data-slide="team"]')).toBeVisible();
});

test('AI game contest pitch page can move through slides', async ({ page }) => {
  await page.goto('/docs/ai-game-contest-pitch.html');

  await expect(page.locator('[data-current-slide]')).toHaveText('01');
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('[data-current-slide]')).toHaveText('02');
  await page.locator('[data-action="prev"]').click();
  await expect(page.locator('[data-current-slide]')).toHaveText('01');
});

test('AI game contest pitch page follows hash navigation after load', async ({ page }) => {
  await page.goto('/docs/ai-game-contest-pitch.html');

  await page.evaluate(() => {
    window.location.hash = 'commercialization';
  });

  await expect(page.locator('[data-current-slide]')).toHaveText('11');
});
