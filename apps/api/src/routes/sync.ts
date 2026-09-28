import { Elysia, t } from 'elysia';
import { desc } from 'drizzle-orm';
import { db } from '../db/client';
import { syncLog } from '../db/schema';
import { schedulerStatus } from '../services/scheduler';
import { syncAll, syncCharacter } from '../services/sync';

export const syncRoutes = new Elysia({ prefix: '/sync' })
  .post('/all', async () => {
    const results = await syncAll();
    return {
      inserted: results.reduce((n, r) => n + r.inserted, 0),
      errors: results.filter((r) => r.error).length,
      results,
    };
  })
  .post(
    '/:characterId',
    async ({ params, status }) => {
      const result = await syncCharacter(params.characterId);
      return result.error ? status(502, result) : result;
    },
    { params: t.Object({ characterId: t.Numeric() }) },
  )
  // Estado del cron: próximo sync automático y resultado del último
  .get('/status', () => schedulerStatus())
  // Últimas ejecuciones, para revisar errores
  .get(
    '/log',
    ({ query }) =>
      db
        .select()
        .from(syncLog)
        .orderBy(desc(syncLog.id))
        .limit(query.limit ?? 50),
    { query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 500 })) }) },
  );
