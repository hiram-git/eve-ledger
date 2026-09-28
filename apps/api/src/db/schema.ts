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
  kind: text('kind').notNull().default('journal'), // journal | transactions
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  rowsInserted: integer('rows_inserted').default(0),
  error: text('error'),
});
