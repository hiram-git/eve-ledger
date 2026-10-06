import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characters } from '../db/schema';
import { decrypt, encrypt } from './crypto';
import { refreshAccessToken, verifyAccessToken } from './sso';

const MARGIN_MS = 60_000;

// Una sola renovación a la vez por piloto: sin Client Secret (PKCE) EVE invalida el refresh token en cuanto
// se usa, así que dos renovaciones en paralelo con el mismo token dejarían la segunda con invalid_grant
const inflight = new Map<number, Promise<string>>();

// Devuelve un access token válido, renovándolo si hace falta
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

  // EVE rota el refresh token (sin secreto, el usado deja de valer al instante): se guarda el nuevo antes de
  // nada que pueda fallar, o un fallo al validar (p. ej. sin red para las claves de EVE) lo perdería y el piloto
  // quedaría con el token caducado hasta revincularlo. Solo si nadie lo ha cambiado mientras tanto (revincular)
  const saved = await db
    .update(characters)
    .set({ refreshToken: await encrypt(tokens.refresh_token), accessToken: null, tokenExpiresAt: null })
    .where(and(eq(characters.id, characterId), eq(characters.refreshToken, ch.refreshToken)))
    .returning({ id: characters.id });
  if (!saved.length) {
    // Revinculado durante la renovación: manda el token nuevo de la base de datos
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

  // El access token, solo ya validado (sin él, la siguiente llamada renueva otra vez con el refresh token guardado)
  await db
    .update(characters)
    .set({ accessToken: await encrypt(tokens.access_token), tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000) })
    .where(eq(characters.id, characterId));

  return tokens.access_token;
}
