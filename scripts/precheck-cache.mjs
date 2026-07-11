export function buildCacheFileEntries(paths, getMtime) {
  return paths.map((path) => ({ path, mtime: getMtime(path) }));
}

export function cacheFilesMatch(paths, entries, getMtime) {
  if (!Array.isArray(entries) || paths.length !== entries.length) return false;
  return paths.every((path, index) => {
    const entry = entries[index];
    return entry?.path === path && entry.mtime === getMtime(path);
  });
}
