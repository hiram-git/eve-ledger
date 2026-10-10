import { sqliteTable, integer, text, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

const ts = (name: string) => integer(name, { mode: 'timestamp' });

export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey(), // character_id de EVE
  name: text('name').notNull(),
  ownerHash: text('owner_hash').notNull(), // cambia si el personaje se transfiere de cuenta
  scopes: text('scopes').notNull(),
  refreshToken: text('refresh_token').notNull(), // cifrado AES-GCM
  // Cómo se vinculó (y cómo se renueva el token): con el Client Secret o con PKCE (src/lib/sso.ts)
  authMethod: text('auth_method', { enum: ['secret', 'pkce'] }).notNull().default('secret'),
  accessToken: text('access_token'), // cifrado AES-GCM
  tokenExpiresAt: ts('token_expires_at'),
  lastSyncAt: ts('last_sync_at'),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
  // Último vínculo (también al revincular): los errores de sync anteriores ya no cuentan
  linkedAt: ts('linked_at'),
  // Alfa u Omega: ESI no lo dice, lo marca el usuario en Pilotos. Un Alfa entrena a la mitad de velocidad
  clone: text('clone', { enum: ['omega', 'alpha'] }).notNull().default('omega'),
  // GET /characters/{id}/skills: SP totales y sin asignar (los de los skill injectors aún no repartidos)
  totalSp: integer('total_sp'),
  unallocatedSp: integer('unallocated_sp'),
  skillsAt: ts('skills_at'),
});

export const walletJournal = sqliteTable(
  'wallet_journal',
  {
    // id de ESI + piloto → sync idempotente. ESI da el MISMO id a las dos partes de un movimiento entre dos
    // personajes (una donación de tu main a tu alter aparece en los dos journals con el mismo id): la clave es por piloto
    journalId: integer('journal_id').notNull(),
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
    primaryKey({ columns: [t.journalId, t.characterId] }),
    index('journal_char_date_idx').on(t.characterId, t.date),
    index('journal_ref_type_idx').on(t.refType),
  ],
);

export const walletTransactions = sqliteTable(
  'wallet_transactions',
  {
    // id de ESI + piloto: una compraventa entre dos de tus pilotos tiene el mismo id en los dos lados
    transactionId: integer('transaction_id').notNull(),
    characterId: integer('character_id').notNull().references(() => characters.id),
    date: ts('date').notNull(),
    typeId: integer('type_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    isBuy: integer('is_buy', { mode: 'boolean' }).notNull(),
    locationId: integer('location_id').notNull(),
    clientId: integer('client_id'), // contraparte; si es un personaje propio, es una operación interna
    journalRefId: integer('journal_ref_id'), // enlaza con wallet_journal.journal_id (del mismo piloto)
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.characterId] }),
    index('tx_char_date_idx').on(t.characterId, t.date),
    index('tx_type_idx').on(t.typeId),
    // El journal busca su transacción (compras a otro de tus pilotos, transferencias por transacción)
    index('tx_char_journal_idx').on(t.characterId, t.journalRefId),
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
  kind: text('kind').notNull().default('journal'), // journal | transactions | assets | killmails | contracts | skills
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

// Ítem del killmail aplanado (los contenedores de la bodega traen sus ítems anidados)
// copy: copia de blueprint (vale 0, como en el inventario)
// flag: dónde iba (ranura, bahía de drones, bodega…; ver FITTED_FLAGS en losses.ts). Los ítems dentro de un
// contenedor llevan el flag del contenedor. Sin flag = killmail guardado antes de pedirlo (se completa en el sync)
export type KillmailItem = { typeId: number; destroyed: number; dropped: number; copy?: boolean; flag?: number };

// Killmails de tus pilotos (GET /characters/{id}/killmails/recent + GET /killmails/{id}/{hash}): muertes y
// pérdidas. Son inmutables, se piden una sola vez. Una pérdida es un killmail cuya víctima es un piloto vinculado
export const killmails = sqliteTable(
  'killmails',
  {
    killmailId: integer('killmail_id').primaryKey(),
    hash: text('hash').notNull(),
    characterId: integer('character_id').notNull(), // piloto en cuya lista apareció
    time: ts('killmail_time').notNull(),
    solarSystemId: integer('solar_system_id').notNull(),
    victimCharacterId: integer('victim_character_id'), // null si la víctima es una estructura
    shipTypeId: integer('ship_type_id').notNull(),
    items: text('items', { mode: 'json' }).$type<KillmailItem[]>().notNull(),
    attackers: integer('attackers').notNull(),
  },
  (t) => [index('killmails_victim_time_idx').on(t.victimCharacterId, t.time)],
);

// Contratos de tus pilotos (GET /characters/{id}/contracts): cambian de estado, se actualizan en cada sync.
// Los ítems de los courier que emiten tus pilotos (GET .../contracts/{id}/items) se piden una vez: dicen qué
// llevan, y así el transporte se liga a la nave perdida que repone
export type ContractItem = { typeId: number; quantity: number };
export const contracts = sqliteTable(
  'contracts',
  {
    contractId: integer('contract_id').primaryKey(),
    characterId: integer('character_id').notNull(), // piloto en cuya lista apareció
    issuerId: integer('issuer_id').notNull(),
    acceptorId: integer('acceptor_id'),
    assigneeId: integer('assignee_id'),
    type: text('type').notNull(), // item_exchange | courier | auction | loan | unknown
    status: text('status').notNull(),
    dateIssued: ts('date_issued').notNull(),
    dateCompleted: ts('date_completed'),
    price: real('price'),
    reward: real('reward'),
    collateral: real('collateral'),
    startLocationId: integer('start_location_id'),
    endLocationId: integer('end_location_id'),
    items: text('items', { mode: 'json' }).$type<ContractItem[]>(), // null = aún sin pedir
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('contracts_issuer_date_idx').on(t.issuerId, t.dateIssued)],
);

// Tipos de ítem (GET /universe/types/{id}, público y estático): grupo y grupo de mercado. Sirven para
// reconocer un módulo equivalente al perdido (mismo grupo de mercado: «Large Smart Bombs») al reponer una nave
export const types = sqliteTable('types', {
  typeId: integer('type_id').primaryKey(),
  groupId: integer('group_id').notNull(),
  marketGroupId: integer('market_group_id'), // null = no se vende en el mercado
  updatedAt: ts('updated_at').notNull(),
});

// Skills entrenadas de cada piloto (GET /characters/{id}/skills, scope esi-skills.read_skills.v1): una foto que
// se reemplaza en cada sync. activeLevel es el que puede usar (un Alfa no usa las skills de Omega por encima de
// su límite); trainedLevel y sp, lo entrenado
export const characterSkills = sqliteTable(
  'character_skills',
  {
    characterId: integer('character_id').notNull(),
    skillId: integer('skill_id').notNull(),
    trainedLevel: integer('trained_level').notNull(),
    activeLevel: integer('active_level').notNull(),
    sp: integer('sp').notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.skillId] })],
);

// Atributos de cada piloto (GET /characters/{id}/attributes): ESI los da ya con los implantes sumados (EVEMon le
// resta el bono de los implantes para obtener la base), así que son los que cuentan para la velocidad de entrenamiento
export const characterAttributes = sqliteTable('character_attributes', {
  characterId: integer('character_id').primaryKey(),
  charisma: integer('charisma').notNull(),
  intelligence: integer('intelligence').notNull(),
  memory: integer('memory').notNull(),
  perception: integer('perception').notNull(),
  willpower: integer('willpower').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// Dogma de los tipos que usan las doctrinas (GET /universe/types/{id} y /universe/groups/{id}, públicos y estáticos):
// categoría (nave, módulo, drone, munición…), skills requeridas (requiredSkill1…6) y, para las skills, su rango y
// sus atributos primario y secundario
export type RequiredSkill = { skillId: number; level: number };
export const typeDogma = sqliteTable('type_dogma', {
  typeId: integer('type_id').primaryKey(),
  name: text('name').notNull(),
  groupId: integer('group_id').notNull(),
  categoryId: integer('category_id').notNull(),
  rank: real('rank'),
  primaryAttr: integer('primary_attr'),
  secondaryAttr: integer('secondary_attr'),
  required: text('required', { mode: 'json' }).$type<RequiredSkill[]>().notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// Doctrinas: fits pegados en formato EFT (eveworkbench, foros) con, opcionalmente, el plan de skills de la
// comunidad (un .emp de EVEMon) para cada fit
export const doctrines = sqliteTable('doctrines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
});

// section: el bloque del EFT (low, mid, high, rig, subsystem), la munición cargada (charge), la bodega de drones o
// cazas (drone) o la carga (cargo). La carga no cuenta para poder volarla
export type FitSection = 'low' | 'mid' | 'high' | 'rig' | 'subsystem' | 'charge' | 'drone' | 'cargo';
export type FitItem = { typeId: number; quantity: number; section: FitSection };
export const fits = sqliteTable('fits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  doctrineId: integer('doctrine_id')
    .notNull()
    .references(() => doctrines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  shipTypeId: integer('ship_type_id').notNull(),
  eft: text('eft').notNull(),
  items: text('items', { mode: 'json' }).$type<FitItem[]>().notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
});

// Plan de skills de un fit (el «óptimo» de la comunidad): skill y nivel objetivo
export const fitPlans = sqliteTable('fit_plans', {
  fitId: integer('fit_id')
    .primaryKey()
    .references(() => fits.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  skills: text('skills', { mode: 'json' }).$type<RequiredSkill[]>().notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
});
