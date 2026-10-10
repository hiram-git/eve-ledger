import { Elysia, t } from 'elysia';
import { desc } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, syncLog } from '../db/schema';
import { env } from '../lib/env';
import { esiGet } from '../lib/esi';
import { SCOPES } from '../lib/sso';

// Personajes vinculados con su estado: permisos que faltan y último error de sync (si es posterior al último éxito)
async function listCharacters() {
  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      scopes: characters.scopes,
      lastSyncAt: characters.lastSyncAt,
      createdAt: characters.createdAt,
      linkedAt: characters.linkedAt,
      clone: characters.clone,
    })
    .from(characters);

  const logs = await db.select().from(syncLog).orderBy(desc(syncLog.id)).limit(500);

  return rows.map((c) => {
    const granted = c.scopes.split(' ').filter(Boolean);
    const last = logs.find((l) => l.characterId === c.id && l.finishedAt);
    // Último vínculo: el primero o, si se revinculó, el más reciente (los errores de antes ya no cuentan)
    const linkedAt = c.linkedAt ?? c.createdAt;
    const lastError =
      last?.error && (!c.lastSyncAt || last.startedAt >= c.lastSyncAt) && last.startedAt >= linkedAt
        ? { at: last.finishedAt, kind: last.kind, message: last.error }
        : null;
    return {
      ...c,
      linkedAt,
      scopes: granted,
      missingScopes: SCOPES.filter((s) => !granted.includes(s)),
      lastError,
    };
  });
}

export const characterRoutes = new Elysia({ prefix: '/characters' })
  // En el navegador se ve la página de pilotos del dashboard; los scripts reciben JSON
  .get('/', ({ request, redirect }) => {
    const accept = request.headers.get('accept') ?? '';
    if (accept.includes('text/html')) return redirect(`${env.webUrl}/pilotos`);
    return listCharacters();
  })
  // Prueba de punta a punta: refresh de token + llamada autenticada a ESI
  .get(
    '/:id/wallet',
    async ({ params }) => {
      const { data } = await esiGet<number>(`/characters/${params.id}/wallet`, params.id);
      return { characterId: params.id, balance: data };
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
