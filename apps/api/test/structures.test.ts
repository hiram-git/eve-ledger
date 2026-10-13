// Citadel names: requested with the token of a pilot with the structures scope (first the one that stores
// something there), a 403 tries the next one and, if nobody has access, it isn't repeated until 7 days have passed
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

const { db, runMigrations } = await import(`${API}/db/client.ts`);
const s = await import(`${API}/db/schema.ts`);
const { EsiError } = await import(`${API}/lib/esi.ts`);
const { resolvePendingStructures, pendingStructures, STRUCTURES_SCOPE } = await import(`${API}/services/structures.ts`);
const { eq, inArray } = await import('drizzle-orm');
runMigrations();

const OWNER = 9201; // stores things in citadel A
const OTHER = 9202; // has the scope, but stores nothing
const NOSCOPE = 9203; // without the scope
const A = 1_035_466_617_946; // with access (OTHER no, OWNER yes)
const B = 1_035_466_617_947; // destroyed (404)
const C = 1_035_466_617_948; // nobody has access (403)
const D = 1_035_466_617_949; // only in a market transaction
const STRUCTURES = [A, B, C, D];
const PILOTS = [OWNER, OTHER, NOSCOPE];

async function clean() {
  await db.delete(s.assets).where(inArray(s.assets.characterId, PILOTS));
  await db.delete(s.walletTransactions).where(inArray(s.walletTransactions.characterId, PILOTS));
  await db.delete(s.characters).where(inArray(s.characters.id, PILOTS));
  await db.delete(s.names).where(inArray(s.names.id, STRUCTURES));
  await db.delete(s.stationSystems).where(inArray(s.stationSystems.stationId, STRUCTURES));
  await db.delete(s.structureLookups).where(inArray(s.structureLookups.id, STRUCTURES));
}

beforeEach(async () => {
  await clean();
  await db.insert(s.characters).values([
    { id: OWNER, name: 'Dueño', ownerHash: 'o', scopes: `esi-assets.read_assets.v1 ${STRUCTURES_SCOPE}`, refreshToken: 'x' },
    { id: OTHER, name: 'Otro', ownerHash: 'p', scopes: STRUCTURES_SCOPE, refreshToken: 'x' },
    { id: NOSCOPE, name: 'Sin permiso', ownerHash: 'q', scopes: 'esi-assets.read_assets.v1', refreshToken: 'x' },
  ]);
  const asset = (itemId: number, characterId: number, root: number) => ({
    itemId,
    characterId,
    typeId: 34,
    quantity: 1,
    locationId: root,
    locationType: 'item',
    locationFlag: 'Hangar',
    rootLocationId: root,
    isSingleton: false,
    isBlueprintCopy: false,
    updatedAt: new Date(),
  });
  await db.insert(s.assets).values([asset(1, OWNER, A), asset(2, NOSCOPE, A), asset(3, OWNER, B), asset(4, NOSCOPE, C)]);
  await db.insert(s.walletTransactions).values({
    transactionId: 1,
    characterId: OTHER,
    date: new Date(),
    typeId: 34,
    quantity: 1,
    unitPrice: 5,
    isBuy: true,
    locationId: D,
  });
});
afterAll(clean);

// Mocked ESI: who requested what and what each structure answers depending on the pilot
function fakeEsi() {
  const calls: [number, number][] = [];
  const fetch = async (id: number, characterId: number) => {
    calls.push([id, characterId]);
    if (id === A && characterId === OWNER) return { name: 'Perimeter - Tranquility Trading Tower', solar_system_id: 30000144 };
    if (id === D) return { name: 'Jita - Keepstar', solar_system_id: 30000142 };
    if (id === B) throw new EsiError(404, `/universe/structures/${id}`, 'not found');
    throw new EsiError(403, `/universe/structures/${id}`, 'forbidden');
  };
  return { calls, fetch };
}

test('resuelve el nombre y el sistema con el piloto que guarda algo allí; 404 y 403 quedan apuntados', async () => {
  expect((await pendingStructures()).sort()).toEqual([A, B, C, D].sort());
  const esi = fakeEsi();
  const r = await resolvePendingStructures(esi.fetch);
  expect(r).toEqual({ resolved: 2, forbidden: 1, missing: 1 });
  // A: first the owner (stores something there), and no need to try anyone else
  expect(esi.calls.filter(([id]) => id === A)).toEqual([[A, OWNER]]);
  // C: both pilots with the scope get 403; the one without the scope isn't even tried
  expect(esi.calls.filter(([id]) => id === C).map(([, c]) => c).sort()).toEqual([OWNER, OTHER].sort());
  expect(esi.calls.some(([, c]) => c === NOSCOPE)).toBe(false);

  const name = await db.query.names.findFirst({ where: eq(s.names.id, A) });
  expect(name).toMatchObject({ name: 'Perimeter - Tranquility Trading Tower', category: 'structure' });
  // The system, for the map (like a station's)
  expect(await db.query.stationSystems.findFirst({ where: eq(s.stationSystems.stationId, A) })).toMatchObject({ systemId: 30000144 });
  expect((await db.query.names.findFirst({ where: eq(s.names.id, D) }))?.name).toBe('Jita - Keepstar');
  const status = Object.fromEntries((await db.select().from(s.structureLookups).where(inArray(s.structureLookups.id, STRUCTURES))).map((l) => [l.id, l.status]));
  expect(status).toEqual({ [A]: 'ok', [B]: 'missing', [C]: 'forbidden', [D]: 'ok' });
});

test('un 403 o un 404 no se repiten en el siguiente sync; un 403 de hace más de 7 días, sí', async () => {
  await resolvePendingStructures(fakeEsi().fetch);
  const again = fakeEsi();
  expect(await resolvePendingStructures(again.fetch)).toEqual({ resolved: 0, forbidden: 0, missing: 0 });
  expect(again.calls).toEqual([]);

  await db.update(s.structureLookups).set({ checkedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(s.structureLookups.id, C));
  const later = fakeEsi();
  await resolvePendingStructures(later.fetch);
  expect(new Set(later.calls.map(([id]) => id))).toEqual(new Set([C]));
});

test('sin ningún piloto con el permiso no llama a ESI', async () => {
  await db.update(s.characters).set({ scopes: 'esi-assets.read_assets.v1' }).where(inArray(s.characters.id, PILOTS));
  const esi = fakeEsi();
  expect(await resolvePendingStructures(esi.fetch)).toEqual({ resolved: 0, forbidden: 0, missing: 0 });
  expect(esi.calls).toEqual([]);
});
