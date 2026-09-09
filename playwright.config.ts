import { defineConfig, devices } from '@playwright/test';

// Playwright sets FORCE_COLOR for workers; avoid conflicting inherited terminal flags.
delete process.env.NO_COLOR;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5187', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.platform === 'win32' ? 'chrome' : undefined,
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: 'node --import tsx tests/fixture.ts',
    url: 'http://127.0.0.1:5187/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
