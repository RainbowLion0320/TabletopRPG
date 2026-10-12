import type { Page } from '@playwright/test';

/** Static layout assertions measure the settled UI; waiting loops keep running. */
export async function settleUiMotion(page: Page) {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => animation.playState === 'running'
      && Number.isFinite(animation.effect?.getTiming().iterations ?? 1));
    await Promise.all(finite.map(animation => animation.finished.catch(() => {})));
  });
}
