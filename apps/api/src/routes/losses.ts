import { Elysia, t } from 'elysia';
import { isLinkedPilot, notLinked, pilotQuery } from '../lib/pilot-filter';
import { shipLosses } from '../services/losses';

// Ships lost in the period, how they affect the wallet (insurance, replacement and transport) and what they cost
export const lossRoutes = new Elysia().get(
  '/losses',
  async ({ query, status }) => {
    if (!(await isLinkedPilot(query.characterId))) return status(404, notLinked(query.characterId));
    // spend and shipCouriers are for the summary (PvP con naves), not for the web
    const { spend: _, shipCouriers: __, ...losses } = await shipLosses(query.days ?? 30, query.characterId);
    return losses;
  },
  { query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })), ...pilotQuery }) },
);
