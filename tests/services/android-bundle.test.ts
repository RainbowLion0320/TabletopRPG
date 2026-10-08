import { describe, expect, it } from 'vitest';
import { removeUnusedAndroidGraphWorkers } from '../../scripts/android-bundle';

const worker = 'assets/elk-worker.min-qa123.js';
const workerAsset = () => ({ type: 'asset' as const, fileName: worker, source: 'desktop layout code' });

describe('unused Android graph output', () => {
  it('removes only the known unreferenced emitted asset and preserves unrelated resources', () => {
    const bundle = {
      [worker]: workerAsset(),
      'assets/game.js': { type: 'chunk' as const, fileName: 'assets/game.js', code: 'renderPhotoDossiers()' },
      'assets/custom-worker.js': { type: 'asset' as const, fileName: 'assets/custom-worker.js', source: 'other worker' },
      'assets/photo.webp': { type: 'asset' as const, fileName: 'assets/photo.webp', source: new Uint8Array([1, 2]) }
    };
    expect(removeUnusedAndroidGraphWorkers(bundle)).toBe(1);
    expect(Object.keys(bundle)).toEqual(['assets/game.js', 'assets/custom-worker.js', 'assets/photo.webp']);
    expect(removeUnusedAndroidGraphWorkers(bundle)).toBe(0);
  });

  it('fails before removing either worker when a game chunk still uses the desktop layout', () => {
    const second = 'assets/elk-worker.min-second.js';
    const bundle = {
      [worker]: workerAsset(),
      [second]: { type: 'asset' as const, fileName: second, source: 'another layout' },
      'assets/game.js': { type: 'chunk' as const, fileName: 'assets/game.js', code: `new Worker('/${second}')` }
    };
    expect(() => removeUnusedAndroidGraphWorkers(bundle)).toThrow('still references');
    expect(Object.keys(bundle)).toEqual([worker, second, 'assets/game.js']);
  });

  it('also protects a live reference in an encoded HTML asset', () => {
    const bundle = {
      [worker]: workerAsset(),
      'index.html': { type: 'asset' as const, fileName: 'index.html', source: new TextEncoder().encode(`<link rel="preload" href="/${worker}">`) }
    };
    expect(() => removeUnusedAndroidGraphWorkers(bundle)).toThrow('still references');
    expect(Object.keys(bundle)).toContain(worker);
  });
});
