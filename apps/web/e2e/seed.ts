// Demo data for the web tests (bun): a new database with three made-up pilots, 35 days of
// history with dates relative to today (ratting, market, a donation between them, PLEX for Omega, a ship
// lost and its replacement), inventory in a station, in a named citadel and in another without a name. Nothing comes from
// ESI or real data: the tests run offline and give the same result every time
import { db, rawDb, runMigrations } from '../../api/src/db/client';
import * as s from '../../api/src/db/schema';

import { PILOTS } from './fixtures';

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number, hour = 12) => {
  const d = new Date(NOW - days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);

const JITA = 30000142;
const PERIMETER = 30000144;
const AMARR = 30002187;
const JITA_STATION = 60003760;
const CITADEL_NAMED = 1_035_466_617_946;
const CITADEL_UNKNOWN = 1_035_466_617_999;
const NPC_CORP = 1000125;
// NPC corporation of Aria and Kade: takes 10 % of bounties and ESS (corporation tax)
const TAX_CORP = 1000044;
// System with an incursion: Kade rats there from day 4 to day 2 and bounties are paid at half
const INCURSION_SYS = 30002090;
const STRANGER = 95_000_001;
const T = { rifter: 587, tritanium: 34, plex: 44992, autocannon: 2873 };

const ALL_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-skills.read_skills.v1',
];

export function seed() {
  runMigrations();
  const { aria, kade, nyx } = PILOTS;

  db.insert(s.characters)
    .values([
      { id: aria.id, name: aria.name, ownerHash: 'a', scopes: [...ALL_SCOPES, 'esi-universe.read_structures.v1'].join(' '), refreshToken: 'x', authMethod: 'pkce', lastSyncAt: minutesAgo(10), createdAt: ago(40), linkedAt: ago(40) },
      { id: kade.id, name: kade.name, ownerHash: 'k', scopes: ALL_SCOPES.join(' '), refreshToken: 'x', authMethod: 'pkce', clone: 'alpha', lastSyncAt: minutesAgo(12), createdAt: ago(40), linkedAt: ago(40) },
      { id: nyx.id, name: nyx.name, ownerHash: 'n', scopes: ALL_SCOPES.join(' '), refreshToken: 'x', authMethod: 'pkce', createdAt: minutesAgo(180), linkedAt: minutesAgo(180) },
    ])
    .run();

  // Entries in date order per pilot, with the running balance as ESI gives it
  type Entry = { char: number; date: Date; ref: string; amount: number; first?: number; second?: number; ctx?: [number, string]; tax?: number };
  const entries: Entry[] = [];
  for (let d = 35; d >= 1; d--) {
    // Aria rats daily (bounties every 20 min: three payouts) and collects the ESS every week
    for (const h of [9, 10, 11]) entries.push({ char: aria.id, date: ago(d, h), ref: 'bounty_prizes', amount: 18_000_000 + (d % 7) * 2_000_000, first: NPC_CORP, second: aria.id, ctx: [AMARR, 'system_id'], tax: 2_000_000 + (d % 7) * 222_222 });
    if (d % 7 === 0) entries.push({ char: aria.id, date: ago(d, 13), ref: 'ess_escrow_transfer', amount: 140_000_000, first: NPC_CORP, second: aria.id, tax: 15_555_556 });
    if (d >= 2 && d <= 4) entries.push({ char: kade.id, date: ago(d, 10), ref: 'bounty_prizes', amount: 9_000_000, first: NPC_CORP, second: kade.id, ctx: [INCURSION_SYS, 'system_id'], tax: 1_000_000 });
    // Kade sells Tritanium in Jita every two days and pays the tax
    if (d % 2 === 0) {
      entries.push({ char: kade.id, date: ago(d, 15), ref: 'market_transaction', amount: 45_000_000, first: STRANGER, second: kade.id });
      entries.push({ char: kade.id, date: ago(d, 15), ref: 'transaction_tax', amount: -1_600_000, first: kade.id, second: NPC_CORP });
    }
  }
  // Donation from Aria to Kade (between your pilots: neither income nor expense; ESI gives both sides the same id)
  entries.push({ char: aria.id, date: ago(20, 18), ref: 'player_donation', amount: -500_000_000, first: aria.id, second: kade.id });
  entries.push({ char: kade.id, date: ago(20, 18), ref: 'player_donation', amount: 500_000_000, first: aria.id, second: kade.id });
  // PLEX for Omega (PLEX / accounts, separate from the game result)
  entries.push({ char: aria.id, date: ago(15, 20), ref: 'market_escrow', amount: -2_400_000_000, first: aria.id, second: aria.id });
  // Kade loses a Rifter 5 days ago; insurance pays and Aria buys another two days later
  entries.push({ char: kade.id, date: ago(5, 21), ref: 'insurance', amount: 300_000, first: NPC_CORP, second: kade.id });
  entries.push({ char: aria.id, date: ago(3, 17), ref: 'market_escrow', amount: -1_100_000, first: aria.id, second: aria.id });
  // Today: Aria is already ratting
  entries.push({ char: aria.id, date: minutesAgo(30), ref: 'bounty_prizes', amount: 25_000_000, first: NPC_CORP, second: aria.id, ctx: [AMARR, 'system_id'] });

  entries.sort((a, b) => a.date.getTime() - b.date.getTime());
  const balance = new Map<number, number>([
    [aria.id, 3_000_000_000],
    [kade.id, 400_000_000],
  ]);
  let id = 1_000_000;
  let tx = 5_000_000;
  const journal = entries.map((e) => {
    const b = (balance.get(e.char) ?? 0) + e.amount;
    balance.set(e.char, b);
    // The donation: the same id in both journals
    const journalId = e.ref === 'player_donation' ? 999_999 : id++;
    // As in ESI, a market buy or sell carries its transaction in context_id
    const market = e.ref === 'market_transaction' || e.ref === 'market_escrow';
    const ctx: [number, string] | undefined = market ? [tx++, 'market_transaction_id'] : e.ctx;
    return {
      journalId,
      characterId: e.char,
      date: e.date,
      refType: e.ref,
      amount: e.amount,
      balance: b,
      firstPartyId: e.first,
      secondPartyId: e.second,
      contextId: ctx?.[0],
      contextIdType: ctx?.[1],
      tax: e.tax ?? 0,
      taxReceiverId: e.tax ? TAX_CORP : null,
    };
  });
  for (let i = 0; i < journal.length; i += 200) db.insert(s.walletJournal).values(journal.slice(i, i + 200)).run();
  // The ESI wallet is ahead of the journal for Aria (25 M the journal doesn't return yet); for Kade, same as the journal
  const setWallet = (id: number, v: number, at: Date) =>
    rawDb().run('update characters set wallet_balance = ?, wallet_at = ? where id = ?', [v, Math.floor(at.getTime() / 1000), id]);
  setWallet(aria.id, balance.get(aria.id)! + 25_000_000, minutesAgo(10));
  setWallet(kade.id, balance.get(kade.id)!, minutesAgo(12));

  // Market transactions linked to their journal entry (and with the same id as its context_id)
  const txRows = journal
    .filter((j) => j.refType === 'market_transaction' || j.refType === 'market_escrow')
    .map((j) => {
      const plex = j.amount === -2_400_000_000;
      const rifter = j.amount === -1_100_000;
      const [typeId, quantity] = plex ? [T.plex, 500] : rifter ? [T.rifter, 1] : [T.tritanium, 9_000_000];
      return {
        transactionId: j.contextId!,
        characterId: j.characterId,
        date: j.date,
        typeId,
        quantity,
        unitPrice: Math.abs(j.amount) / quantity,
        isBuy: j.amount < 0,
        locationId: JITA_STATION,
        clientId: STRANGER,
        journalRefId: j.journalId,
      };
    });
  db.insert(s.walletTransactions).values(txRows).run();

  // The lost ship (victim: Kade) with its equipment
  db.insert(s.killmails)
    .values({
      killmailId: 120_000_001,
      hash: 'demo',
      characterId: kade.id,
      time: ago(5, 20),
      solarSystemId: AMARR,
      victimCharacterId: kade.id,
      shipTypeId: T.rifter,
      items: [{ typeId: T.autocannon, destroyed: 2, dropped: 1, flag: 27 }],
      attackers: 3,
    })
    .run();

  // Inventory: Jita, a named citadel and another without a name (no access: «Estructura …»)
  const asset = (itemId: number, characterId: number, typeId: number, quantity: number, root: number) => ({
    itemId,
    characterId,
    typeId,
    quantity,
    locationId: root,
    locationType: root === JITA_STATION ? 'station' : 'item',
    locationFlag: 'Hangar',
    rootLocationId: root,
    isSingleton: false,
    isBlueprintCopy: false,
    updatedAt: minutesAgo(10),
  });
  db.insert(s.assets)
    .values([
      asset(1, aria.id, T.plex, 120, JITA_STATION),
      asset(2, aria.id, T.tritanium, 50_000_000, JITA_STATION),
      asset(3, kade.id, T.rifter, 3, CITADEL_NAMED),
      asset(4, kade.id, T.autocannon, 12, CITADEL_NAMED),
      asset(5, aria.id, T.tritanium, 8_000_000, CITADEL_UNKNOWN),
    ])
    .run();

  const updatedAt = minutesAgo(15);
  db.insert(s.marketPrices)
    .values([
      { typeId: T.rifter, averagePrice: 1_050_000, adjustedPrice: 1_000_000, updatedAt },
      { typeId: T.tritanium, averagePrice: 4.9, adjustedPrice: 4.5, updatedAt },
      { typeId: T.plex, averagePrice: 4_750_000, adjustedPrice: 4_700_000, updatedAt },
      { typeId: T.autocannon, averagePrice: 21_000, adjustedPrice: 20_000, updatedAt },
    ])
    .run();
  db.insert(s.marketQuotes).values({ typeId: T.plex, sellMin: 4_800_000, sellOrders: 120, updatedAt }).run();
  db.insert(s.names)
    .values([
      { id: T.rifter, name: 'Rifter', category: 'inventory_type' },
      { id: T.tritanium, name: 'Tritanium', category: 'inventory_type' },
      { id: T.plex, name: 'PLEX', category: 'inventory_type' },
      { id: T.autocannon, name: '200mm AutoCannon I', category: 'inventory_type' },
      { id: JITA_STATION, name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant', category: 'station' },
      { id: CITADEL_NAMED, name: 'Perimeter - Tranquility Trading Tower', category: 'structure' },
      { id: JITA, name: 'Jita', category: 'solar_system' },
      { id: AMARR, name: 'Amarr', category: 'solar_system' },
      { id: INCURSION_SYS, name: 'Kamela', category: 'solar_system' },
      { id: TAX_CORP, name: 'School of Applied Knowledge', category: 'corporation' },
    ])
    .run();
  db.insert(s.systems)
    .values([
      { id: JITA, name: 'Jita', security: 0.95, x: -1.29e17, y: 6.07e16, z: 1.17e17 },
      { id: PERIMETER, name: 'Perimeter', security: 0.95, x: -1.3e17, y: 6.1e16, z: 1.16e17 },
      { id: AMARR, name: 'Amarr', security: 1, x: -2.3e17, y: 4.2e16, z: -1.5e16 },
      { id: INCURSION_SYS, name: 'Kamela', security: 0.5, x: -2.2e17, y: 4.1e16, z: -1.4e16 },
    ])
    .run();
  // Incursions recorded since 10 days ago; Kamela, infested from day 5 to today
  db.insert(s.esiChecks).values({ name: 'incursions', firstAt: ago(10), checkedAt: minutesAgo(10) }).run();
  db.insert(s.incursionSystems).values({ systemId: INCURSION_SYS, constellationId: 20000306, firstSeen: ago(5), lastSeen: minutesAgo(10) }).run();
  db.insert(s.stationSystems)
    .values([
      { stationId: JITA_STATION, systemId: JITA },
      { stationId: CITADEL_NAMED, systemId: PERIMETER },
    ])
    .run();
  db.insert(s.structureLookups).values({ id: CITADEL_NAMED, status: 'ok', checkedAt: minutesAgo(10) }).run();

  // Each pilot's last sync, without errors
  for (const p of [aria, kade]) {
    for (const kind of ['journal', 'transactions', 'assets', 'killmails', 'contracts', 'skills']) {
      db.insert(s.syncLog).values({ characterId: p.id, kind, startedAt: minutesAgo(11), finishedAt: minutesAgo(10), rowsInserted: 0 }).run();
    }
  }
}
