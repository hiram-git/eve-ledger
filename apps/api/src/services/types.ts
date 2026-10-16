import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, killmails, types, walletTransactions } from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';

type EsiType = { type_id: number; group_id: number; market_group_id?: number };

// Lookups per sync: the rest come on the next one (types don't change)
const MAX_LOOKUPS = 200;

// Asks ESI for the market group of the types that can replace a lost ship: those from your pilots' losses
// (hull and equipment) and those your pilots buy on the market. Returns how many were added
export async function resolvePendingTypes(): Promise<number> {
  const known = new Set((await db.select({ id: types.typeId }).from(types)).map((r) => r.id));
  const wanted = new Set<number>();
  const linked = db.select({ id: characters.id }).from(characters);
  for (const k of await db
    .select({ ship: killmails.shipTypeId, items: killmails.items })
    .from(killmails)
    .where(inArray(killmails.victimCharacterId, linked))) {
    wanted.add(k.ship);
    for (const i of k.items) wanted.add(i.typeId);
  }
  for (const t of await db
    .selectDistinct({ id: walletTransactions.typeId })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.isBuy, true), known.size ? notInArray(walletTransactions.typeId, [...known]) : undefined)))
    wanted.add(t.id);

  let added = 0;
  let lookups = 0;
  for (const id of wanted) {
    if (known.has(id)) continue;
    if (lookups++ >= MAX_LOOKUPS) break;
    try {
      const { data } = await esiGet<EsiType>(`/universe/types/${id}`);
      db.insert(types)
        .values({ typeId: id, groupId: data.group_id, marketGroupId: data.market_group_id ?? null, updatedAt: new Date() })
        .onConflictDoNothing()
        .run();
      added++;
    } catch (err) {
      if (!(err instanceof EsiError && err.status === 404)) throw err;
    }
  }
  return added;
}
