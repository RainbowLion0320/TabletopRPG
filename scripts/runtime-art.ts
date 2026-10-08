import type { Plugin } from 'vite';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

function artProfile(original: string) {
  const scene = original.includes(`${path.sep}scenes${path.sep}`);
  return { width: scene ? 1920 : 900, height: scene ? 1080 : 1200 };
}

function artKey(input: Buffer, original: string): string {
  // Bump the policy version when changing resize or codec settings.
  return createHash('sha256').update(input).update('runtime-webp-v2')
    .update(JSON.stringify(artProfile(original))).digest('hex').slice(0, 16);
}

/** The existing Android cache is shared by both builds; masters stay in assets. */
export function createRuntimeArtCache(projectDirectory: string) {
  const root = realpathSync(projectDirectory);
  const assets = path.join(root, 'assets');
  const cache = path.join(root, 'output', 'android-art');
  const used = new Set<string>();
  const preparing = new Map<string, Promise<void>>();

  async function ensureCache() {
    for (const directory of [path.dirname(cache), cache]) {
      await fs.mkdir(directory).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink() || path.relative(root, await fs.realpath(directory)) !== path.relative(root, directory)) {
        throw new Error('Art cache must be a regular directory inside this project.');
      }
    }
  }

  async function regularCacheFile(file: string): Promise<boolean> {
    const stat = await fs.lstat(file).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
    if (!stat) return false;
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Do not use a linked or non-file art cache entry.');
    return true;
  }

  async function resolve(source: string, importer?: string): Promise<string | null> {
    if (!source.endsWith('.png') || !importer) return null;
    const original = path.resolve(path.dirname(importer.split('?')[0]), source);
    const relative = path.relative(assets, original);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) return null;
    const actual = await fs.realpath(original).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; });
    if (!actual) return null;
    if (path.relative(assets, actual) !== relative) throw new Error('Art source must stay inside the project assets directory.');
    const input = await fs.readFile(original);
    const key = artKey(input, original), target = path.join(cache, `${key}.webp`);
    used.add(key);
    if (!preparing.has(key)) preparing.set(key, (async () => {
      await ensureCache();
      if (await regularCacheFile(target)) {
        try { if ((await sharp(await fs.readFile(target)).metadata()).format === 'webp') return; }
        catch { /* A damaged generated entry is rebuilt from its master. */ }
      }
      const encoded = await sharp(input).resize({ ...artProfile(original), fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88, alphaQuality: 100, effort: 5 }).toBuffer();
      const temporary = path.join(cache, `.${key}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, encoded, { flag: 'wx' });
        await fs.rename(temporary, target).catch(async error => {
          // Another build may have atomically installed the same complete image.
          if (!await regularCacheFile(target) || !(await fs.readFile(target)).equals(encoded)) throw error;
        });
      } finally {
        await fs.unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
      }
    })());
    try { await preparing.get(key); }
    catch (error) { preparing.delete(key); throw error; }
    return target;
  }

  async function prune() {
    await ensureCache();
    const current = new Set(used);
    async function collect(directory: string) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await collect(file);
        else if (entry.isFile() && entry.name.endsWith('.png')) current.add(artKey(await fs.readFile(file), file));
      }
    }
    const assetStat = await fs.lstat(assets);
    if (!assetStat.isDirectory() || assetStat.isSymbolicLink()) throw new Error('Do not traverse linked asset roots.');
    await collect(assets);
    let removedFiles = 0, removedBytes = 0;
    for (const entry of await fs.readdir(cache, { withFileTypes: true })) {
      const match = /^([a-f0-9]{16})\.webp$/.exec(entry.name);
      if (!entry.isFile() || !match || current.has(match[1])) continue;
      const target = path.resolve(cache, entry.name);
      if (path.dirname(target) !== cache) throw new Error('Art cache target escaped its directory.');
      if (!await regularCacheFile(target)) continue;
      const bytes = (await fs.stat(target)).size;
      try { await fs.unlink(target); removedFiles++; removedBytes += bytes; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return { removedFiles, removedBytes };
  }

  return { resolve, prune };
}

export function runtimeArtPlugin(root: string): Plugin {
  const cache = createRuntimeArtCache(root);
  return {
    name: 'runtime-optimized-art', enforce: 'pre',
    resolveId: (source, importer) => cache.resolve(source, importer),
    async writeBundle() {
      const removed = await cache.prune();
      if (removed.removedFiles) this.info(`Removed ${removed.removedFiles} obsolete generated art files (${removed.removedBytes} bytes).`);
    },
  };
}
