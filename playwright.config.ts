import { defineConfig, devices } from '@playwright/test';

const port = 4174;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results/playwright',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  // Keep real compositor-frame checks reliable on a shared development machine.
  workers: 4,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Existing flow regressions represent returning players. Fresh cinematic playback
    // is verified independently without this saved presentation preference.
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`,
      localStorage: [{ name: 'trpg-opening-v1', value: 'seen' }] }] },
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
