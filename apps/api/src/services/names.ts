import { and, between, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from '../db/client';
import { assets, killmails, loyaltyOffers, loyaltyPoints, names, walletJournal, walletTransactions } from '../db/schema';
import { EsiError, esiPost } from '../lib/esi';

type EsiName = { id: number; name: string; category: string };

export const UNKNOWN = 'unknown';

// ESI limit for POST /universe/names
const MAX_IDS = 1000;

// NPC stations: resolved with /universe/names. Player structures
// (IDs > 1e12) need another endpoint and the esi-universe.read_structures.v1 scope
export const STATION_RANGE = [60_000_000, 64_000_000] as const;
// Solar systems: loose items in space (location_type solar_system)
export const SYSTEM_RANGE = [30_000_000, 33_000_000] as const;

// If a single ID is invalid, ESI answers 404 for the whole request:
// the batch is split in two until the IDs that don't exist are isolated
async function fetchNames(ids: number[]): Promise<EsiName[]> {
  if (ids.length === 0) return [];
  try {
    const { data } = await esiPost<EsiName[]>('/universe/names', ids);
    return data;
  } catch (err) {
    if (!(err instanceof EsiError) || err.status !== 404) throw err;
    if (ids.length === 1) {
      // Saved anyway so as not to spend a 404 again on every sync
      console.warn(`[names] ESI no conoce el ID ${ids[0]}`);
      return [{ id: ids[0], name: `#${ids[0]}`, category: UNKNOWN }];
    }
    const mid = Math.ceil(ids.length / 2);
    return [...(await fetchNames(ids.slice(0, mid))), ...(await fetchNames(ids.slice(mid)))];
  }
}

// Resolves and saves the names not yet cached. Returns how many were added
export async function resolveNames(ids: number[]): Promise<number> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0 && id <= 2 ** 31 - 1);
  if (unique.length === 0) return 0;

  const known = new Set<number>();
  for (let i = 0; i < unique.length; i += MAX_IDS) {
    const rows = await db
      .select({ id: names.id })
      .from(names)
      .where(inArray(names.id, unique.slice(i, i + MAX_IDS)));
    for (const r of rows) known.add(r.id);
  }
  const missing = unique.filter((id) => !known.has(id));

  let added = 0;
  for (let i = 0; i < missing.length; i += MAX_IDS) {
    const found = await fetchNames(missing.slice(i, i + MAX_IDS));
    if (found.length === 0) continue;
    added += db
      .insert(names)
      .values(found.map((n) => ({ id: n.id, name: n.name, category: n.category })))
      .onConflictDoNothing()
      .returning({ id: names.id })
      .all().length;
  }
  return added;
}

// IDs in a column that don't have a cached name yet
async function missingIds(column: SQLiteColumn, table: SQLiteTable, range?: readonly [number, number]) {
  const rows = await db
    .selectDistinct({ id: sql<number>`${column}` })
    .from(table)
    .leftJoin(names, eq(names.id, column))
    .where(and(isNull(names.id), range ? between(column, ...range) : undefined));
  return rows.map((r) => r.id);
}

// Items, stations and systems from transactions, inventory and lost ships, and tax corporations, that don't have a name yet
export async function resolvePendingNames(): Promise<number> {
  const ids = [
    ...(await missingIds(walletTransactions.typeId, walletTransactions)),
    ...(await missingIds(walletTransactions.locationId, walletTransactions, STATION_RANGE)),
    ...(await missingIds(assets.typeId, assets)),
    ...(await missingIds(assets.rootLocationId, assets, STATION_RANGE)),
    ...(await missingIds(assets.rootLocationId, assets, SYSTEM_RANGE)),
    ...(await missingIds(killmails.shipTypeId, killmails)),
    ...(await missingIds(killmails.solarSystemId, killmails, SYSTEM_RANGE)),
    // Corporations that took tax (Descuentos, in Indicadores)
    ...(await missingIds(walletJournal.taxReceiverId, walletJournal)),
    // Corporations with loyalty points (Paragon = EverMarks is told apart by name) and what their stores sell
    ...(await missingIds(loyaltyPoints.corporationId, loyaltyPoints)),
    ...(await missingIds(loyaltyOffers.typeId, loyaltyOffers)),
  ];
  return resolveNames(ids);
}
