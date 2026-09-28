import { Elysia, t } from 'elysia';
import { listTransactions } from '../services/transactions';

const DAY_MS = 86_400_000;

export const transactionRoutes = new Elysia().get(
  '/transactions',
  ({ query }) =>
    listTransactions({
      from: new Date(Date.now() - (query.days ?? 30) * DAY_MS),
      characterId: query.characterId,
      typeId: query.typeId,
      limit: query.limit ?? 200,
    }),
  {
    query: t.Object({
      days: t.Optional(t.Numeric({ minimum: 1, maximum: 3650 })),
      characterId: t.Optional(t.Numeric()),
      typeId: t.Optional(t.Numeric()),
      limit: t.Optional(t.Numeric({ minimum: 1, maximum: 5000 })),
    }),
  },
);
