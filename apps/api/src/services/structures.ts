// Names of player structures (citadels, IDs > 1e12). POST /universe/names does not know them: it takes
// GET /universe/structures/{id} with the token of a pilot that has the esi-universe.read_structures.v1 scope and
// access to the structure (otherwise ESI answers 403). With the name and system, the inventory says «Perimeter -
// Tranquility Trading Tower» instead of «Estructura #1028…» and the map places it in its system
import { and, eq, gt, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { assets, characters, contracts, names, stationSystems, structureLookups, walletTransactions } from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';

export const STRUCTURES_SCOPE = 'esi-universe.read_structures.v1';
// Player structures have IDs above 1e12 (NPC stations, 60–64 million)
export const STRUCTURE_MIN_ID = 1_000_000_000_000;

// Cap per sync: every 403 counts against ESI's error limit (100 per minute across everything)
const MAX_LOOKUPS = 30;
const MAX_DENIED = 15;
// No access today may become access tomorrow (the pilot joins the corp, the structure's permissions change)
const RETRY_FORBIDDEN_MS = 7 * 86_400_000;
// 404: destroyed or does not exist; checked again after a month
const RETRY_MISSING_MS = 30 * 86_400_000;

type EsiStructure = { name: string; solar_system_id: number; owner_id?: number; type_id?: number };
export type FetchStructure = (structureId: number, characterId: number) => Promise<EsiStructure>;

const fetchStructure: FetchStructure = async (id, characterId) =>
  (await esiGet<EsiStructure>(`/universe/structures/${id}`, characterId)).data;

const isStructure = (col: typeof assets.rootLocationId) => gt(col, STRUCTURE_MIN_ID);

// Structures that appear in the inventory, transactions and contracts and still have no name; those that
// returned 403 or 404 recently wait for their retry. Most visible first (most stacks in the inventory, then
// most transactions): with the per-sync cap, the ones that matter are resolved first
export async function pendingStructures(now = Date.now()): Promise<number[]> {
  const due = or(
    isNull(structureLookups.id),
    and(eq(structureLookups.status, 'forbidden'), lt(structureLookups.checkedAt, new Date(now - RETRY_FORBIDDEN_MS))),
    and(eq(structureLookups.status, 'missing'), lt(structureLookups.checkedAt, new Date(now - RETRY_MISSING_MS))),
  );
  const named = db.select({ id: names.id }).from(names);
  const weight = new Map<number, number>();
  const sources = [
    { col: assets.rootLocationId, table: assets, factor: 1_000_000 },
    { col: walletTransactions.locationId, table: walletTransactions, factor: 1 },
    { col: contracts.startLocationId, table: contracts, factor: 1 },
    { col: contracts.endLocationId, table: contracts, factor: 1 },
  ] as const;
  for (const { col, table, factor } of sources) {
    const rows = await db
      .select({ id: sql<number>`${col}`, n: sql<number>`count(*)` })
      .from(table)
      .leftJoin(structureLookups, eq(structureLookups.id, col))
      .where(and(isStructure(col as typeof assets.rootLocationId), notInArray(col, named), due))
      .groupBy(col);
    for (const r of rows) if (r.id) weight.set(r.id, (weight.get(r.id) ?? 0) + r.n * factor);
  }
  return [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
}

// Which pilots to try for a structure, among those with the permission: those that store something there or bought and
// sold there (they have or had access). If none of them finds it, nobody else will see it: no more 403s are spent.
// With none like that (it only shows up in a contract), at most two of the others
const MAX_STRANGERS = 2;
async function candidates(structureId: number, withScope: number[]): Promise<number[]> {
  if (!withScope.length) return [];
  const users = new Set<number>();
  for (const r of await db
    .selectDistinct({ id: assets.characterId })
    .from(assets)
    .where(and(eq(assets.rootLocationId, structureId), inArray(assets.characterId, withScope))))
    users.add(r.id);
  for (const r of await db
    .selectDistinct({ id: walletTransactions.characterId })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.locationId, structureId), inArray(walletTransactions.characterId, withScope))))
    users.add(r.id);
  return users.size ? [...users] : withScope.slice(0, MAX_STRANGERS);
}

async function mark(id: number, status: 'ok' | 'forbidden' | 'missing') {
  const row = { id, status, checkedAt: new Date() };
  await db.insert(structureLookups).values(row).onConflictDoUpdate({ target: structureLookups.id, set: row });
}

export async function resolvePendingStructures(fetch: FetchStructure = fetchStructure) {
  const result = { resolved: 0, forbidden: 0, missing: 0 };
  const pilots = await db.select({ id: characters.id, scopes: characters.scopes }).from(characters);
  const withScope = pilots.filter((p) => p.scopes.split(' ').includes(STRUCTURES_SCOPE)).map((p) => p.id);
  if (!withScope.length) return result;

  let lookups = 0;
  let denied = 0;
  for (const id of await pendingStructures()) {
    if (lookups >= MAX_LOOKUPS || denied >= MAX_DENIED) break;
    let outcome: 'ok' | 'forbidden' | 'missing' = 'forbidden';
    const pilotsToTry = await candidates(id, withScope);
    let tried = 0;
    for (const characterId of pilotsToTry) {
      if (lookups >= MAX_LOOKUPS || denied >= MAX_DENIED) break;
      lookups++;
      tried++;
      try {
        const s = await fetch(id, characterId);
        await db.insert(names).values({ id, name: s.name, category: 'structure' }).onConflictDoUpdate({
          target: names.id,
          set: { name: s.name, category: 'structure', updatedAt: new Date() },
        });
        await db.insert(stationSystems).values({ stationId: id, systemId: s.solar_system_id }).onConflictDoNothing();
        outcome = 'ok';
        break;
      } catch (err) {
        if (!(err instanceof EsiError)) throw err;
        if (err.status === 404) {
          outcome = 'missing';
          break;
        }
        // 403: this pilot has no access; try the next one. 401: its token is invalid (its sync says so)
        if (err.status === 403 || err.status === 401) {
          denied++;
          continue;
        }
        throw err;
      }
    }
    // A 403 only counts if every pilot was tried: if the cap cut it short, it continues in the next sync
    if (outcome === 'forbidden' && tried < pilotsToTry.length) continue;
    await mark(id, outcome);
    result[outcome === 'ok' ? 'resolved' : outcome]++;
  }
  if (result.resolved) console.log(`[structures] ${result.resolved} estructuras con nombre`);
  return result;
}
