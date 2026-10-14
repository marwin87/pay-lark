import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/test-results',
  globalSetup: './tests/e2e/global-setup',
  globalTeardown: './tests/e2e/global-teardown',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  webServer: {
    command: 'docker compose up -d --wait backend frontend demo-data',
    // Forces the rate limiter off on a fresh start; see global-setup.ts for why and
    // for the already-running-stack case.
    env: { RATE_LIMIT_ENABLED: 'false' },
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3010',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3010',
    trace: 'on-first-retry',
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
