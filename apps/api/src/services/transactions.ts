import { and, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../db/client';
import { characters, names, walletTransactions as tx } from '../db/schema';

const itemName = alias(names, 'item_name');
const locationName = alias(names, 'location_name');

// Compra/venta entre mis propios personajes: en el consolidado se anula
const isInternal = sql<number>`(case when ${tx.clientId} in (select id from characters) then 1 else 0 end)`;

export type TransactionFilter = {
  from: Date;
  characterId?: number;
  typeId?: number;
  limit: number;
};

export async function listTransactions(f: TransactionFilter) {
  const where: SQL[] = [gte(tx.date, f.from)];
  if (f.characterId) where.push(eq(tx.characterId, f.characterId));
  if (f.typeId) where.push(eq(tx.typeId, f.typeId));

  const rows = await db
    .select({
      transactionId: tx.transactionId,
      date: tx.date,
      characterId: tx.characterId,
      characterName: characters.name,
      typeId: tx.typeId,
      itemName: itemName.name,
      isBuy: tx.isBuy,
      quantity: tx.quantity,
      unitPrice: tx.unitPrice,
      locationId: tx.locationId,
      locationName: locationName.name,
      clientId: tx.clientId,
      journalRefId: tx.journalRefId,
      internal: isInternal,
    })
    .from(tx)
    .innerJoin(characters, eq(characters.id, tx.characterId))
    .leftJoin(itemName, eq(itemName.id, tx.typeId))
    .leftJoin(locationName, eq(locationName.id, tx.locationId))
    .where(and(...where))
    .orderBy(desc(tx.date), desc(tx.transactionId))
    .limit(f.limit);

  return rows.map((r) => ({
    ...r,
    internal: r.internal === 1,
    total: r.quantity * r.unitPrice * (r.isBuy ? -1 : 1),
  }));
}

// Revisión de mercado: por ítem, lo vendido y lo comprado en el período (sin operaciones internas),
// ordenado por ISK movido. El neto por ítem es ventas − compras, sin comisiones ni impuestos.
export async function marketReview(from: Date, limit = 15) {
  const soldIsk = sql<number>`coalesce(sum(case when ${tx.isBuy} = 0 then ${tx.quantity} * ${tx.unitPrice} end), 0)`;
  const boughtIsk = sql<number>`coalesce(sum(case when ${tx.isBuy} = 1 then ${tx.quantity} * ${tx.unitPrice} end), 0)`;
  const where = and(gte(tx.date, from), eq(isInternal, 0));

  const items = await db
    .select({
      typeId: tx.typeId,
      name: itemName.name,
      soldQty: sql<number>`coalesce(sum(case when ${tx.isBuy} = 0 then ${tx.quantity} end), 0)`,
      sold: soldIsk,
      boughtQty: sql<number>`coalesce(sum(case when ${tx.isBuy} = 1 then ${tx.quantity} end), 0)`,
      bought: boughtIsk,
      trades: sql<number>`count(*)`,
    })
    .from(tx)
    .leftJoin(itemName, eq(itemName.id, tx.typeId))
    .where(where)
    .groupBy(tx.typeId)
    .orderBy(desc(sql`${soldIsk} + ${boughtIsk}`))
    .limit(limit);

  const [totals] = await db
    .select({ sold: soldIsk, bought: boughtIsk, items: sql<number>`count(distinct ${tx.typeId})` })
    .from(tx)
    .where(where);

  return {
    items: items.map((r) => ({ ...r, net: r.sold - r.bought })),
    totals: { ...totals, net: totals.sold - totals.bought },
  };
}
