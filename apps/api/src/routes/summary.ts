import { Elysia, t } from 'elysia';
import { getSummary } from '../services/summary';

export const summaryRoutes = new Elysia().get('/summary', ({ query }) => getSummary(query.days ?? 30), {
  query: t.Object({ days: t.Optional(t.Numeric({ minimum: 1, maximum: 365 })) }),
});
