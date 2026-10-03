import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

// Rutas relativas a donde arranca la API (apps/api) salvo que se indiquen: la app de escritorio (apps/desktop)
// guarda la base en la carpeta de datos del usuario y trae las migraciones como recurso del instalador
const DB_PATH = Bun.env.DB_PATH || 'data/ledger.db';
const MIGRATIONS_DIR = Bun.env.MIGRATIONS_DIR || './drizzle';

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

export const db = drizzle(sqlite, { schema });

export function runMigrations() {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
