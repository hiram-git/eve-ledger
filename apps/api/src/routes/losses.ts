import { Elysia, t } from 'elysia';
import { isLinkedPilot, notLinked, pilotQuery } from '../lib/pilot-filter';
import { shipLosses } from '../services/losses';

// Naves perdidas en el período y cómo tocan el wallet (seguro, primas y reposición)
export const lossRoutes = new Elysia().get(
  '/losses',
  async ({ query, status }) =>
    (await isLinkedPilot(query.characterId))
      ? shipLosses(query.days ?? 30, query.characterId)
      : status(404, notLinked(query.characterId)),
  { query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })), ...pilotQuery }) },
);
