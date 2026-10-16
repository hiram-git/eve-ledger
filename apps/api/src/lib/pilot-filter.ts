import { eq } from 'drizzle-orm';
import { t } from 'elysia';
import { db } from '../db/client';
import { characters } from '../db/schema';

// Optional ?characterId= parameter to view the ledger of a single pilot
export const pilotQuery = { characterId: t.Optional(t.Numeric()) };

// An id that is not a linked pilot is a 404, not an empty ledger that looks real
export async function isLinkedPilot(characterId?: number) {
  if (!characterId) return true;
  const [row] = await db.select({ id: characters.id }).from(characters).where(eq(characters.id, characterId));
  return !!row;
}

export const notLinked = (characterId?: number) => ({ error: `El personaje ${characterId} no está vinculado` });
