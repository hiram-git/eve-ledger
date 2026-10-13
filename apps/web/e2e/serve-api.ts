// The test API (bun): a new database in a temporary folder with the demo data, without automatic
// sync (doesn't call ESI) and on the test port. Playwright starts it (playwright.config.ts)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'eve-ledger-e2e-'));
Object.assign(Bun.env, {
  DB_PATH: join(dir, 'ledger.db'),
  MIGRATIONS_DIR: join(import.meta.dir, '../../api/drizzle'),
  PORT: Bun.env.E2E_API_PORT ?? '3999',
  HOST: '127.0.0.1',
  SYNC_INTERVAL_MIN: '0',
  EVE_CLIENT_ID: 'e2e',
  EVE_CALLBACK_URL: 'http://127.0.0.1:3999/auth/callback',
  ENC_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),
  WEB_URL: `http://127.0.0.1:${Bun.env.E2E_WEB_PORT ?? '4399'}`,
});

const { seed } = await import('./seed');
seed();
console.log(`[e2e] base de demostración en ${dir}`);
await import('../../api/src/index');
