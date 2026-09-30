import { and, desc, eq, gte, lt, min, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, walletJournal } from '../db/schema';
import { ACTIVITIES, activityOf } from '../lib/activities';
import { marketReview } from './transactions';

const DAY_MS = 86_400_000;

// Transferencias entre mis propios personajes: en el consolidado se anulan
// (una sale de un wallet y entra en otro), así que no cuentan como ingreso ni gasto
const isInternal = sql<number>`(case when ${walletJournal.firstPartyId} in (select id from characters)
  and ${walletJournal.secondPartyId} in (select id from characters) then 1 else 0 end)`;

const income = sql<number>`coalesce(sum(case when ${walletJournal.amount} > 0 then ${walletJournal.amount} end), 0)`;
const expenses = sql<number>`coalesce(sum(case when ${walletJournal.amount} < 0 then -${walletJournal.amount} end), 0)`;

export type Totals = { income: number; expenses: number; net: number };

const activity = activityOf(walletJournal.refType);

const withNet = <T extends { income: number; expenses: number }>(r: T): T & { net: number } => ({
  ...r,
  net: r.income - r.expenses,
});

// Fecha UTC (hora de EVE) en formato YYYY-MM-DD
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Ingresos, gastos y neto entre dos instantes, sin transferencias internas. Brutos: las compras de
// mercado son gasto y las ventas ingreso; el margen del trading solo se muestra en byActivity
async function flowBetween(pilot: SQL | undefined, from: Date, to?: Date) {
  const [row] = await db
    .select({ income, expenses })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), to ? lt(walletJournal.date, to) : undefined, eq(isInternal, 0), pilot));
  return withNet(row);
}

// characterId opcional: el ledger de un solo piloto. Las transferencias entre tus pilotos siguen
// sin contar (mover ISK no es ganarlo); la lista de pilotos se devuelve siempre completa.
// Saldo = el balance del último movimiento sincronizado del personaje
export async function lastBalance(characterId: number) {
  const [last] = await db
    .select({ balance: walletJournal.balance, date: walletJournal.date })
    .from(walletJournal)
    .where(eq(walletJournal.characterId, characterId))
    .orderBy(desc(walletJournal.date), desc(walletJournal.journalId))
    .limit(1);
  return last;
}

export async function getSummary(days: number, characterId?: number) {
  const now = new Date();
  // Desde el inicio del día UTC, para que el primer día de la serie esté completo
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const pilot = characterId ? eq(walletJournal.characterId, characterId) : undefined;
  const allPilots = and(gte(walletJournal.date, from), eq(isInternal, 0));
  const inPeriod = and(allPilots, pilot);

  const activityRows = await db
    .select({ activity, income, expenses, count: sql<number>`count(*)` })
    .from(walletJournal)
    .where(inPeriod)
    .groupBy(activity);
  const totals = withNet({
    income: activityRows.reduce((n, r) => n + r.income, 0),
    expenses: activityRows.reduce((n, r) => n + r.expenses, 0),
  });

  // «Hoy» = día de EVE en curso (desde 00:00 UTC) y el período anterior de igual duración
  const today = await flowBetween(pilot, todayStart);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);
  const previous = await flowBetween(pilot, previousFrom, from);

  // Cobertura: el historial empieza con el primer movimiento guardado, no con el período pedido
  const [first] = await db.select({ at: min(walletJournal.date) }).from(walletJournal).where(pilot);
  const firstEntryAt = first?.at ?? null;
  const coveredDays = !firstEntryAt
    ? 0
    : firstEntryAt <= from
      ? days
      : Math.floor((todayStart.getTime() - Date.UTC(firstEntryAt.getUTCFullYear(), firstEntryAt.getUTCMonth(), firstEntryAt.getUTCDate())) / DAY_MS) + 1;
  // El período anterior solo es comparable si el historial lo cubre entero
  const previousComplete = !!firstEntryAt && firstEntryAt <= previousFrom;

  const [internal] = await db
    .select({ volume: income })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), eq(isInternal, 1), pilot));

  const byCharacter = await db
    .select({ characterId: walletJournal.characterId, income, expenses })
    .from(walletJournal)
    .where(allPilots)
    .groupBy(walletJournal.characterId);

  const refType = walletJournal.refType;
  const byRefType = await db
    .select({ refType, activity, income, expenses, count: sql<number>`count(*)` })
    .from(walletJournal)
    .where(inPeriod)
    .groupBy(refType);

  const day = sql<string>`date(${walletJournal.date}, 'unixepoch')`;
  const dailyRows = await db.select({ day, income, expenses }).from(walletJournal).where(inPeriod).groupBy(day);

  // Serie diaria completa, con ceros en los días sin movimientos
  const dailyMap = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = Array.from({ length: days }, (_, i) => {
    const d = isoDay(new Date(from.getTime() + i * DAY_MS));
    return withNet({ date: d, income: dailyMap.get(d)?.income ?? 0, expenses: dailyMap.get(d)?.expenses ?? 0 });
  });

  // Saldo = el balance del último movimiento sincronizado de cada personaje
  const chars = await db.select({ id: characters.id, name: characters.name, lastSyncAt: characters.lastSyncAt }).from(characters);
  const charMap = new Map(byCharacter.map((r) => [r.characterId, r]));
  const perCharacter = await Promise.all(
    chars.map(async (c) => {
      const last = await lastBalance(c.id);
      const agg = charMap.get(c.id);
      return withNet({
        id: c.id,
        name: c.name,
        lastSyncAt: c.lastSyncAt,
        balance: last?.balance ?? null,
        balanceAt: last?.date ?? null,
        income: agg?.income ?? 0,
        expenses: agg?.expenses ?? 0,
      });
    }),
  );
  perCharacter.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));

  return {
    period: { days, from, to: now },
    totals: totals as Totals,
    characterId: characterId ?? null,
    balance: perCharacter.filter((c) => !characterId || c.id === characterId).reduce((n, c) => n + (c.balance ?? 0), 0),
    internalTransfers: internal.volume,
    characters: perCharacter,
    // Por actividad, con brutos y detalle por ref_type; el neto del trading es su margen
    byActivity: ACTIVITIES.map((a) => {
      const row = activityRows.find((r) => r.activity === a);
      return withNet({
        activity: a,
        income: row?.income ?? 0,
        expenses: row?.expenses ?? 0,
        count: row?.count ?? 0,
        refTypes: byRefType
          .filter((r) => r.activity === a)
          .map(({ activity: _, ...r }) => withNet(r))
          .sort((x, y) => Math.abs(y.net) - Math.abs(x.net)),
      });
    }).filter((a) => a.count > 0),
    daily,
    today,
    previous: { ...previous, complete: previousComplete },
    coverage: { firstEntryAt, coveredDays },
    market: await marketReview(from, characterId),
  };
}
