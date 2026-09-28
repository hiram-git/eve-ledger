import { and, desc, eq, gte, lt, min, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, walletJournal } from '../db/schema';
import { topItems } from './transactions';

const DAY_MS = 86_400_000;

// Transferencias entre mis propios personajes: en el consolidado se anulan
// (una sale de un wallet y entra en otro), así que no cuentan como ingreso ni gasto
const isInternal = sql<number>`(case when ${walletJournal.firstPartyId} in (select id from characters)
  and ${walletJournal.secondPartyId} in (select id from characters) then 1 else 0 end)`;

const income = sql<number>`coalesce(sum(case when ${walletJournal.amount} > 0 then ${walletJournal.amount} end), 0)`;
const expenses = sql<number>`coalesce(sum(case when ${walletJournal.amount} < 0 then -${walletJournal.amount} end), 0)`;

export type Totals = { income: number; expenses: number; net: number };

const withNet = <T extends { income: number; expenses: number }>(r: T): T & { net: number } => ({
  ...r,
  net: r.income - r.expenses,
});

// Fecha UTC (hora de EVE) en formato YYYY-MM-DD
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Ingresos, gastos y neto entre dos instantes, sin transferencias internas
async function flowBetween(from: Date, to?: Date) {
  const [row] = await db
    .select({ income, expenses })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), to ? lt(walletJournal.date, to) : undefined, eq(isInternal, 0)));
  return withNet(row);
}

export async function getSummary(days: number) {
  const now = new Date();
  // Desde el inicio del día UTC, para que el primer día de la serie esté completo
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const inPeriod = and(gte(walletJournal.date, from), eq(isInternal, 0));

  const [totals] = await db.select({ income, expenses }).from(walletJournal).where(inPeriod);

  // «Hoy» = día de EVE en curso (desde 00:00 UTC) y el período anterior de igual duración
  const today = await flowBetween(todayStart);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);
  const previous = await flowBetween(previousFrom, from);

  // Cobertura: el historial empieza con el primer movimiento guardado, no con el período pedido
  const [first] = await db.select({ at: min(walletJournal.date) }).from(walletJournal);
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
    .where(and(gte(walletJournal.date, from), eq(isInternal, 1)));

  const byCharacter = await db
    .select({ characterId: walletJournal.characterId, income, expenses })
    .from(walletJournal)
    .where(inPeriod)
    .groupBy(walletJournal.characterId);

  const refType = walletJournal.refType;
  const byRefType = await db
    .select({ refType, income, expenses, count: sql<number>`count(*)` })
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
      const [last] = await db
        .select({ balance: walletJournal.balance, date: walletJournal.date })
        .from(walletJournal)
        .where(eq(walletJournal.characterId, c.id))
        .orderBy(desc(walletJournal.date), desc(walletJournal.journalId))
        .limit(1);
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
    totals: withNet(totals) as Totals,
    balance: perCharacter.reduce((n, c) => n + (c.balance ?? 0), 0),
    internalTransfers: internal.volume,
    characters: perCharacter,
    byRefType: byRefType.map(withNet).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
    daily,
    today,
    previous: { ...previous, complete: previousComplete },
    coverage: { firstEntryAt, coveredDays },
    market: await topItems(from),
  };
}
