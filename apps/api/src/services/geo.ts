import { and, eq, gte, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { assets, killmails, marketPrices, stationSystems, systems, walletJournal } from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';
import { unitPrice } from './inventory';
import { STATION_RANGE, SYSTEM_RANGE } from './names';

type EsiStation = { system_id: number };
type EsiSystem = { name: string; security_status: number; position: { x: number; y: number; z: number } };

// Cap per sync: geography is static, anything missing is completed in the next one
const MAX_LOOKUPS = 150;

const inRange = (col: typeof assets.rootLocationId, [lo, hi]: readonly [number, number]) =>
  sql`${col} between ${lo} and ${hi}`;

// Journal entries whose context is a system (ratting bounties, e.g.)
const systemContext = eq(walletJournal.contextIdType, 'system_id');

// Asks ESI for the stations and systems the map needs that aren't cached yet
export async function resolvePendingGeo(): Promise<{ stations: number; systems: number }> {
  let lookups = 0;

  const stationRows = await db
    .selectDistinct({ id: assets.rootLocationId })
    .from(assets)
    .leftJoin(stationSystems, eq(stationSystems.stationId, assets.rootLocationId))
    .where(and(isNull(stationSystems.stationId), inRange(assets.rootLocationId, STATION_RANGE)));

  let stationsAdded = 0;
  for (const { id } of stationRows) {
    if (lookups++ >= MAX_LOOKUPS) break;
    try {
      const { data } = await esiGet<EsiStation>(`/universe/stations/${id}`);
      await db.insert(stationSystems).values({ stationId: id, systemId: data.system_id }).onConflictDoNothing();
      stationsAdded++;
    } catch (err) {
      if (!(err instanceof EsiError && err.status === 404)) throw err;
    }
  }

  // Systems: those of the stations, of items loose in space, of the losses and of the journal
  const known = db.select({ id: systems.id }).from(systems);
  const wanted = new Set<number>();
  for (const r of await db
    .selectDistinct({ id: stationSystems.systemId })
    .from(stationSystems)
    .where(notInArray(stationSystems.systemId, known)))
    wanted.add(r.id);
  for (const r of await db
    .selectDistinct({ id: assets.rootLocationId })
    .from(assets)
    .where(and(inRange(assets.rootLocationId, SYSTEM_RANGE), notInArray(assets.rootLocationId, known))))
    wanted.add(r.id);
  // Those of the losses: each ship's row shows the system's security
  for (const r of await db
    .selectDistinct({ id: killmails.solarSystemId })
    .from(killmails)
    .where(notInArray(killmails.solarSystemId, known)))
    wanted.add(r.id);
  for (const r of await db
    .selectDistinct({ id: walletJournal.contextId })
    .from(walletJournal)
    .where(and(systemContext, notInArray(walletJournal.contextId, known))))
    if (r.id) wanted.add(r.id);

  let systemsAdded = 0;
  for (const id of wanted) {
    if (lookups++ >= MAX_LOOKUPS) break;
    try {
      const { data } = await esiGet<EsiSystem>(`/universe/systems/${id}`);
      await db
        .insert(systems)
        .values({ id, name: data.name, security: data.security_status, ...data.position })
        .onConflictDoNothing();
      systemsAdded++;
    } catch (err) {
      if (!(err instanceof EsiError && err.status === 404)) throw err;
    }
  }
  return { stations: stationsAdded, systems: systemsAdded };
}

export type MapNode = {
  systemId: number;
  name: string;
  security: number;
  x: number;
  z: number;
  inventory: number; // ISK in inventory in the system (stations + space)
  earnedToday: number; // ISK earned today (EVE day) with the system as context
};

// Data for the «tu New Eden» map: where the inventory is and where ISK was earned today
export async function getMap(characterId?: number) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  // Value per root location; the station is mapped to its system
  const byRoot = await db
    .select({
      rootId: assets.rootLocationId,
      systemId: stationSystems.systemId,
      value: sql<number>`coalesce(sum(${assets.quantity} * ${unitPrice}), 0)`,
    })
    .from(assets)
    .leftJoin(marketPrices, eq(marketPrices.typeId, assets.typeId))
    .leftJoin(stationSystems, eq(stationSystems.stationId, assets.rootLocationId))
    .where(characterId ? eq(assets.characterId, characterId) : undefined)
    .groupBy(assets.rootLocationId);

  const inventory = new Map<number, number>();
  const unplaced = { value: 0, locations: 0 };
  for (const r of byRoot) {
    const inSpace = r.rootId >= SYSTEM_RANGE[0] && r.rootId <= SYSTEM_RANGE[1];
    const systemId = inSpace ? r.rootId : r.systemId;
    if (!systemId) {
      // Player structures or stations not resolved yet
      unplaced.value += r.value;
      unplaced.locations++;
      continue;
    }
    inventory.set(systemId, (inventory.get(systemId) ?? 0) + r.value);
  }

  const earnedRows = await db
    .select({ systemId: walletJournal.contextId, earned: sql<number>`sum(${walletJournal.amount})` })
    .from(walletJournal)
    .where(
      and(
        systemContext,
        gte(walletJournal.date, todayStart),
        sql`${walletJournal.amount} > 0`,
        characterId ? eq(walletJournal.characterId, characterId) : undefined,
      ),
    )
    .groupBy(walletJournal.contextId);
  const earned = new Map(earnedRows.filter((r) => r.systemId).map((r) => [r.systemId!, r.earned]));

  const ids = [...new Set([...inventory.keys(), ...earned.keys()])];
  const found = ids.length ? await db.select().from(systems).where(inArray(systems.id, ids)) : [];
  const nodes: MapNode[] = found.map((s) => ({
    systemId: s.id,
    name: s.name,
    security: Math.round(s.security * 10) / 10,
    x: s.x,
    z: s.z,
    inventory: inventory.get(s.id) ?? 0,
    earnedToday: earned.get(s.id) ?? 0,
  }));

  // Systems with data but no coordinates yet (resolved in the next sync)
  const pending = ids.length - nodes.length;
  for (const id of ids) {
    if (found.some((s) => s.id === id)) continue;
    unplaced.value += inventory.get(id) ?? 0;
  }

  return { nodes: nodes.sort((a, b) => b.inventory - a.inventory), unplaced, pending, todayStart };
}
