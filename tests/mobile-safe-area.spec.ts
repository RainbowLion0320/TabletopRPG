import { expect, test } from '@playwright/test';

for (const width of [320, 390, 430, 562]) {
  test(`portrait controls respect native safe areas and browser fallback at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    let modelCalls = 0;
    await page.route('**/*', route => {
      if (route.request().method() === 'POST') { modelCalls++; return route.abort(); }
      if (new URL(route.request().url()).pathname === '/__api_config') return route.fulfill({ status: 404, body: '' });
      return route.continue();
    });
    await page.goto('/');
    const session = await page.context().newCDPSession(page);
    const browserInsets = { top: 48, right: 16, bottom: 34, left: 12 };
    const variants = [
      { browser: browserInsets, native: null },
      { browser: { top: 0, right: 0, bottom: 0, left: 0 }, native: { top: 40, right: 18, bottom: 28, left: 22 } },
      { browser: browserInsets, native: { top: 0, right: 0, bottom: 0, left: 0 } },
      { browser: browserInsets, native: { top: 40, right: 18, bottom: 0, left: 22 } },
    ];
    await page.getByRole('button', { name: '声音设置', exact: true }).click();
    for (const variant of variants) {
      await session.send('Emulation.setSafeAreaInsetsOverride', { insets: variant.browser });
      const margins = await page.evaluate(native => {
        const sides = ['top', 'right', 'bottom', 'left'] as const;
        for (const side of sides) {
          const property = `--safe-area-inset-${side}`;
          if (native) document.documentElement.style.setProperty(property, `${native[side]}px`);
          else document.documentElement.style.removeProperty(property);
        }
        const probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;opacity:0;pointer-events:none;padding:var(--mobile-top) var(--mobile-right) var(--mobile-bottom) var(--mobile-left)';
        document.body.append(probe); const style = getComputedStyle(probe);
        const values = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat);
        probe.remove(); return values;
      }, variant.native);
      const expected = variant.native ?? variant.browser;
      expect(margins).toEqual([Math.max(6, expected.top), Math.max(10, expected.right), Math.max(6, expected.bottom), Math.max(10, expected.left)]);
      await expect.poll(() => page.locator('.audio-settings').evaluate((panel, padding) => {
        const r = panel.getBoundingClientRect();
        return r.top >= padding[0] - .5 && r.right <= innerWidth - padding[1] + .5 && r.bottom <= innerHeight - padding[2] + .5 && r.left >= padding[3] - .5;
      }, margins)).toBe(true);
      expect(await page.locator('.audio-close').evaluate(button => {
        const r = button.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
    }
    await page.getByRole('button', { name: '关闭声音设置', exact: true }).click();
    await expect(page.getByRole('button', { name: '声音设置', exact: true })).toBeFocused();
    expect(modelCalls).toBe(0);
  });
}
