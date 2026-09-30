import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { marketQuotes } from '../db/schema';
import { esiGet } from '../lib/esi';

// PLEX (tipo 44992) se negocia en su propio mercado global, no en Jita
export const PLEX_TYPE_ID = 44992;
const PLEX_REGION_ID = 19000001;
const MAX_PAGES = 5;
// Un syncAll llama a syncCharacter por cada piloto: con esto el precio se pide una sola vez por ronda
const MIN_AGE_MS = 60_000;

type EsiOrder = { price: number; is_buy_order: boolean };

export async function getQuote(typeId: number) {
  const [row] = await db.select().from(marketQuotes).where(eq(marketQuotes.typeId, typeId));
  return row;
}

// Precio de venta más bajo del PLEX ahora mismo (órdenes públicas, sin token)
export async function refreshPlexQuote(): Promise<number | null> {
  const prev = await getQuote(PLEX_TYPE_ID);
  if (prev && Date.now() - prev.updatedAt.getTime() < MIN_AGE_MS) return prev.sellMin;

  const path = `/markets/${PLEX_REGION_ID}/orders/?type_id=${PLEX_TYPE_ID}&order_type=sell`;
  const orders: EsiOrder[] = [];
  const first = await esiGet<EsiOrder[]>(`${path}&page=1`);
  orders.push(...first.data);
  const pages = Math.min(Number(first.headers.get('x-pages') ?? 1) || 1, MAX_PAGES);
  for (let page = 2; page <= pages; page++) orders.push(...(await esiGet<EsiOrder[]>(`${path}&page=${page}`)).data);

  const sells = orders.filter((o) => !o.is_buy_order).map((o) => o.price);
  const sellMin = sells.length ? Math.min(...sells) : null;
  const row = { typeId: PLEX_TYPE_ID, sellMin, sellOrders: sells.length, updatedAt: new Date() };
  await db.insert(marketQuotes).values(row).onConflictDoUpdate({ target: marketQuotes.typeId, set: row });
  console.log(`[quotes] PLEX: ${sellMin ?? 'sin órdenes'} (${sells.length} órdenes de venta)`);
  return sellMin;
}
