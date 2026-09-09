import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = import.meta.dirname;
function androidAssets(): Plugin {
  return {
    name: 'android-optimized-art', enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith('.png') || !importer) return null;
      const original = path.resolve(path.dirname(importer), source);
      if (!original.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(original)) return null;
      const input = fs.readFileSync(original);
      const key = createHash('sha256').update(input).update('android-webp-v1').digest('hex').slice(0, 16);
      const target = path.join(root, 'output/android-art', `${key}.webp`);
      if (!fs.existsSync(target)) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const scene = original.includes(`${path.sep}scenes${path.sep}`);
        await sharp(input).resize({ width: scene ? 1920 : 900, height: scene ? 1080 : 1200, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 88, alphaQuality: 100, effort: 5 }).toFile(target);
      }
      return target;
    },
  };
}

export default defineConfig({
  root,
  base: '/',
  envDir: false,
  envPrefix: 'ANDROID_PUBLIC_',
  plugins: [{ name: 'android-entry',
    transformIndexHtml: { order: 'pre', handler: () => fs.readFileSync(path.join(root, 'mobile/index.html'), 'utf8') },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'unsupported.html', source: fs.readFileSync(path.join(root, 'mobile/unsupported.html'), 'utf8') }); },
  }, react(), androidAssets()],
  define: Object.fromEntries(['PROVIDER', 'PROTOCOL', 'ENDPOINT', 'API_KEY', 'MODEL'].map(key => [`import.meta.env.VITE_AI_${key}`, '""'])),
  server: { host: '127.0.0.1', port: 5275, strictPort: true, fs: { allow: [root] } },
  build: { outDir: path.join(root, 'dist-android'), emptyOutDir: true, target: 'chrome110', sourcemap: false },
});
