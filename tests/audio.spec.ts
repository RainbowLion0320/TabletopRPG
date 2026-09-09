import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('assets/audio/manifest.json', 'utf8')) as Array<{ file: string; seconds: number }>;

test('real output is audible after interaction, music mute leaves ambience, hidden tabs suspend', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalContext = window.AudioContext;
    const probe = { context: null as AudioContext | null, analysers: [] as AnalyserNode[] };
    (window as Window & { audioOutputProbe?: typeof probe }).audioOutputProbe = probe;
    window.AudioContext = class extends OriginalContext {
      constructor() { super(); probe.context = this; }
      createGain() {
        const gain = super.createGain();
        const analyser = super.createAnalyser();
        gain.connect(analyser);
        probe.analysers.push(analyser);
        return gain;
      }
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const output = () => page.evaluate(() => {
    const probe = (window as Window & { audioOutputProbe?: { context: AudioContext; analysers: AnalyserNode[] } }).audioOutputProbe!;
    const rms = probe.analysers.slice(0, 2).map((analyser) => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
    });
    return { state: probe.context.state, music: rms[0], effects: rms[1] };
  });
  await expect.poll(async () => (await output()).music).toBeGreaterThan(0.0001);
  await expect.poll(async () => (await output()).effects).toBeGreaterThan(0.0001);
  await page.getByRole('switch', { name: '背景音乐', exact: true }).click();
  await expect.poll(async () => (await output()).music).toBe(0);
  await expect.poll(async () => (await output()).effects).toBeGreaterThan(0.0001);
  await page.getByRole('switch', { name: '游戏音效', exact: true }).click();
  await expect.poll(async () => (await output()).effects).toBe(0);
  await page.getByRole('switch', { name: '背景音乐', exact: true }).click();
  await expect.poll(async () => (await output()).music).toBeGreaterThan(0.0001);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await output()).state).toBe('suspended');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await output()).music).toBeGreaterThan(0.0001);
});

test('audio is gesture-gated, preferences are independent and survive reload', async ({ page }) => {
  const audioRequests: string[] = [];
  page.on('request', (request) => { if (/\/assets\/audio\/.*\.mp3/.test(request.url())) audioRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '雾中消逝' })).toBeVisible();
  expect(audioRequests).toHaveLength(0);
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '声音设置' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => audioRequests.some((url) => url.includes('fog-theme'))).toBe(true);
  await expect.poll(() => audioRequests.some((url) => url.includes('rain-window'))).toBe(true);
  await dialog.getByRole('switch', { name: '背景音乐', exact: true }).click();
  await expect(dialog.getByRole('slider', { name: '音乐音量' })).toBeDisabled();
  await expect(dialog.getByRole('switch', { name: '游戏音效' })).toBeChecked();
  await dialog.getByRole('slider', { name: '音效音量' }).fill('23');
  await dialog.getByRole('button', { name: '试听骰子音效' }).click();
  await expect.poll(() => audioRequests.some((url) => url.includes('dice-land'))).toBe(true);
  await dialog.getByRole('switch', { name: '游戏音效' }).click();
  await expect(dialog.getByRole('button', { name: '试听骰子音效' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '声音设置', exact: true })).toBeFocused();
  audioRequests.length = 0;
  await page.reload();
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  await expect(dialog.getByRole('switch', { name: '背景音乐', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('switch', { name: '游戏音效' })).not.toBeChecked();
  await expect(dialog.getByRole('slider', { name: '音效音量' })).toHaveValue('23');
  expect(audioRequests).toHaveLength(0);
});

for (const partySize of [1, 2, 4]) {
  test(`sound controls remain available through setup, ${partySize}-player game and home`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '开始游戏' }).click();
    await page.getByRole('button', { name: '声音设置', exact: true }).click();
    await page.getByRole('switch', { name: '背景音乐', exact: true }).click();
    await page.keyboard.press('Escape');
    const cards = page.locator('.preset-card-modern');
    for (let index = 1; index < partySize; index++) await cards.nth(index).click();
    await page.getByRole('button', { name: '进入游戏' }).click();
    await expect(page.locator('.game-screen')).toBeVisible();
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '声音设置', exact: true }).click();
    await expect(page.getByRole('switch', { name: '背景音乐', exact: true })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: '游戏音效' })).toBeChecked();
    await page.getByText('音乐与音效鸣谢', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Kevin MacLeod' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await page.getByRole('button', { name: '声音设置', exact: true }).click();
    await expect(page.getByRole('switch', { name: '背景音乐', exact: true })).not.toBeChecked();
  });
}

test('all shipped audio decodes to non-silent unclipped buffers in a real browser', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async (entries) => {
    const context = new AudioContext();
    try {
      const results = [];
      for (const entry of entries) {
        const response = await fetch(`/assets/audio/${entry.file}`);
        if (!response.ok) throw new Error(`${entry.file}: ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        const data = buffer.getChannelData(0);
        let peak = 0;
        let square = 0;
        for (const sample of data) { peak = Math.max(peak, Math.abs(sample)); square += sample * sample; }
        results.push({ file: entry.file, duration: buffer.duration, peak, rms: Math.sqrt(square / data.length),
          seam: Math.abs(data[0] - data[data.length - 1]) });
      }
      return results;
    } finally { await context.close(); }
  }, manifest);
  for (const [index, result] of results.entries()) {
    expect(result.duration, result.file).toBeCloseTo(manifest[index].seconds, 1);
    expect(result.peak, result.file).toBeLessThan(0.85);
    expect(result.rms, result.file).toBeGreaterThan(0.004);
    if (!result.file.startsWith('sfx/')) expect(result.seam, result.file).toBeLessThan(0.12);
  }
});

test('sound settings fit a narrow viewport and keep keyboard focus inside', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '声音设置' });
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.height).toBeLessThanOrEqual(536);
  await page.getByText('音乐与音效鸣谢', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭声音设置' })).toBeFocused();
  await page.getByText('音乐与音效鸣谢', { exact: true }).click();
  await dialog.getByRole('link', { name: 'CC0', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭声音设置' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
