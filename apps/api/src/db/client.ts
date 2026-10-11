import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

// Rutas relativas a donde arranca la API (apps/api) salvo que se indiquen: la app de escritorio (apps/desktop)
// guarda la base en la carpeta de datos del usuario y trae las migraciones como recurso del instalador
export const DB_PATH = Bun.env.DB_PATH || 'data/ledger.db';
export const MIGRATIONS_DIR = Bun.env.MIGRATIONS_DIR || './drizzle';

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });

// La conexión de bun:sqlite, para lo que Drizzle no hace (VACUUM INTO de las copias de seguridad)
export const rawDb = () => sqlite;

export function runMigrations() {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

// Migraciones que conoce esta versión (las del journal de drizzle-kit) y las aplicadas en una base
export function knownMigrations(): number {
  const journal = join(MIGRATIONS_DIR, 'meta', '_journal.json');
  if (!existsSync(journal)) return 0;
  return (JSON.parse(readFileSync(journal, 'utf8')) as { entries: unknown[] }).entries.length;
}

export function appliedMigrations(handle: Database = sqlite): number {
  try {
    return (handle.query('select count(*) as n from __drizzle_migrations').get() as { n: number }).n;
  } catch {
    // Base nueva: todavía sin la tabla de migraciones
    return 0;
  }
}

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const columns = (schemaName: 'main' | 'src', table: string) =>
  (sqlite.query(`PRAGMA ${schemaName}.table_info(${quote(table)})`).all() as { name: string }[]).map((c) => c.name);

// Sustituye el contenido de la base por el del archivo `file` (ya comprobado), sin cerrarla: la API sigue en marcha
// y en Windows no se puede renombrar encima de una base abierta. Una copia del archivo se pone al día con las
// migraciones de esta versión (una copia antigua tiene menos tablas o columnas) y sus tablas se copian a la base
// abierta en una sola transacción: si algo falla, no cambia nada
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
  // Las claves ajenas, fuera mientras se vacían y se llenan las tablas (el orden entre ellas no importa)
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
      // Windows puede tenerla aún abierta: se borra en la siguiente restauración
    }
  }
}
