import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

// Paths relative to where the API starts (apps/api) unless given: the desktop app (apps/desktop)
// keeps the database in the user's data folder and ships the migrations as an installer resource
export const DB_PATH = Bun.env.DB_PATH || 'data/ledger.db';
export const MIGRATIONS_DIR = Bun.env.MIGRATIONS_DIR || './drizzle';

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });

// The bun:sqlite connection, for what Drizzle doesn't do (VACUUM INTO for backups)
export const rawDb = () => sqlite;

export function runMigrations() {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

// Migrations this version knows (those in the drizzle-kit journal) and those applied in a database
export function knownMigrations(): number {
  const journal = join(MIGRATIONS_DIR, 'meta', '_journal.json');
  if (!existsSync(journal)) return 0;
  return (JSON.parse(readFileSync(journal, 'utf8')) as { entries: unknown[] }).entries.length;
}

export function appliedMigrations(handle: Database = sqlite): number {
  try {
    return (handle.query('select count(*) as n from __drizzle_migrations').get() as { n: number }).n;
  } catch {
    // New database: no migrations table yet
    return 0;
  }
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const columns = (schemaName: 'main' | 'src', table: string) =>
  (sqlite.query(`PRAGMA ${schemaName}.table_info(${quote(table)})`).all() as { name: string }[]).map((c) => c.name);

// Replaces the database contents with those of `file` (already checked), without closing it: the API keeps running
// and on Windows you can't rename over an open database. A copy of the file is brought up to date with this
// version's migrations (an old backup has fewer tables or columns) and its tables are copied into the open
// database in a single transaction: if anything fails, nothing changes
export function replaceDatabase(file: string) {
  const staged = `${DB_PATH}.restoring`;
  rmSync(staged, { force: true });
  copyFileSync(file, staged);
  const copy = new Database(staged);
  try {
    migrate(drizzle(copy, { schema }), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    copy.close();
  }
  // Foreign keys off while the tables are emptied and filled (the order between them doesn't matter)
  sqlite.exec('PRAGMA foreign_keys = OFF');
  sqlite.query('ATTACH DATABASE ? AS src').run(staged);
  try {
    const tables = (
      sqlite.query("select name from main.sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as { name: string }[]
    ).map((t) => t.name);
    sqlite.transaction(() => {
      for (const table of tables) {
        const inSource = new Set(columns('src', table));
        const shared = columns('main', table).filter((c) => inSource.has(c));
        sqlite.exec(`DELETE FROM main.${quote(table)}`);
        if (!shared.length) continue;
        const list = shared.map(quote).join(', ');
        sqlite.exec(`INSERT INTO main.${quote(table)} (${list}) SELECT ${list} FROM src.${quote(table)}`);
      }
    })();
  } finally {
    sqlite.exec('DETACH DATABASE src');
    sqlite.exec('PRAGMA foreign_keys = ON');
    try {
      rmSync(staged, { force: true });
    } catch {
      // Windows may still have it open: it is deleted on the next restore
    }
  }
}
