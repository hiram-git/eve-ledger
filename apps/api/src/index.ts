import { Elysia } from 'elysia';
import { runMigrations } from './db/client';
import { env } from './lib/env';
import { allowedHosts, localOnly } from './lib/local-only';
import { authRoutes } from './routes/auth';
import { backupRoutes } from './routes/backups';
import { indicatorRoutes } from './routes/indicators';
import { inventoryRoutes } from './routes/inventory';
import { lossRoutes } from './routes/losses';
import { characterRoutes } from './routes/characters';
import { doctrineRoutes } from './routes/doctrines';
import { summaryRoutes } from './routes/summary';
import { backupBeforeMigrations, maybeAutoBackup } from './services/backups';
import { startScheduler } from './services/scheduler';
import { syncRoutes } from './routes/sync';
import { transactionRoutes } from './routes/transactions';

// A new version brings migrations: back up what was there before applying them
backupBeforeMigrations();
runMigrations();

const allowed = allowedHosts();
const app = new Elysia()
  // This machine only: local Host and, for non-GET requests, no foreign Origin (src/lib/local-only.ts)
  .onRequest(({ request }) => localOnly(request, allowed) ?? undefined)
  .onError(({ error, code }) => {
    console.error(`[${code}]`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  })
  .get('/', ({ redirect }) => redirect(`${env.webUrl}/`))
  .use(authRoutes)
  .use(characterRoutes)
  .use(syncRoutes)
  .use(summaryRoutes)
  .use(transactionRoutes)
  .use(inventoryRoutes)
  .use(indicatorRoutes)
  .use(lossRoutes)
  .use(doctrineRoutes)
  .use(backupRoutes)
  .listen({ port: env.port, hostname: env.host });

console.log(`EVE Ledger API en http://localhost:${app.server?.port}`);
console.log(`Vincula un personaje: http://localhost:${app.server?.port}/auth/login`);

await startScheduler();

// The daily backup: at startup and every 6 h (also after each automatic sync round); at most one every 20 h
maybeAutoBackup();
setInterval(maybeAutoBackup, 6 * 3_600_000);
