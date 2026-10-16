import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, WEB_PORT, WEB_URL } from './e2e/fixtures';

// End-to-end tests: the API with a new demo database (e2e/serve-api.ts) and the built web
// (`bun run build` first; `bun run test:e2e` does it), both with Bun as in the desktop app.
// A single worker: they share the database and the backup test changes it
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun e2e/serve-api.ts',
      url: `${API_URL}/sync/status`,
      env: { E2E_API_PORT: String(API_PORT), E2E_WEB_PORT: String(WEB_PORT) },
      timeout: 60_000,
      stdout: 'pipe',
    },
    {
      command: 'bun ./dist/server/entry.mjs',
      url: `${WEB_URL}/pilotos`,
      env: { API_URL, PORT: String(WEB_PORT), HOST: '127.0.0.1', PILOT_SLOTS: '5' },
      timeout: 60_000,
    },
  ],
});
