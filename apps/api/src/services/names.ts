import { and, between, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { names, walletTransactions } from '../db/schema';
import { EsiError, esiPost } from '../lib/esi';

type EsiName = { id: number; name: string; category: string };

export const UNKNOWN = 'unknown';

// Límite de ESI para POST /universe/names
const MAX_IDS = 1000;

// Estaciones NPC: se resuelven con /universe/names. Las estructuras de jugadores
// (IDs > 1e12) necesitan otro endpoint y el scope esi-universe.read_structures.v1
export const STATION_RANGE = [60_000_000, 64_000_000] as const;

// Si un solo ID es inválido, ESI responde 404 para toda la petición:
// se parte el lote en dos hasta aislar los IDs que no existen
async function fetchNames(ids: number[]): Promise<EsiName[]> {
  if (ids.length === 0) return [];
  try {
    const { data } = await esiPost<EsiName[]>('/universe/names', ids);
    return data;
  } catch (err) {
    if (!(err instanceof EsiError) || err.status !== 404) throw err;
    if (ids.length === 1) {
      // Se guarda igualmente para no volver a gastar un 404 en cada sync
      console.warn(`[names] ESI no conoce el ID ${ids[0]}`);
      return [{ id: ids[0], name: `#${ids[0]}`, category: UNKNOWN }];
    }
    const mid = Math.ceil(ids.length / 2);
    return [...(await fetchNames(ids.slice(0, mid))), ...(await fetchNames(ids.slice(mid)))];
  }
}

// Resuelve y guarda los nombres que aún no estén en caché. Devuelve cuántos se añadieron
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

// Ítems y estaciones de las transacciones que aún no tienen nombre
export async function resolveTransactionNames(): Promise<number> {
  const types = await db
    .selectDistinct({ id: walletTransactions.typeId })
    .from(walletTransactions)
    .leftJoin(names, sql`${names.id} = ${walletTransactions.typeId}`)
    .where(isNull(names.id));

  const stations = await db
    .selectDistinct({ id: walletTransactions.locationId })
    .from(walletTransactions)
    .leftJoin(names, sql`${names.id} = ${walletTransactions.locationId}`)
    .where(and(isNull(names.id), between(walletTransactions.locationId, ...STATION_RANGE)));

  return resolveNames([...types, ...stations].map((r) => r.id));
}
