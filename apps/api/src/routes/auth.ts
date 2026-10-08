import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { encrypt } from '../lib/crypto';
import { env } from '../lib/env';
import { buildAuthorizeUrl, exchangeCode, loginMethod, newPkce, verifyAccessToken } from '../lib/sso';
import { syncCharacter } from '../services/sync';

// Estados pendientes en memoria (app local, un solo usuario), con el verificador de PKCE si el login lo usa
const pendingStates = new Map<string, { exp: number; verifier?: string }>();
const STATE_TTL_MS = 10 * 60_000;

// El resultado se muestra en el dashboard (apps/web/src/pages/pilotos.astro), con el tema del proyecto.
// La app de escritorio abre el login en el navegador del sistema y lee esta línea de la salida de la API
// para llevar su ventana al mismo resultado (apps/desktop/src-tauri/src/services.rs)
const toPilots = (params: Record<string, string>) => {
  const query = new URLSearchParams(params).toString();
  console.log(`[auth] result:${query}`);
  return `${env.webUrl}/${env.authDonePage ? 'vinculado' : 'pilotos'}?${query}`;
};

export const authRoutes = new Elysia({ prefix: '/auth' })
  .get('/login', async ({ redirect }) => {
    const now = Date.now();
    for (const [s, { exp }] of pendingStates) if (exp < now) pendingStates.delete(s);

    const state = crypto.randomUUID();
    const pkce = loginMethod() === 'pkce' ? await newPkce() : undefined;
    pendingStates.set(state, { exp: now + STATE_TTL_MS, verifier: pkce?.verifier });
    return redirect(buildAuthorizeUrl(state, pkce?.challenge));
  })
  .get(
    '/callback',
    async ({ query, redirect }) => {
      // El usuario canceló en la pantalla de EVE (o EVE devolvió un error)
      if (!query.code) return redirect(toPilots({ error: 'denied' }));

      const pending = query.state ? pendingStates.get(query.state) : undefined;
      if (query.state) pendingStates.delete(query.state);
      if (!pending || pending.exp < Date.now()) return redirect(toPilots({ error: 'state' }));

      let characterId: number;
      try {
        const tokens = await exchangeCode(query.code, pending.verifier);
        const id = await verifyAccessToken(tokens.access_token);
        characterId = id.characterId;

        const values = {
          name: id.name,
          ownerHash: id.ownerHash,
          scopes: id.scopes.join(' '),
          authMethod: pending.verifier ? ('pkce' as const) : ('secret' as const),
          refreshToken: await encrypt(tokens.refresh_token),
          accessToken: await encrypt(tokens.access_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          linkedAt: new Date(),
        };

        await db
          .insert(characters)
          .values({ id: id.characterId, ...values })
          .onConflictDoUpdate({ target: characters.id, set: values });

        // Primer sync en segundo plano: el journal solo guarda ~30 días, cuanto antes mejor. Al revincular, si ya
        // había un sync de ese piloto en marcha (con el token viejo), se repite en cuanto acabe
        syncCharacter(id.characterId, { queue: true }).then(
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
