// Purchase prices for the doctrines: the lowest sell order in Jita (user's decision), for each type the
// fits carry and for the skill injectors. Public orders from The Forge (no token) filtered by the Jita
// system; stored in jita_prices and requested at most once an hour (on sync, when adding a fit or by hand)
import { inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { fits, jitaPrices } from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';
import { INJECTOR } from '../lib/injectors';

const THE_FORGE = 10000002;
const JITA_SYSTEM = 30000142;
const MAX_AGE_MS = 3_600_000;
const MAX_PAGES = 5;
// Cap on types per round (a large fit carries ~40): the rest are requested in the next one
const MAX_TYPES = 120;

type EsiOrder = { price: number; is_buy_order: boolean; system_id: number };
export type JitaPrice = typeof jitaPrices.$inferSelect;

export async function loadJitaPrices(ids: number[]): Promise<Map<number, JitaPrice>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(jitaPrices).where(inArray(jitaPrices.typeId, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.typeId, r]));
}

async function sellMinInJita(typeId: number) {
  const path = `/markets/${THE_FORGE}/orders/?order_type=sell&type_id=${typeId}`;
  const first = await esiGet<EsiOrder[]>(`${path}&page=1`);
  const orders = [...first.data];
  const pages = Math.min(Number(first.headers.get('x-pages') ?? 1) || 1, MAX_PAGES);
  for (let page = 2; page <= pages; page++) orders.push(...(await esiGet<EsiOrder[]>(`${path}&page=${page}`)).data);
  const sells = orders.filter((o) => !o.is_buy_order && o.system_id === JITA_SYSTEM).map((o) => o.price);
  return { sellMin: sells.length ? Math.min(...sells) : null, sellOrders: sells.length };
}

// Requests the prices that are missing or older than an hour. A type ESI does not know (404) stays without a price
export async function refreshJitaPrices(typeIds: number[], { force = false } = {}): Promise<number> {
  const ids = [...new Set(typeIds)];
  const known = await loadJitaPrices(ids);
  const stale = ids
    .filter((id) => force || !known.has(id) || Date.now() - known.get(id)!.updatedAt.getTime() > MAX_AGE_MS)
    .slice(0, MAX_TYPES);
  let done = 0;
  for (const typeId of stale) {
    let quote: { sellMin: number | null; sellOrders: number };
    try {
      quote = await sellMinInJita(typeId);
    } catch (err) {
      if (err instanceof EsiError && (err.status === 404 || err.status === 400)) quote = { sellMin: null, sellOrders: 0 };
      else throw err;
    }
    const row = { typeId, ...quote, updatedAt: new Date() };
    await db.insert(jitaPrices).values(row).onConflictDoUpdate({ target: jitaPrices.typeId, set: row });
    done++;
  }
  if (done) console.log(`[jita] ${done} precios actualizados`);
  return done;
}

// Everything priced in the doctrines: hulls, what the fits carry and the two injectors
export async function doctrineTypeIds(): Promise<number[]> {
  const rows = await db.select({ ship: fits.shipTypeId, items: fits.items }).from(fits);
  const ids = new Set<number>([INJECTOR.large, INJECTOR.small]);
  for (const r of rows) {
    ids.add(r.ship);
    for (const i of r.items) ids.add(i.typeId);
  }
  // Without fits nothing is needed (not even the injectors)
  return rows.length ? [...ids] : [];
}

export const refreshDoctrinePrices = async (opts: { force?: boolean } = {}) => refreshJitaPrices(await doctrineTypeIds(), opts);
