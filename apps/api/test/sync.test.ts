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
