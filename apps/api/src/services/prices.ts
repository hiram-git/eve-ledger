import { max, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { marketPrices } from '../db/schema';
import { esiGet } from '../lib/esi';

type EsiPrice = { type_id: number; average_price?: number; adjusted_price?: number };

// ESI cachea /markets/prices ~1 h: refrescar más a menudo no trae nada nuevo
const MAX_AGE_MS = 60 * 60_000;
const CHUNK = 1000;

export async function pricesUpdatedAt(): Promise<Date | null> {
  const [row] = await db.select({ at: max(marketPrices.updatedAt) }).from(marketPrices);
  return row?.at ?? null;
}

// Descarga todos los precios (~15k tipos, una sola llamada pública) si los guardados son viejos
export async function refreshPricesIfStale(): Promise<number> {
  const at = await pricesUpdatedAt();
  if (at && Date.now() - at.getTime() < MAX_AGE_MS) return 0;

  const { data } = await esiGet<EsiPrice[]>('/markets/prices');
  const now = new Date();
  const rows = data.map((p) => ({
    typeId: p.type_id,
    averagePrice: p.average_price ?? null,
    adjustedPrice: p.adjusted_price ?? null,
    updatedAt: now,
  }));

  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      tx.insert(marketPrices)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: marketPrices.typeId,
          set: {
            averagePrice: sql`excluded.average_price`,
            adjustedPrice: sql`excluded.adjusted_price`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    }
  });
  console.log(`[prices] ${rows.length} precios actualizados`);
  return rows.length;
}
