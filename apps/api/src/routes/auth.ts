import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { encrypt } from '../lib/crypto';
import { buildAuthorizeUrl, exchangeCode, verifyAccessToken } from '../lib/sso';
import { syncJournal } from '../services/sync';

// Estados pendientes en memoria (app local, un solo usuario)
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60_000;

const html = (body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:2rem">${body}</body>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

export const authRoutes = new Elysia({ prefix: '/auth' })
  .get('/login', ({ redirect }) => {
    const now = Date.now();
    for (const [s, exp] of pendingStates) if (exp < now) pendingStates.delete(s);

    const state = crypto.randomUUID();
    pendingStates.set(state, now + STATE_TTL_MS);
    return redirect(buildAuthorizeUrl(state));
  })
  .get(
    '/callback',
    async ({ query }) => {
      const exp = pendingStates.get(query.state);
      pendingStates.delete(query.state);
      if (!exp || exp < Date.now()) return html('<h2>State inválido o expirado.</h2><a href="/auth/login">Reintentar</a>', 400);

      const tokens = await exchangeCode(query.code);
      const id = await verifyAccessToken(tokens.access_token);

      const values = {
        name: id.name,
        ownerHash: id.ownerHash,
        scopes: id.scopes.join(' '),
        refreshToken: await encrypt(tokens.refresh_token),
        accessToken: await encrypt(tokens.access_token),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      };

      await db
        .insert(characters)
        .values({ id: id.characterId, ...values })
        .onConflictDoUpdate({ target: characters.id, set: values });

      // Primer sync en segundo plano: el journal solo guarda ~30 días, cuanto antes mejor
      syncJournal(id.characterId).then(
        (r) => console.log(`[auth] sync inicial de ${id.name}: ${r.error ?? `${r.inserted} movimientos`}`),
        (err) => console.error(`[auth] sync inicial de ${id.name} falló:`, err),
      );

      return html(`
        <img src="https://images.evetech.net/characters/${id.characterId}/portrait?size=128" style="border-radius:8px">
        <h2>${id.name} vinculado ✔</h2>
        <p>Scopes: ${id.scopes.join(', ')}</p>
        <p>Sincronizando su wallet journal en segundo plano…</p>
        <p><a href="/auth/login">Vincular otro personaje</a> · <a href="/characters">Ver personajes</a></p>`);
    },
    { query: t.Object({ code: t.String(), state: t.String() }) },
  );
