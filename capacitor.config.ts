import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rainbowlion.fogtrpg',
  appName: '雾中消逝',
  webDir: 'dist-android',
  loggingBehavior: 'none',
  android: {
    backgroundColor: '#0d0c0a',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    minWebViewVersion: 110,
  },
  server: { errorPath: 'unsupported.html' },
  plugins: { CapacitorHttp: { enabled: false }, SystemBars: { hidden: true, insetsHandling: 'css' } },
};

export default config;
