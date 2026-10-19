import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './src/tests',
  testMatch: '**/*.e2e.ts',
  outputDir: '../test-results/browser',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'node --import tsx backend/src/tests/e2e-server.ts',
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    url: 'http://localhost:5174/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
