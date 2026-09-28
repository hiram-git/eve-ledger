import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, syncLog, walletJournal, walletTransactions } from '../db/schema';
import { esiGet } from '../lib/esi';
import { resolveTransactionNames } from './names';

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

// GET /characters/{id}/wallet/transactions
type EsiTransaction = {
  transaction_id: number;
  date: string;
  type_id: number;
  quantity: number;
  unit_price: number;
  is_buy: boolean;
  location_id: number;
  client_id: number;
  journal_ref_id: number;
};

type Kind = 'journal' | 'transactions';

export type StepResult = { pages: number; fetched: number; inserted: number; error?: string };

export type SyncResult = {
  characterId: number;
  name?: string;
  inserted: number; // journal + transacciones
  journal?: StepResult;
  transactions?: StepResult;
  namesResolved?: number;
  error?: string;
};

// Cada página trae hasta 2500 filas × ~10 columnas: se inserta por lotes
// para no pasar el límite de variables de SQLite
const CHUNK = 500;

// ESI devuelve como mucho 2500 transacciones por llamada; las anteriores se piden con from_id
const TX_PAGE_SIZE = 2500;
const TX_MAX_PAGES = 20;

// Evita dos syncs simultáneos del mismo personaje
const running = new Set<number>();

type Table = typeof walletJournal | typeof walletTransactions;

// Inserta en lotes dentro de una transacción y devuelve cuántas filas eran nuevas
function insertChunked<T extends Table>(table: T, rows: T['$inferInsert'][]): number {
  if (rows.length === 0) return 0;
  return db.transaction((tx) => {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const added: unknown[] = tx
        .insert(table as Table)
        .values(rows.slice(i, i + CHUNK) as never)
        .onConflictDoNothing()
        .returning()
        .all();
      inserted += added.length;
    }
    return inserted;
  });
}

const journalRow = (characterId: number, e: EsiJournalEntry): typeof walletJournal.$inferInsert => ({
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

const transactionRow = (characterId: number, t: EsiTransaction): typeof walletTransactions.$inferInsert => ({
  transactionId: t.transaction_id,
  characterId,
  date: new Date(t.date),
  typeId: t.type_id,
  quantity: t.quantity,
  unitPrice: t.unit_price,
  isBuy: t.is_buy,
  locationId: t.location_id,
  clientId: t.client_id ?? null,
  journalRefId: t.journal_ref_id ?? null,
});

async function fetchJournal(characterId: number, r: StepResult) {
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const { data, headers } = await esiGet<EsiJournalEntry[]>(
      `/characters/${characterId}/wallet/journal?page=${page}`,
      characterId,
    );
    if (page === 1) totalPages = Number(headers.get('x-pages') ?? 1) || 1;

    r.pages = page;
    r.fetched += data.length;
    r.inserted += insertChunked(walletJournal, data.map((e) => journalRow(characterId, e)));
  }
}

// Sin X-Pages: se va hacia atrás con from_id mientras lleguen páginas llenas.
// Si una página no trae nada nuevo, lo anterior ya está guardado y se para
async function fetchTransactions(characterId: number, r: StepResult) {
  let fromId: number | undefined;
  for (let page = 1; page <= TX_MAX_PAGES; page++) {
    const query = fromId ? `?from_id=${fromId}` : '';
    const { data } = await esiGet<EsiTransaction[]>(`/characters/${characterId}/wallet/transactions${query}`, characterId);

    r.pages = page;
    r.fetched += data.length;
    const inserted = insertChunked(walletTransactions, data.map((t) => transactionRow(characterId, t)));
    r.inserted += inserted;

    if (data.length < TX_PAGE_SIZE || inserted === 0) break;
    const oldest = Math.min(...data.map((t) => t.transaction_id));
    if (fromId !== undefined && oldest >= fromId) break;
    fromId = oldest;
  }
}

// Ejecuta un paso registrándolo en sync_log; nunca lanza, el error queda en el resultado
async function logged(characterId: number, kind: Kind, fn: (r: StepResult) => Promise<void>): Promise<StepResult> {
  const r: StepResult = { pages: 0, fetched: 0, inserted: 0 };
  let logId: number | undefined;
  try {
    [{ id: logId }] = await db
      .insert(syncLog)
      .values({ characterId, kind, startedAt: new Date() })
      .returning({ id: syncLog.id });
    await fn(r);
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
  } finally {
    if (logId !== undefined) {
      await db
        .update(syncLog)
        .set({ finishedAt: new Date(), rowsInserted: r.inserted, error: r.error ?? null })
        .where(eq(syncLog.id, logId));
    }
  }
  return r;
}

export const syncJournal = (characterId: number) => logged(characterId, 'journal', (r) => fetchJournal(characterId, r));

export const syncTransactions = (characterId: number) =>
  logged(characterId, 'transactions', (r) => fetchTransactions(characterId, r));

// Journal + transacciones de un personaje, y después los nombres que falten
export async function syncCharacter(characterId: number): Promise<SyncResult> {
  const ch = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
  if (!ch) throw new Error(`Personaje ${characterId} no vinculado`);

  const result: SyncResult = { characterId, name: ch.name, inserted: 0 };
  if (running.has(characterId)) {
    return { ...result, error: 'Ya hay una sincronización en curso para este personaje' };
  }
  running.add(characterId);

  try {
    result.journal = await syncJournal(characterId);
    // Si el token falló en el journal, fallará igual aquí: no gastar errores de ESI
    result.transactions = result.journal.error ? undefined : await syncTransactions(characterId);
    result.inserted = result.journal.inserted + (result.transactions?.inserted ?? 0);

    const errors = [result.journal.error, result.transactions?.error].filter(Boolean);
    if (errors.length) result.error = errors.join(' | ');
    else await db.update(characters).set({ lastSyncAt: new Date() }).where(eq(characters.id, characterId));

    // Consulta local; solo llama a ESI si hay IDs sin nombre (también reintenta fallos anteriores)
    if (result.transactions) {
      try {
        result.namesResolved = await resolveTransactionNames();
      } catch (err) {
        // Los nombres se reintentan en el próximo sync; no invalida los datos ya guardados
        console.warn(`[names] no se pudieron resolver:`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    running.delete(characterId);
  }
  return result;
}

// Secuencial: un personaje tras otro para no disparar el rate limit de ESI
export async function syncAll(): Promise<SyncResult[]> {
  const all = await db.select({ id: characters.id }).from(characters);
  const results: SyncResult[] = [];
  for (const { id } of all) results.push(await syncCharacter(id));
  return results;
}
