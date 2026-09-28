import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, syncLog, walletJournal } from '../db/schema';
import { esiGet } from '../lib/esi';

// GET /characters/{id}/wallet/journal (solo los campos que guardamos)
type EsiJournalEntry = {
  id: number;
  date: string;
  ref_type: string;
  description: string;
  amount?: number;
  balance?: number;
  first_party_id?: number;
  second_party_id?: number;
  context_id?: number;
  context_id_type?: string;
};

export type SyncResult = {
  characterId: number;
  name?: string;
  pages: number;
  fetched: number;
  inserted: number;
  error?: string;
};

// Cada página trae hasta 2500 filas × 10 columnas: se inserta por lotes
// para no pasar el límite de variables de SQLite
const CHUNK = 500;

// Evita dos syncs simultáneos del mismo personaje
const running = new Set<number>();

const toRow = (characterId: number, e: EsiJournalEntry): typeof walletJournal.$inferInsert => ({
  journalId: e.id,
  characterId,
  date: new Date(e.date),
  refType: e.ref_type,
  amount: e.amount ?? 0,
  balance: e.balance ?? null,
  description: e.description ?? null,
  firstPartyId: e.first_party_id ?? null,
  secondPartyId: e.second_party_id ?? null,
  contextId: e.context_id ?? null,
  contextIdType: e.context_id_type ?? null,
});

function insertEntries(characterId: number, entries: EsiJournalEntry[]): number {
  if (entries.length === 0) return 0;
  const rows = entries.map((e) => toRow(characterId, e));

  return db.transaction((tx) => {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      inserted += tx
        .insert(walletJournal)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoNothing()
        .returning({ id: walletJournal.journalId })
        .all().length;
    }
    return inserted;
  });
}

export async function syncJournal(characterId: number): Promise<SyncResult> {
  const ch = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
  if (!ch) throw new Error(`Personaje ${characterId} no vinculado`);

  const result: SyncResult = { characterId, name: ch.name, pages: 0, fetched: 0, inserted: 0 };

  if (running.has(characterId)) {
    return { ...result, error: 'Ya hay una sincronización en curso para este personaje' };
  }
  running.add(characterId);

  let logId: number | undefined;
  try {
    [{ id: logId }] = await db
      .insert(syncLog)
      .values({ characterId, startedAt: new Date() })
      .returning({ id: syncLog.id });

    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const { data, headers } = await esiGet<EsiJournalEntry[]>(
        `/characters/${characterId}/wallet/journal?page=${page}`,
        characterId,
      );
      if (page === 1) totalPages = Number(headers.get('x-pages') ?? 1) || 1;

      result.pages = page;
      result.fetched += data.length;
      result.inserted += insertEntries(characterId, data);
    }

    await db.update(characters).set({ lastSyncAt: new Date() }).where(eq(characters.id, characterId));
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    running.delete(characterId);
    if (logId !== undefined) {
      await db
        .update(syncLog)
        .set({ finishedAt: new Date(), rowsInserted: result.inserted, error: result.error ?? null })
        .where(eq(syncLog.id, logId));
    }
  }

  return result;
}

// Secuencial: un personaje tras otro para no disparar el rate limit de ESI
export async function syncAll(): Promise<SyncResult[]> {
  const all = await db.select({ id: characters.id }).from(characters);
  const results: SyncResult[] = [];
  for (const { id } of all) results.push(await syncJournal(id));
  return results;
}
