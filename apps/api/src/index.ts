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

// Una versión nueva trae migraciones: copia de lo que había antes de aplicarlas
backupBeforeMigrations();
runMigrations();

const allowed = allowedHosts();
const app = new Elysia()
  // Solo esta máquina: Host local y, en lo que no es GET, sin Origin ajeno (src/lib/local-only.ts)
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

// La copia diaria: al arrancar y cada 6 h (tras cada ronda del sync automático también); como mucho una cada 20 h
maybeAutoBackup();
setInterval(maybeAutoBackup, 6 * 3_600_000);
