import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { assets } from '../db/schema';
import { esiGet } from '../lib/esi';

// GET /characters/{id}/assets (1000 ítems por página)
type EsiAsset = {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_flag: string;
  location_type: string;
  is_singleton: boolean;
  is_blueprint_copy?: boolean;
};

export const ASSETS_SCOPE = 'esi-assets.read_assets.v1';

const CHUNK = 500;
const MAX_DEPTH = 10;

// Un ítem dentro de una nave dentro de un contenedor... apunta a su padre por item_id.
// Se sube por la cadena hasta llegar a algo que no es un ítem propio (estación, estructura, sistema)
export function rootLocations(items: EsiAsset[]): Map<number, number> {
  const byId = new Map(items.map((a) => [a.item_id, a]));
  const roots = new Map<number, number>();
  for (const a of items) {
    let loc = a.location_id;
    for (let depth = 0; depth < MAX_DEPTH && byId.has(loc); depth++) loc = byId.get(loc)!.location_id;
    roots.set(a.item_id, loc);
  }
  return roots;
}

export async function fetchAssets(characterId: number, r: { pages: number; fetched: number; inserted: number }) {
  const items: EsiAsset[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const { data, headers } = await esiGet<EsiAsset[]>(`/characters/${characterId}/assets?page=${page}`, characterId);
    if (page === 1) totalPages = Number(headers.get('x-pages') ?? 1) || 1;
    items.push(...data);
    r.pages = page;
  }
  r.fetched = items.length;

  const roots = rootLocations(items);
  const now = new Date();
  const rows = items.map((a) => ({
    itemId: a.item_id,
    characterId,
    typeId: a.type_id,
    quantity: a.quantity,
    locationId: a.location_id,
    locationFlag: a.location_flag,
    locationType: a.location_type,
    rootLocationId: roots.get(a.item_id)!,
    isSingleton: a.is_singleton,
    isBlueprintCopy: a.is_blueprint_copy ?? false,
    updatedAt: now,
  }));

  // Se reemplaza la foto completa solo cuando ya se descargaron todas las páginas.
  // Upsert por item_id: si un ítem pasó de otro personaje a este, se lo "lleva"
  db.transaction((tx) => {
    tx.delete(assets).where(eq(assets.characterId, characterId)).run();
    for (let i = 0; i < rows.length; i += CHUNK) {
      tx.insert(assets)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: assets.itemId,
          set: {
            characterId: sql`excluded.character_id`,
            typeId: sql`excluded.type_id`,
            quantity: sql`excluded.quantity`,
            locationId: sql`excluded.location_id`,
            locationFlag: sql`excluded.location_flag`,
            locationType: sql`excluded.location_type`,
            rootLocationId: sql`excluded.root_location_id`,
            isSingleton: sql`excluded.is_singleton`,
            isBlueprintCopy: sql`excluded.is_blueprint_copy`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    }
  });
  r.inserted = rows.length;
}
