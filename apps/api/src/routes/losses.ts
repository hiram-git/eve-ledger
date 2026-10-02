import { Elysia, t } from 'elysia';
import { isLinkedPilot, notLinked, pilotQuery } from '../lib/pilot-filter';
import { shipLosses } from '../services/losses';

// Naves perdidas en el período, cómo tocan el wallet (seguro, reposición y transporte) y lo que costaron
export const lossRoutes = new Elysia().get(
  '/losses',
  async ({ query, status }) => {
    if (!(await isLinkedPilot(query.characterId))) return status(404, notLinked(query.characterId));
    // spend y shipCouriers son para el resumen (PvP con naves), no para la web
    const { spend: _, shipCouriers: __, ...losses } = await shipLosses(query.days ?? 30, query.characterId);
    return losses;
  },
  { query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })), ...pilotQuery }) },
);
