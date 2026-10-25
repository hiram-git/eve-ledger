import { and, eq, gte, inArray, sql, sum } from 'drizzle-orm';
import { db } from '../db/client';
import { assets, characters, marketPrices, names, systems, walletJournal } from '../db/schema';
import { PVE_EXTRA_KINDS, refKindOf } from '../lib/activities';
import { env } from '../lib/env';
import { deductionsIndicator } from './deductions';
import { loyaltyIndicator } from './loyalty';
import { shipLosses } from './losses';
import { PLEX_TYPE_ID, getQuote } from './quotes';
import { activity, dailyNetRate, isInternal, lastBalance } from './summary';

const DAY_MS = 86_400_000;
// From 00:00 EVE `days - 1` days ago, like the summary
const periodFrom = (days: number) => {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
};
// Wallet balance: each pilot's last balance
async function walletBalance() {
  const chars = await db.select({ id: characters.id }).from(characters);
  const balances = await Promise.all(chars.map((c) => lastBalance(c.id)));
  return balances.reduce((acc, b) => acc + (b?.balance ?? 0), 0);
}

// PLEX: it pays for Omega. Price = lowest sell on the market (refreshed on each sync);
// while there is no quote, ESI's global average.
// Pace: daily net over the last 7 days, versus the daily cost of Omega (a month = 30 days)
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

  // Wallet balance of the linked pilots. From the inventory only the PLEX you already have counts:
  // the rest is not money until it is sold
  const chars = await db.select({ id: characters.id, lastSyncAt: characters.lastSyncAt }).from(characters);
  const balances = await Promise.all(chars.map((c) => lastBalance(c.id)));
  const available = balances.reduce((acc, b) => acc + (b?.balance ?? 0), 0);
  const [owned] = await db.select({ qty: sum(assets.quantity) }).from(assets).where(eq(assets.typeId, PLEX_TYPE_ID));
  const plexOwned = Number(owned?.qty ?? 0);
  const plexMissing = Math.max(0, plexNeeded - plexOwned);

  const cost = plexPrice === null ? null : plexNeeded * plexPrice;
  // What is left to pay: the missing PLEX, at the current price
  const costMissing = plexPrice === null ? null : plexMissing * plexPrice;
  const missing = costMissing === null ? null : Math.max(0, costMissing - available);
  const surplus = costMissing === null ? null : Math.max(0, available - costMissing);
  const covered = cost === null ? 0 : Math.min(cost, available + Math.min(plexOwned, plexNeeded) * plexPrice!);
  const progress = cost === null || cost === 0 ? null : covered / cost;

  // Do your pilots pay for their Omega? Omega renews every month, so "how much is missing" is not enough:
  // we compare what it costs per day with what you earn per day. The pace is measured per pilot over the
  // days with data (one with a stuck sync counts up to its last sync; one without a sync does not count)
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
    // Each pilot's balance: the web says how much of "available" comes from pilots with stale data
    balances: chars.map((c, i) => ({ characterId: c.id, balance: balances[i]?.balance ?? null })),
  };
}

// ISK per hour of ratting. EVE does not say how long you played, but it pays NPC bounties in 20-minute
// blocks: each `bounty_prizes` payment in the journal is one block, so blocks × 20 min ≈ time ratting
// (by default, a partial block counts as whole). The ESS (`ess_escrow_transfer`) is the deferred part of those
// bounties: it adds to the pilot, but not to a system (it does not say). Also (user's decision), what ratting
// yields outside bounties: sold escalations and loot sold to the buyback (refKindOf); time still comes
// from the bounty blocks (escalation sites pay them too)
const TICK_MINUTES = 20;
const BOUNTY_REFS = ['bounty_prizes', 'bounty_prize'];
const ESS_REF = 'ess_escrow_transfer';
const RATTING_KINDS = [...BOUNTY_REFS, ESS_REF, ...PVE_EXTRA_KINDS];
const ratKind = refKindOf(walletJournal.refType, walletJournal.amount, walletJournal.firstPartyId);

async function rattingRate(from: Date) {
  const rows = await db
    .select({
      characterId: walletJournal.characterId,
      refType: ratKind,
      amount: walletJournal.amount,
      contextId: walletJournal.contextId,
      contextIdType: walletJournal.contextIdType,
    })
    .from(walletJournal)
    .where(and(inArray(ratKind, RATTING_KINDS), gte(walletJournal.date, from)));
  const bounty = rows.filter((r) => BOUNTY_REFS.includes(r.refType));
  const ticks = bounty.length;
  const isk = rows.reduce((n, r) => n + Math.max(0, r.amount), 0);
  const hours = (ticks * TICK_MINUTES) / 60;
  // Where the ISK comes from: bounties, ESS, sold escalations and sold loot
  const part = (kinds: string[]) => rows.filter((r) => kinds.includes(r.refType)).reduce((n, r) => n + Math.max(0, r.amount), 0);
  const parts = {
    bounties: part(BOUNTY_REFS),
    ess: part([ESS_REF]),
    escalations: part(['escalation_sale']),
    loot: part(['loot_buyback']),
  };
  return { rows, bounty, ticks, isk, parts, hours, iskPerHour: hours ? isk / hours : null };
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

  // Per system: bounties only (the journal says the system with context_id_type = system_id)
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
    .sort((a, b) => b.hours - a.hours);
  // For the breakdown: the 6 systems with most hours; the rest, grouped; and bounties without a system (the journal does not say)
  const TOP = 6;
  const rest = bySystem.slice(TOP).reduce(
    (acc, s) => ({ systems: acc.systems + 1, ticks: acc.ticks + s.ticks, hours: acc.hours + s.hours, isk: acc.isk + s.isk }),
    { systems: 0, ticks: 0, hours: 0, isk: 0 },
  );
  const noSystemTicks = all.bounty.filter((r) => r.contextIdType !== 'system_id' || !r.contextId).length;
  const noSystem = {
    ticks: noSystemTicks,
    hours: (noSystemTicks * TICK_MINUTES) / 60,
    isk: all.bounty.filter((r) => r.contextIdType !== 'system_id' || !r.contextId).reduce((n, r) => n + Math.max(0, r.amount), 0),
  };

  return {
    days,
    tickMinutes: TICK_MINUTES,
    ticks: all.ticks,
    hours: all.hours,
    isk: all.isk,
    iskPerHour: all.iskPerHour,
    parts: all.parts,
    // The last 7 days, to see whether the pace goes up or down
    recent: { days: 7, hours: recent.hours, iskPerHour: recent.iskPerHour },
    byPilot,
    bySystem: bySystem.slice(0, TOP),
    bySystemRest: rest,
    bySystemUnknown: noSystem,
  };
}

// Your days: the game net of each day in the period (without PLEX and without what was moved between your pilots), consolidated.
// Best and worst day, how many days ended positive and the current streak. A day without movements counts as 0
// from the first stored movement on; before the history it does not count
export async function daysIndicator(days = 30) {
  const from = periodFrom(days);
  const day = sql<string>`date(${walletJournal.date}, 'unixepoch')`;
  const rows = await db
    .select({ day, net: sql<number>`coalesce(sum(${walletJournal.amount}), 0)` })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), eq(isInternal, 0), sql`${activity} <> 'accounts'`))
    .groupBy(day);
  const [first] = await db.select({ at: sql<number | null>`min(${walletJournal.date})` }).from(walletJournal);
  const firstAt = first?.at ? new Date(Number(first.at) * 1000) : null;
  if (!firstAt) return { days, withData: 0, positive: 0, negative: 0, best: null, worst: null, streak: 0, avg: null, firstAt: null };
  const netOf = new Map(rows.map((r) => [r.day, r.net]));
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstDay = Date.UTC(firstAt.getUTCFullYear(), firstAt.getUTCMonth(), firstAt.getUTCDate());
  const series: { date: string; net: number }[] = [];
  for (let t = Math.max(from.getTime(), firstDay); t <= todayStart; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    series.push({ date, net: netOf.get(date) ?? 0 });
  }
  // Today is not over yet: it enters the average and the streak only if it already has movements
  const closed = series.filter((d, i) => i < series.length - 1 || netOf.has(d.date));
  const withData = closed.length;
  const positive = closed.filter((d) => d.net > 0).length;
  const negative = closed.filter((d) => d.net < 0).length;
  const best = closed.length ? closed.reduce((a, b) => (b.net > a.net ? b : a)) : null;
  const worst = closed.length ? closed.reduce((a, b) => (b.net < a.net ? b : a)) : null;
  let streak = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].net > 0; i--) streak++;
  const avg = withData ? closed.reduce((n, d) => n + d.net, 0) / withData : null;
  return { days, withData, positive, negative, best, worst, streak, avg, firstAt: firstAt.toISOString() };
}

// Replacement fund: how many times you can replace each ship you lost (hull + fitting as lost, at
// ESI's average price) with the wallet balance, and how much ratting each one costs. Plus what the period's
// losses cost you, expressed in ratting hours
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
    // What they cost you (negative) and its equivalent in ratting hours
    cost,
    costHours: iskPerHour && cost < 0 ? -cost / iskPerHour : null,
    // Without the killmails scope on any pilot there are no losses to measure
    noScope: recent.pilots > 0 && recent.missingScope.length === recent.pilots,
  };
}

// Market fees and taxes: what the game takes for trading. Courier fees are
// logistics, not market: they do not count here
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
  // Sold on the market (excluding sales to your other pilots)
  const [sales] = await db
    .select({ total: sql<number>`coalesce(sum(${walletJournal.amount}), 0)` })
    .from(walletJournal)
    .where(
      and(
        eq(walletJournal.refType, 'market_transaction'),
        sql`${walletJournal.amount} > 0`,
        gte(walletJournal.date, from),
        sql`not (${walletJournal.firstPartyId} in (select id from characters) and ${walletJournal.secondPartyId} in (select id from characters) and ${walletJournal.firstPartyId} <> ${walletJournal.secondPartyId})`,
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
    deductions: await deductionsIndicator(ratting),
    days: await daysIndicator(),
    loyalty: await loyaltyIndicator(),
  };
}
