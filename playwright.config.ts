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
  // Frame-timing assertions can lose a sample to a busy runner; one retry absorbs
  // that without hiding a real failure, and only costs time when something trips.
  retries: process.env.CI ? 1 : 0,
  // On CI also write the machine-readable report: the workflow turns it into
  // annotations, which are readable without repository admin rights.
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'test-results/report.json' }]]
    : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Existing flow regressions represent returning players who already know the
    // controls, so the guide is switched off here. Its own behaviour is covered by
    // tests/app/onboarding.test.tsx, which starts real games without this opt-out.
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`,
      localStorage: [{ name: 'trpg-opening-v1', value: 'seen' }, { name: 'trpg-tutorial-opt-out', value: 'off' }] }] },
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
