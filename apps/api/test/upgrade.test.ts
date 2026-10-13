// Actualizar desde cada versión publicada de escritorio: una base con el esquema de entonces y datos como los
// guardaba (killmails sin `flag`, pilotos vinculados con Client Secret), y la API actual arrancando
// encima: copia `update` antes de migrar, todas las migraciones, ningún dato perdido, las mismas cifras desde
// cualquier versión de partida, y la copia de antes se puede restaurar
import { expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

const MIGRATIONS = join(import.meta.dir, '../drizzle');
const KNOWN = (JSON.parse(readFileSync(join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: unknown[] }).entries.length;

// Migraciones que traía cada versión de escritorio publicada
const RELEASES: [string, number][] = [
  ['0.1.0', 9],
  ['0.1.9', 11],
  ['0.1.11', 12],
  ['0.1.12', 14],
  ['0.1.13', 15],
  ['0.1.15', 17],
];

const ARIA = 2_100_000_001;
const KADE = 2_100_000_002;
const STRANGER = 95_000_001;
const NPC = 1_000_125;
const JITA = 30_000_142;
const JITA_STATION = 60_003_760;
const RIFTER = 587;
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);
const at = (daysAgo: number, hour = 12) => now - daysAgo * DAY + (hour - 12) * 3600;

// Inserta solo las columnas que tiene la tabla en esa versión
function insert(sqlite: Database, table: string, rows: Record<string, unknown>[]) {
  const cols = new Set((sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  if (!cols.size) return 0;
  for (const row of rows) {
    const keys = Object.keys(row).filter((k) => cols.has(k));
    sqlite.query(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...(keys.map((k) => row[k]) as never[]));
  }
  return rows.length;
}

function oldDatabase(dir: string, migrations: number) {
  // Las migraciones de entonces: las mismas SQL con el journal recortado
  const old = join(dir, 'drizzle-old');
  cpSync(MIGRATIONS, old, { recursive: true });
  const journalPath = join(old, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  journal.entries = journal.entries.slice(0, migrations);
  writeFileSync(journalPath, JSON.stringify(journal));
  const file = join(dir, 'ledger.db');
  const sqlite = new Database(file, { create: true });
  migrate(drizzle(sqlite), { migrationsFolder: old });

  insert(sqlite, 'characters', [
    { id: ARIA, name: 'Aria Vex', owner_hash: 'a', scopes: 'esi-wallet.read_character_wallet.v1 esi-assets.read_assets.v1 esi-killmails.read_killmails.v1', refresh_token: 'enc', created_at: at(40), last_sync_at: at(0), auth_method: 'pkce', linked_at: at(40) },
    { id: KADE, name: 'Kade Morrow', owner_hash: 'k', scopes: 'esi-wallet.read_character_wallet.v1', refresh_token: 'enc', created_at: at(40), last_sync_at: at(0), auth_method: 'pkce', linked_at: at(40) },
  ]);
  const journal_: Record<string, unknown>[] = [];
  const balance = new Map([[ARIA, 1e9], [KADE, 2e8]]);
  let id = 1;
  const entry = (char: number, date: number, ref: string, amount: number, first: number, second: number, extra: Record<string, unknown> = {}) => {
    const b = balance.get(char)! + amount;
    balance.set(char, b);
    journal_.push({ journal_id: extra.journal_id ?? id++, character_id: char, date, ref_type: ref, amount, balance: b, first_party_id: first, second_party_id: second, ...extra });
  };
  const tx: Record<string, unknown>[] = [];
  for (let d = 28; d >= 1; d--) {
    for (const h of [9, 10, 11]) entry(ARIA, at(d, h), 'bounty_prizes', 15_000_000 + d * 100_000, NPC, ARIA, { context_id: JITA, context_id_type: 'system_id' });
    if (d % 2 === 0) {
      const t = 500_000 + d;
      entry(KADE, at(d, 15), 'market_transaction', 40_000_000, STRANGER, KADE, { context_id: t, context_id_type: 'market_transaction_id' });
      tx.push({ transaction_id: t, character_id: KADE, date: at(d, 15), type_id: 34, quantity: 10_000_000, unit_price: 4, is_buy: 0, location_id: JITA_STATION, client_id: STRANGER, journal_ref_id: id - 1 });
    }
  }
  // Donación entre tus pilotos: el mismo id en los dos journals (desde la 0007, que ya traía la 0.1.0)
  entry(ARIA, at(10, 18), 'player_donation', -300_000_000, ARIA, KADE, { journal_id: 999_999 });
  entry(KADE, at(10, 18), 'player_donation', 300_000_000, ARIA, KADE, { journal_id: 999_999 });
  // Kade pierde un Rifter y el seguro paga
  entry(KADE, at(5, 21), 'insurance', 300_000, NPC, KADE);
  insert(sqlite, 'wallet_journal', journal_);
  insert(sqlite, 'wallet_transactions', tx);
  insert(sqlite, 'names', [
    { id: 34, name: 'Tritanium', category: 'inventory_type', updated_at: at(0) },
    { id: RIFTER, name: 'Rifter', category: 'inventory_type', updated_at: at(0) },
    { id: JITA, name: 'Jita', category: 'solar_system', updated_at: at(0) },
    { id: JITA_STATION, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', category: 'station', updated_at: at(0) },
  ]);
  insert(sqlite, 'assets', [
    { item_id: 1, character_id: ARIA, type_id: 34, quantity: 1_000_000, location_id: JITA_STATION, location_flag: 'Hangar', location_type: 'station', root_location_id: JITA_STATION, is_singleton: 0, is_blueprint_copy: 0, updated_at: at(0) },
    { item_id: 2, character_id: ARIA, type_id: RIFTER, quantity: 1, location_id: JITA_STATION, location_flag: 'Hangar', location_type: 'station', root_location_id: JITA_STATION, is_singleton: 1, is_blueprint_copy: 0, updated_at: at(0) },
  ]);
  insert(sqlite, 'market_prices', [
    { type_id: 34, average_price: 4, adjusted_price: 4, updated_at: at(0) },
    { type_id: RIFTER, average_price: 600_000, adjusted_price: 590_000, updated_at: at(0) },
  ]);
  // Ítems sin `flag`: así se guardaban antes de separar equipo y carga
  insert(sqlite, 'killmails', [
    { killmail_id: 7001, hash: 'h', character_id: KADE, killmail_time: at(5, 20), solar_system_id: JITA, victim_character_id: KADE, ship_type_id: RIFTER, items: JSON.stringify([{ typeId: 34, destroyed: 100, dropped: 0 }]), attackers: 2 },
  ]);
  sqlite.close();
  return { file, journal: journal_.length, transactions: tx.length };
}

function upgrade(file: string) {
  const out = Bun.spawnSync(['bun', join(import.meta.dir, 'upgrade-worker.ts')], {
    env: {
      ...process.env,
      DB_PATH: file,
      MIGRATIONS_DIR: MIGRATIONS,
      ENC_KEY: Buffer.from(new Uint8Array(32)).toString('base64'),
      EVE_CLIENT_ID: 'test',
      EVE_CALLBACK_URL: 'http://127.0.0.1/auth/callback',
      SYNC_INTERVAL_MIN: '0',
      KADE_ID: String(KADE),
    },
  });
  if (out.exitCode !== 0) throw new Error(out.stderr.toString());
  const lines = out.stdout.toString().trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

const results: Record<string, ReturnType<typeof upgrade>> = {};

for (const [version, migrations] of RELEASES) {
  test(`desde la ${version} (${migrations} migraciones)`, () => {
    const dir = mkdtempSync(join(tmpdir(), `eve-ledger-upgrade-${version}-`));
    const old = oldDatabase(dir, migrations);
    const r = upgrade(old.file);
    results[version] = r;
    if (Bun.env.UPGRADE_DEBUG) console.log(version, JSON.stringify(r));
    expect(r.before).toBe(migrations);
    expect(r.after).toBe(KNOWN);
    // La copia de antes de actualizar es la base de entonces, tal cual
    expect(r.update).not.toBeNull();
    expect(r.update.migrations).toBe(migrations);
    expect(r.counts).toMatchObject({
      characters: 2,
      wallet_journal: old.journal,
      wallet_transactions: old.transactions,
      assets: 2,
      killmails: 1,
    });
    // Un piloto vinculado antes de la 0009 (Client Secret) queda como `secret`: hay que revincularlo
    expect(r.authMethods).toEqual(migrations > 9 ? ['pkce', 'pkce'] : ['secret', 'secret']);
    expect(r.losses.count).toBe(1);
    expect(r.ratting.ticks).toBe(28 * 3);
    expect(r.inventory).toBe(4_600_000);
    // Restaurar la copia de antes deja la base con todo lo de entonces
    expect(r.restored).toMatchObject({ migrations, entries: old.journal, after: old.journal });
  }, 30_000);
}

test('las cifras no dependen de la versión de partida', () => {
  const versions = Object.keys(results);
  expect(versions.length).toBe(RELEASES.length);
  const first = results[versions[0]];
  for (const v of versions.slice(1)) {
    expect(results[v].totals).toEqual(first.totals);
    expect(results[v].byActivity).toEqual(first.byActivity);
    expect(results[v].losses).toEqual(first.losses);
  }
});
