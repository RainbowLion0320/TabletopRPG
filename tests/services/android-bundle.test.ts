import { describe, expect, it } from 'vitest';
import { removeUnusedAndroidGraphWorkers, removeUnusedAndroidLandscapeOpening } from '../../scripts/android-bundle';

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

describe('portrait Android opening output', () => {
  const landscape = 'assets/opening-landscape-video123.mp4';
  const poster = 'assets/opening-landscape-poster-image123.webp';
  it('removes only dead landscape assets and preserves portrait picture, audio and unrelated resources', () => {
    const bundle = {
      [landscape]: { type: 'asset' as const, fileName: landscape, source: new Uint8Array([1]) },
      [poster]: { type: 'asset' as const, fileName: poster, source: new Uint8Array([2]) },
      'assets/opening-portrait-film.mp4': { type: 'asset' as const, fileName: 'assets/opening-portrait-film.mp4', source: new Uint8Array([3]) },
      'assets/opening-music-track.m4a': { type: 'asset' as const, fileName: 'assets/opening-music-track.m4a', source: new Uint8Array([4]) },
      'assets/landscape.webp': { type: 'asset' as const, fileName: 'assets/landscape.webp', source: new Uint8Array([5]) }
    };
    expect(removeUnusedAndroidLandscapeOpening(bundle)).toBe(2);
    expect(Object.keys(bundle)).toEqual(['assets/opening-portrait-film.mp4', 'assets/opening-music-track.m4a', 'assets/landscape.webp']);
    expect(removeUnusedAndroidLandscapeOpening(bundle)).toBe(0);
  });
  it('fails before deleting anything if a current chunk or encoded HTML still references either composition', () => {
    for (const entry of [
      { type: 'chunk' as const, fileName: 'assets/game.js', code: `const movie='/${landscape}'` },
      { type: 'asset' as const, fileName: 'index.html', source: new TextEncoder().encode(`<link href="/${poster}">`) }
    ]) {
      const bundle = {
        [landscape]: { type: 'asset' as const, fileName: landscape, source: new Uint8Array([1]) },
        [poster]: { type: 'asset' as const, fileName: poster, source: new Uint8Array([2]) },
        [entry.fileName]: entry
      };
      expect(() => removeUnusedAndroidLandscapeOpening(bundle)).toThrow('still references');
      expect(Object.keys(bundle)).toContain(landscape); expect(Object.keys(bundle)).toContain(poster);
    }
  });
});
