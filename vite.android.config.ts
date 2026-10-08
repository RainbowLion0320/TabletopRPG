import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { runtimeArtPlugin } from './scripts/runtime-art';
import { getAndroidAiDefines } from './src/config/androidBuildDefaults';
import { removeUnusedAndroidGraphWorkers } from './scripts/android-bundle';

const root = import.meta.dirname;

export default defineConfig(({ command }) => ({
  root,
  base: '/',
  envDir: false,
  envPrefix: 'ANDROID_PUBLIC_',
  plugins: [{ name: 'android-entry',
    transformIndexHtml: { order: 'pre', handler: () => fs.readFileSync(path.join(root, 'mobile/index.html'), 'utf8') },
    generateBundle: { order: 'post', handler(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'unsupported.html', source: fs.readFileSync(path.join(root, 'mobile/unsupported.html'), 'utf8') });
      removeUnusedAndroidGraphWorkers(bundle);
    } },
  }, react(), runtimeArtPlugin(root)],
  define: { ...getAndroidAiDefines(command, process.env), 'import.meta.env.ANDROID_PUBLIC_NATIVE_BUNDLE': 'true' },
  server: { host: '127.0.0.1', port: 5275, strictPort: true, fs: { allow: [root] } },
  build: { outDir: path.join(root, 'dist-android'), emptyOutDir: true, target: 'chrome110', sourcemap: false },
}));
