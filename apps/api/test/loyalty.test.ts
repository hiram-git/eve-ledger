// Loyalty points: the sync keeps a snapshot per corporation and logs every change; the stores are read once a
// day (the ones with most LP first, a 404 waits a week); the indicator values the LP at the best exchange of each
// store, keeps EverMarks (Paragon) apart and measures the change over the period
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
const { fetchLoyalty, loyaltyIndicator, refreshLoyaltyStores, LOYALTY_SCOPE } = await import(`${API}/services/loyalty.ts`);
const { inArray } = await import('drizzle-orm');
runMigrations();

const A = 9401; // with the scope
const B = 9402; // with the scope
const C = 9403; // without it
const PILOTS = [A, B, C];
const SOE = 1_000_130;
const FEDNAVY = 1_000_181;
const PARAGON = 1_000_432;
const CORPS = [SOE, FEDNAVY, PARAGON];
const T = { probe: 1, factionAmmo: 2, t1Ammo: 3, unpriced: 4 };
const H = 3_600_000;
const D = 86_400_000;
const now = Math.floor(Date.now() / 1000) * 1000;
const step = () => ({ pages: 0, fetched: 0, inserted: 0 });

async function clean() {
  await db.delete(s.loyaltyPoints);
  await db.delete(s.loyaltyLog);
  await db.delete(s.loyaltyOffers);
  await db.delete(s.loyaltyStores);
  await db.delete(s.syncLog).where(inArray(s.syncLog.characterId, PILOTS));
  await db.delete(s.characters).where(inArray(s.characters.id, PILOTS));
  await db.delete(s.names).where(inArray(s.names.id, [...CORPS, ...Object.values(T)]));
  await db.delete(s.marketPrices).where(inArray(s.marketPrices.typeId, Object.values(T)));
}

beforeEach(async () => {
  await clean();
  await db.insert(s.characters).values([
    { id: A, name: 'Aria', ownerHash: 'a', scopes: LOYALTY_SCOPE, refreshToken: 'x' },
    { id: B, name: 'Bea', ownerHash: 'b', scopes: LOYALTY_SCOPE, refreshToken: 'x' },
    { id: C, name: 'Cid', ownerHash: 'c', scopes: '', refreshToken: 'x' },
  ]);
});

afterAll(clean);

test('el sync guarda los LP por corporación y apunta en el registro solo lo que cambia', async () => {
  const t0 = new Date(now - 3 * H);
  const r = step();
  await fetchLoyalty(A, r, async () => [{ corporation_id: SOE, loyalty_points: 100_000 }, { corporation_id: PARAGON, loyalty_points: 2_000 }], t0);
  expect(r.inserted).toBe(2);
  expect(await db.select().from(s.loyaltyLog)).toHaveLength(2);
  // Same figures an hour later: nothing new in the log
  await fetchLoyalty(A, step(), async () => [{ corporation_id: SOE, loyalty_points: 100_000 }, { corporation_id: PARAGON, loyalty_points: 2_000 }], new Date(t0.getTime() + H));
  expect(await db.select().from(s.loyaltyLog)).toHaveLength(2);
  // SOE grew and Paragon no longer appears: the snapshot has one row and the log says SOE 130 000 and Paragon 0
  await fetchLoyalty(A, step(), async () => [{ corporation_id: SOE, loyalty_points: 130_000 }], new Date(t0.getTime() + 2 * H));
  const points = await db.select().from(s.loyaltyPoints);
  expect(points.map((p) => [p.corporationId, p.points])).toEqual([[SOE, 130_000]]);
  const log = (await db.select().from(s.loyaltyLog)).map((l) => [l.corporationId, l.points]);
  expect(log).toHaveLength(4);
  expect(log).toContainEqual([SOE, 130_000]);
  expect(log).toContainEqual([PARAGON, 0]);
});

test('las tiendas se leen una vez al día, las de más LP primero, y un 404 espera una semana', async () => {
  const t0 = new Date(now);
  await db.insert(s.loyaltyPoints).values([
    { characterId: A, corporationId: FEDNAVY, points: 50_000, updatedAt: t0 },
    { characterId: A, corporationId: SOE, points: 100_000, updatedAt: t0 },
    { characterId: B, corporationId: SOE, points: 30_000, updatedAt: t0 },
  ]);
  const calls: number[] = [];
  const fetch = async (corp: number) => {
    calls.push(corp);
    if (corp === FEDNAVY) throw new EsiError(404, `/loyalty/stores/${corp}/offers`, 'not found');
    return [
      { offer_id: 1, type_id: T.probe, quantity: 1, lp_cost: 24_000, isk_cost: 2_400_000, required_items: [] },
      { offer_id: 2, type_id: T.factionAmmo, quantity: 5000, lp_cost: 2_000, isk_cost: 10_000, required_items: [{ type_id: T.t1Ammo, quantity: 5000 }] },
    ];
  };
  expect(await refreshLoyaltyStores(fetch, t0)).toBe(2);
  expect(calls).toEqual([SOE, FEDNAVY]);
  expect(await db.select().from(s.loyaltyOffers)).toHaveLength(2);
  const stores = await db.select().from(s.loyaltyStores);
  expect(stores.map((x) => [x.corporationId, x.status, x.offers]).sort()).toEqual([[SOE, 'ok', 2], [FEDNAVY, 'missing', 0]].sort());
  // An hour later nothing is due; after a day, the store that was read; the 404 only after a week
  expect(await refreshLoyaltyStores(fetch, new Date(t0.getTime() + H))).toBe(0);
  expect(await refreshLoyaltyStores(fetch, new Date(t0.getTime() + 25 * H))).toBe(1);
  expect(calls.at(-1)).toBe(SOE);
  expect(await refreshLoyaltyStores(fetch, new Date(t0.getTime() + 8 * D))).toBe(2);
});

test('el indicador valora al mejor cambio, aparta los EverMarks y mide el cambio del período', async () => {
  const t0 = new Date(now);
  await db.insert(s.names).values([
    { id: SOE, name: 'Sisters of EVE', category: 'corporation' },
    { id: FEDNAVY, name: 'Federation Navy', category: 'corporation' },
    { id: PARAGON, name: 'Paragon', category: 'corporation' },
    { id: T.factionAmmo, name: 'Caldari Navy Antimatter Charge M', category: 'inventory_type' },
  ]);
  await db.insert(s.marketPrices).values([
    { typeId: T.probe, averagePrice: 10_000_000, adjustedPrice: null, updatedAt: t0 },
    { typeId: T.factionAmmo, averagePrice: 5_000, adjustedPrice: null, updatedAt: t0 },
    { typeId: T.t1Ammo, averagePrice: 100, adjustedPrice: null, updatedAt: t0 },
  ]);
  await db.insert(s.loyaltyOffers).values([
    // (10 M − 2,4 M) / 24 000 = 316,67 ISK/LP
    { corporationId: SOE, offerId: 1, typeId: T.probe, quantity: 1, lpCost: 24_000, iskCost: 2_400_000, requiredItems: [] },
    // (5000 × 5000 − 10 000 − 5000 × 100) / 2000 = 12 245 ISK/LP: the best
    { corporationId: SOE, offerId: 2, typeId: T.factionAmmo, quantity: 5000, lpCost: 2_000, iskCost: 10_000, requiredItems: [{ typeId: T.t1Ammo, quantity: 5000 }] },
    // Without a price: skipped
    { corporationId: SOE, offerId: 3, typeId: T.unpriced, quantity: 1, lpCost: 10, iskCost: 0, requiredItems: [] },
  ]);
  await db.insert(s.loyaltyStores).values([
    { corporationId: SOE, offers: 3, status: 'ok', checkedAt: t0 },
    { corporationId: FEDNAVY, offers: 0, status: 'missing', checkedAt: t0 },
  ]);
  await db.insert(s.loyaltyPoints).values([
    { characterId: A, corporationId: SOE, points: 100_000, updatedAt: t0 },
    { characterId: A, corporationId: FEDNAVY, points: 50_000, updatedAt: t0 },
    { characterId: A, corporationId: PARAGON, points: 2_000, updatedAt: t0 },
    { characterId: B, corporationId: SOE, points: 30_000, updatedAt: t0 },
    { characterId: B, corporationId: PARAGON, points: 500, updatedAt: t0 },
  ]);
  const log = (characterId: number, corporationId: number, daysAgo: number, points: number) => ({ characterId, corporationId, at: new Date(t0.getTime() - daysAgo * D), points });
  await db.insert(s.loyaltyLog).values([
    log(A, SOE, 40, 80_000),
    log(A, SOE, 10, 100_000),
    log(A, FEDNAVY, 40, 50_000),
    log(A, PARAGON, 40, 1_000),
    log(A, PARAGON, 0, 2_000),
    // Bea's history starts inside the period: her first entry is her baseline
    log(B, SOE, 5, 30_000),
    log(B, PARAGON, 5, 500),
  ]);

  const lp = await loyaltyIndicator(30, t0);
  // Other test files leave characters in the shared database: only ours count
  expect(lp.missingScope.filter((p) => PILOTS.includes(p.characterId)).map((p) => p.name)).toEqual(['Cid']);
  expect(lp.pilots.filter((p) => PILOTS.includes(p.characterId)).map((p) => [p.name, p.synced])).toEqual([['Aria', true], ['Bea', true]]);
  expect(lp.corps.map((c) => [c.name, c.points])).toEqual([['Sisters of EVE', 130_000], ['Federation Navy', 50_000]]);
  const soe = lp.corps[0];
  expect(soe.iskPerLp).toBeCloseTo(12_245, 0);
  expect(soe.value).toBeCloseTo(130_000 * 12_245, 0);
  expect(soe.offer).toEqual({ typeId: T.factionAmmo, name: 'Caldari Navy Antimatter Charge M', quantity: 5000, lpCost: 2_000, iskCost: 10_000, required: 1 });
  expect(soe.byPilot.map((p) => [p.name, p.points])).toEqual([['Aria', 100_000], ['Bea', 30_000]]);
  expect(soe.change).toBe(20_000);
  expect(lp.corps[1].value).toBeNull();
  expect(lp.corps[1].change).toBe(0);
  expect(lp.points).toBe(180_000);
  expect(lp.value).toBeCloseTo(130_000 * 12_245, 0);
  expect(lp.unvaluedCorps).toBe(1);
  expect(lp.storesPending).toBe(0);
  expect(lp.change).toBe(20_000);
  expect(lp.changePartial).toBe(false);
  expect(lp.evermarks).toEqual({ points: 2_500, byPilot: [{ characterId: A, name: 'Aria', points: 2_000 }, { characterId: B, name: 'Bea', points: 500 }], change: 1_000 });
});
