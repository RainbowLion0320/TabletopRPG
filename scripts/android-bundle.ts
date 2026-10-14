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
  return removeUnreferencedAssets(bundle, workers, 'Android bundle still references a desktop graph worker.');
}

/** The portrait APK must not retain Vite's dead landscape opening exports. */
export function removeUnusedAndroidLandscapeOpening(bundle: Record<string, BundleEntry>): number {
  const assets = Object.entries(bundle).filter(([name, entry]) => entry.type === 'asset'
    && name === entry.fileName && /^assets\/opening-landscape(?:-poster)?-[\w-]+\.(?:mp4|webp)$/.test(name));
  return removeUnreferencedAssets(bundle, assets, 'Android bundle still references a landscape opening.');
}

function removeUnreferencedAssets(bundle: Record<string, BundleEntry>, assets: [string, BundleEntry][], message: string): number {
  const otherEntries = Object.values(bundle).filter(entry => !assets.some(([name]) => name === entry.fileName));
  for (const [name] of assets) {
    const basename = name.slice(name.lastIndexOf('/') + 1);
    for (const entry of otherEntries) {
      const text = entry.type === 'chunk' ? entry.code
        : /\.(?:js|css|html|json)$/.test(entry.fileName)
          ? typeof entry.source === 'string' ? entry.source : entry.source && new TextDecoder().decode(entry.source)
          : undefined;
      if (text?.includes(basename)) throw new Error(message);
    }
  }
  for (const [name] of assets) delete bundle[name];
  return assets.length;
}
