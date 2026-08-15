import { defineConfig, devices } from '@playwright/test';

const PORT = 3009;

// Same convention as Ebrigth_OSC's config: accept either Playwright's own
// PLAYWRIGHT_BASE_URL or the staging-deploy workflow's BASE_URL, and only
// spawn a local `next start` when neither points at a real deployment.
const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL;
const useRemoteServer = !!remoteBaseUrl && !/localhost/.test(remoteBaseUrl);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['list']]
    : [['list']],
  use: {
    baseURL: remoteBaseUrl ?? `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: useRemoteServer
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
