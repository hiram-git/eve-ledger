import { and, asc, desc, eq, gte, inArray, lt, min, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, walletJournal, walletTransactions } from '../db/schema';
import { ACTIVITIES, activityOf, PLEX_TYPE_ID, refKindOf } from '../lib/activities';
import { REPLACEMENT_DAYS, shipLosses } from './losses';
import { marketReview } from './transactions';

const DAY_MS = 86_400_000;

// The market transaction of a journal entry (same pilot, journal_ref_id = journal_id): its
// counterparty (client_id) and its id, which both sides of a trade between your pilots share
const linkedTx = (col: string) =>
  sql.raw(
    `(select t.${col} from wallet_transactions t where t.character_id = wallet_journal.character_id and t.journal_ref_id = wallet_journal.journal_id limit 1)`,
  );
const txClient = linkedTx('client_id');
const txId = linkedTx('transaction_id');

// Transfers between my own characters: they cancel out in the consolidated view
// (one leaves a wallet and enters another), so they count as neither income nor expense.
// - Two DIFFERENT pilots as the parties: donations, contracts, trades and the seller's side of a trade.
// - A market purchase (market_escrow) carries the buyer itself as both parties: it is an expense unless its
//   transaction has another of your pilots as the counterparty (buying your alt's sell order), and for the
//   whole amount of that transaction (a buy order filled by several sellers is not cancelled out)
export const isInternal = sql<number>`(case
  when ${walletJournal.firstPartyId} in (select id from characters)
    and ${walletJournal.secondPartyId} in (select id from characters)
    and ${walletJournal.firstPartyId} <> ${walletJournal.secondPartyId} then 1
  when ${walletJournal.refType} = 'market_escrow' and exists (
    select 1 from wallet_transactions t
    where t.character_id = ${walletJournal.characterId} and t.journal_ref_id = ${walletJournal.journalId}
      and t.client_id in (select id from characters) and t.client_id <> ${walletJournal.characterId}
      and abs(t.quantity * t.unit_price + ${walletJournal.amount}) < 0.01
  ) then 1
  else 0 end)`;

const income = sql<number>`coalesce(sum(case when ${walletJournal.amount} > 0 then ${walletJournal.amount} end), 0)`;
const expenses = sql<number>`coalesce(sum(case when ${walletJournal.amount} < 0 then -${walletJournal.amount} end), 0)`;

export type Totals = { income: number; expenses: number; net: number };

// Movement type for the detail: ESI's ref_type, except sold escalations and buyback loot
const refKind = refKindOf(walletJournal.refType, walletJournal.amount, walletJournal.firstPartyId);
export const activity = activityOf(walletJournal.refType, walletJournal.contextId, refKind);

const withNet = <T extends { income: number; expenses: number }>(r: T): T & { net: number } => ({
  ...r,
  net: r.income - r.expenses,
});

// UTC date (EVE time) in YYYY-MM-DD format
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Income, expenses and net between two instants, without internal transfers. Gross: market purchases
// are expenses and sales income; the trading margin is only shown in byActivity
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

// Daily net of a pilot over the last `days` days, measured only over the days with data:
// from its first movement (if later than the start) up to its last sync. A pilot with a stuck
// sync counts at its rate up to that sync; with no sync, or no data in the window, returns null
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
  // Without PLEX: buying it IS paying for Omega, not the rate at which you pay for it
  const flow = await flowBetween(eq(walletJournal.characterId, characterId), from, to, true);
  // Less than a day of data: divide by a whole day so the rate is not inflated
  return flow.net / Math.max(1, span);
}

// PLEX bought and sold on the market in the period (without operations between your pilots)
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

// Optional characterId: the ledger of a single pilot. Transfers between your pilots do not count in
// any net (moving ISK is not earning it); the pilot list is always returned in full.
// Balance = the balance of the character's last synced movement
// Opening balance: the balance the pilot entered the period with (that of its last movement before
// `from`). If its history starts inside the period, the balance of its first movement minus that movement,
// and `partial` says so. Opening balance + wallet change = balance, except for movements ESI no longer returned
export async function openingBalance(characterId: number, from: Date) {
  const [before] = await db
    .select({ balance: walletJournal.balance, date: walletJournal.date })
    .from(walletJournal)
    .where(and(eq(walletJournal.characterId, characterId), lt(walletJournal.date, from)))
    .orderBy(desc(walletJournal.date), desc(walletJournal.journalId))
    .limit(1);
  if (before?.balance != null) return { balance: before.balance, at: before.date, partial: false };
  const [first] = await db
    .select({ balance: walletJournal.balance, amount: walletJournal.amount, date: walletJournal.date })
    .from(walletJournal)
    .where(and(eq(walletJournal.characterId, characterId), gte(walletJournal.date, from)))
    .orderBy(asc(walletJournal.date), asc(walletJournal.journalId))
    .limit(1);
  if (first?.balance != null) return { balance: first.balance - first.amount, at: first.date, partial: true };
  return { balance: null, at: null, partial: true };
}

// Current balance: the wallet balance ESI returns on each sync (the real one) and, if there is none yet, the balance of the last
// journal movement. journalBalance is always the journal's: the reconciliation adds up with it (opening balance +
// net + between your pilots), because the real wallet may include movements the journal does not return yet
export async function lastBalance(characterId: number) {
  const [last] = await db
    .select({ balance: walletJournal.balance, date: walletJournal.date })
    .from(walletJournal)
    .where(eq(walletJournal.characterId, characterId))
    .orderBy(desc(walletJournal.date), desc(walletJournal.journalId))
    .limit(1);
  const [wallet] = await db
    .select({ balance: characters.walletBalance, at: characters.walletAt })
    .from(characters)
    .where(eq(characters.id, characterId));
  const journalBalance = last?.balance ?? null;
  if (wallet?.balance != null && wallet.at) return { balance: wallet.balance, date: wallet.at, journalBalance };
  return last ? { balance: journalBalance, date: last.date, journalBalance } : undefined;
}

export async function getSummary(days: number, characterId?: number) {
  const now = new Date();
  // From the start of the UTC day, so the first day of the series is complete
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

  // «Hoy» (Today) = current EVE day (since 00:00 UTC) and the previous period of equal length
  const today = await flowBetween(pilot, todayStart);
  const previousFrom = new Date(from.getTime() - days * DAY_MS);
  const previous = await flowBetween(pilot, previousFrom, from);

  // Coverage: history starts with the first stored movement, not with the requested period
  const [first] = await db.select({ at: min(walletJournal.date) }).from(walletJournal).where(pilot);
  const firstEntryAt = first?.at ?? null;
  const coveredDays = !firstEntryAt
    ? 0
    : firstEntryAt <= from
      ? days
      : Math.floor((todayStart.getTime() - Date.UTC(firstEntryAt.getUTCFullYear(), firstEntryAt.getUTCMonth(), firstEntryAt.getUTCDate())) / DAY_MS) + 1;
  // The previous period is only comparable if history covers it entirely
  const previousComplete = !!firstEntryAt && firstEntryAt <= previousFrom;

  // Moved between your pilots in the period: who sent and who received each
  // transfer. ESI gives both sides the same id and one is enough to know (the sign says who pays; the other
  // party is the other pilot), so it also adds up with movements from before the journal stored both
  // sides (migration 0007). They count in no net (user's decision: a pilot's net is what was earned in
  // game; moving ISK is not earning it). Kept apart for the reconciliation: opening balance + net + between your pilots = balance
  const internalRows = await db
    .select({
      journalId: walletJournal.journalId,
      characterId: walletJournal.characterId,
      amount: walletJournal.amount,
      date: walletJournal.date,
      firstPartyId: walletJournal.firstPartyId,
      secondPartyId: walletJournal.secondPartyId,
      txClient: sql<number | null>`${txClient}`,
      txId: sql<number | null>`${txId}`,
    })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), eq(isInternal, 1)));
  // One transfer per key: the transaction id in a market trade (the buyer's escrow
  // and the seller's market_transaction have different journal ids), the journal id otherwise
  const transfers = new Map<string, { from: number; to: number; amount: number; date: Date }>();
  for (const r of internalRows) {
    const key = r.txId !== null ? `tx${r.txId}` : `j${r.journalId}`;
    if (transfers.has(key) || !r.amount) continue;
    // The other party: the one that is not this pilot; in the buyer's escrow (him on both sides), the transaction's client
    const other =
      r.firstPartyId !== r.characterId ? r.firstPartyId! : r.secondPartyId !== r.characterId ? r.secondPartyId! : r.txClient!;
    const [sender, receiver] = r.amount < 0 ? [r.characterId, other] : [other, r.characterId];
    transfers.set(key, { from: sender, to: receiver, amount: Math.abs(r.amount), date: r.date });
  }
  // Received and sent by a pilot (or moved among all) between two instants
  const internalBetween = (id: number | undefined, a: Date, b?: Date) => {
    let received = 0;
    let sent = 0;
    for (const t of transfers.values()) {
      if (t.date < a || (b && t.date >= b)) continue;
      if (id === undefined) received += t.amount;
      else {
        if (t.to === id) received += t.amount;
        if (t.from === id) sent += t.amount;
      }
    }
    return id === undefined ? { received, sent: received } : { received, sent };
  };
  const internal = internalBetween(characterId, from);
  const internalByCharacter = new Map<number, { received: number; sent: number }>();
  for (const t of transfers.values()) {
    if (t.date < from) continue;
    const s = internalByCharacter.get(t.from) ?? { received: 0, sent: 0 };
    s.sent += t.amount;
    internalByCharacter.set(t.from, s);
    const r = internalByCharacter.get(t.to) ?? { received: 0, sent: 0 };
    r.received += t.amount;
    internalByCharacter.set(t.to, r);
  }
  // Single-pilot view: what was moved with your other pilots each day (for the chart; not in the day's net)
  const internalDay = new Map<string, number>();
  if (characterId) {
    for (const x of transfers.values()) {
      if (x.date < from) continue;
      const d = isoDay(x.date);
      const signed = (x.to === characterId ? x.amount : 0) - (x.from === characterId ? x.amount : 0);
      if (signed) internalDay.set(d, (internalDay.get(d) ?? 0) + signed);
    }
  }

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
    // The same contract fee can be logistics (courier) or trading (item exchange)
    .groupBy(refType, activity);

  // «PvP con naves» (PvP with ships, user's decision): replacing a lost ship and hauling it costs PvP, not trading or
  // logistics. Replacement purchases (matched by shipLosses, including those for losses in the 7 days
  // before the period) come out of each purchase's journal entry (market_escrow for the buyer;
  // market_transaction in old data), and the movements of couriers that carried lost ships
  // (reward and fee, with the contract as context_id) come out of logistics
  const shipFlow = await shipLosses(days + REPLACEMENT_DAYS);
  const replacementSpend = shipFlow.spend.filter((s) => s.date >= from && (!characterId || s.characterId === characterId));
  // A purchase's entry is the journal entry of the same pilot (the id may repeat in the seller's)
  const refIds = [...new Set(replacementSpend.map((s) => s.journalRefId).filter((id): id is number => id !== null))];
  const refOf = new Map(
    (refIds.length
      ? await db
          .select({ id: walletJournal.journalId, characterId: walletJournal.characterId, amount: walletJournal.amount, refType, activity })
          .from(walletJournal)
          .where(and(inPeriod, inArray(walletJournal.journalId, refIds)))
      : []
    ).map((r) => [`${r.id}|${r.characterId}`, r]),
  );
  // What leaves each row (ref_type + activity). A purchase split between two losses is a single movement,
  // and one that only partly replaces (two Rifters, one for the loss) stays in its row with what is not replacement:
  // the row's counter only loses the entries that move entirely to PvP
  const used = new Map<string, number>();
  const fromRows = new Map<string, { amount: number; ids: Set<string>; whole: number }>();
  for (const s of replacementSpend) {
    const id = `${s.journalRefId}|${s.characterId}`;
    const r = s.journalRefId !== null ? refOf.get(id) : undefined;
    if (!r) continue;
    const key = `${r.refType}|${r.activity}`;
    const row = fromRows.get(key) ?? { amount: 0, ids: new Set<string>(), whole: 0 };
    row.amount += s.amount;
    row.ids.add(id);
    fromRows.set(key, row);
    used.set(id, (used.get(id) ?? 0) + s.amount);
  }
  for (const [id, amount] of used) {
    const r = refOf.get(id)!;
    if (amount >= Math.abs(r.amount) - 0.01) fromRows.get(`${r.refType}|${r.activity}`)!.whole += 1;
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
      count -= repl.whole;
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

  // Full daily series, with zeros on days without movements
  const dailyMap = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = Array.from({ length: days }, (_, i) => {
    const d = isoDay(new Date(from.getTime() + i * DAY_MS));
    // accounts: PLEX bought (−) or sold (+) that day, already included in income/expenses: the chart marks it
    const row = withNet({ date: d, income: dailyMap.get(d)?.income ?? 0, expenses: dailyMap.get(d)?.expenses ?? 0, accounts: dailyMap.get(d)?.accounts ?? 0 });
    // internal: in single-pilot view, what was moved with your other pilots that day (apart from the net)
    return { ...row, internal: internalDay.get(d) ?? 0 };
  });

  // Balance = the ESI wallet balance at the last sync (or the balance of the last movement, if there is none yet)
  const chars = await db.select({ id: characters.id, name: characters.name, lastSyncAt: characters.lastSyncAt }).from(characters);
  const charMap = new Map(byCharacter.map((r) => [r.characterId, r]));
  const perCharacter = await Promise.all(
    chars.map(async (c) => {
      const last = await lastBalance(c.id);
      const opening = await openingBalance(c.id, from);
      const agg = charMap.get(c.id);
      const internalReceived = internalByCharacter.get(c.id)?.received ?? 0;
      const internalSent = internalByCharacter.get(c.id)?.sent ?? 0;
      const income = agg?.income ?? 0;
      const expenses = agg?.expenses ?? 0;
      return {
        id: c.id,
        name: c.name,
        lastSyncAt: c.lastSyncAt,
        balance: last?.balance ?? null,
        balanceAt: last?.date ?? null,
        journalBalance: last?.journalBalance ?? null,
        openingBalance: opening.balance,
        openingAt: opening.at,
        openingPartial: opening.partial,
        income,
        expenses,
        internalReceived,
        internalSent,
        // A pilot's net is what was earned in game (user's decision): the sum of the pilots is the consolidated total.
        // What changed its wallet also adds what was moved with your other pilots (opening balance + walletChange = balance)
        net: income - expenses,
        walletChange: income - expenses + internalReceived - internalSent,
      };
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
    // By activity, with gross amounts and detail per ref_type; trading's net is its margin
    // Replacement purchases and couriers of lost ships are already moved to PvP (ship_replacement,
    // ship_transport); each activity's gross amounts are the sum of its ref_types
    byActivity: ACTIVITIES.map((a) => {
      const refTypes = [
        ...byRefType.filter((r) => r.activity === a).map((r) => shift(a, r)),
        ...(a === 'pvp' ? shipRefTypes : []),
      ]
        // No rounding: a row left at 0 (all its purchases were replacements) disappears; while it still has
        // money it stays, so the sum of the activities is always the total
        .filter((r) => Math.abs(r.income) > 0.005 || Math.abs(r.expenses) > 0.005)
        .map((r) => ({ ...r, count: Math.max(r.count, 1) }))
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
    // What «PvP con naves» moved to PvP (for the web's notes)
    shipFlow: { replacement: moved.replacement, transport: moved.transport.expenses - moved.transport.income },
    daily,
    today,
    previous: { ...previous, complete: previousComplete },
    coverage: { firstEntryAt, coveredDays },
    market: await marketReview(from, characterId),
    // PLEX / accounts: apart from the game result (the activity's net is in byActivity)
    accounts: await plexTraded(from, characterId),
  };
}
