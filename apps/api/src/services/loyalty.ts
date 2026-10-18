// Loyalty points (user's decision, after a community comment): what each pilot has with each corporation
// (missions, faction warfare, your own corporation's projects) and what it is worth in ISK at the best exchange
// of that corporation's LP store, valued at ESI's average price. EverMarks are the LP of the NPC corporation
// Paragon: counted apart, they can't be turned into ISK (cosmetics only, not tradable). ESI only gives balances,
// so the change over a period comes from the log this service keeps from the first sync on. The corporation's
// own LP wallet is not in ESI (feature request open since 2023)
import { and, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, loyaltyLog, loyaltyOffers, loyaltyPoints, loyaltyStores, marketPrices, names, syncLog } from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';
import type { StepResult } from './sync';

export const LOYALTY_SCOPE = 'esi-characters.read_loyalty.v1';
// EverMarks: the LP of this NPC corporation (its ID isn't hardcoded; it is told apart by the name ESI gives)
export const EVERMARKS_CORP = 'Paragon';
// NPC corporations (Sisters of EVE, Federation Navy…): their IDs are in this range
const NPC_CORPS = [1_000_000, 2_000_000] as const;
// A store is read again after a day (ESI caches it daily); one that failed, after a week
const STORE_MAX_AGE_MS = 24 * 3_600_000;
const STORE_RETRY_MS = 7 * 86_400_000;
const MAX_STORES = 10;
const CHUNK = 200;
const DAY_MS = 86_400_000;

type EsiLoyalty = { corporation_id: number; loyalty_points: number };
type EsiOffer = {
  offer_id: number;
  type_id: number;
  quantity: number;
  lp_cost: number;
  isk_cost: number;
  required_items?: { type_id: number; quantity: number }[];
};
export type FetchLoyalty = (characterId: number) => Promise<EsiLoyalty[]>;
export type FetchOffers = (corporationId: number) => Promise<EsiOffer[]>;

const esiLoyalty: FetchLoyalty = async (id) => (await esiGet<EsiLoyalty[]>(`/characters/${id}/loyalty/points`, id)).data;
const esiOffers: FetchOffers = async (id) => (await esiGet<EsiOffer[]>(`/loyalty/stores/${id}/offers`)).data;

// `fetch` and `now` are injected in the tests (test/loyalty.test.ts)
export async function fetchLoyalty(characterId: number, r: StepResult, fetch: FetchLoyalty = esiLoyalty, now = new Date()) {
  const data = await fetch(characterId);
  r.pages = 1;
  r.fetched = data.length;
  const rows = data
    .filter((d) => Number.isInteger(d.corporation_id))
    .map((d) => ({ characterId, corporationId: d.corporation_id, points: Math.max(0, Math.round(d.loyalty_points ?? 0)), updatedAt: now }));
  db.transaction((tx) => {
    const before = tx.select().from(loyaltyPoints).where(eq(loyaltyPoints.characterId, characterId)).all();
    tx.delete(loyaltyPoints).where(eq(loyaltyPoints.characterId, characterId)).run();
    if (rows.length) tx.insert(loyaltyPoints).values(rows).run();
    // The log keeps every change; a corporation that no longer appears is at 0
    const current = new Map(rows.map((x) => [x.corporationId, x.points]));
    for (const b of before) if (!current.has(b.corporationId)) current.set(b.corporationId, 0);
    for (const [corporationId, points] of current) {
      const [last] = tx
        .select({ points: loyaltyLog.points })
        .from(loyaltyLog)
        .where(and(eq(loyaltyLog.characterId, characterId), eq(loyaltyLog.corporationId, corporationId)))
        .orderBy(desc(loyaltyLog.at), desc(loyaltyLog.id))
        .limit(1)
        .all();
      if (!last || last.points !== points) tx.insert(loyaltyLog).values({ characterId, corporationId, at: now, points }).run();
    }
  });
  r.inserted = rows.length;
}

// Stores of the corporations your pilots have LP with, the ones with most LP first: read when they have never
// been read or a day has passed (a week after a failure), at most MAX_STORES per call. Returns how many were read
export async function refreshLoyaltyStores(fetch: FetchOffers = esiOffers, now = new Date()): Promise<number> {
  const corps = await db
    .select({ id: loyaltyPoints.corporationId, points: sql<number>`sum(${loyaltyPoints.points})` })
    .from(loyaltyPoints)
    .groupBy(loyaltyPoints.corporationId)
    .having(sql`sum(${loyaltyPoints.points}) > 0`);
  const stores = await db.select().from(loyaltyStores);
  const checked = new Map(stores.map((s) => [s.corporationId, s]));
  const due = corps
    .filter((c) => {
      const s = checked.get(c.id);
      if (!s) return true;
      const age = now.getTime() - s.checkedAt.getTime();
      return s.status === 'ok' ? age > STORE_MAX_AGE_MS : age > STORE_RETRY_MS;
    })
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_STORES);
  let read = 0;
  for (const { id } of due) {
    let offers: EsiOffer[] | null = null;
    let status = 'ok';
    try {
      offers = await fetch(id);
    } catch (err) {
      if (!(err instanceof EsiError)) throw err;
      status = err.status === 404 ? 'missing' : 'error';
    }
    db.transaction((tx) => {
      if (offers) {
        tx.delete(loyaltyOffers).where(eq(loyaltyOffers.corporationId, id)).run();
        const rows = offers
          .filter((o) => o.lp_cost > 0 && o.quantity > 0)
          .map((o) => ({
            corporationId: id,
            offerId: o.offer_id,
            typeId: o.type_id,
            quantity: o.quantity,
            lpCost: o.lp_cost,
            iskCost: o.isk_cost ?? 0,
            requiredItems: (o.required_items ?? []).map((i) => ({ typeId: i.type_id, quantity: i.quantity })),
          }));
        for (let i = 0; i < rows.length; i += CHUNK) tx.insert(loyaltyOffers).values(rows.slice(i, i + CHUNK)).run();
      }
      const row = { offers: offers?.length ?? 0, status, checkedAt: now };
      tx.insert(loyaltyStores).values({ corporationId: id, ...row }).onConflictDoUpdate({ target: loyaltyStores.corporationId, set: row }).run();
    });
    read++;
  }
  if (read) console.log(`[loyalty] ${read} tiendas de LP leídas`);
  return read;
}

const periodFrom = (days: number, now: Date) => {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
};

type Offer = { typeId: number; name: string | null; quantity: number; lpCost: number; iskCost: number; required: number };

export async function loyaltyIndicator(days = 30, now = new Date()) {
  const pilots = await db.select({ id: characters.id, name: characters.name, scopes: characters.scopes }).from(characters);
  const withScope = pilots.filter((p) => p.scopes.split(' ').includes(LOYALTY_SCOPE));
  const missingScope = pilots.filter((p) => !p.scopes.split(' ').includes(LOYALTY_SCOPE)).map((p) => ({ characterId: p.id, name: p.name }));
  // A pilot with the scope counts as covered once a loyalty sync finished without error (even with no LP anywhere)
  const synced = await db
    .select({ characterId: syncLog.characterId })
    .from(syncLog)
    .where(and(eq(syncLog.kind, 'loyalty'), isNull(syncLog.error), sql`${syncLog.finishedAt} is not null`))
    .groupBy(syncLog.characterId);
  const syncedIds = new Set(synced.map((s) => s.characterId));
  const rows = await db.select().from(loyaltyPoints);
  for (const r of rows) syncedIds.add(r.characterId);
  const nameOf = new Map(pilots.map((p) => [p.id, p.name]));

  const corpIds = [...new Set(rows.map((r) => r.corporationId))];
  const corpNames = corpIds.length ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, corpIds)) : [];
  const corpName = new Map(corpNames.map((n) => [n.id, n.name]));
  const isEvermarks = (id: number) => corpName.get(id) === EVERMARKS_CORP;

  // Best exchange of each store: ISK the item fetches (average price) minus the ISK and the items the offer asks for,
  // per LP. Offers whose item or inputs have no price are skipped
  const valued = corpIds.filter((id) => !isEvermarks(id));
  const offers = valued.length ? await db.select().from(loyaltyOffers).where(inArray(loyaltyOffers.corporationId, valued)) : [];
  const typeIds = [...new Set(offers.flatMap((o) => [o.typeId, ...o.requiredItems.map((i) => i.typeId)]))];
  const priceOf = new Map<number, number>();
  for (let i = 0; i < typeIds.length; i += 500) {
    const prices = await db.select().from(marketPrices).where(inArray(marketPrices.typeId, typeIds.slice(i, i + 500)));
    for (const p of prices) {
      const v = p.averagePrice ?? p.adjustedPrice;
      if (v !== null && v > 0) priceOf.set(p.typeId, v);
    }
  }
  const best = new Map<number, { rate: number; offer: Offer }>();
  for (const o of offers) {
    const out = priceOf.get(o.typeId);
    if (out === undefined) continue;
    let inputs = 0;
    let priced = true;
    for (const i of o.requiredItems) {
      const p = priceOf.get(i.typeId);
      if (p === undefined) {
        priced = false;
        break;
      }
      inputs += p * i.quantity;
    }
    if (!priced) continue;
    const rate = (out * o.quantity - o.iskCost - inputs) / o.lpCost;
    if (rate <= 0) continue;
    const current = best.get(o.corporationId);
    if (!current || rate > current.rate) {
      best.set(o.corporationId, { rate, offer: { typeId: o.typeId, name: null, quantity: o.quantity, lpCost: o.lpCost, iskCost: o.iskCost, required: o.requiredItems.length } });
    }
  }
  const bestTypes = [...best.values()].map((b) => b.offer.typeId);
  const typeNames = bestTypes.length ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, bestTypes)) : [];
  const typeName = new Map(typeNames.map((n) => [n.id, n.name]));
  for (const b of best.values()) b.offer.name = typeName.get(b.offer.typeId) ?? null;
  const stores = await db.select({ corporationId: loyaltyStores.corporationId }).from(loyaltyStores);
  const storeRead = new Set(stores.map((s) => s.corporationId));

  // Change over the period: what each pilot had with each corporation at the start of the period (the last
  // log entry at or before it) or, if the history starts inside it, the first entry (partial, since that date)
  const from = periodFrom(days, now);
  const baseline = await db
    .select({ characterId: loyaltyLog.characterId, corporationId: loyaltyLog.corporationId, points: loyaltyLog.points, at: sql<number>`max(${loyaltyLog.at})` })
    .from(loyaltyLog)
    .where(lte(loyaltyLog.at, from))
    .groupBy(loyaltyLog.characterId, loyaltyLog.corporationId);
  const first = await db
    .select({ characterId: loyaltyLog.characterId, corporationId: loyaltyLog.corporationId, points: loyaltyLog.points, at: sql<number>`min(${loyaltyLog.at})` })
    .from(loyaltyLog)
    .where(gt(loyaltyLog.at, from))
    .groupBy(loyaltyLog.characterId, loyaltyLog.corporationId);
  const [history] = await db.select({ at: sql<number | null>`min(${loyaltyLog.at})` }).from(loyaltyLog);
  const historySince = history?.at ? new Date(Number(history.at) * 1000) : null;
  const key = (c: number, k: number) => `${c}:${k}`;
  const base = new Map<string, number>();
  for (const f of first) base.set(key(f.characterId, f.corporationId), f.points);
  for (const b of baseline) base.set(key(b.characterId, b.corporationId), b.points);
  const current = new Map(rows.map((r) => [key(r.characterId, r.corporationId), r.points]));
  // Corporations in the log but no longer in the snapshot (their LP went to 0) still count in the change
  const changeByCorp = new Map<number, number>();
  for (const [k, b] of base) {
    const [c, corp] = k.split(':').map(Number);
    if (!syncedIds.has(c)) continue;
    const delta = (current.get(k) ?? 0) - b;
    changeByCorp.set(corp, (changeByCorp.get(corp) ?? 0) + delta);
  }

  const byCorp = new Map<number, { points: number; byPilot: { characterId: number; name: string; points: number }[] }>();
  for (const r of rows) {
    const c = byCorp.get(r.corporationId) ?? { points: 0, byPilot: [] };
    c.points += r.points;
    if (r.points > 0) c.byPilot.push({ characterId: r.characterId, name: nameOf.get(r.characterId) ?? `#${r.characterId}`, points: r.points });
    byCorp.set(r.corporationId, c);
  }
  for (const corp of changeByCorp.keys()) if (!byCorp.has(corp)) byCorp.set(corp, { points: 0, byPilot: [] });
  const allCorps = [...byCorp.entries()]
    .map(([corporationId, c]) => {
      const b = best.get(corporationId);
      return {
        corporationId,
        name: corpName.get(corporationId) ?? null,
        npc: corporationId >= NPC_CORPS[0] && corporationId < NPC_CORPS[1],
        points: c.points,
        byPilot: c.byPilot.sort((x, y) => y.points - x.points),
        iskPerLp: b?.rate ?? null,
        value: b ? c.points * b.rate : null,
        offer: b?.offer ?? null,
        // null: the store hasn't been read yet (it is read on the next sync)
        storeRead: storeRead.has(corporationId),
        change: changeByCorp.has(corporationId) ? changeByCorp.get(corporationId)! : null,
      };
    })
    .filter((c) => c.points > 0 || c.change)
    .sort((a, b) => b.points - a.points);
  const corps = allCorps.filter((c) => !isEvermarks(c.corporationId));
  const em = allCorps.filter((c) => isEvermarks(c.corporationId));
  const evermarks = em.length
    ? {
        points: em.reduce((n, c) => n + c.points, 0),
        byPilot: em.flatMap((c) => c.byPilot).sort((x, y) => y.points - x.points),
        change: em.some((c) => c.change !== null) ? em.reduce((n, c) => n + (c.change ?? 0), 0) : null,
      }
    : null;
  const points = corps.reduce((n, c) => n + c.points, 0);
  const value = corps.reduce((n, c) => n + (c.value ?? 0), 0);
  const withChange = corps.filter((c) => c.change !== null);

  return {
    days,
    pilots: withScope.map((p) => ({ characterId: p.id, name: p.name, synced: syncedIds.has(p.id) })),
    missingScope,
    corps,
    evermarks,
    points,
    // Estimated: sum of the corporations with a priced store; the others are counted
    value,
    valuedCorps: corps.filter((c) => c.value !== null).length,
    unvaluedCorps: corps.filter((c) => c.points > 0 && c.value === null).length,
    storesPending: corps.filter((c) => c.points > 0 && !c.storeRead).length,
    change: withChange.length ? withChange.reduce((n, c) => n + (c.change ?? 0), 0) : null,
    // The log starts here; if it is later than the start of the period, the change is since this date
    historySince: historySince?.toISOString() ?? null,
    changePartial: historySince !== null && historySince.getTime() > from.getTime(),
  };
}
