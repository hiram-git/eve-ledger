// Sync with a mocked ESI: repeated syncs store nothing twice, a courier whose items ESI no longer has doesn't fail
// the step, a failed step shows in /characters even if later ones succeed, and two rounds at once are one round
import { afterAll, expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

const A = 9_100_001;
const B = 9_100_002;
class FakeEsiError extends Error {
  constructor(public status: number) {
    super(`ESI ${status}`);
  }
}
let journalDelay = 0;
// Market transactions of A, newest first, and whether the next page with from_id fails (an ESI 502)
let trades: number[] = [];
let failOlderPage = false;
const day = new Date(Date.now() - 86_400_000).toISOString();
mock.module(`${API}/lib/esi.ts`, () => ({
  EsiError: FakeEsiError,
  esiGet: async (path: string) => {
    const headers = new Headers({ 'x-pages': '1' });
    const id = Number(path.split('/')[2]);
    // Pilots of other test files (syncAll goes through every pilot): their sync stops at the journal
    if (path.startsWith('/characters/') && id !== A && id !== B) throw new FakeEsiError(403);
    if (/wallet\/journal/.test(path)) {
      if (journalDelay) await Bun.sleep(journalDelay);
      const data = [1, 2].map((n) => ({ id: id * 10 + n, date: day, ref_type: 'bounty_prizes', description: '', amount: 1_000_000 * n, balance: [1_000_000, 3_000_000][n - 1] }));
      return { data, headers };
    }
    if (/\/wallet$/.test(path)) return { data: 3_000_000, headers };
    if (/wallet\/transactions/.test(path)) {
      const from = Number(new URL(`http://esi${path}`).searchParams.get('from_id')) || Infinity;
      if (from !== Infinity && failOlderPage) {
        failOlderPage = false;
        throw new FakeEsiError(502);
      }
      const page = (id === A ? trades : []).filter((t) => t <= from).slice(0, 2500);
      const data = page.map((t) => ({ transaction_id: t, date: day, type_id: 34, quantity: 1, unit_price: 5, is_buy: true, location_id: 60003760, client_id: 1000125, journal_ref_id: 1 }));
      return { data, headers };
    }
    if (/contracts\/\d+\/items/.test(path)) throw new FakeEsiError(404);
    if (/\/contracts\?page/.test(path)) {
      if (id === B) throw new FakeEsiError(500);
      return { data: [{ contract_id: 777, issuer_id: id, type: 'courier', status: 'deleted', date_issued: day, reward: 1 }], headers };
    }
    if (/\/skills$/.test(path)) return { data: { skills: [], total_sp: 0 }, headers };
    if (/\/attributes$/.test(path)) return { data: { charisma: 20, intelligence: 20, memory: 20, perception: 20, willpower: 20 }, headers };
    return { data: [], headers };
  },
  esiPost: async () => ({ data: [], headers: new Headers() }),
}));

const { db, rawDb, runMigrations } = await import(`${API}/db/client.ts`);
const s = await import(`${API}/db/schema.ts`);
runMigrations();
const { syncCharacter, syncAll } = await import(`${API}/services/sync.ts`);
const { characterRoutes } = await import(`${API}/routes/characters.ts`);
const { eq } = await import('drizzle-orm');

const ALL = 'esi-wallet.read_character_wallet.v1 esi-contracts.read_character_contracts.v1 esi-skills.read_skills.v1';
const linkedAt = new Date(Date.now() - 10 * 86_400_000);
await db.insert(s.characters).values([
  { id: A, name: 'Sync A', ownerHash: 'a', scopes: ALL, refreshToken: 'x', linkedAt },
  { id: B, name: 'Sync B', ownerHash: 'b', scopes: ALL, refreshToken: 'x', linkedAt },
]);
// The test files share one database: leave nothing behind for the others
const logStart = (rawDb().query('select coalesce(max(id), 0) id from sync_log').get() as { id: number }).id;
afterAll(() => {
  const sqlite = rawDb();
  sqlite.run(`delete from sync_log where id > ${logStart}`);
  for (const t of ['wallet_journal', 'wallet_transactions', 'character_skills', 'character_attributes']) sqlite.run(`delete from ${t} where character_id in (${A}, ${B})`);
  sqlite.run(`delete from contracts where issuer_id in (${A}, ${B})`);
  sqlite.run(`delete from characters where id in (${A}, ${B})`);
});
const journalRows = (id: number) => rawDb().query('select count(*) n from wallet_journal where character_id = ?').get(id) as { n: number };

test('sincronizar dos veces no guarda nada dos veces y un courier sin ítems en ESI (404) no falla el paso', async () => {
  const first = await syncCharacter(A);
  expect(first.error).toBeUndefined();
  expect(first.journal?.inserted).toBe(2);
  const again = await syncCharacter(A);
  expect(again.error).toBeUndefined();
  expect(again.journal?.inserted).toBe(0);
  expect(journalRows(A).n).toBe(2);
  expect(rawDb().query('select count(*) n from contracts where contract_id = 777').get()).toEqual({ n: 1 });
});

test('/characters dice el paso que falló aunque los siguientes acaben bien', async () => {
  const r = await syncCharacter(B);
  expect(r.contracts?.error).toContain('500');
  expect(r.skills?.error).toBeUndefined();
  const list = (await (await characterRoutes.handle(new Request('http://localhost/characters/'))).json()) as { id: number; lastError: { kind: string } | null }[];
  expect(list.find((p) => p.id === B)?.lastError?.kind).toBe('contracts');
  expect(list.find((p) => p.id === A)?.lastError).toBeNull();
});

test('dos rondas a la vez (cron y «Sincronizar») son la misma ronda: nadie sale «ya en curso»', async () => {
  journalDelay = 50;
  const one = syncAll();
  const two = syncAll();
  expect(two).toBe(one);
  const results = await one;
  journalDelay = 0;
  expect(results.some((r) => r.error?.includes('Ya hay una sincronización'))).toBe(false);
  expect(journalRows(A).n).toBe(2);
});

test('el aviso de errores solo cuenta a quien sigue sin un sync bueno después de fallar en la ronda', async () => {
  const { stillFailing } = await import(`${API}/services/scheduler.ts`);
  const startedAt = new Date(Date.now() - 60_000);
  const at = (s: number) => new Date(startedAt.getTime() + s * 1000);
  // A failed in the round and synced fine 10 s later (the user, from the health line, while the round went on);
  // B failed and nothing since; C was skipped because a manual sync of it was running, which went fine
  await db.insert(s.syncLog).values([
    { characterId: A, kind: 'journal', startedAt: at(1), finishedAt: at(2), error: 'ESI 502' },
    { characterId: B, kind: 'journal', startedAt: at(3), finishedAt: at(4), error: 'ESI 502' },
  ]);
  await db.update(s.characters).set({ lastSyncAt: at(12) }).where(eq(s.characters.id, A));
  await db.update(s.characters).set({ lastSyncAt: new Date(startedAt.getTime() - 3_600_000) }).where(eq(s.characters.id, B));
  expect(stillFailing({ startedAt, failed: [A, B] })).toBe(1);
  expect(stillFailing({ startedAt, failed: [] })).toBe(0);
});

test('si falla una página de transacciones, el siguiente sync rellena el hueco aunque no haya nada nuevo', async () => {
  trades = Array.from({ length: 6000 }, (_, i) => 70_006_000 - i);
  failOlderPage = true;
  expect((await syncCharacter(A)).transactions?.error).toContain('502');
  const stored = () => (rawDb().query('select count(*) n from wallet_transactions where character_id = ?').get(A) as { n: number }).n;
  expect(stored()).toBe(2500);
  // Nothing new since: the first page is all stored, but the previous step failed, so it keeps going back
  expect((await syncCharacter(A)).transactions?.error).toBeUndefined();
  expect(stored()).toBe(6000);
  trades = [];
});

test('el registro de syncs se poda a 90 días sin perder el último de cada paso ni el primer sync de lealtad', async () => {
  const { pruneSyncLog } = await import(`${API}/services/sync.ts`);
  const old = (d: number) => new Date(Date.now() - d * 86_400_000);
  const ids = (await db
    .insert(s.syncLog)
    .values([
      { characterId: B, kind: 'loyalty', startedAt: old(200), finishedAt: old(200) }, // first good loyalty sync: stays
      { characterId: B, kind: 'loyalty', startedAt: old(150), finishedAt: old(150) }, // goes
      { characterId: B, kind: 'skills', startedAt: old(120), finishedAt: old(120), error: 'x' }, // goes
      { characterId: B, kind: 'skills', startedAt: old(100), finishedAt: old(100) }, // last of its step: stays
      { characterId: B, kind: 'loyalty', startedAt: old(10), finishedAt: old(10) }, // recent: stays
    ])
    .returning({ id: s.syncLog.id })).map((r) => r.id);
  pruneSyncLog();
  const left = (rawDb().query(`select id from sync_log where id in (${ids.join(',')})`).all() as { id: number }[]).map((r) => r.id);
  expect(left).toEqual([ids[0], ids[3], ids[4]]);
});
