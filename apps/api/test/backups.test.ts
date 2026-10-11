// Copias de seguridad: se crean con VACUUM INTO, se recortan por tipo, se comprueban antes de restaurar y
// restaurar cambia el contenido de la base abierta sin reiniciar (también desde una copia de una versión anterior)
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

const { db, runMigrations, appliedMigrations, knownMigrations } = await import(`${API}/db/client.ts`);
const s = await import(`${API}/db/schema.ts`);
const backups = await import(`${API}/services/backups.ts`);
const { maintenance } = await import(`${API}/lib/maintenance.ts`);
const { eq, inArray } = await import('drizzle-orm');
runMigrations();

const X = 9101;
const Y = 9102;
const tmp = mkdtempSync(join(tmpdir(), 'eve-ledger-backup-test-'));

async function clean() {
  await db.delete(s.walletJournal).where(inArray(s.walletJournal.characterId, [X, Y]));
  await db.delete(s.characters).where(inArray(s.characters.id, [X, Y]));
  rmSync(backups.BACKUP_DIR, { recursive: true, force: true });
}

async function pilot(id: number, entries: number) {
  await db.insert(s.characters).values({ id, name: `Piloto ${id}`, ownerHash: String(id), scopes: '', refreshToken: 'x' });
  await db.insert(s.walletJournal).values(
    Array.from({ length: entries }, (_, i) => ({
      journalId: id * 1000 + i,
      characterId: id,
      date: new Date(Date.UTC(2026, 8, 1 + i, 12)),
      refType: 'bounty_prizes',
      amount: 1000,
      balance: 1000 * (i + 1),
    })),
  );
}

beforeEach(clean);
afterAll(clean);

test('una copia manual guarda la base entera y dice qué lleva', async () => {
  await pilot(X, 3);
  const b = backups.createBackup('manual');
  expect(b.kind).toBe('manual');
  expect(b.size).toBeGreaterThan(0);
  expect(backups.listBackups().map((x) => x.name)).toContain(b.name);
  const info = backups.inspectBackupByName(b.name);
  expect(info.entries).toBeGreaterThanOrEqual(3);
  expect(info.pilots).toBeGreaterThanOrEqual(1);
  expect(info.firstEntryAt).toBeInstanceOf(Date);
});

test('cada tipo se recorta por separado: 10 manuales, la diaria no la borra', async () => {
  await pilot(X, 1);
  const auto = backups.createBackup('auto');
  for (let i = 0; i < 12; i++) backups.createBackup('manual');
  const list = backups.listBackups();
  expect(list.filter((b) => b.kind === 'manual')).toHaveLength(10);
  expect(list.map((b) => b.name)).toContain(auto.name);
});

test('la diaria se hace una vez y no se repite hasta pasadas 20 h', async () => {
  // (la base de las pruebas es compartida: otros archivos ya dejan pilotos, así que siempre hay algo que guardar)
  await pilot(X, 1);
  expect(backups.maybeAutoBackup()?.kind).toBe('auto');
  expect(backups.maybeAutoBackup()).toBeNull();
});

test('solo restaura bases de EVE Ledger sanas y de esta versión o anteriores', async () => {
  const junk = join(tmp, 'junk.db');
  writeFileSync(junk, 'esto no es una base de datos '.repeat(200));
  expect(() => backups.inspectBackup(junk)).toThrow(expect.objectContaining({ code: 'not_sqlite' }));

  const other = join(tmp, 'other.db');
  rmSync(other, { force: true });
  const o = new Database(other, { create: true });
  o.exec('create table notas (id integer primary key)');
  o.close();
  expect(() => backups.inspectBackup(other)).toThrow(expect.objectContaining({ code: 'not_ledger' }));

  // Una copia hecha por una versión más nueva (con una migración que esta no conoce)
  await pilot(X, 1);
  const b = backups.createBackup('manual');
  const newer = join(tmp, 'newer.db');
  copyFileSync(join(backups.BACKUP_DIR, b.name), newer);
  const n = new Database(newer);
  n.exec("insert into __drizzle_migrations (hash, created_at) values ('futura', 9999999999999)");
  n.close();
  expect(() => backups.inspectBackup(newer)).toThrow(expect.objectContaining({ code: 'newer' }));

  // Nombres que no son de copias (rutas, «..»): no se sirven
  expect(() => backups.backupPath('../ledger.db')).toThrow(expect.objectContaining({ code: 'not_found' }));
  expect(() => backups.backupPath('ledger-20260101-000000-manual.db')).toThrow(expect.objectContaining({ code: 'not_found' }));
});

test('restaurar vuelve a la copia, guarda antes lo que había y sigue funcionando sin reiniciar', async () => {
  await pilot(X, 2);
  const b = backups.createBackup('manual');
  // Después de la copia: X pierde sus movimientos y aparece Y
  await db.delete(s.walletJournal).where(eq(s.walletJournal.characterId, X));
  await pilot(Y, 4);

  const { info, safety } = backups.restoreBackup(b.name);
  expect(info.entries).toBeGreaterThanOrEqual(2);
  // El `db` de los servicios ya lee la base restaurada
  expect((await db.select().from(s.walletJournal).where(eq(s.walletJournal.characterId, X))).length).toBe(2);
  expect(await db.query.characters.findFirst({ where: eq(s.characters.id, Y) })).toBeUndefined();
  // Lo de antes de restaurar quedó en una copia «restore»
  expect(safety?.kind).toBe('restore');
  const saved = new Database(join(backups.BACKUP_DIR, safety!.name), { readonly: true });
  expect((saved.query(`select count(*) as n from wallet_journal where character_id = ${Y}`).get() as { n: number }).n).toBe(4);
  saved.close();
  // Y se puede seguir escribiendo
  await db.insert(s.walletJournal).values({ journalId: 1, characterId: X, date: new Date(), refType: 'bounty_prizes', amount: 1, balance: 1 });
});

test('restaurar un archivo subido y negarse mientras otra restauración está en marcha', async () => {
  await pilot(X, 1);
  const b = backups.createBackup('manual');
  const bytes = new Uint8Array(readFileSync(join(backups.BACKUP_DIR, b.name)));
  await pilot(Y, 1);
  backups.restoreUpload(bytes);
  expect(await db.query.characters.findFirst({ where: eq(s.characters.id, Y) })).toBeUndefined();
  // El archivo subido no se queda en la carpeta
  expect(backups.listBackups().every((x) => !x.name.startsWith('upload'))).toBe(true);
  expect(existsSync(backups.BACKUP_DIR)).toBe(true);

  expect(() => backups.restoreUpload(new Uint8Array())).toThrow(expect.objectContaining({ code: 'empty' }));
  maintenance.set(true);
  try {
    expect(() => backups.restoreBackup(b.name)).toThrow(expect.objectContaining({ code: 'busy' }));
  } finally {
    maintenance.set(false);
  }
});

test('una copia de una versión anterior (con menos migraciones) se restaura y queda al día', async () => {
  await pilot(X, 2);
  const b = backups.createBackup('manual');
  // La copia «antigua»: sin la última migración. Se deshace lo que crea su SQL (tablas, columnas, índices) y se
  // borra su fila (por created_at: Drizzle deja el id de __drizzle_migrations a NULL)
  const old = join(tmp, 'old.db');
  copyFileSync(join(backups.BACKUP_DIR, b.name), old);
  const journal = JSON.parse(readFileSync(join(Bun.env.MIGRATIONS_DIR!, 'meta', '_journal.json'), 'utf8'));
  const last = journal.entries.at(-1).tag;
  const sqlText = readFileSync(join(Bun.env.MIGRATIONS_DIR!, `${last}.sql`), 'utf8');
  const undo: string[] = [];
  for (const m of sqlText.matchAll(/CREATE TABLE `([^`]+)`/g)) undo.push(`drop table \`${m[1]}\``);
  for (const m of sqlText.matchAll(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/g)) undo.push(`alter table \`${m[1]}\` drop column \`${m[2]}\``);
  for (const m of sqlText.matchAll(/CREATE (?:UNIQUE )?INDEX `([^`]+)`/g)) undo.unshift(`drop index \`${m[1]}\``);
  expect(undo.length).toBeGreaterThan(0);
  const o = new Database(old);
  for (const stmt of undo) o.exec(stmt);
  o.exec('delete from __drizzle_migrations where created_at = (select max(created_at) from __drizzle_migrations)');
  expect(appliedMigrations(o)).toBe(knownMigrations() - 1);
  o.close();
  await pilot(Y, 1);
  backups.restoreUpload(new Uint8Array(readFileSync(old)));
  expect((await db.select().from(s.walletJournal).where(eq(s.walletJournal.characterId, X))).length).toBe(2);
  expect(await db.query.characters.findFirst({ where: eq(s.characters.id, Y) })).toBeUndefined();
  // La base sigue con el esquema de esta versión y con todas las migraciones registradas
  expect(appliedMigrations()).toBe(knownMigrations());
  await db.select({ o: s.typeDogma.omegaOnly }).from(s.typeDogma).limit(1);
  await db.select().from(s.structureLookups).limit(1);
});

test('antes de migrar solo copia si hay migraciones pendientes', async () => {
  await pilot(X, 1);
  expect(backups.backupBeforeMigrations()).toBeNull();
});
