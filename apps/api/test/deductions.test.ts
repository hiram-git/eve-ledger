// Deductions: corporation tax (exact, from the journal) and incursion penalty (estimated from the spans during
// which each system was seen infested; ESI only reports active incursions)
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
const { deductionsIndicator, refreshIncursions } = await import(`${API}/services/deductions.ts`);
const { eq, inArray } = await import('drizzle-orm');
runMigrations();

const PILOT = 9301;
const NPC_CORP = 1_000_125; // NPC corporation
const PLAYER_CORP = 98_000_001;
const INFESTED = 30_002_001;
const CLEAN = 30_002_002;
const CONSTELLATION = 20_000_301;
const H = 3_600_000;
const now = Math.floor(Date.now() / 1000) * 1000; // dates are stored in seconds

async function clean() {
  await db.delete(s.walletJournal).where(eq(s.walletJournal.characterId, PILOT));
  await db.delete(s.characters).where(eq(s.characters.id, PILOT));
  await db.delete(s.incursionSystems);
  await db.delete(s.esiChecks);
  await db.delete(s.names).where(inArray(s.names.id, [NPC_CORP, PLAYER_CORP]));
}

const incursion = (systems: number[]) => async () => [{ constellation_id: CONSTELLATION, infested_solar_systems: systems, state: 'established' }];

beforeEach(async () => {
  await clean();
  await db.insert(s.characters).values({ id: PILOT, name: 'Ratter', ownerHash: 'r', scopes: '', refreshToken: 'x' });
  await db.insert(s.names).values([
    { id: NPC_CORP, name: 'State Protectorate', category: 'corporation' },
    { id: PLAYER_CORP, name: 'Mi Corp', category: 'corporation' },
  ]);
});

afterAll(clean);

test('un sistema infestado se alarga mientras se vea y abre otro tramo tras 24 h sin verlo', async () => {
  const t0 = new Date(now - 60 * H);
  expect(await refreshIncursions(incursion([INFESTED]), t0)).toBe(1);
  // Within the same minute (another pilot in the same round) it isn't asked again
  expect(await refreshIncursions(incursion([INFESTED]), new Date(t0.getTime() + 1000))).toBe(0);
  await refreshIncursions(incursion([INFESTED]), new Date(t0.getTime() + 5 * H));
  let spells = await db.select().from(s.incursionSystems);
  expect(spells).toHaveLength(1);
  expect(spells[0].lastSeen.getTime() - spells[0].firstSeen.getTime()).toBe(5 * H);
  // No incursion: nothing is recorded, but the check is
  await refreshIncursions(incursion([]), new Date(t0.getTime() + 10 * H));
  await refreshIncursions(incursion([INFESTED]), new Date(t0.getTime() + 40 * H));
  spells = await db.select().from(s.incursionSystems);
  expect(spells).toHaveLength(2);
  const [check] = await db.select().from(s.esiChecks);
  expect(check.firstAt.getTime()).toBe(t0.getTime());
});

test('impuesto exacto por corporación y penalización solo mientras se vio la incursión', async () => {
  const t0 = now - 50 * H;
  await refreshIncursions(incursion([INFESTED]), new Date(t0));
  await refreshIncursions(incursion([INFESTED]), new Date(t0 + 10 * H));
  let id = 1;
  const row = (at: number, refType: string, amount: number, tax: number | null, receiver: number | null, system?: number) => ({
    journalId: id++,
    characterId: PILOT,
    date: new Date(at),
    refType,
    amount,
    tax,
    taxReceiverId: receiver,
    contextId: system ?? null,
    contextIdType: system ? 'system_id' : null,
  });
  await db.insert(s.walletJournal).values([
    // Inside the span: collects 9 M of 20 M (−50 %) after 10 % tax → 9 M were lost
    row(t0 + 2 * H, 'bounty_prizes', 9_000_000, 1_000_000, NPC_CORP, INFESTED),
    // Before it was seen: unknown, doesn't count
    row(t0 - 2 * H, 'bounty_prizes', 18_000_000, 2_000_000, NPC_CORP, INFESTED),
    // System without incursion
    row(t0 + 3 * H, 'bounty_prizes', 18_000_000, 2_000_000, NPC_CORP, CLEAN),
    // ESS and mission: tax to the player's corporation
    row(t0 + 4 * H, 'ess_escrow_transfer', 9_500_000, 500_000, PLAYER_CORP),
    row(t0 + 5 * H, 'agent_mission_reward', 4_500_000, 500_000, PLAYER_CORP),
    // Stored before the tax was read
    row(t0 + 6 * H, 'bounty_prizes', 1_000_000, null, null, CLEAN),
  ]);

  const d = await deductionsIndicator({ hours: 2, isk: 46_000_000 });
  expect(d.tax).toBe(6_000_000);
  expect(d.byCorp.map((c) => [c.name, c.npc, c.tax])).toEqual([
    ['State Protectorate', true, 5_000_000],
    ['Mi Corp', false, 1_000_000],
  ]);
  expect(d.byCorp[0].rate).toBeCloseTo(0.1);
  expect(d.taxUnknown).toBe(1);
  expect(d.bySystem.map((x) => [x.systemId, x.ticks, x.lost])).toEqual([[INFESTED, 1, 9_000_000]]);
  expect(d.incursion).toBe(9_000_000);
  expect(d.incursionsSince).toBe(new Date(t0).toISOString());
  // Without deductions: 46 M + 5.5 M of ratting tax (not the mission) + 9 M of incursion in 2 h
  expect(d.iskPerHour).toBe(23_000_000);
  expect(d.grossPerHour).toBe(30_250_000);
});
