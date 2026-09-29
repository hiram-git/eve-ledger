import { Elysia, t } from 'elysia';
import { isLinkedPilot, notLinked, pilotQuery } from '../lib/pilot-filter';
import { getSummary } from '../services/summary';

export const summaryRoutes = new Elysia().get(
  '/summary',
  async ({ query, status }) =>
    (await isLinkedPilot(query.characterId))
      ? getSummary(query.days ?? 30, query.characterId)
      : status(404, notLinked(query.characterId)),
  { query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })), ...pilotQuery }) },
);
