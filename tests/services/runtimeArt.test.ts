// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createRuntimeArtCache } from '../../scripts/runtime-art';

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fog-art-test-')); roots.push(root);
  await fs.mkdir(path.join(root, 'assets', 'scenes'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets', 'avatars'));
  return { root, importer: path.join(root, 'src', 'story.ts'), cache: path.join(root, 'output', 'android-art') };
}
const image = (width = 2000, height = 1200, red = 160) => sharp({ create: {
  width, height, channels: 4, background: { r: red, g: 70, b: 30, alpha: .4 }
} }).png().toBuffer();

afterEach(async () => {
  const temp = await fs.realpath(os.tmpdir());
  for (const root of roots.splice(0)) {
    const actual = await fs.realpath(root);
    if (path.dirname(actual) !== temp || !path.basename(actual).startsWith('fog-art-test-')) throw new Error('Fixture cleanup escaped its temporary workspace.');
    await fs.rm(actual, { recursive: true, force: true });
  }
});

describe('shared runtime art cache', () => {
  it('preserves masters and transparency with separate scene and portrait sizes for identical pixels', async () => {
    const { root, importer, cache } = await fixture(), png = await image();
    const scene = path.join(root, 'assets', 'scenes', 'room.png'), person = path.join(root, 'assets', 'avatars', 'person.png');
    await fs.writeFile(scene, png); await fs.writeFile(person, png);
    const art = createRuntimeArtCache(root);
    const sceneResult = (await art.resolve('../assets/scenes/room.png', importer))!;
    const personResult = (await art.resolve('../assets/avatars/person.png', importer))!;
    expect(sceneResult).not.toBe(personResult);
    expect(await sharp(await fs.readFile(sceneResult)).metadata()).toMatchObject({ format: 'webp', width: 1800, height: 1080, hasAlpha: true });
    expect(await sharp(await fs.readFile(personResult)).metadata()).toMatchObject({ format: 'webp', width: 900, height: 540, hasAlpha: true });
    const decoded = await sharp(await fs.readFile(personResult)).raw().toBuffer(); expect(decoded[3]).toBe(102);
    expect(await fs.readFile(scene)).toEqual(png); expect(await fs.readFile(person)).toEqual(png);
    expect(await art.resolve('../other.png', importer)).toBeNull();
    expect(await fs.readdir(cache)).toHaveLength(2);
  });

  it('allows simultaneous web and APK preparation and repairs an incomplete cached image', async () => {
    const { root, importer, cache } = await fixture();
    await fs.writeFile(path.join(root, 'assets', 'avatars', 'person.png'), await image(16, 20));
    const results = await Promise.all([createRuntimeArtCache(root).resolve('../assets/avatars/person.png', importer), createRuntimeArtCache(root).resolve('../assets/avatars/person.png', importer)]);
    expect(results[0]).toBe(results[1]);
    const file = results[0]!;
    expect(await sharp(await fs.readFile(file)).metadata()).toMatchObject({ format: 'webp', width: 16, height: 20 });
    await fs.writeFile(file, 'interrupted generation');
    expect(await createRuntimeArtCache(root).resolve('../assets/avatars/person.png', importer)).toBe(file);
    expect(await sharp(await fs.readFile(file)).metadata()).toMatchObject({ format: 'webp', width: 16, height: 20 });
    expect(await fs.readdir(cache)).toEqual([path.basename(file)]);
  });

  it('prunes only obsolete hash entries and retains current images unused by this particular build', async () => {
    const { root, importer, cache } = await fixture();
    const person = path.join(root, 'assets', 'avatars', 'person.png'), other = path.join(root, 'assets', 'avatars', 'other.png');
    await fs.writeFile(person, await image(16, 20)); await fs.writeFile(other, await image(16, 20, 180));
    const first = createRuntimeArtCache(root);
    const old = (await first.resolve('../assets/avatars/person.png', importer))!;
    const untouched = (await first.resolve('../assets/avatars/other.png', importer))!;
    await fs.writeFile(person, await image(16, 20, 200));
    const next = createRuntimeArtCache(root), current = (await next.resolve('../assets/avatars/person.png', importer))!;
    await fs.writeFile(path.join(cache, '0000000000000000.webp'), 'obsolete');
    await fs.writeFile(path.join(cache, 'keep-for-review.webp'), 'unrecognized owner');
    await fs.mkdir(path.join(cache, '1111111111111111.webp'));
    expect((await next.prune()).removedFiles).toBe(2);
    expect((await next.prune()).removedFiles).toBe(0);
    expect(await fs.readdir(cache)).toEqual(expect.arrayContaining([path.basename(current), path.basename(untouched), 'keep-for-review.webp', '1111111111111111.webp']));
    await expect(fs.stat(old)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(path.join(cache, 'keep-for-review.webp'), 'utf8')).toBe('unrecognized owner');
    expect(await fs.readFile(person)).toEqual(await image(16, 20, 200));
  });

  it('rejects a linked cache directory before generating or deleting files through it', async () => {
    const { root, importer, cache } = await fixture(), outside = path.join(root, 'unrelated');
    await fs.mkdir(path.dirname(cache)); await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, '0000000000000000.webp'), 'keep this file');
    await fs.writeFile(path.join(root, 'assets', 'avatars', 'person.png'), await image(16, 20));
    await fs.symlink(outside, cache, process.platform === 'win32' ? 'junction' : 'dir');
    const art = createRuntimeArtCache(root);
    await expect(art.resolve('../assets/avatars/person.png', importer)).rejects.toThrow('regular directory');
    await expect(art.prune()).rejects.toThrow('regular directory');
    expect(await fs.readFile(path.join(outside, '0000000000000000.webp'), 'utf8')).toBe('keep this file');
    expect(await fs.readdir(outside)).toEqual(['0000000000000000.webp']);
  });
});
