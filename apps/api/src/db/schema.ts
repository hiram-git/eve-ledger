import { sqliteTable, integer, text, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

const ts = (name: string) => integer(name, { mode: 'timestamp' });

export const characters = sqliteTable('characters', {
  id: integer('id').primaryKey(), // EVE character_id
  name: text('name').notNull(),
  ownerHash: text('owner_hash').notNull(), // changes if the character is transferred to another account
  scopes: text('scopes').notNull(),
  refreshToken: text('refresh_token').notNull(), // AES-GCM encrypted
  // How it was linked: always PKCE today; 'secret' = with the Client Secret of earlier versions (must be relinked)
  authMethod: text('auth_method', { enum: ['secret', 'pkce'] }).notNull().default('secret'),
  accessToken: text('access_token'), // AES-GCM encrypted
  tokenExpiresAt: ts('token_expires_at'),
  lastSyncAt: ts('last_sync_at'),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
  // Last link (also when relinking): sync errors from before it no longer count
  linkedAt: ts('linked_at'),
  // Alpha or Omega: ESI doesn't say, the user sets it in Pilotos. An Alpha trains at half speed
  clone: text('clone', { enum: ['omega', 'alpha'] }).notNull().default('omega'),
  // GET /characters/{id}/skills: total and unallocated SP (those from skill injectors not yet allocated)
  totalSp: integer('total_sp'),
  unallocatedSp: integer('unallocated_sp'),
  skillsAt: ts('skills_at'),
  // GET /characters/{id}/wallet on every sync: the real balance (ESI caches it 2 min; the journal, up to 1 h, and it
  // has no entries for a pilot who hasn't moved ISK in more than 30 days)
  walletBalance: real('wallet_balance'),
  walletAt: ts('wallet_at'),
});

export const walletJournal = sqliteTable(
  'wallet_journal',
  {
    // ESI id + pilot → idempotent sync. ESI gives the SAME id to both sides of an entry between two
    // characters (a donation from your main to your alt shows up in both journals with the same id): the key is per pilot
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
    // Tax a corporation took (bounties, missions, ESS): `amount` already comes without it. null = entry
    // stored before it was read (desktop 0.1.17) that ESI no longer returns; 0 = no tax
    tax: real('tax'),
    taxReceiverId: integer('tax_receiver_id'),
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
    // ESI id + pilot: a trade between two of your pilots has the same id on both sides
    transactionId: integer('transaction_id').notNull(),
    characterId: integer('character_id').notNull().references(() => characters.id),
    date: ts('date').notNull(),
    typeId: integer('type_id').notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: real('unit_price').notNull(),
    isBuy: integer('is_buy', { mode: 'boolean' }).notNull(),
    locationId: integer('location_id').notNull(),
    clientId: integer('client_id'), // counterparty; if it's one of your own characters, it's an internal operation
    journalRefId: integer('journal_ref_id'), // links to wallet_journal.journal_id (of the same pilot)
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.characterId] }),
    index('tx_char_date_idx').on(t.characterId, t.date),
    index('tx_type_idx').on(t.typeId),
    // The journal looks up its transaction (purchases from another of your pilots, transfers by transaction)
    index('tx_char_journal_idx').on(t.characterId, t.journalRefId),
  ],
);

// Cache of ESI names (POST /universe/names): items, stations, characters...
// EVE IDs are unique across categories, so one table is enough
export const names = sqliteTable('names', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // inventory_type, station, character, corporation...
  updatedAt: ts('updated_at').notNull().$defaultFn(() => new Date()),
});

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  characterId: integer('character_id').notNull(),
  kind: text('kind').notNull().default('journal'), // journal | transactions | assets | killmails | contracts | skills | loyalty
  startedAt: ts('started_at').notNull(),
  finishedAt: ts('finished_at'),
  rowsInserted: integer('rows_inserted').default(0),
  error: text('error'),
});

// Current snapshot of the inventory: replaced entirely on every sync of the character
export const assets = sqliteTable(
  'assets',
  {
    itemId: integer('item_id').primaryKey(),
    characterId: integer('character_id').notNull().references(() => characters.id),
    typeId: integer('type_id').notNull(),
    quantity: integer('quantity').notNull(),
    locationId: integer('location_id').notNull(), // station, system or the item_id that contains it
    locationFlag: text('location_flag').notNull(), // Hangar, Cargo, DroneBay...
    locationType: text('location_type').notNull(), // station | solar_system | item | other
    rootLocationId: integer('root_location_id').notNull(), // station/structure/system where it ultimately is
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

// GET /markets/prices: ESI's global average price (not the Jita sell price)
export const marketPrices = sqliteTable('market_prices', {
  typeId: integer('type_id').primaryKey(),
  averagePrice: real('average_price'),
  adjustedPrice: real('adjusted_price'),
  updatedAt: ts('updated_at').notNull(),
});

// Lowest sell price on the market (real orders, not the global average). Refreshed on every sync;
// for now only PLEX, which is what Omega costs
export const marketQuotes = sqliteTable('market_quotes', {
  typeId: integer('type_id').primaryKey(),
  sellMin: real('sell_min'), // null = no sell orders
  sellOrders: integer('sell_orders').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// Doctrines: lowest sell in Jita for what the fits carry and for skill injectors (public orders from
// The Forge filtered by the Jita system). Refreshed at most once an hour (sync and when adding a fit)
export const jitaPrices = sqliteTable('jita_prices', {
  typeId: integer('type_id').primaryKey(),
  sellMin: real('sell_min'), // null = no sell orders in Jita
  sellOrders: integer('sell_orders').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// ESI geography cache for the map: systems with coordinates and station → system.
// This is static universe data, requested only once per ID
export const systems = sqliteTable('systems', {
  id: integer('id').primaryKey(), // solar_system_id
  name: text('name').notNull(),
  security: real('security').notNull(),
  // Position in meters; the galactic plane is x/z (y is the height)
  x: real('x').notNull(),
  y: real('y').notNull(),
  z: real('z').notNull(),
});

// Incursions: ESI only reports active ones (GET /incursions/, public), so every sync records which systems
// are infested. One span per system and presence: if seen again within 24 h it's extended; if not, a new span.
// Used to estimate what an incursion's bounty penalty took (src/services/deductions.ts)
export const incursionSystems = sqliteTable(
  'incursion_systems',
  {
    systemId: integer('system_id').notNull(),
    constellationId: integer('constellation_id').notNull(),
    firstSeen: ts('first_seen').notNull(),
    lastSeen: ts('last_seen').notNull(),
  },
  (t) => [primaryKey({ columns: [t.systemId, t.firstSeen] })],
);

// Public queries recorded even when they return nothing: since when (`firstAt`) and the latest (`checkedAt`).
// `incursions`: with no active incursions no span remains, but we know it was checked
export const esiChecks = sqliteTable('esi_checks', {
  name: text('name').primaryKey(),
  firstAt: ts('first_at').notNull(),
  checkedAt: ts('checked_at').notNull(),
});

export const stationSystems = sqliteTable('station_systems', {
  stationId: integer('station_id').primaryKey(),
  systemId: integer('system_id').notNull(),
});

// Player structures (citadels, IDs > 1e12): GET /universe/structures/{id} with the
// esi-universe.read_structures.v1 scope of a pilot with access (src/services/structures.ts). The name goes to `names` and
// the system to `station_systems`; here, when it was asked and what ESI said, so a 403 isn't repeated on every sync
// ok: resolved · forbidden: no pilot with the scope has access (retried after 7 days) · missing: 404
export const structureLookups = sqliteTable('structure_lookups', {
  id: integer('id').primaryKey(),
  status: text('status').notNull(),
  checkedAt: ts('checked_at').notNull(),
});

// Flattened killmail item (containers in the hold bring their items nested)
// copy: blueprint copy (worth 0, as in the inventory)
// flag: where it was (slot, drone bay, hold…; see FITTED_FLAGS in losses.ts). Items inside a
// container carry the container's flag. No flag = killmail stored before it was requested (completed on sync)
export type KillmailItem = { typeId: number; destroyed: number; dropped: number; copy?: boolean; flag?: number };

// Your pilots' killmails (GET /characters/{id}/killmails/recent + GET /killmails/{id}/{hash}): kills and
// losses. They're immutable and requested only once. A loss is a killmail whose victim is a linked pilot
export const killmails = sqliteTable(
  'killmails',
  {
    killmailId: integer('killmail_id').primaryKey(),
    hash: text('hash').notNull(),
    characterId: integer('character_id').notNull(), // pilot in whose list it appeared
    time: ts('killmail_time').notNull(),
    solarSystemId: integer('solar_system_id').notNull(),
    victimCharacterId: integer('victim_character_id'), // null if the victim is a structure
    shipTypeId: integer('ship_type_id').notNull(),
    items: text('items', { mode: 'json' }).$type<KillmailItem[]>().notNull(),
    attackers: integer('attackers').notNull(),
  },
  (t) => [index('killmails_victim_time_idx').on(t.victimCharacterId, t.time)],
);

// Your pilots' contracts (GET /characters/{id}/contracts): they change status and are updated on every sync.
// The items of couriers your pilots issue (GET .../contracts/{id}/items) are requested once: they say what
// they carry, so transport is tied to the lost ship it replaces
export type ContractItem = { typeId: number; quantity: number };
export const contracts = sqliteTable(
  'contracts',
  {
    contractId: integer('contract_id').primaryKey(),
    characterId: integer('character_id').notNull(), // pilot in whose list it appeared
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
    items: text('items', { mode: 'json' }).$type<ContractItem[]>(), // null = not requested yet
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('contracts_issuer_date_idx').on(t.issuerId, t.dateIssued)],
);

// Item types (GET /universe/types/{id}, public and static): group and market group. Used to
// recognize a module equivalent to the lost one (same market group: «Large Smart Bombs») when replacing a ship
export const types = sqliteTable('types', {
  typeId: integer('type_id').primaryKey(),
  groupId: integer('group_id').notNull(),
  marketGroupId: integer('market_group_id'), // null = not sold on the market
  updatedAt: ts('updated_at').notNull(),
});

// Trained skills of each pilot (GET /characters/{id}/skills, scope esi-skills.read_skills.v1): a snapshot that
// is replaced on every sync. activeLevel is the one they can use (an Alpha can't use Omega skills above
// its cap); trainedLevel and sp, what was trained
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

// Attributes of each pilot (GET /characters/{id}/attributes): ESI gives them with implants already added (EVEMon
// subtracts the implant bonus to get the base), so they're the ones that count for training speed
export const characterAttributes = sqliteTable('character_attributes', {
  characterId: integer('character_id').primaryKey(),
  charisma: integer('charisma').notNull(),
  intelligence: integer('intelligence').notNull(),
  memory: integer('memory').notNull(),
  perception: integer('perception').notNull(),
  willpower: integer('willpower').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

// Dogma of the types used by doctrines (GET /universe/types/{id} and /universe/groups/{id}, public and static):
// category (ship, module, drone, ammo…), required skills (requiredSkill1…6) and, for skills, their rank and
// their primary and secondary attributes
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
  // Skills: an Alpha can't train it (attribute 1047, canNotBeTrainedOnTrial); null = requested before it was stored
  omegaOnly: integer('omega_only', { mode: 'boolean' }),
  updatedAt: ts('updated_at').notNull(),
});

// Doctrines: fits pasted in EFT format (eveworkbench, forums) with, optionally, the community skill plan
// (an EVEMon .emp) for each fit
export const doctrines = sqliteTable('doctrines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
});

// section: the EFT block (low, mid, high, rig, subsystem), the loaded ammo (charge), the drone or fighter
// bay (drone) or the cargo (cargo). Cargo doesn't count toward being able to fly it
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

// Skill plan of a fit (the community's «óptimo», optimal): skill and target level
export const fitPlans = sqliteTable('fit_plans', {
  fitId: integer('fit_id')
    .primaryKey()
    .references(() => fits.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  skills: text('skills', { mode: 'json' }).$type<RequiredSkill[]>().notNull(),
  createdAt: ts('created_at').notNull().$defaultFn(() => new Date()),
});

// Loyalty points of each pilot by corporation (GET /characters/{id}/loyalty/points, optional scope
// esi-characters.read_loyalty.v1): a snapshot replaced on every sync. EverMarks are the LP of the NPC corporation
// Paragon, told apart by the name ESI gives it (resolved into `names` like any other corporation)
export const loyaltyPoints = sqliteTable(
  'loyalty_points',
  {
    characterId: integer('character_id').notNull(),
    corporationId: integer('corporation_id').notNull(),
    points: integer('points').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.corporationId] })],
);

// Every change of a pilot's LP with a corporation, as seen on sync (ESI keeps no LP history): the change over
// a period (earned minus spent) is read from here, from the first sync on
export const loyaltyLog = sqliteTable(
  'loyalty_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id').notNull(),
    corporationId: integer('corporation_id').notNull(),
    at: ts('at').notNull(),
    points: integer('points').notNull(),
  },
  (t) => [index('loyalty_log_idx').on(t.characterId, t.corporationId, t.at)],
);

// LP store of each corporation your pilots have LP with (GET /loyalty/stores/{id}/offers, public, cached daily
// by ESI): what the LP buys, to value them at the best exchange. loyalty_stores says when each store was read
export type LoyaltyRequired = { typeId: number; quantity: number };
export const loyaltyOffers = sqliteTable(
  'loyalty_offers',
  {
    corporationId: integer('corporation_id').notNull(),
    offerId: integer('offer_id').notNull(),
    typeId: integer('type_id').notNull(),
    quantity: integer('quantity').notNull(),
    lpCost: integer('lp_cost').notNull(),
    iskCost: real('isk_cost').notNull(),
    requiredItems: text('required_items', { mode: 'json' }).$type<LoyaltyRequired[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.offerId] })],
);

export const loyaltyStores = sqliteTable('loyalty_stores', {
  corporationId: integer('corporation_id').primaryKey(),
  offers: integer('offers').notNull(),
  status: text('status').notNull(), // ok | missing (404: that corporation has no store) | error
  checkedAt: ts('checked_at').notNull(),
});
