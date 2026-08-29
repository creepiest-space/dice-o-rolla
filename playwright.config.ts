import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/dice-demo/e2e',
  outputDir: './artifacts/playwright-results',
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['line'], ['html', { open: 'never', outputFolder: 'artifacts/playwright-report' }]],
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun --hot --port 4173 ./index.html',
    cwd: './apps/dice-demo',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
