import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { encrypt } from '../lib/crypto';
import { env } from '../lib/env';
import { buildAuthorizeUrl, exchangeCode, verifyAccessToken } from '../lib/sso';
import { syncCharacter } from '../services/sync';

// Estados pendientes en memoria (app local, un solo usuario)
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60_000;

// El resultado se muestra en el dashboard (apps/web/src/pages/pilotos.astro), con el tema del proyecto
const toPilots = (params: Record<string, string>) => `${env.webUrl}/pilotos?${new URLSearchParams(params)}`;

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
    async ({ query, redirect }) => {
      // El usuario canceló en la pantalla de EVE (o EVE devolvió un error)
      if (!query.code) return redirect(toPilots({ error: 'denied' }));

      const exp = query.state ? pendingStates.get(query.state) : undefined;
      if (query.state) pendingStates.delete(query.state);
      if (!exp || exp < Date.now()) return redirect(toPilots({ error: 'state' }));

      let characterId: number;
      try {
        const tokens = await exchangeCode(query.code);
        const id = await verifyAccessToken(tokens.access_token);
        characterId = id.characterId;

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
        syncCharacter(id.characterId).then(
          (r) => console.log(`[auth] sync inicial de ${id.name}: ${r.error ?? `${r.inserted} movimientos`}`),
          (err) => console.error(`[auth] sync inicial de ${id.name} falló:`, err),
        );
      } catch (err) {
        console.error('[auth] callback:', err);
        const detail = err instanceof Error ? err.message : String(err);
        return redirect(toPilots({ error: 'sso', detail: detail.slice(0, 200) }));
      }

      return redirect(toPilots({ linked: String(characterId) }));
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    },
  );
