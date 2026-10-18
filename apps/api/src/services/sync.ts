import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { maintenance } from '../lib/maintenance';
import { characters, syncLog, walletJournal, walletTransactions } from '../db/schema';
import { esiGet } from '../lib/esi';
import { ASSETS_SCOPE, fetchAssets } from './assets';
import { CONTRACTS_SCOPE, fetchContracts } from './contracts';
import { fetchLosses, LOSSES_SCOPE } from './losses';
import { resolvePendingGeo } from './geo';
import { resolvePendingNames } from './names';
import { resolvePendingStructures } from './structures';
import { resolvePendingTypes } from './types';
import { refreshPricesIfStale } from './prices';
import { refreshDoctrineDogma } from './doctrines';
import { refreshDoctrinePrices } from './jita';
import { refreshPlexQuote } from './quotes';
import { refreshIncursions } from './deductions';
import { fetchSkills, SKILLS_SCOPE } from './skills';
import { fetchLoyalty, LOYALTY_SCOPE, refreshLoyaltyStores } from './loyalty';

// GET /characters/{id}/wallet/journal (only the fields we store)
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
  tax?: number;
  tax_receiver_id?: number;
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

type Kind = 'journal' | 'transactions' | 'assets' | 'killmails' | 'contracts' | 'skills' | 'loyalty';

export type StepResult = { pages: number; fetched: number; inserted: number; error?: string };

export type SyncResult = {
  characterId: number;
  name?: string;
  inserted: number; // new entries: journal + transactions
  journal?: StepResult;
  transactions?: StepResult;
  assets?: StepResult; // full snapshot: inserted = items stored, not 'new'
  killmails?: StepResult; // inserted = new killmails (kills and losses)
  contracts?: StepResult; // snapshot of the contracts: inserted = contracts stored
  skills?: StepResult; // snapshot of the skills: inserted = skills stored
  loyalty?: StepResult; // snapshot of the loyalty points: inserted = corporations with LP
  skipped?: string[];
  namesResolved?: number;
  error?: string;
};

// Each page brings up to 2500 rows × ~10 columns: inserted in batches
// so as not to exceed SQLite's variable limit
const CHUNK = 500;

// ESI returns at most 2500 transactions per call; older ones are requested with from_id
const TX_PAGE_SIZE = 2500;
const TX_MAX_PAGES = 20;

// Prevents two simultaneous syncs of the same character; those requested with queue (when relinking) are repeated afterwards
const running = new Set<number>();
const rerun = new Set<number>();

// Some sync in progress: restoring a backup waits for it to finish (src/services/backups.ts)
export const syncBusy = () => running.size > 0;

type Table = typeof walletJournal | typeof walletTransactions;

// Inserts in batches inside a transaction and returns how many rows were new
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
  tax: Math.abs(e.tax ?? 0),
  taxReceiverId: e.tax_receiver_id ?? null,
});

// Entries stored before the tax was read (desktop 0.1.17) have it as null: ESI still returns those from
// ~30 days, and they're filled in here (only those without it)
function fillTax(characterId: number, data: EsiJournalEntry[]) {
  db.transaction((tx) => {
    for (const e of data) {
      tx.update(walletJournal)
        .set({ tax: Math.abs(e.tax ?? 0), taxReceiverId: e.tax_receiver_id ?? null })
        .where(and(eq(walletJournal.journalId, e.id), eq(walletJournal.characterId, characterId), isNull(walletJournal.tax)))
        .run();
    }
  });
}

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
    fillTax(characterId, data);
  }
}

// No X-Pages: go backwards with from_id while full pages keep arriving.
// If a page brings nothing new, everything before it is already stored and we stop
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

// Runs a step and records it in sync_log; never throws, the error stays in the result
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

export const syncAssets = (characterId: number) => logged(characterId, 'assets', (r) => fetchAssets(characterId, r));

export const syncKillmails = (characterId: number) =>
  logged(characterId, 'killmails', (r) => fetchLosses(characterId, r));

export const syncContracts = (characterId: number) =>
  logged(characterId, 'contracts', (r) => fetchContracts(characterId, r));

export const syncSkills = (characterId: number) => logged(characterId, 'skills', (r) => fetchSkills(characterId, r));

export const syncLoyalty = (characterId: number) => logged(characterId, 'loyalty', (r) => fetchLoyalty(characterId, r));

// Public tasks (no token) after syncing: they fail without invalidating the data already stored
// and are retried on the next sync
async function bestEffort<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[${label}] falló:`, err instanceof Error ? err.message : err);
  }
}

// Real wallet balance (GET /characters/{id}/wallet, same scope as the journal). Without it, the balance is the balance
// of the last journal entry, which arrives up to 1 h late and is missing if the pilot didn't move ISK in 30 days
async function syncWallet(characterId: number) {
  const { data } = await esiGet<number>(`/characters/${characterId}/wallet`, characterId);
  if (typeof data !== 'number' || !Number.isFinite(data)) return;
  await db.update(characters).set({ walletBalance: data, walletAt: new Date() }).where(eq(characters.id, characterId));
}

// Journal + transactions + inventory of a character; then any missing prices and names
export async function syncCharacter(characterId: number, opts: { queue?: boolean } = {}): Promise<SyncResult> {
  const ch = await db.query.characters.findFirst({ where: eq(characters.id, characterId) });
  if (!ch) throw new Error(`Personaje ${characterId} no vinculado`);

  const result: SyncResult = { characterId, name: ch.name, inserted: 0 };
  // Restoring a backup: the database is being changed
  if (maintenance.active()) return { ...result, error: 'Restaurando una copia de seguridad; vuelve a sincronizar en un momento' };
  if (running.has(characterId)) {
    if (opts.queue) rerun.add(characterId);
    return { ...result, error: 'Ya hay una sincronización en curso para este personaje' };
  }
  running.add(characterId);

  try {
    result.journal = await syncJournal(characterId);
    // If the token failed on the journal, it will fail here too: don't waste ESI errors
    const tokenOk = !result.journal.error;
    if (tokenOk) {
      await bestEffort('wallet', () => syncWallet(characterId));
      result.transactions = await syncTransactions(characterId);
      // Characters linked before these scopes were requested: they must be relinked
      const scopes = ch.scopes.split(' ');
      result.skipped = [];
      if (scopes.includes(ASSETS_SCOPE)) result.assets = await syncAssets(characterId);
      else result.skipped.push(`inventario: falta el scope ${ASSETS_SCOPE}, vuelve a vincular el personaje`);
      if (scopes.includes(LOSSES_SCOPE)) result.killmails = await syncKillmails(characterId);
      else result.skipped.push(`pérdidas: falta el scope ${LOSSES_SCOPE}, vuelve a vincular el personaje`);
      if (scopes.includes(CONTRACTS_SCOPE)) result.contracts = await syncContracts(characterId);
      else result.skipped.push(`contratos: falta el scope ${CONTRACTS_SCOPE}, vuelve a vincular el personaje`);
      if (scopes.includes(SKILLS_SCOPE)) result.skills = await syncSkills(characterId);
      else result.skipped.push(`skills: falta el scope ${SKILLS_SCOPE}, vuelve a vincular el personaje`);
      // Optional scope: nothing is reported as missing without it
      if (scopes.includes(LOYALTY_SCOPE)) result.loyalty = await syncLoyalty(characterId);
    }
    result.inserted = result.journal.inserted + (result.transactions?.inserted ?? 0);

    const errors = [
      result.journal.error,
      result.transactions?.error,
      result.assets?.error,
      result.killmails?.error,
      result.contracts?.error,
      result.skills?.error,
      result.loyalty?.error,
    ].filter(Boolean);
    if (errors.length) result.error = errors.join(' | ');
    else await db.update(characters).set({ lastSyncAt: new Date() }).where(eq(characters.id, characterId));

    // PLEX price (Omega): public, requested on every sync even if this pilot's token failed
    await bestEffort('quotes', refreshPlexQuote);
    // Systems with an incursion right now (public): without this record their bounty penalty can't be estimated
    await bestEffort('incursions', refreshIncursions);
    // LP stores of the corporations your pilots have LP with (public, daily): what the LP is worth
    await bestEffort('loyalty', () => refreshLoyaltyStores());
    // Lowest sell in Jita for what the doctrines carry and for injectors (at most once an hour: once per round)
    await bestEffort('jita', refreshDoctrinePrices);
    // Doctrine skills stored before knowing whether they're Omega-only (public; only requests the missing ones)
    await bestEffort('dogma', refreshDoctrineDogma);

    if (tokenOk) {
      // They only call ESI if needed: prices older than 1 h, IDs without a name (retries earlier failures)
      // They value the inventory and the lost ships
      if ((result.assets && !result.assets.error) || result.killmails?.inserted) await bestEffort('prices', refreshPricesIfStale);
      result.namesResolved = await bestEffort('names', resolvePendingNames);
      // Citadels: name and system with the structures scope (before geo, which places their system on the map)
      await bestEffort('structures', () => resolvePendingStructures());
      await bestEffort('geo', resolvePendingGeo);
      // Market group of what was lost and what was bought: recognizes equivalent equipment when replacing a ship
      await bestEffort('types', resolvePendingTypes);
    }
  } finally {
    running.delete(characterId);
    if (rerun.delete(characterId)) {
      syncCharacter(characterId).then(
        (r) => console.log(`[sync] repetido tras revincular ${r.name}: ${r.error ?? `${r.inserted} movimientos`}`),
        (err) => console.error('[sync] repetido tras revincular:', err),
      );
    }
  }
  return result;
}

// Sequential: one character after another so as not to trigger ESI's rate limit
export async function syncAll(): Promise<SyncResult[]> {
  const all = await db.select({ id: characters.id }).from(characters);
  const results: SyncResult[] = [];
  for (const { id } of all) results.push(await syncCharacter(id));
  return results;
}
