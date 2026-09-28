import { Elysia } from 'elysia';
import { runMigrations } from './db/client';
import { env } from './lib/env';
import { authRoutes } from './routes/auth';
import { characterRoutes } from './routes/characters';
import { summaryRoutes } from './routes/summary';
import { startScheduler } from './services/scheduler';
import { syncRoutes } from './routes/sync';

runMigrations();

const app = new Elysia()
  .onError(({ error, code }) => {
    console.error(`[${code}]`, error);
    return { error: error instanceof Error ? error.message : String(error) };
  })
  .get('/', ({ redirect }) => redirect('/characters'))
  .use(authRoutes)
  .use(characterRoutes)
  .use(syncRoutes)
  .use(summaryRoutes)
  .listen(env.port);

console.log(`EVE Ledger API en http://localhost:${app.server?.port}`);
console.log(`Vincula un personaje: http://localhost:${app.server?.port}/auth/login`);

await startScheduler();
