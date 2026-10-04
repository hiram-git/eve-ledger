import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { decrypt, encrypt } from './crypto';
import { refreshAccessToken, verifyAccessToken } from './sso';

const MARGIN_MS = 60_000;

// Devuelve un access token válido, renovándolo si hace falta
export async function getAccessToken(characterId: number): Promise<string> {
  const ch = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
  if (!ch) throw new Error(`Personaje ${characterId} no vinculado`);

  if (ch.accessToken && ch.tokenExpiresAt && ch.tokenExpiresAt.getTime() - MARGIN_MS > Date.now()) {
    return decrypt(ch.accessToken);
  }

  const tokens = await refreshAccessToken(await decrypt(ch.refreshToken), ch.authMethod);
  const identity = await verifyAccessToken(tokens.access_token);
  if (identity.ownerHash !== ch.ownerHash) {
    throw new Error(`El personaje ${ch.name} cambió de dueño; vuelve a vincularlo`);
  }

  await db
    .update(characters)
    .set({
      accessToken: await encrypt(tokens.access_token),
      refreshToken: await encrypt(tokens.refresh_token),
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    })
    .where(eq(characters.id, characterId));

  return tokens.access_token;
}
