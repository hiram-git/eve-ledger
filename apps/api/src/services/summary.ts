import { and, desc, eq, gte, inArray, lt, min, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, walletJournal, walletTransactions } from '../db/schema';
import { ACTIVITIES, activityOf, PLEX_TYPE_ID, refKindOf } from '../lib/activities';
import { REPLACEMENT_DAYS, shipLosses } from './losses';
import { marketReview } from './transactions';

const DAY_MS = 86_400_000;

// Transferencias entre mis propios personajes: en el consolidado se anulan
// (una sale de un wallet y entra en otro), así que no cuentan como ingreso ni gasto.
// Dos pilotos DISTINTOS: en una compra de mercado (market_escrow) ESI pone al propio comprador como
// primera y segunda parte, y eso es un gasto, no una transferencia
const isInternal = sql<number>`(case when ${walletJournal.firstPartyId} in (select id from characters)
  and ${walletJournal.secondPartyId} in (select id from characters)
  and ${walletJournal.firstPartyId} <> ${walletJournal.secondPartyId} then 1 else 0 end)`;

const income = sql<number>`coalesce(sum(case when ${walletJournal.amount} > 0 then ${walletJournal.amount} end), 0)`;
const expenses = sql<number>`coalesce(sum(case when ${walletJournal.amount} < 0 then -${walletJournal.amount} end), 0)`;

export type Totals = { income: number; expenses: number; net: number };

// Tipo de movimiento para el detalle: el ref_type de ESI, salvo escalaciones vendidas y loot del buyback
const refKind = refKindOf(walletJournal.refType, walletJournal.amount, walletJournal.firstPartyId);
const activity = activityOf(walletJournal.refType, walletJournal.contextId, refKind);

const withNet = <T extends { income: number; expenses: number }>(r: T): T & { net: number } => ({
  ...r,
  net: r.income - r.expenses,
});

// Fecha UTC (hora de EVE) en formato YYYY-MM-DD
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Ingresos, gastos y neto entre dos instantes, sin transferencias internas. Brutos: las compras de
// mercado son gasto y las ventas ingreso; el margen del trading solo se muestra en byActivity
async function flowBetween(pilot: SQL | undefined, from: Date, to?: Date, withoutAccounts = false) {
  const [row] = await db
    .select({ income, expenses })
    .from(walletJournal)
    .where(
      and(
        gte(walletJournal.date, from),
        to ? lt(walletJournal.date, to) : undefined,
        eq(isInternal, 0),
        pilot,
        withoutAccounts ? sql`${activity} <> 'accounts'` : undefined,
      ),
    );
  return withNet(row);
}

// Neto diario de un piloto en los últimos `days` días, medido solo sobre los días de los que hay datos:
// desde su primer movimiento (si es posterior al inicio) hasta su último sync. Un piloto con el sync
// atascado cuenta con su ritmo hasta ese sync; sin sync, o sin datos en la ventana, devuelve null
export async function dailyNetRate(characterId: number, lastSyncAt: Date | null, days: number) {
  if (!lastSyncAt) return null;
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowFrom = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
  const [first] = await db
    .select({ at: min(walletJournal.date) })
    .from(walletJournal)
    .where(eq(walletJournal.characterId, characterId));
  const from = first?.at && first.at > windowFrom ? first.at : windowFrom;
  const to = lastSyncAt < now ? lastSyncAt : now;
  const span = (to.getTime() - from.getTime()) / DAY_MS;
  if (span <= 0) return null;
  // Sin el PLEX: comprarlo ES pagar el Omega, no el ritmo con el que lo pagas
  const flow = await flowBetween(eq(walletJournal.characterId, characterId), from, to, true);
  // Menos de un día de datos: se divide por un día entero para no inflar el ritmo
  return flow.net / Math.max(1, span);
}

// PLEX comprado y vendido en el mercado en el período (sin operaciones entre tus pilotos)
async function plexTraded(from: Date, characterId?: number) {
  const [row] = await db
    .select({
      bought: sql<number>`coalesce(sum(case when ${walletTransactions.isBuy} = 1 then ${walletTransactions.quantity} end), 0)`,
      sold: sql<number>`coalesce(sum(case when ${walletTransactions.isBuy} = 0 then ${walletTransactions.quantity} end), 0)`,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.typeId, PLEX_TYPE_ID),
        gte(walletTransactions.date, from),
        sql`(${walletTransactions.clientId} is null or ${walletTransactions.clientId} not in (select id from characters))`,
        characterId ? eq(walletTransactions.characterId, characterId) : undefined,
      ),
    );
  return { plexBought: row?.bought ?? 0, plexSold: row?.sold ?? 0 };
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

  // Movido entre tus pilotos, por piloto: quién envió y quién recibió cada transferencia. ESI da el mismo id a
  // los dos lados y basta uno para saberlo (el signo dice quién paga; la otra parte es el otro piloto), así que
  // también cuadra con movimientos de antes de que el journal guardara los dos lados (migración 0007)
  const internalRows = await db
    .select({
      journalId: walletJournal.journalId,
      characterId: walletJournal.characterId,
      amount: walletJournal.amount,
      firstPartyId: walletJournal.firstPartyId,
      secondPartyId: walletJournal.secondPartyId,
    })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), eq(isInternal, 1)));
  const transfers = new Map<number, { from: number; to: number; amount: number }>();
  for (const r of internalRows) {
    if (transfers.has(r.journalId) || !r.amount) continue;
    const other = r.firstPartyId === r.characterId ? r.secondPartyId! : r.firstPartyId!;
    const [sender, receiver] = r.amount < 0 ? [r.characterId, other] : [other, r.characterId];
    transfers.set(r.journalId, { from: sender, to: receiver, amount: Math.abs(r.amount) });
  }
  const internalByCharacter = new Map<number, { received: number; sent: number }>();
  const internalOf = (id: number) => internalByCharacter.get(id) ?? internalByCharacter.set(id, { received: 0, sent: 0 }).get(id)!;
  let movedBetween = 0;
  for (const t of transfers.values()) {
    internalOf(t.from).sent += t.amount;
    internalOf(t.to).received += t.amount;
    movedBetween += t.amount;
  }
  // En la vista de un piloto, lo suyo; en el consolidado, lo recibido y lo enviado son lo mismo
  const internal = characterId
    ? (internalByCharacter.get(characterId) ?? { received: 0, sent: 0 })
    : { received: movedBetween, sent: movedBetween };

  const byCharacter = await db
    .select({ characterId: walletJournal.characterId, income, expenses })
    .from(walletJournal)
    .where(allPilots)
    .groupBy(walletJournal.characterId);
  const refType = refKind;
  const byRefType = await db
    .select({ refType, activity, income, expenses, count: sql<number>`count(*)` })
    .from(walletJournal)
    .where(inPeriod)
    // La misma comisión de contrato puede ser logística (courier) o trading (compraventa)
    .groupBy(refType, activity);

  // «PvP con naves» (decisión del usuario): reponer una nave perdida y llevarla cuesta PvP, no trading ni
  // logística. Las compras de reposición (emparejadas por shipLosses, también las de pérdidas de los 7 días
  // previos al período) salen del asiento del journal de cada compra (market_escrow para el comprador;
  // market_transaction en datos antiguos), y los movimientos de los couriers que llevaron naves perdidas
  // (recompensa y comisión, con el contrato como context_id) salen de logística
  const shipFlow = await shipLosses(days + REPLACEMENT_DAYS);
  const replacementSpend = shipFlow.spend.filter((s) => s.date >= from && (!characterId || s.characterId === characterId));
  // El asiento de una compra es el del journal del mismo piloto (el id puede repetirse en el del vendedor)
  const refIds = [...new Set(replacementSpend.map((s) => s.journalRefId).filter((id): id is number => id !== null))];
  const refOf = new Map(
    (refIds.length
      ? await db
          .select({ id: walletJournal.journalId, characterId: walletJournal.characterId, refType, activity })
          .from(walletJournal)
          .where(and(inPeriod, inArray(walletJournal.journalId, refIds)))
      : []
    ).map((r) => [`${r.id}|${r.characterId}`, r]),
  );
  // Lo que sale de cada fila (ref_type + actividad): una compra repartida entre dos pérdidas es un solo movimiento
  const fromRows = new Map<string, { amount: number; ids: Set<string> }>();
  for (const s of replacementSpend) {
    const r = s.journalRefId !== null ? refOf.get(`${s.journalRefId}|${s.characterId}`) : undefined;
    if (!r) continue;
    const key = `${r.refType}|${r.activity}`;
    const row = fromRows.get(key) ?? { amount: 0, ids: new Set<string>() };
    row.amount += s.amount;
    row.ids.add(`${s.journalRefId}|${s.characterId}`);
    fromRows.set(key, row);
  }
  const replacementTotal = [...fromRows.values()].reduce((n, r) => n + r.amount, 0);
  const replacementCount = [...fromRows.values()].reduce((n, r) => n + r.ids.size, 0);
  const transportRows = shipFlow.shipCouriers.length
    ? await db
        .select({ refType, activity, income, expenses, count: sql<number>`count(*)` })
        .from(walletJournal)
        .where(and(inPeriod, eq(walletJournal.contextIdType, 'contract_id'), inArray(walletJournal.contextId, shipFlow.shipCouriers)))
        .groupBy(refType, activity)
    : [];
  const moved = {
    replacement: replacementTotal,
    replacementCount,
    transport: withNet({
      income: transportRows.reduce((n, r) => n + r.income, 0),
      expenses: transportRows.reduce((n, r) => n + r.expenses, 0),
    }),
    transportCount: transportRows.reduce((n, r) => n + r.count, 0),
  };
  const shift = (a: string, r: { refType: string; activity: string; income: number; expenses: number; count: number }) => {
    let { income: inc, expenses: exp, count } = r;
    const repl = fromRows.get(`${r.refType}|${r.activity}`);
    if (repl && r.activity === a) {
      exp -= repl.amount;
      count -= repl.ids.size;
    }
    const t = transportRows.find((x) => x.refType === r.refType && x.activity === r.activity);
    if (t && r.activity === a) {
      inc -= t.income;
      exp -= t.expenses;
      count -= t.count;
    }
    return { refType: r.refType, income: inc, expenses: exp, count };
  };
  const shipRefTypes = [
    { refType: 'ship_replacement', income: 0, expenses: moved.replacement, count: moved.replacementCount },
    { refType: 'ship_transport', income: moved.transport.income, expenses: moved.transport.expenses, count: moved.transportCount },
  ].filter((r) => r.count > 0);

  const day = sql<string>`date(${walletJournal.date}, 'unixepoch')`;
  const accountsDay = sql<number>`coalesce(sum(case when ${activity} = 'accounts' then ${walletJournal.amount} end), 0)`;
  const dailyRows = await db.select({ day, income, expenses, accounts: accountsDay }).from(walletJournal).where(inPeriod).groupBy(day);

  // Serie diaria completa, con ceros en los días sin movimientos
  const dailyMap = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = Array.from({ length: days }, (_, i) => {
    const d = isoDay(new Date(from.getTime() + i * DAY_MS));
    // accounts: PLEX comprado (−) o vendido (+) ese día, ya incluido en ingresos/gastos: el gráfico lo señala
    return withNet({ date: d, income: dailyMap.get(d)?.income ?? 0, expenses: dailyMap.get(d)?.expenses ?? 0, accounts: dailyMap.get(d)?.accounts ?? 0 });
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
        internalReceived: internalByCharacter.get(c.id)?.received ?? 0,
        internalSent: internalByCharacter.get(c.id)?.sent ?? 0,
      });
    }),
  );
  perCharacter.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));

  return {
    period: { days, from, to: now },
    totals: totals as Totals,
    characterId: characterId ?? null,
    balance: perCharacter.filter((c) => !characterId || c.id === characterId).reduce((n, c) => n + (c.balance ?? 0), 0),
    internalTransfers: Math.max(internal.received, internal.sent),
    internalReceived: internal.received,
    internalSent: internal.sent,
    characters: perCharacter,
    // Por actividad, con brutos y detalle por ref_type; el neto del trading es su margen
    // Las compras de reposición y los couriers de naves perdidas ya están movidos a PvP (ship_replacement,
    // ship_transport); los brutos de cada actividad son la suma de sus ref_types
    byActivity: ACTIVITIES.map((a) => {
      const refTypes = [
        ...byRefType.filter((r) => r.activity === a).map((r) => shift(a, r)),
        ...(a === 'pvp' ? shipRefTypes : []),
      ]
        // Sin redondeo: una fila que queda en 0 (todas sus compras eran reposición) desaparece
        .filter((r) => r.count > 0 && (Math.abs(r.income) > 0.005 || Math.abs(r.expenses) > 0.005))
        .map(withNet)
        .sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
      return withNet({
        activity: a,
        income: refTypes.reduce((n, r) => n + r.income, 0),
        expenses: refTypes.reduce((n, r) => n + r.expenses, 0),
        count: refTypes.reduce((n, r) => n + r.count, 0),
        refTypes,
      });
    }).filter((a) => a.count > 0),
    // Lo movido a PvP por «PvP con naves» (para las notas de la web)
    shipFlow: { replacement: moved.replacement, transport: moved.transport.expenses - moved.transport.income },
    daily,
    today,
    previous: { ...previous, complete: previousComplete },
    coverage: { firstEntryAt, coveredDays },
    market: await marketReview(from, characterId),
    // PLEX / cuentas: aparte del resultado de juego (el neto de la actividad está en byActivity)
    accounts: await plexTraded(from, characterId),
  };
}
