import { Elysia, t } from 'elysia';
import { desc } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, syncLog } from '../db/schema';
import { env } from '../lib/env';
import { esiGet } from '../lib/esi';
import { OPTIONAL_SCOPES, SCOPES } from '../lib/sso';

// Linked characters with their status: missing permissions and the last sync error (if after the last success)
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
    // Last link: the first one or, if relinked, the most recent (earlier errors no longer count)
    const linkedAt = c.linkedAt ?? c.createdAt;
    const lastError =
      last?.error && (!c.lastSyncAt || last.startedAt >= c.lastSyncAt) && last.startedAt >= linkedAt
        ? { at: last.finishedAt, kind: last.kind, message: last.error }
        : null;
    return {
      ...c,
      linkedAt,
      scopes: granted,
      missingScopes: SCOPES.filter((s) => !granted.includes(s) && !OPTIONAL_SCOPES.includes(s)),
      missingOptionalScopes: OPTIONAL_SCOPES.filter((s) => !granted.includes(s)),
      lastError,
    };
  });
}

export const characterRoutes = new Elysia({ prefix: '/characters' })
  // Browsers get the dashboard's pilots page; scripts get JSON
  .get('/', ({ request, redirect }) => {
    const accept = request.headers.get('accept') ?? '';
    if (accept.includes('text/html')) return redirect(`${env.webUrl}/pilotos`);
    return listCharacters();
  })
  // End-to-end check: token refresh + authenticated ESI call
  .get(
    '/:id/wallet',
    async ({ params }) => {
      const { data } = await esiGet<number>(`/characters/${params.id}/wallet`, params.id);
      return { characterId: params.id, balance: data };
    },
    { params: t.Object({ id: t.Numeric() }) },
  );
