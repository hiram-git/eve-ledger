import { and, desc, eq, max, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '../db/client';
import { assets as a, characters, marketPrices as p, names } from '../db/schema';
import { pricesUpdatedAt } from './prices';

const itemName = alias(names, 'item_name');
const locationName = alias(names, 'location_name');

// Precio unitario: medio de ESI (o el ajustado si no hay medio). Las copias de blueprint
// no se venden en el mercado y su average_price es el del original: valen 0
export const unitPrice = sql<number>`(case when ${a.isBlueprintCopy} then 0 else coalesce(${p.averagePrice}, ${p.adjustedPrice}, 0) end)`;
const value = sql<number>`coalesce(sum(${a.quantity} * ${unitPrice}), 0)`;
const priced = eq(p.typeId, a.typeId);

// characterId opcional: solo el inventario de ese piloto (byCharacter siempre incluye a todos)
export async function getInventory({ locations = 10, items = 15, characterId }: { locations?: number; items?: number; characterId?: number } = {}) {
  const pilot = characterId ? eq(a.characterId, characterId) : undefined;
  const [totals] = await db
    .select({
      value,
      stacks: sql<number>`count(*)`,
      types: sql<number>`count(distinct ${a.typeId})`,
      unpricedTypes: sql<number>`count(distinct case when ${p.typeId} is null and not ${a.isBlueprintCopy} then ${a.typeId} end)`,
      assetsUpdatedAt: max(a.updatedAt),
    })
    .from(a)
    .leftJoin(p, priced)
    .where(pilot);

  const byCharacter = await db
    .select({ characterId: a.characterId, name: characters.name, value, updatedAt: max(a.updatedAt) })
    .from(a)
    .innerJoin(characters, eq(characters.id, a.characterId))
    .leftJoin(p, priced)
    .groupBy(a.characterId)
    .orderBy(desc(value));

  const byLocation = await db
    .select({
      locationId: a.rootLocationId,
      name: locationName.name,
      value,
      stacks: sql<number>`count(*)`,
    })
    .from(a)
    .leftJoin(p, priced)
    .leftJoin(locationName, eq(locationName.id, a.rootLocationId))
    .where(pilot)
    .groupBy(a.rootLocationId)
    .orderBy(desc(value));

  const topItems = await db
    .select({
      typeId: a.typeId,
      name: itemName.name,
      quantity: sql<number>`sum(${a.quantity})`,
      unitPrice: sql<number>`max(${unitPrice})`,
      value,
    })
    .from(a)
    .leftJoin(p, priced)
    .leftJoin(itemName, eq(itemName.id, a.typeId))
    .where(pilot)
    .groupBy(a.typeId)
    .orderBy(desc(value))
    .limit(items);

  // Las ubicaciones más valiosas y el resto agrupado
  const shown = byLocation.slice(0, locations);
  const rest = byLocation.slice(locations);
  if (rest.length) {
    shown.push({
      locationId: 0,
      name: `Otras ${rest.length} ubicaciones`,
      value: rest.reduce((n, l) => n + l.value, 0),
      stacks: rest.reduce((n, l) => n + l.stacks, 0),
    });
  }

  return {
    ...totals,
    pricesUpdatedAt: await pricesUpdatedAt(),
    byCharacter,
    byLocation: shown,
    topItems,
  };
}

export type AssetFilter = { characterId?: number; locationId?: number; typeId?: number; limit: number };

export async function listAssets(f: AssetFilter) {
  const where: SQL[] = [];
  if (f.characterId) where.push(eq(a.characterId, f.characterId));
  if (f.locationId) where.push(eq(a.rootLocationId, f.locationId));
  if (f.typeId) where.push(eq(a.typeId, f.typeId));

  const lineValue = sql<number>`${a.quantity} * ${unitPrice}`;
  return db
    .select({
      itemId: a.itemId,
      characterId: a.characterId,
      characterName: characters.name,
      typeId: a.typeId,
      itemName: itemName.name,
      quantity: a.quantity,
      isBlueprintCopy: a.isBlueprintCopy,
      locationFlag: a.locationFlag,
      locationId: a.rootLocationId,
      locationName: locationName.name,
      unitPrice,
      value: lineValue,
    })
    .from(a)
    .innerJoin(characters, eq(characters.id, a.characterId))
    .leftJoin(p, priced)
    .leftJoin(itemName, eq(itemName.id, a.typeId))
    .leftJoin(locationName, eq(locationName.id, a.rootLocationId))
    .where(and(...where))
    .orderBy(desc(lineValue))
    .limit(f.limit);
}
