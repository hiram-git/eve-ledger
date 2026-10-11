// Nombres de las estructuras de jugadores (citadelas, IDs > 1e12). POST /universe/names no las conoce: hace falta
// GET /universe/structures/{id} con el token de un piloto que tenga el scope esi-universe.read_structures.v1 y
// acceso a la estructura (si no, ESI responde 403). Con el nombre y el sistema, el inventario dice «Perimeter -
// Tranquility Trading Tower» en vez de «Estructura #1028…» y el mapa la sitúa en su sistema
import { and, eq, gt, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { assets, characters, contracts, names, stationSystems, structureLookups, walletTransactions } from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';

export const STRUCTURES_SCOPE = 'esi-universe.read_structures.v1';
// Las estructuras de jugadores tienen IDs por encima de 1e12 (las estaciones NPC, 60–64 millones)
export const STRUCTURE_MIN_ID = 1_000_000_000_000;

// Tope por sync: cada 403 cuenta contra el límite de errores de ESI (100 por minuto entre todo)
const MAX_LOOKUPS = 30;
const MAX_DENIED = 15;
// Sin acceso hoy puede haberlo mañana (el piloto entra en la corp, cambian los permisos de la estructura)
const RETRY_FORBIDDEN_MS = 7 * 86_400_000;
// 404: destruida o no existe; se vuelve a mirar al mes
const RETRY_MISSING_MS = 30 * 86_400_000;

type EsiStructure = { name: string; solar_system_id: number; owner_id?: number; type_id?: number };
export type FetchStructure = (structureId: number, characterId: number) => Promise<EsiStructure>;

const fetchStructure: FetchStructure = async (id, characterId) =>
  (await esiGet<EsiStructure>(`/universe/structures/${id}`, characterId)).data;

const isStructure = (col: typeof assets.rootLocationId) => gt(col, STRUCTURE_MIN_ID);

// Estructuras que aparecen en el inventario, las transacciones y los contratos y que aún no tienen nombre; las que
// dieron 403 o 404 hace poco esperan a su reintento. Primero las que más se ven (más pilas en el inventario, luego
// más transacciones): con el tope por sync, las que importan se resuelven antes
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

// Qué pilotos probar con una estructura, de los que tienen el permiso: los que guardan algo en ella o compraron y
// vendieron allí (tienen o tuvieron acceso). Si ninguno da con ella, nadie más la verá: no se gastan más 403.
// Sin ninguno así (solo sale en un contrato), como mucho dos de los demás
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
        // 403: este piloto no tiene acceso; se prueba con el siguiente. 401: su token no vale (lo dice su sync)
        if (err.status === 403 || err.status === 401) {
          denied++;
          continue;
        }
        throw err;
      }
    }
    // Un 403 solo cuenta si se probó con todos: si el tope cortó antes, se sigue en el siguiente sync
    if (outcome === 'forbidden' && tried < pilotsToTry.length) continue;
    await mark(id, outcome);
    result[outcome === 'ok' ? 'resolved' : outcome]++;
  }
  if (result.resolved) console.log(`[structures] ${result.resolved} estructuras con nombre`);
  return result;
}
