// Demo data for the README and brochure screenshots (bun): six MADE-UP pilots with 65 days of
// history (dates relative to today), nothing from a real account. Ratting in Deklein with ESS, escalations and loot
// sold, missions, trading in Jita, couriers, PLEX for Omega, donations between the pilots, lost ships
// (one replaced with its courier, one not replaced and one with the window still open), inventory in stations and
// citadels, and skills for the doctrines. Usage: DB_PATH=<new database> bun seed.ts (called by run.sh)
import { db, rawDb, runMigrations } from '../../../apps/api/src/db/client';
import * as s from '../../../apps/api/src/db/schema';
import { TYPES } from './types';

const DAY = 86_400_000;
const NOW = Date.now();
const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);
// Seeded pseudo-random: the screenshots come out the same every time
let seedState = 20261011;
const rand = () => ((seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (a: number, b: number) => a + (b - a) * rand();
const round = (v: number, step = 1000) => Math.round(v / step) * step;

const P = {
  aria: { id: 2100000001, name: 'Aria Vex' },
  kade: { id: 2100000002, name: 'Kade Morrow' },
  nyx: { id: 2100000003, name: 'Nyx Adari' },
  lio: { id: 2100000004, name: 'Lio Tanaka' },
  rhea: { id: 2100000005, name: 'Rhea Solen' },
  tomas: { id: 2100000006, name: 'Tomas Kael' },
};
const SYS = {
  jita: 30000142, perimeter: 30000144, amarr: 30002187, dodixie: 30002659, rens: 30002510,
  vfk: 30002904, t3m8: 30002938, j1au: 30002942, n2is: 30002945, v0r: 30002934,
};
const ST = {
  jita: 60003760, dodixie: 60011866, rens: 60004588, amarr: 60008494,
  ttt: 1022734985679, // Perimeter - Tranquility Trading Tower (public)
  staging: 1_045_000_000_001, // made-up citadel in VFK-IV
};
const NPC_CORP = 1000125; // CONCORD
const STRANGERS = [95_100_001, 95_100_002, 95_100_003, 95_100_004];
const BUYBACK_CORP = 98_100_001;
const T = {
  tritanium: 34, pyerite: 35, mexallon: 36, isogen: 37, plex: 44992, capsule: 670,
  rifter: 587, hurricane: 24702, scimitar: 11978, dc: 2048, gyro: 519, ac: 2913, neut: 37627, lse: 3841, ab: 12058,
  aerator: 31718, lrsb: 3608, pds: 1541, sebo: 5975, emp: 21924, warrior: 2488, hammerhead: 2185, injector: 40520,
};
const AVG: Record<number, number> = {
  [T.tritanium]: 4.1, [T.pyerite]: 12.5, [T.mexallon]: 58, [T.isogen]: 95, [T.plex]: 4_050_000, [T.capsule]: 10_000,
  [T.rifter]: 410_000, [T.hurricane]: 63_000_000, [T.scimitar]: 232_000_000, [T.dc]: 1_200_000, [T.gyro]: 1_900_000,
  [T.ac]: 3_400_000, [T.neut]: 2_800_000, [T.lse]: 3_000_000, [T.ab]: 3_700_000, [T.aerator]: 4_300_000,
  [T.lrsb]: 8_000_000, [T.pds]: 1_450_000, [T.sebo]: 2_150_000, [T.emp]: 215, [T.warrior]: 280_000,
  [T.hammerhead]: 530_000, [T.injector]: 820_000_000,
};
const NAMES: Record<number, string> = {
  [T.tritanium]: 'Tritanium', [T.pyerite]: 'Pyerite', [T.mexallon]: 'Mexallon', [T.isogen]: 'Isogen', [T.capsule]: 'Capsule',
  [T.plex]: 'PLEX', [T.injector]: 'Large Skill Injector',
  ...Object.fromEntries(Object.entries(TYPES).map(([id, t]) => [id, t[0]])),
};

const ALL_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-skills.read_skills.v1',
  'esi-universe.read_structures.v1',
  'esi-characters.read_loyalty.v1',
].join(' ');

runMigrations();
db.insert(s.characters)
  .values(
    Object.values(P).map((p) => ({
      id: p.id,
      name: p.name,
      ownerHash: 'demo',
      scopes: ALL_SCOPES,
      refreshToken: 'demo',
      authMethod: 'pkce' as const,
      lastSyncAt: minutesAgo(12),
      createdAt: at(66, 18),
      linkedAt: at(66, 18),
    })),
  )
  .run();

// ---------------------------------------------------------------------------------------------------------------
// Wallet movements
type Entry = { char: number; date: Date; ref: string; amount: number; first?: number; second?: number; ctx?: [number, string]; tx?: Tx };
type Tx = { typeId: number; quantity: number; location: number; client: number };
const entries: Entry[] = [];
const add = (e: Entry) => entries.push(e);
const RAT = [SYS.vfk, SYS.t3m8, SYS.j1au, SYS.n2is];
const buy = (char: number, date: Date, typeId: number, quantity: number, unit: number, location = ST.jita) =>
  add({ char, date, ref: 'market_escrow', amount: -round(unit * quantity, 1), first: char, second: char, tx: { typeId, quantity, location, client: STRANGERS[0] } });
const sell = (char: number, date: Date, typeId: number, quantity: number, unit: number, location = ST.jita) =>
  add({ char, date, ref: 'market_transaction', amount: round(unit * quantity, 1), first: STRANGERS[1], second: char, tx: { typeId, quantity, location, client: STRANGERS[1] } });

for (let d = 65; d >= 0; d--) {
  const today = d === 0;
  // Aria: ratting almost daily in Deklein (one payout every 20 min), ESS weekly, escalations and loot now and then
  if (rand() > 0.12 || today) {
    const system = RAT[d % RAT.length];
    const ticks = today ? 4 : Math.round(between(5, 11));
    const start = today ? Math.max(0, new Date(NOW).getUTCHours() - 2) : Math.round(between(15, 19));
    for (let i = 0; i < ticks; i++) {
      const when = today ? minutesAgo(30 + (ticks - 1 - i) * 20) : at(d, start + Math.floor(i / 3), (i % 3) * 20);
      add({ char: P.aria.id, date: when, ref: 'bounty_prizes', amount: round(between(19e6, 34e6)), first: NPC_CORP, second: P.aria.id, ctx: [today ? SYS.vfk : system, 'system_id'] });
    }
  }
  if (d % 7 === 3) add({ char: P.aria.id, date: at(d, 22), ref: 'ess_escrow_transfer', amount: round(between(380e6, 620e6)), first: NPC_CORP, second: P.aria.id });
  if (d % 9 === 4) add({ char: P.aria.id, date: at(d, 23), ref: 'player_donation', amount: rand() > 0.5 ? 300e6 : 150e6, first: STRANGERS[2], second: P.aria.id });
  if (d % 6 === 2) add({ char: P.aria.id, date: at(d, 21), ref: 'contract_price_payment_corp', amount: round(between(70e6, 190e6)), first: BUYBACK_CORP, second: P.aria.id });
  // Nyx: ratting some days in 0V0R-R
  if (d % 3 !== 0 && d > 0) {
    const ticks = Math.round(between(3, 6));
    for (let i = 0; i < ticks; i++) add({ char: P.nyx.id, date: at(d, 19 + Math.floor(i / 3), (i % 3) * 20), ref: 'bounty_prizes', amount: round(between(9e6, 15e6)), first: NPC_CORP, second: P.nyx.id, ctx: [SYS.v0r, 'system_id'] });
  }
  // Kade (Alpha): missions in Dodixie
  if (d % 2 === 0 && d > 0) {
    for (let i = 0; i < 3; i++) {
      add({ char: P.kade.id, date: at(d, 17 + i), ref: 'agent_mission_reward', amount: round(between(1.4e6, 2.6e6)), first: NPC_CORP, second: P.kade.id });
      add({ char: P.kade.id, date: at(d, 17 + i, 1), ref: 'agent_mission_time_bonus_reward', amount: round(between(0.6e6, 1.2e6)), first: NPC_CORP, second: P.kade.id });
    }
  }
  // Tomas (Alpha): small bounties in Rens
  if (d % 4 === 1) {
    for (let i = 0; i < 3; i++) add({ char: P.tomas.id, date: at(d, 20, i * 20), ref: 'bounty_prizes', amount: round(between(0.9e6, 1.8e6)), first: NPC_CORP, second: P.tomas.id, ctx: [SYS.rens, 'system_id'] });
  }
  // Lio: mineral trading in Jita (buys every three days, sells every two, with taxes and fees)
  if (d % 3 === 1) {
    const q = round(between(18e6, 30e6), 1e5);
    buy(P.lio.id, at(d, 12), T.tritanium, q, 3.85);
    add({ char: P.lio.id, date: at(d, 12, 1), ref: 'brokers_fee', amount: -round(q * 3.85 * 0.015), first: P.lio.id, second: NPC_CORP });
  }
  if (d % 2 === 0) {
    const q = round(between(16e6, 28e6), 1e5);
    sell(P.lio.id, today ? minutesAgo(95) : at(d, 14), T.tritanium, q, 4.35);
    add({ char: P.lio.id, date: today ? minutesAgo(94) : at(d, 14, 1), ref: 'transaction_tax', amount: -round(q * 4.35 * 0.036), first: P.lio.id, second: NPC_CORP });
    if (d % 4 === 0) {
      const p = round(between(1.2e6, 2.2e6), 1e3);
      sell(P.lio.id, at(d, 15), T.pyerite, p, 13.8);
      add({ char: P.lio.id, date: at(d, 15, 1), ref: 'transaction_tax', amount: -round(p * 13.8 * 0.036), first: P.lio.id, second: NPC_CORP });
    }
  }
  // Rhea: couriers for the hauling corp (logistics)
  if (d % 3 === 2) add({ char: P.rhea.id, date: at(d, 13), ref: 'contract_reward', amount: round(between(14e6, 38e6)), first: STRANGERS[3], second: P.rhea.id, ctx: [80_000_000 + d, 'contract_id'] });
}
// Other expenses: skills and clones
add({ char: P.kade.id, date: at(40, 16), ref: 'skill_purchase', amount: -32_000_000, first: P.kade.id, second: NPC_CORP });
add({ char: P.aria.id, date: at(33, 9), ref: 'jump_clone_activation_fee', amount: -9_500_000, first: P.aria.id, second: NPC_CORP });
add({ char: P.rhea.id, date: at(18, 10), ref: 'skill_purchase', amount: -24_000_000, first: P.rhea.id, second: NPC_CORP });
// Donations between your pilots (neither income nor expense; ESI gives both sides the same id)
const donation = (from: number, to: number, date: Date, amount: number, id: number) => {
  add({ char: from, date, ref: 'player_donation', amount: -amount, first: from, second: to, ctx: [id, 'donation'] });
  add({ char: to, date, ref: 'player_donation', amount, first: from, second: to, ctx: [id, 'donation'] });
};
donation(P.aria.id, P.lio.id, at(44, 11), 2_000_000_000, 1);
donation(P.aria.id, P.rhea.id, at(9, 11), 350_000_000, 2);
// PLEX for Omega (PLEX / accounts, separate from the game result)
buy(P.aria.id, at(49, 20), T.plex, 1000, 4_020_000);
buy(P.aria.id, at(19, 20), T.plex, 1000, 4_090_000);

// Ship losses -----------------------------------------------------------------------------------------------
const HURRICANE_FIT: [number, number, number][] = [
  [T.dc, 1, 11], [T.gyro, 2, 12], [T.lse, 2, 19], [T.ab, 1, 21], [T.ac, 5, 27], [T.neut, 1, 32],
  [T.aerator, 2, 92], [T.hammerhead, 5, 87], [T.emp, 3000, 5],
];
const SCIMITAR_FIT: [number, number, number][] = [
  [T.pds, 2, 11], [T.dc, 1, 13], [T.lse, 2, 19], [T.ab, 1, 21], [T.sebo, 1, 22], [T.lrsb, 4, 27], [T.warrior, 5, 87],
];
const killmails: (typeof s.killmails.$inferInsert)[] = [];
const lose = (id: number, victim: number, when: Date, system: number, ship: number, fit: [number, number, number][], attackers: number) =>
  killmails.push({
    killmailId: id,
    hash: 'demo',
    characterId: victim,
    time: when,
    solarSystemId: system,
    victimCharacterId: victim,
    shipTypeId: ship,
    items: fit.map(([typeId, q, flag]) => ({ typeId, destroyed: Math.ceil(q * 0.6), dropped: q - Math.ceil(q * 0.6), flag })),
    attackers,
  });
// 1) Nyx's Hurricane 12 days ago: insurance, Aria replaces it in Jita and Nyx issues the courier to the staging citadel
lose(130_000_001, P.nyx.id, at(12, 20, 14), SYS.t3m8, T.hurricane, HURRICANE_FIT, 7);
add({ char: P.nyx.id, date: at(12, 20, 40), ref: 'insurance', amount: 21_400_000, first: NPC_CORP, second: P.nyx.id });
buy(P.aria.id, at(10, 15), T.hurricane, 1, 61_800_000);
for (const [typeId, q] of HURRICANE_FIT) buy(P.aria.id, at(10, 15, 5), typeId, q, AVG[typeId] * 0.98);
add({ char: P.nyx.id, date: at(10, 16), ref: 'insurance', amount: -16_800_000, first: P.nyx.id, second: NPC_CORP });
const COURIER = 70_000_001;
add({ char: P.nyx.id, date: at(10, 16, 10), ref: 'contract_reward_deposited', amount: -28_000_000, first: P.nyx.id, second: P.nyx.id, ctx: [COURIER, 'contract_id'] });
add({ char: P.nyx.id, date: at(10, 16, 10), ref: 'contract_brokers_fee', amount: -1_350_000, first: P.nyx.id, second: NPC_CORP, ctx: [COURIER, 'contract_id'] });
// 2) Nyx's Hurricane 27 days ago, uninsured and not replaced: net worth that didn't come back
lose(130_000_002, P.nyx.id, at(27, 21, 2), SYS.n2is, T.hurricane, HURRICANE_FIT, 12);
// 3) Rhea's Scimitar 2 days ago: insurance and hull replaced, fitting still missing (the window is still open)
lose(130_000_003, P.rhea.id, at(2, 19, 48), SYS.j1au, T.scimitar, SCIMITAR_FIT, 9);
add({ char: P.rhea.id, date: at(2, 20, 5), ref: 'insurance', amount: 74_000_000, first: NPC_CORP, second: P.rhea.id });
buy(P.rhea.id, at(1, 14), T.scimitar, 1, 229_500_000);
// 4) Minor losses: a Rifter of Tomas's and a capsule
lose(130_000_004, P.tomas.id, at(24, 20, 30), SYS.rens, T.rifter, [[T.dc, 1, 11], [T.ab, 1, 19]], 2);
lose(130_000_005, P.nyx.id, at(27, 21, 3), SYS.n2is, T.capsule, [], 12);

// Running balances and entries ----------------------------------------------------------------------------------
entries.sort((a, b) => a.date.getTime() - b.date.getTime());
const balance = new Map<number, number>([
  [P.aria.id, 9_400_000_000], [P.kade.id, 145_000_000], [P.nyx.id, 1_250_000_000],
  [P.lio.id, 1_600_000_000], [P.rhea.id, 820_000_000], [P.tomas.id, 64_000_000],
]);
let journalId = 20_000_000;
let txId = 6_000_000;
const donationIds = new Map<number, number>();
const journal: (typeof s.walletJournal.$inferInsert)[] = [];
const txRows: (typeof s.walletTransactions.$inferInsert)[] = [];
for (const e of entries) {
  const b = (balance.get(e.char) ?? 0) + e.amount;
  balance.set(e.char, b);
  let id: number;
  let ctx = e.ctx;
  if (e.ctx?.[1] === 'donation') {
    id = donationIds.get(e.ctx[0]) ?? journalId++;
    donationIds.set(e.ctx[0], id);
    ctx = undefined;
  } else id = journalId++;
  if (e.tx) {
    const transactionId = txId++;
    ctx = [transactionId, 'market_transaction_id'];
    txRows.push({
      transactionId,
      characterId: e.char,
      date: e.date,
      typeId: e.tx.typeId,
      quantity: e.tx.quantity,
      unitPrice: Math.abs(e.amount) / e.tx.quantity,
      isBuy: e.amount < 0,
      locationId: e.tx.location,
      clientId: e.tx.client,
      journalRefId: id,
    });
  }
  journal.push({
    journalId: id,
    characterId: e.char,
    date: e.date,
    refType: e.ref,
    amount: e.amount,
    balance: b,
    firstPartyId: e.first,
    secondPartyId: e.second,
    contextId: ctx?.[0],
    contextIdType: ctx?.[1],
  });
}
for (const [id, b] of balance) if (b < 0) throw new Error(`saldo negativo en ${id}`);
for (let i = 0; i < journal.length; i += 300) db.insert(s.walletJournal).values(journal.slice(i, i + 300)).run();
for (let i = 0; i < txRows.length; i += 300) db.insert(s.walletTransactions).values(txRows.slice(i, i + 300)).run();
db.insert(s.killmails).values(killmails).run();
db.insert(s.contracts)
  .values({
    contractId: COURIER,
    characterId: P.nyx.id,
    issuerId: P.nyx.id,
    acceptorId: STRANGERS[3],
    assigneeId: STRANGERS[3],
    type: 'courier',
    status: 'finished',
    dateIssued: at(10, 16, 10),
    dateCompleted: at(9, 2),
    price: 0,
    reward: 28_000_000,
    collateral: 150_000_000,
    startLocationId: ST.jita,
    endLocationId: ST.staging,
    items: [{ typeId: T.hurricane, quantity: 1 }, ...HURRICANE_FIT.map(([typeId, quantity]) => ({ typeId, quantity }))],
    updatedAt: minutesAgo(12),
  })
  .run();

// Inventory ----------------------------------------------------------------------------------------------------
let itemId = 1_000_000_000_000;
const asset = (characterId: number, typeId: number, quantity: number, root: number, singleton = false) => ({
  itemId: itemId++,
  characterId,
  typeId,
  quantity,
  locationId: root,
  locationFlag: 'Hangar',
  locationType: root > 1e12 ? 'item' : 'station',
  rootLocationId: root,
  isSingleton: singleton,
  isBlueprintCopy: false,
  updatedAt: minutesAgo(12),
});
db.insert(s.assets)
  .values([
    asset(P.aria.id, T.plex, 1650, ST.jita),
    asset(P.aria.id, T.injector, 2, ST.jita),
    asset(P.aria.id, T.hurricane, 1, ST.staging, true),
    asset(P.aria.id, T.hammerhead, 15, ST.staging),
    asset(P.aria.id, T.emp, 24000, ST.staging),
    asset(P.nyx.id, T.hurricane, 1, ST.staging, true),
    asset(P.nyx.id, T.ac, 10, ST.staging),
    asset(P.lio.id, T.tritanium, 38_000_000, ST.jita),
    asset(P.lio.id, T.pyerite, 9_500_000, ST.jita),
    asset(P.lio.id, T.mexallon, 2_400_000, ST.ttt),
    asset(P.lio.id, T.isogen, 600_000, ST.ttt),
    asset(P.rhea.id, T.scimitar, 1, ST.jita, true),
    asset(P.rhea.id, T.lrsb, 2, ST.amarr),
    asset(P.kade.id, T.rifter, 3, ST.dodixie),
    asset(P.kade.id, T.warrior, 10, ST.dodixie),
    asset(P.tomas.id, T.rifter, 2, ST.rens),
  ])
  .run();

// Prices, names and universe -----------------------------------------------------------------------------------
const updatedAt = minutesAgo(20);
db.insert(s.marketPrices)
  .values(Object.entries(AVG).map(([typeId, averagePrice]) => ({ typeId: Number(typeId), averagePrice, adjustedPrice: averagePrice * 0.97, updatedAt })))
  .run();
db.insert(s.marketQuotes).values({ typeId: T.plex, sellMin: 4_100_000, sellOrders: 140, updatedAt }).run();
const systems = [
  { id: SYS.jita, name: 'Jita', security: 0.95, x: -129064861735000000, y: 60755306910000000, z: 117469227060000000 },
  { id: SYS.perimeter, name: 'Perimeter', security: 0.95, x: -143265233088942900, y: 64923714928938900, z: 104178623206741810 },
  { id: SYS.amarr, name: 'Amarr', security: 1, x: -204748707250000000, y: 40238379936600000, z: -57621278902400000 },
  { id: SYS.dodixie, name: 'Dodixie', security: 0.87, x: -187616963382000000, y: 53241293004300000, z: 27692548633900000 },
  { id: SYS.rens, name: 'Rens', security: 0.89, x: -99122341091000000, y: 40335100631500000, z: -2867728819580000 },
  { id: SYS.vfk, name: 'VFK-IV', security: -0.85, x: -247700153492032860, y: 72336465861537360, z: 284957546786617300 },
  { id: SYS.t3m8, name: '3T7-M8', security: -0.59, x: -328390438607435800, y: 95689905003307500, z: 327960211268499260 },
  { id: SYS.j1au, name: 'J1AU-9', security: -0.73, x: -343963638330214800, y: 97971314581215000, z: 337958141396100030 },
  { id: SYS.n2is, name: 'N2IS-B', security: -0.6, x: -329151958655297400, y: 101075940193693200, z: 326604583168921540 },
  { id: SYS.v0r, name: '0V0R-R', security: -0.58, x: -307099452811904300, y: 89706189297312370, z: 328096400882326800 },
];
db.insert(s.systems).values(systems).run();
db.insert(s.stationSystems)
  .values([
    { stationId: ST.jita, systemId: SYS.jita },
    { stationId: ST.dodixie, systemId: SYS.dodixie },
    { stationId: ST.rens, systemId: SYS.rens },
    { stationId: ST.amarr, systemId: SYS.amarr },
    { stationId: ST.ttt, systemId: SYS.perimeter },
    { stationId: ST.staging, systemId: SYS.vfk },
  ])
  .run();
db.insert(s.structureLookups)
  .values([ST.ttt, ST.staging].map((id) => ({ id, status: 'ok', checkedAt: minutesAgo(12) })))
  .run();
db.insert(s.names)
  .values([
    ...Object.entries(NAMES).map(([id, name]) => ({ id: Number(id), name, category: 'inventory_type' })),
    { id: ST.jita, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', category: 'station' },
    { id: ST.dodixie, name: 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant', category: 'station' },
    { id: ST.rens, name: 'Rens VI - Moon 8 - Brutor Tribe Treasury', category: 'station' },
    { id: ST.amarr, name: 'Amarr VIII (Oris) - Emperor Family Academy', category: 'station' },
    { id: ST.ttt, name: 'Perimeter - Tranquility Trading Tower', category: 'structure' },
    { id: ST.staging, name: 'VFK-IV - Ledger Staging', category: 'structure' },
    ...systems.map((x) => ({ id: x.id, name: x.name, category: 'solar_system' })),
    { id: NPC_CORP, name: 'CONCORD', category: 'corporation' },
    { id: BUYBACK_CORP, name: 'Demo Buyback Corp', category: 'corporation' },
    ...STRANGERS.map((id, i) => ({ id, name: `Demo Trader ${i + 1}`, category: 'character' })),
  ])
  .onConflictDoNothing()
  .run();

// Skills for the doctrines (attributes already include implants, as ESI returns them) ------------------------------
const sp = (rank: number, lv: number) => (lv <= 0 ? 0 : Math.ceil(250 * rank * Math.pow(2, 2.5 * (lv - 1))));
const skills = Object.entries(TYPES).filter(([, t]) => t[2] === 16).map(([id, t]) => [Number(id), t[3]!] as const);
const ALL5 = Object.fromEntries(skills.map(([id]) => [id, 5]));
const base = { 3327: 4, 3329: 4, 3333: 4, 3392: 4, 3394: 4, 3436: 5, 24241: 5, 3300: 4, 3305: 4, 3413: 4, 3426: 4, 3416: 4, 3425: 4, 3449: 4, 3450: 4 };
type Profile = { clone: 'omega' | 'alpha'; total: number; unallocated?: number; lv: Record<number, number>; active?: Record<number, number> };
const PROFILES: Record<number, Profile> = {
  // Veteran: flies everything; two level Vs short of the plan
  [P.aria.id]: { clone: 'omega', total: 61_000_000, lv: { ...ALL5, 33095: 4, 12205: 4 } },
  // Alpha: the Rifter yes; Hurricane and Scimitar need Omega-only skills
  [P.kade.id]: { clone: 'alpha', total: 4_200_000, lv: { ...base, 33095: 3, 3318: 3, 3423: 3, 33699: 4, 3422: 3, 3431: 3, 26260: 1 } },
  // DPS: Hurricane and Rifter; lacks Logistics Cruisers for the Scimitar
  [P.nyx.id]: { clone: 'omega', total: 26_000_000, unallocated: 180_000, lv: { ...base, 3333: 5, 33095: 5, 3305: 5, 12205: 3, 3318: 5, 3423: 4, 33699: 5, 3425: 4, 3450: 4, 26260: 3, 3422: 3, 3431: 3, 3413: 5, 3426: 5 } },
  // New trader: Rifter; several missing for the Hurricane
  [P.lio.id]: { clone: 'omega', total: 7_800_000, lv: { ...base, 33095: 1, 3318: 2, 33699: 3, 3423: 2, 3422: 2 } },
  // Logi: Scimitar and Rifter; lacks the specialization for the Hurricane
  [P.rhea.id]: { clone: 'omega', total: 31_000_000, lv: { ...base, 3333: 5, 12096: 4, 3422: 5, 3416: 5, 3425: 5, 3431: 4, 33095: 3, 3318: 3, 3423: 4, 33699: 4, 26260: 2 } },
  // Alpha with skills trained back when Omega
  [P.tomas.id]: { clone: 'alpha', total: 9_500_000, lv: { ...base, 3333: 5, 33095: 4, 3305: 5, 12205: 1, 3318: 4, 3423: 4, 33699: 5, 26260: 3, 3431: 4 }, active: { 3333: 4, 3305: 4, 12205: 0, 33699: 4, 3318: 4 } },
};
const skillsAt = minutesAgo(35);
for (const [idStr, p] of Object.entries(PROFILES)) {
  const id = Number(idStr);
  rawDb().run('update characters set clone = ?, total_sp = ?, unallocated_sp = ?, skills_at = ? where id = ?', [p.clone, p.total, p.unallocated ?? 0, Math.floor(skillsAt.getTime() / 1000), id]);
  const rows = skills
    .filter(([sid]) => (p.lv[sid] ?? 0) > 0)
    .map(([sid, rank]) => ({ characterId: id, skillId: sid, trainedLevel: p.lv[sid], activeLevel: p.active?.[sid] ?? p.lv[sid], sp: sp(rank, p.lv[sid]) }));
  if (rows.length) db.insert(s.characterSkills).values(rows).run();
  db.insert(s.characterAttributes).values({ characterId: id, charisma: 19, intelligence: 21, memory: 20, perception: 27, willpower: 24, updatedAt: skillsAt }).run();
}

// Loyalty points: missions with Sisters of EVE and the Federation Navy; EverMarks from daily goals ------------------
const LP_CORP = { soe: 1000130, fednavy: 1000181, paragon: 1000432 };
const LP_TYPE = { probe: 30488, navyAntimatter: 21898 };
db.insert(s.names)
  .values([
    { id: LP_CORP.soe, name: 'Sisters of EVE', category: 'corporation' },
    { id: LP_CORP.fednavy, name: 'Federation Navy', category: 'corporation' },
    { id: LP_CORP.paragon, name: 'Paragon', category: 'corporation' },
    { id: LP_TYPE.probe, name: 'Sisters Core Probe Launcher', category: 'inventory_type' },
    { id: LP_TYPE.navyAntimatter, name: 'Federation Navy Antimatter Charge M', category: 'inventory_type' },
  ])
  .onConflictDoNothing()
  .run();
db.insert(s.marketPrices)
  .values([
    { typeId: LP_TYPE.probe, averagePrice: 7_900_000, adjustedPrice: 7_700_000, updatedAt },
    { typeId: LP_TYPE.navyAntimatter, averagePrice: 420, adjustedPrice: 400, updatedAt },
  ])
  .onConflictDoNothing()
  .run();
db.insert(s.loyaltyOffers)
  .values([
    // (7,9 M − 2,4 M) / 24 000 = 229 ISK/LP
    { corporationId: LP_CORP.soe, offerId: 1, typeId: LP_TYPE.probe, quantity: 1, lpCost: 24_000, iskCost: 2_400_000, requiredItems: [] },
    // (5000 × 420 − 10 000) / 2000 = 1045 ISK/LP
    { corporationId: LP_CORP.fednavy, offerId: 2, typeId: LP_TYPE.navyAntimatter, quantity: 5000, lpCost: 2_000, iskCost: 10_000, requiredItems: [] },
  ])
  .run();
db.insert(s.loyaltyStores)
  .values(Object.values(LP_CORP).map((corporationId) => ({ corporationId, offers: corporationId === LP_CORP.paragon ? 0 : 1, status: 'ok', checkedAt: minutesAgo(12) })))
  .run();
const lpRows: [number, number, number, number][] = [
  // [pilot, corporation, points now, points 40 days ago]
  [P.aria.id, LP_CORP.soe, 1_180_000, 1_050_000],
  [P.aria.id, LP_CORP.paragon, 21_400, 15_200],
  [P.nyx.id, LP_CORP.fednavy, 640_000, 520_000],
  [P.nyx.id, LP_CORP.paragon, 9_800, 6_100],
  [P.rhea.id, LP_CORP.soe, 310_000, 310_000],
  [P.rhea.id, LP_CORP.paragon, 4_300, 2_900],
  [P.kade.id, LP_CORP.paragon, 2_600, 1_100],
  [P.lio.id, LP_CORP.fednavy, 45_000, 60_000],
];
db.insert(s.loyaltyPoints).values(lpRows.map(([characterId, corporationId, points]) => ({ characterId, corporationId, points, updatedAt: minutesAgo(12) }))).run();
db.insert(s.loyaltyLog)
  .values(
    lpRows.flatMap(([characterId, corporationId, points, before]) => [
      { characterId, corporationId, at: at(40, 12), points: before },
      ...(points !== before ? [{ characterId, corporationId, at: minutesAgo(12), points }] : []),
    ]),
  )
  .run();

// Each pilot's last sync, without errors
for (const p of Object.values(P)) {
  for (const kind of ['journal', 'transactions', 'assets', 'killmails', 'contracts', 'skills', 'loyalty']) {
    db.insert(s.syncLog).values({ characterId: p.id, kind, startedAt: minutesAgo(13), finishedAt: minutesAgo(12), rowsInserted: 0 }).run();
  }
}
console.log(`demo: ${journal.length} movimientos, ${txRows.length} transacciones, ${killmails.length} killmails`);
