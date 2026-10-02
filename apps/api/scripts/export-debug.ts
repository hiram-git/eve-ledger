// Exporta los datos del ledger a un JSON para revisarlos fuera de esta máquina, SIN nada sensible:
// ni tokens (access/refresh), ni owner_hash, ni descripciones del journal (texto libre con nombres).
// Por defecto también anonimiza: tus pilotos pasan a «Piloto 1…N» con IDs ficticios, y los IDs de otros
// jugadores, corporaciones y alianzas se sustituyen por seudónimos estables (la misma persona, el mismo seudónimo).
//
// Uso (desde apps/api):  bun run export:debug [--days=90] [--names]
//   --days=N   movimientos del wallet y transacciones de los últimos N días (90 por defecto)
//   --names    conserva los nombres e IDs reales de tus pilotos (el resto sigue anonimizado)
//
// Escribe data/export-debug-AAAA-MM-DD.json (data/ no se sube a git). Revísalo antes de compartirlo.
import { Database } from 'bun:sqlite';
import { existsSync, writeFileSync } from 'node:fs';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'] as const;
  }),
);
const days = Math.max(1, Number(args.get('days') ?? 90) || 90);
const keepNames = args.get('names') === 'true';

const DB_PATH = 'data/ledger.db';
if (!existsSync(DB_PATH)) {
  console.error(`No encuentro ${DB_PATH}: corre el script desde apps/api.`);
  process.exit(1);
}
const db = new Database(DB_PATH, { readonly: true });
const all = <T = Record<string, unknown>>(sql: string, ...params: (string | number)[]) =>
  db.query(sql).all(...params) as T[];

// --- Seudónimos -------------------------------------------------------------------------------------------
// Tus pilotos: 2100000001… en orden de vinculación (o sus IDs reales con --names)
const pilots = all<{ id: number; name: string }>(`select id, name from characters order by created_at, id`);
const pilotId = new Map(pilots.map((p, i) => [p.id, keepNames ? p.id : 2_100_000_001 + i]));
const pilotName = new Map(pilots.map((p, i) => [p.id, keepNames ? p.name : `Piloto ${i + 1}`]));
// Otros jugadores, corporaciones y alianzas (IDs ≥ 90.000.000): seudónimo estable. Las corporaciones de NPC
// (1.000.000–2.999.999), los agentes y los sistemas/estaciones quedan tal cual: no identifican a nadie
const others = new Map<number, number>();
const person = (id: number | null) => {
  if (id === null || id === undefined) return null;
  if (pilotId.has(id)) return pilotId.get(id)!;
  if (id < 90_000_000 || id > 2_147_483_647) return id;
  if (!others.has(id)) others.set(id, 3_900_000_000 + others.size + 1);
  return others.get(id)!;
};
const PERSON_CONTEXTS = new Set(['character_id', 'corporation_id', 'alliance_id']);
// En el texto de los errores de sync: IDs y nombres de tus pilotos
const scrub = (text: string | null) => {
  if (!text) return text;
  let out = text;
  for (const p of pilots) {
    out = out.split(String(p.id)).join(String(pilotId.get(p.id)));
    out = out.split(p.name).join(pilotName.get(p.id)!);
  }
  // Por si un error llevara un token o una cabecera Authorization
  return out.replace(/Bearer\s+[\w.-]+/g, 'Bearer [redactado]').replace(/eyJ[\w.-]{20,}/g, '[token redactado]');
};

const since = Math.floor(Date.now() / 1000) - days * 86_400;

// --- Tablas -----------------------------------------------------------------------------------------------
// characters: sin owner_hash, refresh_token, access_token ni token_expires_at
const characters = all<Record<string, number | string | null>>(
  `select id, name, scopes, last_sync_at, created_at from characters order by created_at, id`,
).map((c) => ({ ...c, id: pilotId.get(c.id as number), name: pilotName.get(c.id as number) }));

// wallet_journal: sin description (texto libre con nombres de jugadores)
const walletJournal = all<Record<string, number | string | null>>(
  `select journal_id, character_id, date, ref_type, amount, balance, first_party_id, second_party_id, context_id, context_id_type
   from wallet_journal where date >= ? order by date`,
  since,
).map((j) => ({
  ...j,
  character_id: person(j.character_id as number),
  first_party_id: person(j.first_party_id as number | null),
  second_party_id: person(j.second_party_id as number | null),
  context_id: PERSON_CONTEXTS.has(String(j.context_id_type)) ? person(j.context_id as number) : j.context_id,
}));

const walletTransactions = all<Record<string, number | null>>(
  `select transaction_id, character_id, date, type_id, quantity, unit_price, is_buy, location_id, client_id, journal_ref_id
   from wallet_transactions where date >= ? order by date`,
  since,
).map((t) => ({ ...t, character_id: person(t.character_id), client_id: person(t.client_id) }));

const assets = all<Record<string, number | string | null>>(`select * from assets`).map((a) => ({
  ...a,
  character_id: person(a.character_id as number),
}));

// killmails: sin el hash (solo sirve para volver a pedirlo a ESI)
const killmails = all<Record<string, number | string | null>>(
  `select killmail_id, character_id, killmail_time, solar_system_id, victim_character_id, ship_type_id, items, attackers from killmails`,
).map((k) => ({
  ...k,
  hash: 'redactado',
  character_id: person(k.character_id as number),
  victim_character_id: person(k.victim_character_id as number | null),
}));

const contracts = all<Record<string, number | string | null>>(`select * from contracts`).map((c) => ({
  ...c,
  character_id: person(c.character_id as number),
  issuer_id: person(c.issuer_id as number),
  acceptor_id: person(c.acceptor_id as number | null),
  assignee_id: person(c.assignee_id as number | null),
}));

// Nombres: solo ítems, estaciones y geografía (nunca personajes, corporaciones ni alianzas)
const names = all(
  `select * from names where category not in ('character', 'corporation', 'alliance', 'faction')`,
);

// Precios: solo los tipos que aparecen en los datos exportados (la tabla completa son ~15.000 filas)
const typeIds = new Set<number>([
  ...walletTransactions.map((t) => t.type_id as number),
  ...assets.map((a) => a.type_id as number),
  ...killmails.flatMap((k) => [k.ship_type_id as number, ...JSON.parse(String(k.items)).map((i: { typeId: number }) => i.typeId)]),
  ...contracts.flatMap((c) => (c.items ? JSON.parse(String(c.items)).map((i: { typeId: number }) => i.typeId) : [])),
  44992, // PLEX
]);
const marketPrices = all<{ type_id: number }>(`select * from market_prices`).filter((p) => typeIds.has(p.type_id));
const marketQuotes = all(`select * from market_quotes`);
const systems = all(`select * from systems`);
// Grupos de mercado de los tipos (reconocen el equipo equivalente al reponer una nave); la tabla puede no existir aún
const typesTable = (() => {
  try {
    return all(`select * from types`);
  } catch {
    return [];
  }
})();
const stationSystems = all(`select * from station_systems`);

const syncLog = all<Record<string, number | string | null>>(`select * from sync_log order by id desc limit 300`).map((l) => ({
  ...l,
  character_id: person(l.character_id as number),
  error: scrub(l.error as string | null),
}));

const tables = {
  characters,
  wallet_journal: walletJournal,
  wallet_transactions: walletTransactions,
  names,
  assets,
  market_prices: marketPrices,
  market_quotes: marketQuotes,
  systems,
  station_systems: stationSystems,
  types: typesTable,
  killmails,
  contracts,
  sync_log: syncLog,
};

const exportedAt = new Date().toISOString();
const out = {
  meta: {
    format: 'eve-ledger-debug',
    version: 1,
    exportedAt,
    days,
    anonymized: !keepNames,
    excluded: ['tokens (access/refresh)', 'owner_hash', 'descripciones del journal', 'hash de los killmails', 'nombres de personajes y corporaciones'],
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
  },
  tables,
};

const file = `data/export-debug-${exportedAt.slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(out));

console.log(`Exportado: ${file}`);
for (const [k, v] of Object.entries(out.meta.counts)) console.log(`  ${k.padEnd(20)} ${v}`);
console.log(keepNames ? '\nPilotos con sus nombres reales (--names).' : '\nPilotos anonimizados: ' + pilots.map((p) => `${p.name} → ${pilotName.get(p.id)}`).join(', '));
console.log('Sin tokens, owner_hash ni descripciones. Revisa el archivo antes de compartirlo.');
