// Loads an export from export-debug.ts into a NEW database to reproduce the ledger off your machine.
// Doesn't touch data/ledger.db: writes <destination>/data/ledger.db with migrations up to date.
// Imported pilots have no tokens (the export doesn't include them): the API reads them but can't sync.
//
// Usage (from apps/api):  bun run import:debug <export.json> <destination directory>
// Then:  cd <destination> && SYNC_INTERVAL_MIN=0 bun <path to apps/api>/src/index.ts
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [file, dest] = process.argv.slice(2);
if (!file || !dest) {
  console.error('Uso: bun run import:debug <export.json> <directorio destino>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
if (data?.meta?.format !== 'eve-ledger-debug') {
  console.error(`${file} no es un export de export-debug.ts`);
  process.exit(1);
}

const dbPath = join(resolve(dest), 'data', 'ledger.db');
if (existsSync(dbPath)) {
  console.error(`${dbPath} ya existe: elige un directorio vacío (no sobrescribo bases).`);
  process.exit(1);
}
mkdirSync(join(resolve(dest), 'data'), { recursive: true });
const migrations = resolve(import.meta.dir, '..', 'drizzle');
const sqlite = new Database(dbPath, { create: true });
migrate(drizzle(sqlite), { migrationsFolder: migrations });
// The API applies its migrations from ./drizzle (relative to where it starts): a link to the repo's
if (!existsSync(join(resolve(dest), 'drizzle'))) symlinkSync(migrations, join(resolve(dest), 'drizzle'));

// Pilots need a refresh token (NOT NULL): a placeholder, never decrypted
const tables: Record<string, Record<string, unknown>[]> = data.tables;
tables.characters = tables.characters.map((c) => ({ ...c, owner_hash: 'importado', refresh_token: 'importado' }));

// Order: characters before whatever references it
const ORDER = [
  'characters',
  'names',
  'systems',
  'station_systems',
  'types',
  'market_prices',
  'market_quotes',
  'wallet_journal',
  'wallet_transactions',
  'assets',
  'killmails',
  'contracts',
  'sync_log',
];
sqlite.transaction(() => {
  for (const table of ORDER) {
    const rows = tables[table] ?? [];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    const insert = sqlite.prepare(
      `insert or ignore into ${table} (${cols.map((c) => `"${c}"`).join(', ')}) values (${cols.map(() => '?').join(', ')})`,
    );
    for (const row of rows) insert.run(...cols.map((c) => (row[c] ?? null) as string | number | null));
  }
})();

console.log(`Importado en ${dbPath}`);
for (const [k, v] of Object.entries(data.meta.counts)) console.log(`  ${k.padEnd(20)} ${v}`);
console.log(`Export del ${data.meta.exportedAt} · ${data.meta.days} días · ${data.meta.anonymized ? 'anonimizado' : 'con nombres'}`);
