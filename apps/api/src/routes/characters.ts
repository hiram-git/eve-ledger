import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { esiGet } from '../lib/esi';

export const characterRoutes = new Elysia({ prefix: '/characters' })
  .get('/', () =>
    db
      .select({
        id: characters.id,
        name: characters.name,
        scopes: characters.scopes,
        lastSyncAt: characters.lastSyncAt,
        createdAt: characters.createdAt,
      })
      .from(characters),
  )
  // Prueba de punta a punta: refresh de token + llamada autenticada a ESI
  .get(
    '/:id/wallet',
    async ({ params }) => {
      const { data } = await esiGet<number>(`/characters/${params.id}/wallet`, params.id);
      return { characterId: params.id, balance: data };
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
