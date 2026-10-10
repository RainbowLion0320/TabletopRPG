import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('assets/audio/manifest.json', 'utf8')) as Array<{ file: string; seconds: number }>;

test('background screen changes retain the unchanged music while releasing the old ambience', async ({ page }) => {
  await page.route('**/*', route => {
    if (route.request().method() === 'POST') return route.abort();
    if (new URL(route.request().url()).pathname === '/__api_config') return route.fulfill({ status: 404, body: '' });
    return route.continue();
  });
  await page.addInitScript(() => {
    const OriginalContext = window.AudioContext;
    const probe = { context: null as AudioContext | null, loops: [] as Array<{ source: AudioBufferSourceNode; starts: number; stops: number }> };
    (window as Window & { audioSceneProbe?: typeof probe }).audioSceneProbe = probe;
    window.AudioContext = class extends OriginalContext {
      constructor() { super(); probe.context = this; }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source), stop = source.stop.bind(source);
        const loop = { source, starts: 0, stops: 0 };
        source.start = (...args) => { if (source.loop) { loop.starts++; probe.loops.push(loop); } return start(...args); };
        source.stop = (...args) => { if (source.loop) loop.stops++; return stop(...args); };
        return source;
      }
    };
  });
  const output = () => page.evaluate(() => {
    const p = (window as Window & { audioSceneProbe?: { context: AudioContext | null; loops: Array<{ source: AudioBufferSourceNode; starts: number; stops: number }> } }).audioSceneProbe!;
    return { state: p.context?.state, loops: p.loops.map(loop => ({ starts: loop.starts, stops: loop.stops, music: (loop.source.buffer?.duration ?? 0) > 45 })) };
  });
  await page.goto('/'); await page.getByRole('button', { name: '声音设置', exact: true }).click();
  await expect.poll(async () => (await output()).loops.length).toBe(2);
  await page.getByRole('button', { name: '关闭声音设置', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
    // A controlled React screen update exercises the director while the device is paused.
    Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === '开始游戏')!.click();
  });
  await expect(page.locator('.preset-card-modern').first()).toBeVisible();
  await expect.poll(async () => (await output()).state).toBe('suspended');
  const paused = await output();
  expect(paused.loops.find(loop => loop.music)).toEqual({ starts: 1, stops: 0, music: true });
  expect(paused.loops.find(loop => !loop.music)?.stops).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await output()).state).toBe('running');
  expect((await output()).loops).toEqual(paused.loops);
});

test('background pause keeps the current music and ambience positions without starting new loops', async ({ page }) => {
  await page.route('**/*', route => {
    if (route.request().method() === 'POST') return route.abort();
    if (new URL(route.request().url()).pathname === '/__api_config') return route.fulfill({ status: 404, body: '' });
    return route.continue();
  });
  await page.addInitScript(() => {
    const OriginalContext = window.AudioContext;
    const probe = { context: null as AudioContext | null, loopStarts: 0, gains: [] as GainNode[] };
    (window as Window & { audioPhaseProbe?: typeof probe }).audioPhaseProbe = probe;
    window.AudioContext = class extends OriginalContext {
      constructor() { super(); probe.context = this; }
      createGain() { const gain = super.createGain(); probe.gains.push(gain); return gain; }
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => { if (source.loop) probe.loopStarts++; return start(...args); };
        return source;
      }
    };
  });
  await page.goto('/'); await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const output = () => page.evaluate(() => {
    const p = (window as Window & { audioPhaseProbe?: { context: AudioContext | null; loopStarts: number; gains: GainNode[] } }).audioPhaseProbe!;
    return { state: p.context?.state, time: p.context?.currentTime ?? 0, loops: p.loopStarts, buses: p.gains.slice(0, 2).map(g => g.gain.value) };
  });
  await expect.poll(async () => (await output()).loops).toBe(2);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await output()).state).toBe('suspended');
  const paused = await output(); expect(paused.buses).toEqual([0, 0]);
  // An elapsed wall-clock interval verifies that the audio clock actually remains paused.
  await page.waitForTimeout(300); expect((await output()).time).toBeCloseTo(paused.time, 2);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(async () => (await output()).state).toBe('running');
  expect((await output()).loops).toBe(2); expect((await output()).buses.every(value => value > 0)).toBe(true);
});

test('releases inactive decoded music while retaining current loops and cached short effects', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const inspect = () => page.evaluate(async () => {
    const { gameAudio } = await import('/src/audio/audio.ts');
    const engine = gameAudio as unknown as {
      buffers: Map<string, Promise<AudioBuffer>>; loops: Map<string, { asset: string }>; retiring: Set<unknown>;
    };
    const buffers = await Promise.all([...engine.buffers].map(async ([asset, value]) => {
      const buffer = await value;
      return { asset, duration: buffer.duration, bytes: buffer.length * buffer.numberOfChannels * 4, sampleRate: buffer.sampleRate };
    }));
    return { playing: [...engine.loops.values()].map(loop => loop.asset).sort(), retiring: engine.retiring.size,
      long: buffers.filter(buffer => buffer.duration >= 5), short: buffers.filter(buffer => buffer.duration < 5) };
  });
  const samples = [];
  for (const soundscape of [
    { music: 'theme', ambience: 'rain' },
    { music: 'investigation', ambience: 'room' },
    { music: 'tension', ambience: 'water' },
    { music: 'theme', ambience: 'rain' },
  ]) {
    await page.evaluate(async soundscape => {
      const { gameAudio } = await import('/src/audio/audio.ts');
      gameAudio.setSoundscape(soundscape);
    }, soundscape);
    await expect.poll(async () => (await inspect()).playing).toEqual([soundscape.music, soundscape.ambience].sort());
    await expect.poll(async () => (await inspect()).retiring).toBe(0);
    samples.push(await inspect());
  }
  await testInfo.attach('decoded-loop-cache', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
  console.log('Decoded audio cache:', JSON.stringify(samples.map(sample => ({ playing: sample.playing,
    longTracks: sample.long.length, longBytes: sample.long.reduce((sum, buffer) => sum + buffer.bytes, 0),
    sampleRates: [...new Set(sample.long.map(buffer => buffer.sampleRate))] }))));
  for (const sample of samples) expect(sample.long.map(buffer => buffer.asset).sort()).toEqual(sample.playing);
  expect(samples.at(-1)!.short.map(buffer => buffer.asset)).toContain('click');
});

test('loops decoded while the audio device is suspended become audible on device resume without another tap', async ({ page }) => {
  await page.addInitScript(() => {
    const OriginalContext = window.AudioContext;
    const probe = {
      context: null as AudioContext | null,
      analysers: [] as AnalyserNode[],
      held: [] as Array<() => void>,
      holdLoops: true,
      loopStarts: 0,
    };
    (window as Window & { audioResumeProbe?: typeof probe }).audioResumeProbe = probe;
    window.AudioContext = class extends OriginalContext {
      constructor() { super(); probe.context = this; }
      createGain() {
        const gain = super.createGain();
        const analyser = super.createAnalyser();
        gain.connect(analyser);
        probe.analysers.push(analyser);
        return gain;
      }
      decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
        return super.decodeAudioData(data).then(buffer => {
          // Delay the real decoded theme/rain, keeping short interface sounds untouched.
          if (!probe.holdLoops || buffer.duration <= 2) return buffer;
          return new Promise<AudioBuffer>(resolve => { probe.held.push(() => resolve(buffer)); });
        });
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => { if (source.loop) probe.loopStarts++; start(...args); };
        return source;
      }
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  const output = () => page.evaluate(() => {
    const probe = (window as Window & { audioResumeProbe?: {
      context: AudioContext; analysers: AnalyserNode[]; held: Array<() => void>; loopStarts: number;
    } }).audioResumeProbe!;
    const rms = probe.analysers.slice(0, 2).map(analyser => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
    });
    return { state: probe.context.state, held: probe.held.length, loops: probe.loopStarts, music: rms[0], ambience: rms[1] };
  });
  await expect.poll(async () => (await output()).held).toBe(2);
  await page.evaluate(async () => {
    const probe = (window as Window & { audioResumeProbe?: {
      context: AudioContext; held: Array<() => void>; holdLoops: boolean;
    } }).audioResumeProbe!;
    await probe.context.suspend();
    probe.holdLoops = false;
    probe.held.splice(0).forEach(release => release());
    for (let index = 0; index < 16; index++) await Promise.resolve();
  });
  expect(await output()).toMatchObject({ state: 'suspended', loops: 0, music: 0 });
  await page.evaluate(async () => {
    const probe = (window as Window & { audioResumeProbe?: { context: AudioContext } }).audioResumeProbe!;
    await probe.context.resume();
  });
  await expect.poll(async () => (await output()).loops).toBe(2);
  await expect.poll(async () => (await output()).music).toBeGreaterThan(0.0001);
  await expect.poll(async () => (await output()).ambience).toBeGreaterThan(0.0001);
});

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
    await page.setViewportSize(partySize === 1 ? { width: 320, height: 568 } : partySize === 2 ? { width: 390, height: 844 } : { width: 562, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: '开始游戏' }).click();
    await page.getByRole('button', { name: '声音设置', exact: true }).click();
    await page.getByRole('switch', { name: '背景音乐', exact: true }).click();
    await page.keyboard.press('Escape');
    const cards = page.locator('.preset-card-modern');
    for (let index = 1; index < partySize; index++) await cards.nth(index).click();
    await page.getByRole('button', { name: '进入游戏' }).click();
    await expect(page.locator('.game-screen')).toBeVisible();
    const draft = '先观察现场，保留这段未提交的行动。\n再询问目击者。';
    await page.locator('.dock-input').fill(draft);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
    await page.getByRole('button', { name: '声音设置', exact: true }).click();
    await expect(page.getByRole('switch', { name: '背景音乐', exact: true })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: '游戏音效' })).toBeChecked();
    await page.getByText('音乐与音效鸣谢', { exact: true }).click();
    await expect(page.getByRole('link', { name: 'Kevin MacLeod' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '调查菜单' }).getByRole('button', { name: '声音设置', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '继续调查', exact: true }).click();
    await expect(page.locator('.dock-input')).toHaveValue(draft);
    await page.getByRole('button', { name: '菜单', exact: true }).click();
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

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 562, height: 1000 }, { width: 1440, height: 900 }]) {
  test(`drawn sound controls retain touch, volume and fixed return at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size); await page.goto('/');
    const entry = page.getByRole('button', { name: '声音设置', exact: true }); await entry.click();
    const dialog = page.getByRole('dialog', { name: '声音设置' });
    const close = dialog.getByRole('button', { name: '关闭声音设置' });
    const body = dialog.locator('.audio-settings-body');
    const music = dialog.getByRole('slider', { name: '音乐音量' });
    const effects = dialog.getByRole('slider', { name: '音效音量' });
    const preview = dialog.getByRole('button', { name: '试听骰子音效' });
    const credits = dialog.locator('summary');
    const reachable = async (locator: typeof close) => {
      await locator.scrollIntoViewIfNeeded();
      const result = await locator.evaluate(e => {
        const r = e.getBoundingClientRect(), b = e.closest('.audio-settings-body')?.getBoundingClientRect();
        return { height: r.height, width: r.width, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
          && (!b || r.top >= b.top - .5 && r.bottom <= b.bottom + .5), hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
      });
      expect(result.height).toBeGreaterThanOrEqual(44); expect(result.width).toBeGreaterThanOrEqual(44);
      expect(result.inside).toBe(true); expect(result.hit).toBe(true);
    };
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    expect(await dialog.locator('.audio-channel').first().evaluate(e => getComputedStyle(e).borderImageSource)).toContain('panel-frame');
    expect(await preview.evaluate(e => getComputedStyle(e, '::before').borderImageSource)).toContain('button-secondary');
    for (const target of [close, dialog.getByRole('switch', { name: '背景音乐', exact: true }), music,
      dialog.getByRole('switch', { name: '游戏音效' }), effects, preview, credits]) await reachable(target);
    expect(await dialog.locator('.audio-channel label').first().evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(15);
    await music.fill('37'); await music.press('ArrowRight'); await expect(music).toHaveValue('38');
    await expect(music).toHaveAttribute('aria-valuetext', '38%');
    await dialog.getByRole('switch', { name: '背景音乐', exact: true }).click(); await expect(music).toBeDisabled();
    await effects.fill('0'); await expect(preview).toBeDisabled();
    await effects.press('End'); await expect(effects).toHaveValue('100'); await expect(effects).toHaveAttribute('aria-valuetext', '100%');
    await effects.press('Home'); await expect(effects).toHaveValue('0');
    await effects.fill('23'); await preview.click();
    await credits.focus(); await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    await credits.click(); await expect(dialog.getByRole('link', { name: 'Kevin MacLeod' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const headerBefore = await close.boundingBox();
    for (const name of ['Kevin MacLeod', 'CC BY 4.0', 'Kenney', 'CC0']) await reachable(dialog.getByRole('link', { name, exact: true }));
    const headerAfter = await close.boundingBox(); expect(headerAfter!.y).toBeCloseTo(headerBefore!.y, 1);
    await dialog.getByRole('link', { name: 'CC0', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    if (size.width === 390) { await credits.click(); await body.evaluate(e => { e.scrollTop = 0; }); await page.screenshot({ path: testInfo.outputPath('audio-controls.png') }); }
    await page.setViewportSize({ width: size.width, height: 300 }); await expect(close).toBeInViewport(); await reachable(close);
    await reachable(credits);
    if (!await dialog.locator('.audio-credits').evaluate(e => (e as HTMLDetailsElement).open)) await credits.click();
    await reachable(dialog.getByRole('link', { name: 'CC0', exact: true }));
    await reachable(close); expect(await dialog.evaluate(e => e.scrollTop)).toBe(0);
    await close.click(); await expect(dialog).not.toBeVisible(); await expect(entry).toBeFocused();
    await page.setViewportSize(size); await page.reload(); await entry.click();
    await expect(music).toHaveValue('38'); await expect(music).toBeDisabled(); await expect(effects).toHaveValue('23');
    await expect(dialog.getByRole('switch', { name: '游戏音效' })).toBeChecked();
    await dialog.getByRole('switch', { name: '背景音乐', exact: true }).click(); await expect(music).toHaveValue('38');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.keyboard.press('Escape'); await expect(entry).toBeFocused();
  });
}
