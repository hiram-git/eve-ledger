// Database backups. ESI only gives ~30 days of wallet: anything older lives only in ledger.db, and a
// broken disk or a reinstall lost it forever. One backup a day (and before each migration and each
// restore) with `VACUUM INTO`, which writes a compact, consistent database even while the API is writing.
// Restoring copies the backup's contents into the open database, without restarting the API (replaceDatabase)
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appliedMigrations, DB_PATH, knownMigrations, rawDb, replaceDatabase } from '../db/client';
import { maintenance } from '../lib/maintenance';
import { syncBusy } from './sync';

export const BACKUP_DIR = Bun.env.BACKUP_DIR || join(dirname(DB_PATH), 'backups');
const keepAuto = Number(Bun.env.BACKUP_KEEP) > 0 ? Math.floor(Number(Bun.env.BACKUP_KEEP)) : 14;

// auto: the daily one · manual: «Hacer una copia ahora» · restore: what was there before restoring another ·
// update: before applying new migrations (when a new version starts)
export type BackupKind = 'auto' | 'manual' | 'restore' | 'update';
const KEEP: Record<BackupKind, number> = { auto: keepAuto, manual: 10, restore: 5, update: 5 };
const NAME = /^ledger-(\d{8})-(\d{6})-(auto|manual|restore|update)\.db$/;
// One a day: if the last daily one is under 20 h old, it is not repeated (the hourly sync shifts it only slightly)
const AUTO_EVERY_MS = 20 * 3_600_000;

export type Backup = { name: string; kind: BackupKind; createdAt: Date; size: number };

export class BackupError extends Error {
  constructor(
    public code: 'not_found' | 'not_sqlite' | 'corrupt' | 'not_ledger' | 'newer' | 'busy' | 'empty',
    detail?: string,
  ) {
    super(detail ?? code);
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

function parse(name: string): Backup | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, day, time, kind] = m;
  const createdAt = new Date(
    Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8), +time.slice(0, 2), +time.slice(2, 4), +time.slice(4, 6)),
  );
  let size = 0;
  try {
    size = statSync(join(BACKUP_DIR, name)).size;
  } catch {
    return null;
  }
  return { name, kind: kind as BackupKind, createdAt, size };
}

// From newest to oldest
export function listBackups(): Backup[] {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .map(parse)
    .filter((b): b is Backup => !!b)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.name.localeCompare(a.name));
}

// Path of a backup by its name: only names in the backup format (no paths and no "..")
export function backupPath(name: string): string {
  if (!NAME.test(name) || !existsSync(join(BACKUP_DIR, name))) throw new BackupError('not_found');
  return join(BACKUP_DIR, name);
}

function prune(kind: BackupKind) {
  for (const old of listBackups().filter((b) => b.kind === kind).slice(KEEP[kind])) {
    rmSync(join(BACKUP_DIR, old.name), { force: true });
  }
}

export function createBackup(kind: BackupKind): Backup {
  mkdirSync(BACKUP_DIR, { recursive: true });
  // Two backups in the same second (a manual one right after the daily one): the name carries the type, but if that
  // matches too, wait for the next second in the name
  let at = new Date();
  let name = `ledger-${stamp(at)}-${kind}.db`;
  while (existsSync(join(BACKUP_DIR, name))) {
    at = new Date(at.getTime() + 1000);
    name = `ledger-${stamp(at)}-${kind}.db`;
  }
  rawDb().query('VACUUM INTO ?').run(join(BACKUP_DIR, name));
  prune(kind);
  console.log(`[backup] ${name}`);
  return parse(name)!;
}

// There is something to save: some linked pilot or some movement
function hasData(handle: Database = rawDb()) {
  try {
    const row = handle
      .query('select (select count(*) from characters) + (select count(*) from wallet_journal) as n')
      .get() as { n: number };
    return row.n > 0;
  } catch {
    return false;
  }
}

// The daily one: at startup, after each sync round and every few hours (also with automatic sync turned off)
export function maybeAutoBackup(): Backup | null {
  if (maintenance.active() || !hasData()) return null;
  const last = listBackups().find((b) => b.kind === 'auto');
  if (last && Date.now() - last.createdAt.getTime() < AUTO_EVERY_MS) return null;
  try {
    return createBackup('auto');
  } catch (err) {
    console.warn('[backup] la copia diaria falló:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Before applying new migrations: if one goes wrong, what was there before stays safe
export function backupBeforeMigrations(): Backup | null {
  if (!hasData() || appliedMigrations() >= knownMigrations()) return null;
  return createBackup('update');
}

export type BackupInfo = {
  pilots: number;
  entries: number;
  firstEntryAt: Date | null;
  lastEntryAt: Date | null;
  migrations: number;
};

// Checks that a file is a healthy EVE Ledger database and that this version can open it (it is not from a newer one)
export function inspectBackup(file: string): BackupInfo {
  let handle: Database;
  try {
    handle = new Database(file, { readonly: true });
  } catch (err) {
    throw new BackupError('not_sqlite', err instanceof Error ? err.message : undefined);
  }
  try {
    let check: string;
    try {
      check = Object.values(handle.query('PRAGMA quick_check').get() as Record<string, string>)[0];
    } catch (err) {
      // «file is not a database»: any file that is not SQLite
      throw new BackupError('not_sqlite', err instanceof Error ? err.message : undefined);
    }
    if (check !== 'ok') throw new BackupError('corrupt', check);
    const tables = (handle.query("select name from sqlite_master where type = 'table'").all() as { name: string }[]).map(
      (t) => t.name,
    );
    if (!['characters', 'wallet_journal', '__drizzle_migrations'].every((t) => tables.includes(t))) {
      throw new BackupError('not_ledger');
    }
    const migrations = appliedMigrations(handle);
    if (migrations > knownMigrations()) throw new BackupError('newer');
    const row = handle
      .query(
        'select (select count(*) from characters) as pilots, count(*) as entries, min(date) as first, max(date) as last from wallet_journal',
      )
      .get() as { pilots: number; entries: number; first: number | null; last: number | null };
    // Journal dates are seconds (Drizzle timestamp)
    const at = (s: number | null) => (s === null ? null : new Date(s * 1000));
    return { pilots: row.pilots, entries: row.entries, firstEntryAt: at(row.first), lastEntryAt: at(row.last), migrations };
  } finally {
    handle.close();
  }
}

export function inspectBackupByName(name: string) {
  return inspectBackup(backupPath(name));
}

// Replaces the database with the backup. First it saves what is there ("restore"); the change runs in a single
// transaction, so if something fails the database stays as it was
export function restoreFromFile(file: string): { info: BackupInfo; safety: Backup | null } {
  if (maintenance.active() || syncBusy()) throw new BackupError('busy');
  const info = inspectBackup(file);
  maintenance.set(true);
  try {
    const safety = hasData() ? createBackup('restore') : null;
    replaceDatabase(file);
    console.log(`[backup] restaurada (${info.pilots} pilotos, ${info.entries} movimientos)`);
    return { info, safety };
  } finally {
    maintenance.set(false);
  }
}

export function restoreBackup(name: string) {
  return restoreFromFile(backupPath(name));
}

// An uploaded file (a backup downloaded earlier or from another machine): saved apart, restored and deleted
export function restoreUpload(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new BackupError('empty');
  mkdirSync(BACKUP_DIR, { recursive: true });
  const tmp = join(BACKUP_DIR, `upload-${stamp(new Date())}-${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  try {
    return restoreFromFile(tmp);
  } finally {
    rmSync(tmp, { force: true });
  }
}

// For the web: where they are, how many are kept and the list
export function backupsView() {
  return { dir: BACKUP_DIR, keep: KEEP, backups: listBackups(), busy: maintenance.active() };
}
