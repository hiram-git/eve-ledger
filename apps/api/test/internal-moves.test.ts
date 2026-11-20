// Balances «Entre tus pilotos»: the user's replacement flow (A loses a Rifter, gives B ISK, B buys the hull and hands
// it over in a 0 ISK contract, a trade with ISK, and a contract with a price). Each move goes the right way, the
// contract with a price is one move (items one way, ISK the other), the ISK adds up to the summary's «between your
// pilots» and the moves inside the replacement window say which loss they belong to
import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'iskpulse-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

const { db, runMigrations } = await import(`${API}/db/client.ts`);
const s = await import(`${API}/db/schema.ts`);
const { getSummary } = await import(`${API}/services/summary.ts`);
const { internalMoves } = await import(`${API}/services/internal-moves.ts`);
const { inArray } = await import('drizzle-orm');
runMigrations();

const A = 9101; // main, loses the Rifter
const B = 9102; // Jita alt
const NPC = 1000125;
const RIFTER = 587;
const SCOPES = 'esi-wallet.read_character_wallet.v1 esi-killmails.read_killmails.v1 esi-contracts.read_character_contracts.v1';
const DAY = 86_400_000;
const now = new Date();
const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const yesterday = (h: number) => new Date(today - DAY + h * 3_600_000);

async function clean() {
  await db.delete(s.walletTransactions).where(inArray(s.walletTransactions.characterId, [A, B]));
  await db.delete(s.walletJournal).where(inArray(s.walletJournal.characterId, [A, B]));
  await db.delete(s.killmails).where(inArray(s.killmails.characterId, [A, B]));
  await db.delete(s.contracts).where(inArray(s.contracts.issuerId, [A, B]));
  await db.delete(s.marketPrices).where(inArray(s.marketPrices.typeId, [RIFTER]));
  await db.delete(s.characters).where(inArray(s.characters.id, [A, B]));
}
afterAll(clean);

test('lo movido entre tus pilotos: dirección, contratos, cuadre con el resumen y reposición', async () => {
  await clean();
  await db.insert(s.characters).values([
    { id: A, name: 'Main', ownerHash: 'a', scopes: SCOPES, refreshToken: 'x', lastSyncAt: now },
    { id: B, name: 'Alt de Jita', ownerHash: 'b', scopes: SCOPES, refreshToken: 'x', lastSyncAt: now },
  ]);
  await db.insert(s.marketPrices).values({ typeId: RIFTER, averagePrice: 400_000, adjustedPrice: 380_000, updatedAt: now });
  await db.insert(s.killmails).values({
    killmailId: 991001, hash: 'h', characterId: A, time: yesterday(9), solarSystemId: 30000142,
    victimCharacterId: A, shipTypeId: RIFTER, items: [], attackers: 1,
  });
  const j = (id: number, char: number, h: number, ref: string, amount: number, first: number, second: number, contract?: number) => ({
    journalId: id, characterId: char, date: yesterday(h), refType: ref, amount, balance: 0, firstPartyId: first, secondPartyId: second,
    contextId: contract ?? null, contextIdType: contract ? 'contract_id' : null,
  });
  await db.insert(s.walletJournal).values([
    // A gives B 30 M (both sides stored)
    j(501, A, 10, 'player_donation', -30_000_000, A, B),
    j(501, B, 10, 'player_donation', 30_000_000, A, B),
    // B buys the hull from an NPC seller
    j(502, B, 11, 'market_escrow', -400_000, B, B),
    // A pays B 1 M in a direct trade (only A's side stored, as before migration 0007)
    j(503, A, 15, 'player_trading', -1_000_000, A, B),
    // B pays A 5 M for a Rifter in a contract with a price
    j(504, B, 16, 'contract_price', -5_000_000, B, A, 7702),
    j(504, A, 16, 'contract_price', 5_000_000, B, A, 7702),
  ]);
  await db.insert(s.walletTransactions).values({
    transactionId: 88001, characterId: B, date: yesterday(11), typeId: RIFTER, quantity: 1, unitPrice: 400_000,
    isBuy: true, locationId: 60003760, clientId: NPC, journalRefId: 502,
  });
  const contract = (id: number, issuer: number, acceptor: number, h: number, price: number) => ({
    contractId: id, characterId: issuer, issuerId: issuer, acceptorId: acceptor, type: 'item_exchange', status: 'finished',
    dateIssued: yesterday(h - 1), dateCompleted: yesterday(h), price, items: [{ typeId: RIFTER, quantity: 1 }], updatedAt: now,
  });
  // B hands the hull to A for 0 ISK (no journal entry); A sells B another one for 5 M
  await db.insert(s.contracts).values([contract(7701, B, A, 14, 0), contract(7702, A, B, 16, 5_000_000)]);

  const all = await internalMoves(7);
  const kinds = all.moves.map((m) => `${m.kind}:${m.giver.id}>${m.receiver.id}:${m.isk}:${m.items?.length ?? 'null'}`);
  expect(kinds).toEqual([
    `contract:${A}>${B}:5000000:1`, // one move: the Rifter A → B, the 5 M back B → A
    `trade:${A}>${B}:1000000:0`,
    `contract:${B}>${A}:0:1`, // the 0 ISK contract, from the contracts table
    `donation:${A}>${B}:30000000:0`,
  ]);
  const paid = all.moves[0];
  expect([paid.iskFrom, paid.iskTo]).toEqual([B, A]);
  expect(paid.value).toBe(400_000);
  // Inside the loss's window: the hull handed over and the ISK to the pilot who bought the replacement
  expect(all.moves.every((m) => m.replacement?.killmailId === 991001)).toBe(true);

  // Same ISK as the summary's «between your pilots», pilot by pilot
  const sum = await getSummary(7);
  for (const id of [A, B]) {
    const view = await internalMoves(7, id);
    const c = sum.characters.find((x) => x.id === id)!;
    expect(view.totals.iskReceived).toBeCloseTo(c.internalReceived, 2);
    expect(view.totals.iskSent).toBeCloseTo(c.internalSent, 2);
    expect(Object.values(view.byKind).reduce((n, v) => n + v, 0)).toBeCloseTo(c.internalReceived - c.internalSent, 2);
  }
  const main = await internalMoves(7, A);
  expect(main.totals.itemsReceived).toBe(400_000);
  expect(main.totals.itemsSent).toBe(400_000);
});
