import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for RepairDesk.
 *
 * Tests real browser behavior:
 * - CORS preflight and cross-origin requests
 * - httpOnly cookie handling
 * - Protected route redirects
 * - Form submissions
 * - Error UI states
 *
 * Run: npx playwright test
 * Run UI: npx playwright test --ui
 * Run headed: npx playwright test --headed
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run sequentially to avoid session conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev --prefix apps/web',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
