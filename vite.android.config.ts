import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { runtimeArtPlugin } from './scripts/runtime-art';
import { getAndroidAiDefines } from './src/config/androidBuildDefaults';

const root = import.meta.dirname;

export default defineConfig(({ command }) => ({
  root,
  base: '/',
  envDir: false,
  envPrefix: 'ANDROID_PUBLIC_',
  plugins: [{ name: 'android-entry',
    transformIndexHtml: { order: 'pre', handler: () => fs.readFileSync(path.join(root, 'mobile/index.html'), 'utf8') },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'unsupported.html', source: fs.readFileSync(path.join(root, 'mobile/unsupported.html'), 'utf8') }); },
  }, react(), runtimeArtPlugin(root)],
  define: getAndroidAiDefines(command, process.env),
  server: { host: '127.0.0.1', port: 5275, strictPort: true, fs: { allow: [root] } },
  build: { outDir: path.join(root, 'dist-android'), emptyOutDir: true, target: 'chrome110', sourcemap: false },
}));
