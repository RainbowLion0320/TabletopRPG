interface BundleEntry {
  type: 'asset' | 'chunk';
  fileName: string;
  code?: string;
  source?: string | Uint8Array;
}

/** Vite can emit an ELK worker after its desktop importer has been removed. */
export function removeUnusedAndroidGraphWorkers(bundle: Record<string, BundleEntry>): number {
  const workers = Object.entries(bundle).filter(([name, entry]) => entry.type === 'asset'
    && name === entry.fileName && /^assets\/elk-worker\.min-[\w-]+\.js$/.test(name));
  const otherEntries = Object.values(bundle).filter(entry => !workers.some(([name]) => name === entry.fileName));
  for (const [name] of workers) {
    const basename = name.slice(name.lastIndexOf('/') + 1);
    for (const entry of otherEntries) {
      const text = entry.type === 'chunk' ? entry.code
        : /\.(?:js|css|html|json)$/.test(entry.fileName)
          ? typeof entry.source === 'string' ? entry.source : entry.source && new TextDecoder().decode(entry.source)
          : undefined;
      if (text?.includes(basename)) throw new Error('Android bundle still references a desktop graph worker.');
    }
  }
  for (const [name] of workers) delete bundle[name];
  return workers.length;
}
