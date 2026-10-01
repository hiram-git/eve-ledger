import { and, eq, gte, inArray, sql, sum } from 'drizzle-orm';
import { db } from '../db/client';
import { assets, characters, marketPrices, names, systems, walletJournal } from '../db/schema';
import { env } from '../lib/env';
import { shipLosses } from './losses';
import { PLEX_TYPE_ID, getQuote } from './quotes';
import { dailyNetRate, lastBalance } from './summary';

const DAY_MS = 86_400_000;
// Desde las 00:00 EVE de hace `days - 1` días, como el resumen
const periodFrom = (days: number) => {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
};
// Saldo de los wallets: el último balance de cada piloto
async function walletBalance() {
  const chars = await db.select({ id: characters.id }).from(characters);
  const balances = await Promise.all(chars.map((c) => lastBalance(c.id)));
  return balances.reduce((acc, b) => acc + (b?.balance ?? 0), 0);
}

// PLEX: con él se paga el Omega. Precio = venta más baja del mercado (se refresca en cada sync);
// mientras no haya cotización, la media global de ESI.
// Ritmo: neto diario de los últimos 7 días, frente al coste diario del Omega (un mes = 30 días)
const PACE_DAYS = 7;
const OMEGA_MONTH_DAYS = 30;

export async function omegaIndicator() {
  const accounts = env.omegaAccounts;
  const plexPerMonth = env.omegaPlexPerMonth;
  const plexNeeded = accounts * plexPerMonth;

  const [price] = await db.select().from(marketPrices).where(eq(marketPrices.typeId, PLEX_TYPE_ID));
  const quote = await getQuote(PLEX_TYPE_ID);
  const average = price?.averagePrice ?? price?.adjustedPrice ?? null;
  const market = quote?.sellMin ?? null;
  const plexPrice = market ?? average;
  const plexPriceSource = market !== null ? ('market' as const) : average !== null ? ('average' as const) : null;
  const plexPriceUpdatedAt = market !== null ? quote!.updatedAt : average !== null ? price!.updatedAt : null;

  // Saldo de los wallets de los pilotos vinculados. Del inventario solo cuenta el PLEX que ya tienes:
  // el resto no es dinero hasta que se vende
  const chars = await db.select({ id: characters.id, lastSyncAt: characters.lastSyncAt }).from(characters);
  const balances = await Promise.all(chars.map((c) => lastBalance(c.id)));
  const available = balances.reduce((acc, b) => acc + (b?.balance ?? 0), 0);
  const [owned] = await db.select({ qty: sum(assets.quantity) }).from(assets).where(eq(assets.typeId, PLEX_TYPE_ID));
  const plexOwned = Number(owned?.qty ?? 0);
  const plexMissing = Math.max(0, plexNeeded - plexOwned);

  const cost = plexPrice === null ? null : plexNeeded * plexPrice;
  // Lo que queda por pagar: los PLEX que faltan, al precio actual
  const costMissing = plexPrice === null ? null : plexMissing * plexPrice;
  const missing = costMissing === null ? null : Math.max(0, costMissing - available);
  const surplus = costMissing === null ? null : Math.max(0, available - costMissing);
  const covered = cost === null ? 0 : Math.min(cost, available + Math.min(plexOwned, plexNeeded) * plexPrice!);
  const progress = cost === null || cost === 0 ? null : covered / cost;

  // ¿Tus pilotos se pagan el Omega? El Omega se renueva cada mes, así que «cuánto falta» no basta:
  // se compara lo que cuesta al día con lo que ganas al día. El ritmo se mide por piloto sobre los
  // días con datos (uno con el sync atascado cuenta hasta su último sync; uno sin sync no cuenta)
  const rates = await Promise.all(chars.map((c) => dailyNetRate(c.id, c.lastSyncAt, PACE_DAYS)));
  const pace = rates.reduce((acc: number, r) => acc + (r ?? 0), 0);
  const costPerDay = cost === null ? null : cost / OMEGA_MONTH_DAYS;
  const paceShare = costPerDay ? pace / costPerDay : null;

  return {
    accounts,
    plexPerMonth,
    months: 1,
    plexNeeded,
    plexOwned,
    plexMissing,
    plexPrice,
    plexAveragePrice: average,
    plexPriceSource,
    plexPriceUpdatedAt,
    cost,
    costMissing,
    available,
    missing,
    surplus,
    progress,
    avgDailyNet: pace,
    paceDays: PACE_DAYS,
    costPerDay,
    paceShare,
    // Saldo de cada piloto: la web dice cuánto de «available» viene de pilotos con datos viejos
    balances: chars.map((c, i) => ({ characterId: c.id, balance: balances[i]?.balance ?? null })),
  };
}

// ISK por hora de ratting. EVE no dice cuánto tiempo jugaste, pero paga las recompensas de NPC en bloques de
// 20 minutos: cada pago `bounty_prizes` del journal es un bloque, así que bloques × 20 min ≈ tiempo ratteando
// (por defecto, un bloque a medias cuenta entero). El ESS (`ess_escrow_transfer`) es la parte diferida de esas
// recompensas: suma al piloto, pero no a un sistema (no lo dice)
const TICK_MINUTES = 20;
const BOUNTY_REFS = ['bounty_prizes', 'bounty_prize'];
const ESS_REF = 'ess_escrow_transfer';

async function rattingRate(from: Date) {
  const rows = await db
    .select({
      characterId: walletJournal.characterId,
      refType: walletJournal.refType,
      amount: walletJournal.amount,
      contextId: walletJournal.contextId,
      contextIdType: walletJournal.contextIdType,
    })
    .from(walletJournal)
    .where(and(inArray(walletJournal.refType, [...BOUNTY_REFS, ESS_REF]), gte(walletJournal.date, from)));
  const bounty = rows.filter((r) => BOUNTY_REFS.includes(r.refType));
  const ticks = bounty.length;
  const isk = rows.reduce((n, r) => n + Math.max(0, r.amount), 0);
  const hours = (ticks * TICK_MINUTES) / 60;
  return { rows, bounty, ticks, isk, hours, iskPerHour: hours ? isk / hours : null };
}

export async function rattingIndicator(days = 30) {
  const all = await rattingRate(periodFrom(days));
  const recent = await rattingRate(periodFrom(7));
  const pilots = await db.select({ id: characters.id, name: characters.name }).from(characters);

  const byPilot = pilots
    .map((p) => {
      const mine = all.rows.filter((r) => r.characterId === p.id);
      const ticks = mine.filter((r) => BOUNTY_REFS.includes(r.refType)).length;
      const isk = mine.reduce((n, r) => n + Math.max(0, r.amount), 0);
      const hours = (ticks * TICK_MINUTES) / 60;
      return { characterId: p.id, name: p.name, ticks, hours, isk, iskPerHour: hours ? isk / hours : null };
    })
    .filter((p) => p.ticks > 0)
    .sort((a, b) => (b.iskPerHour ?? 0) - (a.iskPerHour ?? 0));

  // Por sistema: solo las recompensas (el journal dice el sistema con context_id_type = system_id)
  const bySystemMap = new Map<number, { ticks: number; isk: number }>();
  for (const r of all.bounty) {
    if (r.contextIdType !== 'system_id' || !r.contextId) continue;
    const s = bySystemMap.get(r.contextId) ?? { ticks: 0, isk: 0 };
    s.ticks++;
    s.isk += Math.max(0, r.amount);
    bySystemMap.set(r.contextId, s);
  }
  const ids = [...bySystemMap.keys()];
  const sysRows = ids.length
    ? await db.select({ id: systems.id, name: systems.name, security: systems.security }).from(systems).where(inArray(systems.id, ids))
    : [];
  const nameRows = ids.length ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, ids)) : [];
  const sysById = new Map(sysRows.map((s) => [s.id, s]));
  const nameById = new Map(nameRows.map((n) => [n.id, n.name]));
  const bySystem = [...bySystemMap.entries()]
    .map(([id, v]) => {
      const hours = (v.ticks * TICK_MINUTES) / 60;
      return { systemId: id, name: sysById.get(id)?.name ?? nameById.get(id) ?? null, security: sysById.get(id)?.security ?? null, ticks: v.ticks, hours, isk: v.isk, iskPerHour: v.isk / hours };
    })
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);

  return {
    days,
    tickMinutes: TICK_MINUTES,
    ticks: all.ticks,
    hours: all.hours,
    isk: all.isk,
    iskPerHour: all.iskPerHour,
    // Los últimos 7 días, para ver si el ritmo sube o baja
    recent: { days: 7, hours: recent.hours, iskPerHour: recent.iskPerHour },
    byPilot,
    bySystem,
  };
}

// Fondo de reposición: cuántas veces repones cada nave que has perdido (casco + equipo como lo perdiste, al
// precio medio de ESI) con el saldo de los wallets, y cuánto ratting cuesta cada una. Más lo que te costaron las
// pérdidas del período, expresado en horas de ratting
export async function replacementIndicator(iskPerHour: number | null, days = 30) {
  const available = await walletBalance();
  const recent = await shipLosses(90);
  const period = await shipLosses(days);
  const seen = new Set<number>();
  const ships = recent.losses
    .filter((l) => (seen.has(l.shipTypeId) ? false : (seen.add(l.shipTypeId), true)))
    .slice(0, 5)
    .map((l) => ({
      shipTypeId: l.shipTypeId,
      ship: l.ship,
      lostAt: l.time,
      value: l.value,
      times: l.value > 0 ? Math.floor(available / l.value) : null,
      hours: iskPerHour && l.value > 0 ? l.value / iskPerHour : null,
    }));
  const cost = period.totals.cost;
  return {
    available,
    iskPerHour,
    ships,
    days,
    count: period.totals.count,
    // Lo que te costaron (negativo) y su equivalente en horas de ratting
    cost,
    costHours: iskPerHour && cost < 0 ? -cost / iskPerHour : null,
    // Sin el permiso de killmails en ningún piloto no hay pérdidas que medir
    noScope: recent.pilots > 0 && recent.missingScope.length === recent.pilots,
  };
}

// Comisiones e impuestos del mercado: lo que se lleva el juego por comerciar. Las comisiones de los courier son
// logística, no mercado: no cuentan aquí
const FEE_REFS = ['transaction_tax', 'brokers_fee', 'market_provider_tax', 'contract_sales_tax', 'contract_brokers_fee'];

export async function feesIndicator(days = 30) {
  const from = periodFrom(days);
  const notCourier = sql`not (${walletJournal.refType} = 'contract_brokers_fee'
    and ${walletJournal.contextId} in (select contract_id from contracts where type = 'courier'))`;
  const rows = await db
    .select({ refType: walletJournal.refType, total: sql<number>`coalesce(sum(-${walletJournal.amount}), 0)` })
    .from(walletJournal)
    .where(and(inArray(walletJournal.refType, FEE_REFS), gte(walletJournal.date, from), notCourier))
    .groupBy(walletJournal.refType);
  // Lo vendido en el mercado (sin las ventas a tus otros pilotos)
  const [sales] = await db
    .select({ total: sql<number>`coalesce(sum(${walletJournal.amount}), 0)` })
    .from(walletJournal)
    .where(
      and(
        eq(walletJournal.refType, 'market_transaction'),
        sql`${walletJournal.amount} > 0`,
        gte(walletJournal.date, from),
        sql`not (${walletJournal.firstPartyId} in (select id from characters) and ${walletJournal.secondPartyId} in (select id from characters))`,
      ),
    );
  const byType = rows.map((r) => ({ refType: r.refType, total: r.total })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const total = byType.reduce((n, r) => n + r.total, 0);
  return { days, total, sales: sales?.total ?? 0, share: sales?.total ? total / sales.total : null, byType };
}

export async function getIndicators() {
  const ratting = await rattingIndicator();
  return {
    omega: await omegaIndicator(),
    ratting,
    replacement: await replacementIndicator(ratting.iskPerHour),
    fees: await feesIndicator(),
  };
}
