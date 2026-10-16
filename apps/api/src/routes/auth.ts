import { Elysia, t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { encrypt } from '../lib/crypto';
import { env } from '../lib/env';
import { buildAuthorizeUrl, exchangeCode, newPkce, verifyAccessToken } from '../lib/sso';
import { syncCharacter } from '../services/sync';

// Pending states in memory (local app, single user), with the PKCE verifier if the login uses it
const pendingStates = new Map<string, { exp: number; verifier: string }>();
const STATE_TTL_MS = 10 * 60_000;

// The result is shown in the dashboard (apps/web/src/pages/pilotos.astro), with the project's theme.
// The desktop app opens the login in the system browser and reads this line from the API output
// to bring its window to the same result (apps/desktop/src-tauri/src/services.rs)
// The app is only notified (the [auth] result: line, which brings its window to the front) if the callback belongs
// to a login that started here: any site could request /auth/callback without a code over and over
const toPilots = (params: Record<string, string>, notify = true) => {
  const query = new URLSearchParams(params).toString();
  if (notify) console.log(`[auth] result:${query}`);
  return `${env.webUrl}/${env.authDonePage ? 'vinculado' : 'pilotos'}?${query}`;
};

export const authRoutes = new Elysia({ prefix: '/auth' })
  .get('/login', async ({ redirect }) => {
    const now = Date.now();
    for (const [s, { exp }] of pendingStates) if (exp < now) pendingStates.delete(s);

    const state = crypto.randomUUID();
    // Always PKCE: only the Client ID, no secret
    const pkce = await newPkce();
    pendingStates.set(state, { exp: now + STATE_TTL_MS, verifier: pkce.verifier });
    return redirect(buildAuthorizeUrl(state, pkce.challenge));
  })
  .get(
    '/callback',
    async ({ query, redirect }) => {
      const pending = query.state ? pendingStates.get(query.state) : undefined;
      if (query.state) pendingStates.delete(query.state);
      const known = !!pending && pending.exp >= Date.now();
      // The user cancelled on the EVE screen (or EVE returned an error)
      if (!query.code) return redirect(toPilots({ error: 'denied' }, known));
      if (!known) return redirect(toPilots({ error: 'state' }, false));

      let characterId: number;
      try {
        const tokens = await exchangeCode(query.code, pending!.verifier);
        const id = await verifyAccessToken(tokens.access_token);
        characterId = id.characterId;

        const values = {
          name: id.name,
          ownerHash: id.ownerHash,
          scopes: id.scopes.join(' '),
          authMethod: 'pkce' as const,
          refreshToken: await encrypt(tokens.refresh_token),
          accessToken: await encrypt(tokens.access_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          linkedAt: new Date(),
        };

        await db
          .insert(characters)
          .values({ id: id.characterId, ...values })
          .onConflictDoUpdate({ target: characters.id, set: values });

        // First sync in the background: the journal only keeps ~30 days, the sooner the better. When relinking, if
        // a sync of that pilot was already running (with the old token), it is repeated as soon as it finishes
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
