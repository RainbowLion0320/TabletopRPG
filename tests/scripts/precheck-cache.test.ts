import { describe, expect, it } from 'vitest';
// @ts-expect-error The production helper is an intentionally dependency-free Node ESM module.
import { buildCacheFileEntries, cacheFilesMatch } from '../../scripts/precheck-cache.mjs';

describe('precheck cache file snapshots', () => {
  it('keeps a missing optional .env.local as a stable mtime=0 entry', () => {
    const paths = ['/project/package.json', '/project/.env.local'];
    const mtimes = new Map<string, number>([
      ['/project/package.json', 123],
      ['/project/.env.local', 0]
    ]);
    const getMtime = (path: string) => mtimes.get(path) ?? 0;
    const entries = buildCacheFileEntries(paths, getMtime);

    expect(entries).toEqual([
      { path: '/project/package.json', mtime: 123 },
      { path: '/project/.env.local', mtime: 0 }
    ]);
    expect(cacheFilesMatch(paths, entries, getMtime)).toBe(true);
  });

  it('invalidates when a missing optional file is later created', () => {
    const paths = ['/project/.env.local'];
    const entries = [{ path: '/project/.env.local', mtime: 0 }];
    expect(cacheFilesMatch(paths, entries, () => 456)).toBe(false);
  });
});
