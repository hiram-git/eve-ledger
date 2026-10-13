import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { decrypt, encrypt } from './crypto';
import { refreshAccessToken, verifyAccessToken } from './sso';

const MARGIN_MS = 60_000;

// Only one refresh at a time per pilot: without a Client Secret (PKCE) EVE invalidates the refresh token as soon
// as it is used, so two parallel refreshes with the same token would leave the second with invalid_grant
const inflight = new Map<number, Promise<string>>();

// Returns a valid access token, refreshing it if needed
export function getAccessToken(characterId: number): Promise<string> {
  const pending = inflight.get(characterId);
  if (pending) return pending;
  const run = freshAccessToken(characterId).finally(() => inflight.delete(characterId));
  inflight.set(characterId, run);
  return run;
}

async function freshAccessToken(characterId: number): Promise<string> {
  const ch = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
  if (!ch) throw new Error(`Personaje ${characterId} no vinculado`);

  if (ch.accessToken && ch.tokenExpiresAt && ch.tokenExpiresAt.getTime() - MARGIN_MS > Date.now()) {
    return decrypt(ch.accessToken);
  }

  const tokens = await refreshAccessToken(await decrypt(ch.refreshToken), ch.authMethod);

  // EVE rotates the refresh token (without a secret, the used one stops working instantly): the new one is saved before
  // anything that can fail, or a validation failure (e.g. no network for EVE's keys) would lose it and the pilot
  // would be left with an expired token until relinked. Only if nobody changed it in the meantime (relinking)
  const saved = await db
    .update(characters)
    .set({ refreshToken: await encrypt(tokens.refresh_token), accessToken: null, tokenExpiresAt: null })
    .where(and(eq(characters.id, characterId), eq(characters.refreshToken, ch.refreshToken)))
    .returning({ id: characters.id });
  if (!saved.length) {
    // Relinked during the refresh: the new token in the database wins
    const now = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
    if (now?.accessToken && now.tokenExpiresAt && now.tokenExpiresAt.getTime() - MARGIN_MS > Date.now()) {
      return decrypt(now.accessToken);
    }
    throw new Error(`El token de ${ch.name} cambió durante la renovación; vuelve a sincronizar`);
  }

  const identity = await verifyAccessToken(tokens.access_token);
  if (identity.ownerHash !== ch.ownerHash) {
    throw new Error(`El personaje ${ch.name} cambió de dueño; vuelve a vincularlo`);
  }

  // The access token, only once validated (without it, the next call refreshes again with the stored refresh token)
  await db
    .update(characters)
    .set({ accessToken: await encrypt(tokens.access_token), tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000) })
    .where(eq(characters.id, characterId));

  return tokens.access_token;
}
