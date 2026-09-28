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

// Ítems más vendidos y más comprados del período (ISK movido), sin operaciones internas
export async function topItems(from: Date, limit = 10) {
  const isk = sql<number>`sum(${tx.quantity} * ${tx.unitPrice})`;
  const query = (isBuy: boolean) =>
    db
      .select({
        typeId: tx.typeId,
        name: itemName.name,
        quantity: sql<number>`sum(${tx.quantity})`,
        isk,
        trades: sql<number>`count(*)`,
      })
      .from(tx)
      .leftJoin(itemName, eq(itemName.id, tx.typeId))
      .where(and(gte(tx.date, from), eq(tx.isBuy, isBuy), eq(isInternal, 0)))
      .groupBy(tx.typeId)
      .orderBy(desc(isk))
      .limit(limit);

  const [sold, bought] = await Promise.all([query(false), query(true)]);
  const withAvg = <T extends { isk: number; quantity: number }>(r: T) => ({ ...r, avgPrice: r.isk / r.quantity });
  return { sold: sold.map(withAvg), bought: bought.map(withAvg) };
}
