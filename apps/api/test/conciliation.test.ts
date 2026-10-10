// Conciliación del resumen: con cualquier mezcla de movimientos, las cifras tienen que cuadrar entre sí.
// - La suma de los pilotos es el consolidado (totals) y la suma de las actividades también.
// - Saldo anterior + neto = saldo, en cada piloto.
// Casos que antes no cuadraban: una compraventa de mercado entre dos de tus pilotos y una compra que repone
// una nave perdida solo en parte (dos Rifter en una transacción, uno para la pérdida)
import { afterAll, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

const { db, runMigrations } = await import(`${API}/db/client.ts`);
const s = await import(`${API}/db/schema.ts`);
const { getSummary } = await import(`${API}/services/summary.ts`);
const { shipLosses } = await import(`${API}/services/losses.ts`);
const { inArray } = await import('drizzle-orm');
runMigrations();

const A = 9001;
const B = 9002;
const NPC = 1000125; // contraparte ajena (una corporación NPC)
const RIFTER = 587;
const SCOPES = 'esi-wallet.read_character_wallet.v1 esi-killmails.read_killmails.v1 esi-contracts.read_character_contracts.v1';
const DAY = 86_400_000;
const now = new Date();
const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
// Ayer a una hora dada (siempre dentro del período de 7 días) y hace N días (antes del período)
const yesterday = (h: number) => new Date(today - DAY + h * 3_600_000);
const daysAgo = (n: number) => new Date(today - n * DAY + 12 * 3_600_000);

async function clean() {
  await db.delete(s.walletTransactions).where(inArray(s.walletTransactions.characterId, [A, B]));
  await db.delete(s.walletJournal).where(inArray(s.walletJournal.characterId, [A, B]));
  await db.delete(s.killmails).where(inArray(s.killmails.characterId, [A, B]));
  await db.delete(s.marketPrices).where(inArray(s.marketPrices.typeId, [RIFTER]));
  await db.delete(s.characters).where(inArray(s.characters.id, [A, B]));
}

beforeEach(async () => {
  await clean();
  const lastSyncAt = new Date();
  await db.insert(s.characters).values([
    { id: A, name: 'Comprador', ownerHash: 'a', scopes: SCOPES, refreshToken: 'x', lastSyncAt },
    { id: B, name: 'Vendedor', ownerHash: 'b', scopes: SCOPES, refreshToken: 'x', lastSyncAt },
  ]);
});
afterAll(clean);

type Entry = { id: number; char: number; date: Date; ref: string; amount: number; balance: number; first?: number; second?: number };
const journal = (rows: Entry[]) =>
  db.insert(s.walletJournal).values(
    rows.map((r) => ({
      journalId: r.id,
      characterId: r.char,
      date: r.date,
      refType: r.ref,
      amount: r.amount,
      balance: r.balance,
      firstPartyId: r.first ?? r.char,
      secondPartyId: r.second ?? r.char,
    })),
  );

// Lo que tiene que cuadrar siempre, sea cual sea el caso
async function expectReconciles(days = 7) {
  const sum = await getSummary(days);
  const byPilots = sum.characters.reduce((n, c) => n + c.net, 0);
  expect(byPilots).toBeCloseTo(sum.totals.net, 2);
  expect(sum.byActivity.reduce((n, a) => n + a.income, 0)).toBeCloseTo(sum.totals.income, 2);
  expect(sum.byActivity.reduce((n, a) => n + a.expenses, 0)).toBeCloseTo(sum.totals.expenses, 2);
  for (const c of sum.characters) {
    if (c.openingBalance === null || c.balance === null) continue;
    expect(c.openingBalance + c.net).toBeCloseTo(c.balance, 2);
  }
  return sum;
}

test('una compraventa de mercado entre tus pilotos suma cero en el consolidado', async () => {
  // Saldos de partida (antes del período): A 1.000, B 5.000
  await journal([
    { id: 1, char: A, date: daysAgo(10), ref: 'bounty_prizes', amount: 1000, balance: 1000, first: NPC },
    { id: 2, char: B, date: daysAgo(10), ref: 'bounty_prizes', amount: 5000, balance: 5000, first: NPC },
  ]);
  // A compra por 100 la orden de venta de B. Como en ESI: el comprador apunta un market_escrow consigo mismo
  // en las dos partes; el vendedor, un market_transaction de A a B. La transacción comparte id en los dos lados
  await journal([
    { id: 70001, char: A, date: yesterday(10), ref: 'market_escrow', amount: -100, balance: 900 },
    { id: 70002, char: B, date: yesterday(10), ref: 'market_transaction', amount: 100, balance: 5100, first: A, second: B },
    { id: 70003, char: A, date: yesterday(11), ref: 'bounty_prizes', amount: 1000, balance: 1900, first: NPC },
  ]);
  await db.insert(s.walletTransactions).values([
    { transactionId: 80001, characterId: A, date: yesterday(10), typeId: 34, quantity: 1, unitPrice: 100, isBuy: true, locationId: 60003760, clientId: B, journalRefId: 70001 },
    { transactionId: 80001, characterId: B, date: yesterday(10), typeId: 34, quantity: 1, unitPrice: 100, isBuy: false, locationId: 60003760, clientId: A, journalRefId: 70002 },
  ]);

  const sum = await expectReconciles();
  // Solo cuenta la recompensa: la compraventa se anula
  expect(sum.totals).toEqual({ income: 1000, expenses: 0, net: 1000 });
  const a = sum.characters.find((c) => c.id === A)!;
  const b = sum.characters.find((c) => c.id === B)!;
  // Cada wallet cambió lo que cambió: A −100 + 1.000, B +100
  expect(a.net).toBeCloseTo(900, 2);
  expect(a.internalSent).toBeCloseTo(100, 2);
  expect(b.net).toBeCloseTo(100, 2);
  expect(b.internalReceived).toBeCloseTo(100, 2);
  // En la vista de un piloto, su neto también es lo que cambió su wallet
  expect((await getSummary(7, A)).totals.net).toBeCloseTo(900, 2);
});

test('una compra que repone una nave solo en parte no desaparece de «Por actividad»', async () => {
  await db.insert(s.marketPrices).values({ typeId: RIFTER, averagePrice: 10_000_000, adjustedPrice: null, updatedAt: new Date() });
  await db.insert(s.killmails).values({
    killmailId: 990001,
    hash: 'h',
    characterId: A,
    time: yesterday(9),
    solarSystemId: 30000142,
    victimCharacterId: A,
    shipTypeId: RIFTER,
    items: [],
    attackers: 1,
  });
  // A compra dos Rifter en una sola transacción (20 M): uno repone la pérdida, el otro es trading
  await journal([
    { id: 2, char: A, date: daysAgo(10), ref: 'bounty_prizes', amount: 50_000_000, balance: 50_000_000, first: NPC },
    { id: 71001, char: A, date: yesterday(12), ref: 'market_escrow', amount: -20_000_000, balance: 30_000_000 },
  ]);
  await db.insert(s.walletTransactions).values({
    transactionId: 81001, characterId: A, date: yesterday(12), typeId: RIFTER, quantity: 2, unitPrice: 10_000_000, isBuy: true, locationId: 60003760, clientId: NPC, journalRefId: 71001,
  });

  const sum = await expectReconciles();
  expect(sum.totals.expenses).toBeCloseTo(20_000_000, 2);
  // La mitad es reposición (PvP) y la otra mitad sigue siendo trading
  expect(sum.shipFlow.replacement).toBeCloseTo(10_000_000, 2);
  const pvp = sum.byActivity.find((x) => x.activity === 'pvp');
  const trading = sum.byActivity.find((x) => x.activity === 'trading');
  expect(pvp?.expenses).toBeCloseTo(10_000_000, 2);
  expect(trading?.expenses).toBeCloseTo(10_000_000, 2);
  // Y el panel de pérdidas dice lo mismo
  const losses = await shipLosses(7);
  expect(losses.totals.replacement).toBeCloseTo(10_000_000, 2);
});

test('el estado de una pérdida no depende del período que se mire', async () => {
  await db.insert(s.marketPrices).values({ typeId: RIFTER, averagePrice: 10_000_000, adjustedPrice: null, updatedAt: new Date() });
  // El período de 7 días empieza hace 6 días a las 00:00: una pérdida 2 h antes y otra 2 h después
  const start = today - 6 * DAY;
  const loss = (id: number, at: number) => ({
    killmailId: id, hash: 'h', characterId: A, time: new Date(at), solarSystemId: 30000142, victimCharacterId: A, shipTypeId: RIFTER, items: [], attackers: 1,
  });
  await db.insert(s.killmails).values([loss(990011, start - 2 * 3_600_000), loss(990012, start + 2 * 3_600_000)]);
  // Un solo casco comprado después de las dos: repone la primera, que es la que se perdió antes
  await journal([
    { id: 3, char: A, date: daysAgo(20), ref: 'bounty_prizes', amount: 50_000_000, balance: 50_000_000, first: NPC },
    { id: 72001, char: A, date: new Date(start + 3 * 3_600_000), ref: 'market_escrow', amount: -10_000_000, balance: 40_000_000 },
  ]);
  await db.insert(s.walletTransactions).values({
    transactionId: 82001, characterId: A, date: new Date(start + 3 * 3_600_000), typeId: RIFTER, quantity: 1, unitPrice: 10_000_000, isBuy: true, locationId: 60003760, clientId: NPC, journalRefId: 72001,
  });

  const week = (await shipLosses(7)).losses.find((l) => l.killmailId === 990012)!;
  const fortnight = (await shipLosses(14)).losses.find((l) => l.killmailId === 990012)!;
  expect(week.state).toBe(fortnight.state);
  expect(week.replacement).toBe(fortnight.replacement);
  // La compra fue para la primera pérdida: la segunda sigue sin reponer
  expect(week.replacement).toBe(0);
  // Y en el período de 7 días solo está la segunda
  expect((await shipLosses(7)).totals.count).toBe(1);
});
