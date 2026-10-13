// Rendimiento con un año de datos (hacia la 1.0): genera una base sintética de 5 pilotos y 365 días (ratting diario,
// un trader con ~100 operaciones al día, couriers, una pérdida cada 3 días con su reposición, PLEX, inventario) y
// mide las rutas que piden las páginas, arrancando la API de verdad sobre esa base.
//   bun run bench [--days=365] [--runs=5] [--keep]
// Todo es inventado: no toca la base del usuario (carpeta temporal) ni llama a ESI (sync automático apagado)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name: string, fallback: number) => Number(Bun.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback);
const DAYS = arg('days', 365);
const RUNS = arg('runs', 5);
const KEEP = Bun.argv.includes('--keep');

const dir = mkdtempSync(join(tmpdir(), 'eve-ledger-bench-'));
const DB_PATH = join(dir, 'ledger.db');
const MIGRATIONS_DIR = join(import.meta.dir, '../drizzle');
const baseEnv = {
  ...process.env,
  DB_PATH,
  MIGRATIONS_DIR,
  ENC_KEY: Buffer.from(new Uint8Array(32)).toString('base64'),
  EVE_CLIENT_ID: 'bench',
  EVE_CALLBACK_URL: 'http://127.0.0.1/auth/callback',
  SYNC_INTERVAL_MIN: '0',
};
Object.assign(Bun.env, baseEnv);

const { rawDb, runMigrations } = await import('../src/db/client');
runMigrations();
const sqlite = rawDb();

// ── Datos ────────────────────────────────────────────────────────────────────
const P = { aria: 2_100_000_001, kade: 2_100_000_002, rhea: 2_100_000_003, lio: 2_100_000_004, tomas: 2_100_000_005 };
const NPC = 1_000_125;
const TAX_CORP = 1_000_044;
const JITA = 30_000_142;
const JITA_STATION = 60_003_760;
const RAT_SYSTEMS = [30_002_001, 30_002_002, 30_002_003, 30_002_004];
const PLEX = 44_992;
const HULLS = [587, 24_698, 17_738, 29_984, 12_005]; // Rifter, Drake, Machariel, Tengu, Ishtar
const MODULES = Array.from({ length: 60 }, (_, i) => 2_000 + i);
const TRADE_TYPES = Array.from({ length: 200 }, (_, i) => 10_000 + i);
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);
const dayStart = now - (now % DAY);
const at = (daysAgo: number, seconds: number) => dayStart - daysAgo * DAY + seconds;

let seed = 42;
const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

const scopes = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-skills.read_skills.v1',
].join(' ');

type J = { char: number; date: number; ref: string; amount: number; first: number; second: number; ctx?: number; ctxType?: string; tax?: number; id?: number };
const journal: J[] = [];
const tx: unknown[][] = [];
const killmails: unknown[][] = [];
const contracts: unknown[][] = [];
let txId = 1_000_000;
let jId = 10_000_000;
let kmId = 100_000_000;
let contractId = 200_000_000;

for (let d = DAYS; d >= 0; d--) {
  // Ratting: Aria 4 h (12 pagos), Kade 2 h (6 pagos); impuesto de corporación del 10 %
  for (const [char, ticks] of [[P.aria, 12], [P.kade, 6]] as const) {
    const system = pick(RAT_SYSTEMS);
    for (let t = 0; t < ticks; t++) {
      const gross = 20_000_000 + rand() * 15_000_000;
      journal.push({ char, date: at(d, 50_000 + t * 1200), ref: 'bounty_prizes', amount: gross * 0.9, first: NPC, second: char, ctx: system, ctxType: 'system_id', tax: gross * 0.1 });
    }
  }
  if (d % 7 === 0) journal.push({ char: P.aria, date: at(d, 70_000), ref: 'ess_escrow_transfer', amount: 300_000_000, first: NPC, second: P.aria, tax: 33_000_000 });
  // Trading: Rhea, ~100 operaciones al día (ventas con impuesto y broker; compras por escrow)
  for (let t = 0; t < 100; t++) {
    const date = at(d, 3_600 + t * 600);
    const type = pick(TRADE_TYPES);
    const qty = 1 + Math.floor(rand() * 500);
    const price = 10_000 + rand() * 2_000_000;
    const total = qty * price;
    const id = jId++;
    const buy = t % 2 === 1;
    journal.push({ id, char: P.rhea, date, ref: buy ? 'market_escrow' : 'market_transaction', amount: buy ? -total : total, first: buy ? P.rhea : 95_000_000 + t, second: P.rhea, ctx: txId, ctxType: 'market_transaction_id' });
    if (!buy) journal.push({ char: P.rhea, date, ref: 'transaction_tax', amount: -total * 0.036, first: P.rhea, second: NPC });
    journal.push({ char: P.rhea, date, ref: 'brokers_fee', amount: -total * 0.015, first: P.rhea, second: NPC });
    tx.push([txId++, P.rhea, date, type, qty, price, buy ? 1 : 0, JITA_STATION, 95_000_000 + t, id]);
  }
  // Logística: Lio cobra un courier cada dos días
  if (d % 2 === 0) {
    const cid = contractId++;
    journal.push({ char: P.lio, date: at(d, 40_000), ref: 'contract_reward', amount: 45_000_000, first: 98_000_000, second: P.lio, ctx: cid, ctxType: 'contract_id' });
    contracts.push([cid, P.lio, 98_000_000, P.lio, null, 'courier', 'finished', at(d + 1, 40_000), at(d, 40_000), null, 45_000_000, 500_000_000, JITA_STATION, 60_008_494, '[]', at(0, 0)]);
  }
  // Una pérdida de Kade cada 3 días: seguro, y Tomas repone casco y módulos en Jita al día siguiente
  if (d % 3 === 0 && d > 1) {
    const hull = pick(HULLS);
    const mods = Array.from({ length: 15 }, () => pick(MODULES));
    const lostAt = at(d, 80_000);
    killmails.push([kmId++, 'hash', P.kade, lostAt, pick(RAT_SYSTEMS), P.kade, hull, JSON.stringify(mods.map((m, i) => ({ typeId: m, destroyed: 1, dropped: 0, flag: 11 + i }))), 3]);
    journal.push({ char: P.kade, date: lostAt + 600, ref: 'insurance', amount: 20_000_000, first: NPC, second: P.kade });
    for (const type of [hull, ...mods]) {
      const id = jId++;
      const price = type === hull ? 150_000_000 : 3_000_000;
      journal.push({ id, char: P.tomas, date: lostAt + DAY, ref: 'market_escrow', amount: -price, first: P.tomas, second: P.tomas, ctx: txId, ctxType: 'market_transaction_id' });
      tx.push([txId++, P.tomas, lostAt + DAY, type, 1, price, 1, JITA_STATION, 95_500_000, id]);
    }
  }
  // Kills de Kade (killmails donde no es la víctima)
  if (d % 2 === 1) killmails.push([kmId++, 'hash', P.kade, at(d, 60_000), pick(RAT_SYSTEMS), 95_900_000, 587, '[]', 4]);
  // Aria reparte ISK a los demás cada semana (entre tus pilotos: mismo id en los dos lados)
  if (d % 7 === 3) {
    for (const to of [P.kade, P.tomas]) {
      const id = jId++;
      journal.push({ id, char: P.aria, date: at(d, 30_000), ref: 'player_donation', amount: -1_000_000_000, first: P.aria, second: to });
      journal.push({ id, char: to, date: at(d, 30_000), ref: 'player_donation', amount: 1_000_000_000, first: P.aria, second: to });
    }
  }
  // PLEX para el Omega cada mes
  if (d % 30 === 0) {
    const id = jId++;
    journal.push({ id, char: P.aria, date: at(d, 20_000), ref: 'market_escrow', amount: -2_500 * 5_000_000, first: P.aria, second: P.aria, ctx: txId, ctxType: 'market_transaction_id' });
    tx.push([txId++, P.aria, at(d, 20_000), PLEX, 2_500, 5_000_000, 1, JITA_STATION, 95_600_000, id]);
  }
}

journal.sort((a, b) => a.date - b.date);
const balance = new Map<number, number>(Object.values(P).map((id) => [id, 5_000_000_000]));

sqlite.transaction(() => {
  const ch = sqlite.prepare(
    'insert into characters (id, name, owner_hash, scopes, refresh_token, auth_method, created_at, linked_at, last_sync_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const [name, id] of Object.entries(P)) ch.run(id, name, name, scopes, 'enc', 'pkce', at(DAYS, 0), at(DAYS, 0), now - 600);
  const jr = sqlite.prepare(
    'insert into wallet_journal (journal_id, character_id, date, ref_type, amount, balance, first_party_id, second_party_id, context_id, context_id_type, tax, tax_receiver_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const e of journal) {
    const b = balance.get(e.char)! + e.amount;
    balance.set(e.char, b);
    jr.run(e.id ?? jId++, e.char, e.date, e.ref, e.amount, b, e.first, e.second, e.ctx ?? null, e.ctxType ?? null, e.tax ?? 0, e.tax ? TAX_CORP : null);
  }
  const tr = sqlite.prepare(
    'insert into wallet_transactions (transaction_id, character_id, date, type_id, quantity, unit_price, is_buy, location_id, client_id, journal_ref_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const t of tx) tr.run(...(t as never[]));
  const km = sqlite.prepare(
    'insert into killmails (killmail_id, hash, character_id, killmail_time, solar_system_id, victim_character_id, ship_type_id, items, attackers) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const k of killmails) km.run(...(k as never[]));
  const ct = sqlite.prepare(
    'insert into contracts (contract_id, character_id, issuer_id, acceptor_id, assignee_id, type, status, date_issued, date_completed, price, reward, collateral, start_location_id, end_location_id, items, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const c of contracts) ct.run(...(c as never[]));
  // Inventario: 15 000 pilas en 40 ubicaciones
  const as = sqlite.prepare(
    'insert into assets (item_id, character_id, type_id, quantity, location_id, location_flag, location_type, root_location_id, is_singleton, is_blueprint_copy, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const locations = Array.from({ length: 40 }, (_, i) => 60_000_000 + i * 37);
  const owners = [P.aria, P.kade, P.rhea, P.tomas];
  for (let i = 0; i < 15_000; i++) {
    const loc = pick(locations);
    as.run(1_000_000_000 + i, pick(owners), pick([...TRADE_TYPES, ...MODULES, ...HULLS]), 1 + Math.floor(rand() * 1000), loc, 'Hangar', 'station', loc, 0, 0, now - 600);
  }
  // Precios, nombres y grupos de mercado de todo lo que aparece
  const allTypes = [...TRADE_TYPES, ...MODULES, ...HULLS, PLEX];
  const mp = sqlite.prepare('insert into market_prices (type_id, average_price, adjusted_price, updated_at) values (?, ?, ?, ?)');
  const nm = sqlite.prepare('insert or ignore into names (id, name, category, updated_at) values (?, ?, ?, ?)');
  const ty = sqlite.prepare('insert into types (type_id, group_id, market_group_id, updated_at) values (?, ?, ?, ?)');
  for (const t of allTypes) {
    mp.run(t, 100_000 + (t % 97) * 50_000, 100_000, now - 600);
    nm.run(t, `Tipo ${t}`, 'inventory_type', now - 600);
    ty.run(t, 1 + (t % 20), 100 + (t % 12), now - 600);
  }
  for (const s of [...RAT_SYSTEMS, JITA]) nm.run(s, `Sistema ${s}`, 'solar_system', now - 600);
  for (const l of [...locations, JITA_STATION]) nm.run(l, `Estación ${l}`, 'station', now - 600);
  sqlite.prepare('insert into market_quotes (type_id, sell_min, sell_orders, updated_at) values (?, ?, ?, ?)').run(PLEX, 5_000_000, 100, now - 600);
  const sl = sqlite.prepare('insert into sync_log (character_id, kind, started_at, finished_at, rows_inserted) values (?, ?, ?, ?, 0)');
  for (const id of Object.values(P)) for (const kind of ['journal', 'transactions', 'assets', 'killmails', 'contracts']) sl.run(id, kind, now - 660, now - 600);
})();

const count = (t: string) => (sqlite.query(`select count(*) as n from ${t}`).get() as { n: number }).n;
console.log(
  `Base de ${DAYS} días: ${count('wallet_journal')} movimientos, ${count('wallet_transactions')} transacciones, ` +
    `${count('killmails')} killmails, ${count('assets')} pilas de inventario, ${count('contracts')} contratos`,
);
sqlite.close();

// ── Medir ────────────────────────────────────────────────────────────────────
const PORT = 3990;
const api = Bun.spawn(['bun', join(import.meta.dir, '../src/index.ts')], {
  env: { ...baseEnv, PORT: String(PORT) },
  stdout: 'ignore',
  stderr: 'inherit',
});
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(`${base}/sync/status`)).ok) break;
  } catch {}
  await Bun.sleep(200);
}

// Lo que pide cada página (el Resumen pide varias a la vez)
const routes = [
  '/characters',
  '/summary?days=7',
  '/summary?days=30',
  '/summary?days=90',
  '/summary?days=365',
  `/summary?days=30&characterId=${P.kade}`,
  '/losses?days=30',
  '/losses?days=365',
  '/inventory',
  '/map',
  '/indicators',
  '/doctrines',
];
const results: { route: string; median: number; max: number }[] = [];
for (const route of routes) {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const res = await fetch(base + route, { headers: { accept: 'application/json' } });
    await res.arrayBuffer();
    if (!res.ok) throw new Error(`${route}: ${res.status}`);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  results.push({ route, median: times[Math.floor(times.length / 2)], max: times[times.length - 1] });
}
api.kill();

const pad = Math.max(...routes.map((r) => r.length));
console.log(`\n${'ruta'.padEnd(pad)}  mediana     máx  (${RUNS} veces)`);
for (const r of results) console.log(`${r.route.padEnd(pad)}  ${r.median.toFixed(0).padStart(5)} ms ${r.max.toFixed(0).padStart(5)} ms`);
if (KEEP) console.log(`\nBase conservada en ${DB_PATH}`);
else rmSync(dir, { recursive: true, force: true });
