import { eq } from 'drizzle-orm';
import { t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';

// Parámetro opcional ?characterId= para ver el ledger de un solo piloto
export const pilotQuery = { characterId: t.Optional(t.Numeric()) };

// Un id que no es un piloto vinculado es un 404, no un ledger vacío que parezca real
export async function isLinkedPilot(characterId?: number) {
  if (!characterId) return true;
  const [row] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId));
  return !!row;
}

export const notLinked = (characterId?: number) => ({ error: `El personaje ${characterId} no está vinculado` });
