// Carga un export de export-debug.ts en una base NUEVA para reproducir el ledger fuera de tu máquina.
// No toca data/ledger.db: escribe <destino>/data/ledger.db con las migraciones al día.
// Los pilotos importados no tienen tokens (el export no los lleva): la API los lee, pero no puede sincronizar.
//
// Uso (desde apps/api):  bun run import:debug <export.json> <directorio destino>
// Después:  cd <destino> && SYNC_INTERVAL_MIN=0 bun <ruta a apps/api>/src/index.ts
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
// La API aplica sus migraciones desde ./drizzle (relativo a donde arranca): un enlace a las del repo
if (!existsSync(join(resolve(dest), 'drizzle'))) symlinkSync(migrations, join(resolve(dest), 'drizzle'));

// Los pilotos necesitan un refresh token (NOT NULL): marcador, nunca se descifra
const tables: Record<string, Record<string, unknown>[]> = data.tables;
tables.characters = tables.characters.map((c) => ({ ...c, owner_hash: 'importado', refresh_token: 'importado' }));

// Orden: characters antes que lo que la referencia
const ORDER = [
  'characters',
  'names',
  'systems',
  'station_systems',
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
