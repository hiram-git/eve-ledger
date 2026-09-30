import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';

const ts = (name: string) => integer(name, { mode: 'timestamp' });

export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey(), // character_id de EVE
  name: text('name').notNull(),
  ownerHash: text('owner_hash').notNull(), // cambia si el personaje se transfiere de cuenta
  scopes: text('scopes').notNull(),
  refreshToken: text('refresh_token').notNull(), // cifrado AES-GCM
  accessToken: text('access_token'), // cifrado AES-GCM
  tokenExpiresAt: ts('token_expires_at'),
  lastSyncAt: ts('last_sync_at'),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
});

export const walletJournal = sqliteTable(
  'wallet_journal',
  {
    journalId: integer('journal_id').primaryKey(), // id de ESI → sync idempotente
    characterId: integer('character_id').notNull().references(() => characters.id),
    date: ts('date').notNull(),
    refType: text('ref_type').notNull(),
    amount: real('amount').notNull(),
    balance: real('balance'),
    description: text('description'),
    firstPartyId: integer('first_party_id'),
    secondPartyId: integer('second_party_id'),
    contextId: integer('context_id'),
    contextIdType: text('context_id_type'),
  },
  (t) => [
    index('journal_char_date_idx').on(t.characterId, t.date),
    index('journal_ref_type_idx').on(t.refType),
  ],
);

export const walletTransactions = sqliteTable(
  'wallet_transactions',
  {
    transactionId: integer('transaction_id').primaryKey(), // id de ESI → sync idempotente
    characterId: integer('character_id').notNull().references(() => characters.id),
    date: ts('date').notNull(),
    typeId: integer('type_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    isBuy: integer('is_buy', { mode: 'boolean' }).notNull(),
    locationId: integer('location_id').notNull(),
    clientId: integer('client_id'), // contraparte; si es un personaje propio, es una operación interna
    journalRefId: integer('journal_ref_id'), // enlaza con wallet_journal.journal_id
  },
  (t) => [
    index('tx_char_date_idx').on(t.characterId, t.date),
    index('tx_type_idx').on(t.typeId),
  ],
);

// Caché de nombres de ESI (POST /universe/names): ítems, estaciones, personajes...
// Los IDs de EVE son únicos entre categorías, así que basta una tabla
export const names = sqliteTable('names', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // inventory_type, station, character, corporation...
  updatedAt: ts('updated_at').notNull().$defaultFn(() => new Date()),
});

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  characterId: integer('character_id').notNull(),
  kind: text('kind').notNull().default('journal'), // journal | transactions | assets
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  rowsInserted: integer('rows_inserted').default(0),
  error: text('error'),
});

// Foto actual del inventario: se reemplaza entera en cada sync del personaje
export const assets = sqliteTable(
  'assets',
  {
    itemId: integer('item_id').primaryKey(),
    characterId: integer('character_id').notNull().references(() => characters.id),
    typeId: integer('type_id').notNull(),
    quantity: integer('quantity').notNull(),
    locationId: integer('location_id').notNull(), // estación, sistema o el item_id que lo contiene
    locationFlag: text('location_flag').notNull(), // Hangar, Cargo, DroneBay...
    locationType: text('location_type').notNull(), // station | solar_system | item | other
    rootLocationId: integer('root_location_id').notNull(), // estación/estructura/sistema donde está al final
    isSingleton: integer('is_singleton', { mode: 'boolean' }).notNull(),
    isBlueprintCopy: integer('is_blueprint_copy', { mode: 'boolean' }).notNull().default(false),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    index('assets_char_idx').on(t.characterId),
    index('assets_type_idx').on(t.typeId),
    index('assets_root_idx').on(t.rootLocationId),
  ],
);

// GET /markets/prices: precio medio global de ESI (no es el precio de venta de Jita)
export const marketPrices = sqliteTable('market_prices', {
  typeId: integer('type_id').primaryKey(),
  averagePrice: real('average_price'),
  adjustedPrice: real('adjusted_price'),
  updatedAt: ts('updated_at').notNull(),
});

// Precio de venta más bajo en el mercado (órdenes reales, no la media global). Se refresca en cada sync;
// de momento solo el PLEX, que es lo que cuesta el Omega
export const marketQuotes = sqliteTable('market_quotes', {
  typeId: integer('type_id').primaryKey(),
  sellMin: real('sell_min'), // null = sin órdenes de venta
  sellOrders: integer('sell_orders').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// Caché de geografía de ESI para el mapa: sistemas con coordenadas y estación → sistema.
// Son datos estáticos del universo, se piden una sola vez por ID
export const systems = sqliteTable('systems', {
  id: integer('id').primaryKey(), // solar_system_id
  name: text('name').notNull(),
  security: real('security').notNull(),
  // Posición en metros; el plano galáctico es x/z (y es la altura)
  x: real('x').notNull(),
  y: real('y').notNull(),
  z: real('z').notNull(),
});

export const stationSystems = sqliteTable('station_systems', {
  stationId: integer('station_id').primaryKey(),
  systemId: integer('system_id').notNull(),
});
