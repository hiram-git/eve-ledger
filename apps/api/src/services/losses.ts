import { and, asc, eq, gte, inArray, lt, min, sql } from 'drizzle-orm';
import { db, rawDb } from '../db/client';
import {
  characters,
  killmails,
  marketPrices,
  names,
  systems,
  types,
  walletJournal,
  walletTransactions,
  type KillmailItem,
} from '../db/schema';
import { EsiError, esiGet } from '../lib/esi';
import { CONTRACTS_SCOPE, courierContracts } from './contracts';

export const LOSSES_SCOPE = 'esi-killmails.read_killmails.v1';

// GET /characters/{id}/killmails/recent: kills and losses from the last ~90 days (id + hash only)
type EsiKillmailRef = { killmail_id: number; killmail_hash: string };
// GET /killmails/{id}/{hash}: public and immutable
type EsiItem = {
  item_type_id: number;
  flag: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
  singleton: number; // 2 = blueprint copy
  items?: EsiItem[];
};
type EsiKillmail = {
  killmail_id: number;
  killmail_time: string;
  solar_system_id: number;
  victim: { character_id?: number; ship_type_id: number; items?: EsiItem[] };
  attackers: unknown[];
};

const DAY_MS = 86_400_000;
// New details per sync: the rest arrive in the next one (no need to burn the ESI limit all at once)
const MAX_NEW = 100;
const CHUNK = 500;
// Insurance pays out the moment the ship is lost; leave some slack in case ESI dates it a few minutes later
const INSURANCE_WINDOW_MS = 60 * 60_000;
// Purchases of the same hull and fit in the days after the loss: what it cost to replace it
export const REPLACEMENT_DAYS = 7;

// Cargo containers carry their items nested: they are flattened with the container's flag
function flatten(items: EsiItem[] = [], out: KillmailItem[] = [], parentFlag?: number): KillmailItem[] {
  for (const i of items) {
    const flag = parentFlag ?? i.flag;
    const destroyed = i.quantity_destroyed ?? 0;
    const dropped = i.quantity_dropped ?? 0;
    if (destroyed || dropped) out.push({ typeId: i.item_type_id, destroyed, dropped, flag, ...(i.singleton === 2 ? { copy: true } : {}) });
    flatten(i.items, out, flag);
  }
  return out;
}

// Flags of what is fitted to the ship: low/mid/high slots (11–34), drone bay (87), rigs (92–99),
// subsystems (125–132) and fighters (158–163). Everything else (cargo hold, special holds, hangars) is cargo
const FITTED_FLAGS: [number, number][] = [
  [11, 34],
  [87, 87],
  [92, 99],
  [125, 132],
  [158, 163],
];
// No flag (killmail not yet completed, or −1 if ESI didn't give it) counts as fit, as before
export const isCargo = (i: KillmailItem) =>
  i.flag !== undefined && i.flag >= 0 && !FITTED_FLAGS.some(([lo, hi]) => i.flag! >= lo && i.flag! <= hi);
// Killmails stored before the flag was requested: re-fetched (they're public and immutable), at most this many per sync
const MAX_BACKFILL = 50;

export async function fetchLosses(characterId: number, r: { pages: number; fetched: number; inserted: number }) {
  const refs: EsiKillmailRef[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const { data, headers } = await esiGet<EsiKillmailRef[]>(
      `/characters/${characterId}/killmails/recent?page=${page}`,
      characterId,
    );
    if (page === 1) totalPages = Number(headers.get('x-pages') ?? 1) || 1;
    refs.push(...data);
    r.pages = page;
  }
  r.fetched = refs.length;

  // Killmails don't change: only fetch the ones not stored yet
  const known = new Set<number>();
  const ids = refs.map((k) => k.killmail_id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = await db
      .select({ id: killmails.killmailId })
      .from(killmails)
      .where(inArray(killmails.killmailId, ids.slice(i, i + CHUNK)));
    for (const row of rows) known.add(row.id);
  }

  for (const k of refs.filter((k) => !known.has(k.killmail_id)).slice(0, MAX_NEW)) {
    const { data } = await esiGet<EsiKillmail>(`/killmails/${k.killmail_id}/${k.killmail_hash}`);
    r.inserted += db
      .insert(killmails)
      .values({
        killmailId: data.killmail_id,
        hash: k.killmail_hash,
        characterId,
        time: new Date(data.killmail_time),
        solarSystemId: data.solar_system_id,
        victimCharacterId: data.victim.character_id ?? null,
        shipTypeId: data.victim.ship_type_id,
        items: flatten(data.victim.items),
        attackers: data.attackers.length,
      })
      .onConflictDoNothing()
      .returning({ id: killmails.killmailId })
      .all().length;
  }

  // Those stored without a flag (before fit and cargo were told apart): fill them in
  const incomplete = (await db.select({ id: killmails.killmailId, hash: killmails.hash, items: killmails.items }).from(killmails))
    .filter((k) => k.items.some((i) => i.flag === undefined))
    .slice(0, MAX_BACKFILL);
  for (const k of incomplete) {
    try {
      const { data } = await esiGet<EsiKillmail>(`/killmails/${k.id}/${k.hash}`);
      await db.update(killmails).set({ items: flatten(data.victim.items) }).where(eq(killmails.killmailId, k.id));
    } catch (err) {
      // A killmail ESI no longer serves must not stop the sync or be requested again: flag −1 (counts as fit)
      if (!(err instanceof EsiError) || err.status >= 500) throw err;
      await db
        .update(killmails)
        .set({ items: k.items.map((i) => ({ ...i, flag: i.flag ?? -1 })) })
        .where(eq(killmails.killmailId, k.id));
    }
  }
}

// Allocating purchases, insurance and couriers across ALL stored losses: the expensive part of shipLosses. It doesn't
// depend on the period or the view, and the Summary, «Naves perdidas» and Indicadores ask for it several times per
// page: it is cached until the database changes (the connection's total_changes(): every write goes through it,
// including restoring a backup) or a minute passes (the «pendiente» state depends on the time)
let cached: { key: string; value: Promise<Awaited<ReturnType<typeof computeLosses>>> } | null = null;

function allLosses(now: Date) {
  const changes = (rawDb().query('select total_changes() as n').get() as { n: number }).n;
  const key = `${changes}|${Math.floor(now.getTime() / 60_000)}`;
  if (cached?.key !== key) {
    const value = computeLosses(now).catch((err) => {
      if (cached?.value === value) cached = null;
      throw err;
    });
    cached = { key, value };
  }
  return cached.value;
}

async function computeLosses(now: Date) {
  const pilots = await db.select({ id: characters.id, name: characters.name, scopes: characters.scopes }).from(characters);
  const linked = new Set(pilots.map((p) => p.id));
  const linkedIds = [...linked];
  const nameOf = new Map(pilots.map((p) => [p.id, p.name]));

  // All stored losses of your pilots (not just those in the view or the period): purchases and couriers are
  // allocated across losses in order, so a loss's state can't depend on the period being viewed (with «30 días» a
  // purchase went to the loss from 29 days ago; with «37», to the one from 31 days ago). A pilot's view also needs
  // to know what they paid for the others' ships. The period is applied at the end
  const rows = pilots.length
    ? await db
        .select({
          killmailId: killmails.killmailId,
          time: killmails.time,
          characterId: killmails.victimCharacterId,
          shipTypeId: killmails.shipTypeId,
          ship: names.name,
          systemId: killmails.solarSystemId,
          items: killmails.items,
          attackers: killmails.attackers,
        })
        .from(killmails)
        .leftJoin(names, eq(names.id, killmails.shipTypeId))
        .where(inArray(killmails.victimCharacterId, linkedIds))
        .orderBy(asc(killmails.time))
    : [];

  // Systems: name and security from the map cache; if missing, the name from /universe/names
  const systemIds = [...new Set(rows.map((r) => r.systemId))];
  const systemRows = systemIds.length
    ? await db.select({ id: systems.id, name: systems.name, security: systems.security }).from(systems).where(inArray(systems.id, systemIds))
    : [];
  const systemNameRows = systemIds.length
    ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, systemIds))
    : [];
  const systemById = new Map(systemRows.map((s) => [s.id, s]));
  const systemName = new Map(systemNameRows.map((s) => [s.id, s.name]));

  // ESI average prices for hull and fit
  const typeIds = [...new Set(rows.flatMap((r) => [r.shipTypeId, ...r.items.map((i) => i.typeId)]))];
  const priceRows = typeIds.length
    ? await db
        .select({ typeId: marketPrices.typeId, price: sql<number | null>`coalesce(${marketPrices.averagePrice}, ${marketPrices.adjustedPrice})` })
        .from(marketPrices)
        .where(inArray(marketPrices.typeId, typeIds))
    : [];
  const price = new Map(priceRows.filter((p) => p.price !== null).map((p) => [p.typeId, p.price!]));
  const unpriced = new Set<number>();
  const valueOf = (typeId: number, qty: number, copy = false) => {
    if (copy) return 0;
    const p = price.get(typeId);
    if (p === undefined) unpriced.add(typeId);
    return (p ?? 0) * qty;
  };

  // Market group of what was lost: a module from the same group (Republic Fleet instead of Domination) also
  // replaces the fit. Types are resolved during sync (types table); with no known group, only the same type
  const lostTypes = typeIds.length
    ? await db.select({ typeId: types.typeId, marketGroupId: types.marketGroupId }).from(types).where(inArray(types.typeId, typeIds))
    : [];
  const groupOf = new Map<number, number>();
  for (const t of lostTypes) if (t.marketGroupId !== null) groupOf.set(t.typeId, t.marketGroupId);
  const lostGroups = [...new Set(groupOf.values())];
  const substituteTypes = lostGroups.length
    ? await db.select({ typeId: types.typeId, marketGroupId: types.marketGroupId }).from(types).where(inArray(types.marketGroupId, lostGroups))
    : [];
  for (const t of substituteTypes) groupOf.set(t.typeId, t.marketGroupId!);
  const candidateTypes = [...new Set([...typeIds, ...substituteTypes.map((t) => t.typeId)])];

  // Since when there is history: an earlier loss couldn't have been matched with any purchase
  const [firstEntry] = await db.select({ at: min(walletJournal.date) }).from(walletJournal);
  const historyFrom = firstEntry?.at ?? null;

  const victims = [...new Set(rows.map((r) => r.characterId!))];
  const firstLoss = rows[0]?.time;
  const lastLoss = rows.at(-1)?.time;

  // Insurance payouts (positive insurance ref_type) of the pilots who lost ships: each one is used once
  const payouts = victims.length
    ? await db
        .select({ id: walletJournal.journalId, characterId: walletJournal.characterId, date: walletJournal.date, amount: walletJournal.amount, contextId: walletJournal.contextId, contextIdType: walletJournal.contextIdType })
        .from(walletJournal)
        .where(
          and(
            eq(walletJournal.refType, 'insurance'),
            sql`${walletJournal.amount} > 0`,
            inArray(walletJournal.characterId, victims),
            gte(walletJournal.date, firstLoss!),
            lt(walletJournal.date, new Date(lastLoss!.getTime() + INSURANCE_WINDOW_MS)),
          ),
        )
        .orderBy(asc(walletJournal.date))
    : [];
  const usedPayouts = new Set<number>();

  // Market purchases by any of your pilots after the losses (excluding trades between your pilots)
  const purchases = rows.length
    ? (
        await db
          .select({
            id: walletTransactions.transactionId,
            journalRefId: walletTransactions.journalRefId,
            characterId: walletTransactions.characterId,
            date: walletTransactions.date,
            typeId: walletTransactions.typeId,
            quantity: walletTransactions.quantity,
            unitPrice: walletTransactions.unitPrice,
            clientId: walletTransactions.clientId,
            locationId: walletTransactions.locationId,
            location: names.name,
          })
          .from(walletTransactions)
          .leftJoin(names, eq(names.id, walletTransactions.locationId))
          .where(
            and(
              eq(walletTransactions.isBuy, true),
              inArray(walletTransactions.characterId, linkedIds),
              gte(walletTransactions.date, firstLoss!),
              inArray(walletTransactions.typeId, candidateTypes),
            ),
          )
          .orderBy(asc(walletTransactions.date))
      ).filter((t) => !t.clientId || !linked.has(t.clientId))
    : [];
  // Quantity still unused of each purchase (by its position in `purchases`, which is sorted by date)
  const qtyLeft = purchases.map((t) => t.quantity);
  const purchaseTimes = purchases.map((t) => t.date.getTime());
  // First purchase with date >= t (binary search: with a year of purchases, scanning them all for every loss
  // cost half a second per page)
  const firstPurchaseFrom = (t: number) => {
    let lo = 0;
    let hi = purchaseTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (purchaseTimes[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  // Your pilots' couriers after the losses (cancelled or deleted ones refund the reward) and their fees
  const couriers = rows.length
    ? (await courierContracts(linkedIds, firstLoss!)).filter((c) => !['deleted', 'cancelled', 'reversed', 'rejected'].includes(c.status))
    : [];
  const feeRows = couriers.length
    ? await db
        .select({ contractId: walletJournal.contextId, fee: sql<number>`sum(-${walletJournal.amount})` })
        .from(walletJournal)
        .where(
          and(
            eq(walletJournal.refType, 'contract_brokers_fee'),
            inArray(
              walletJournal.contextId,
              couriers.map((c) => c.contractId),
            ),
          ),
        )
        .groupBy(walletJournal.contextId)
    : [];
  const feeOf = new Map(feeRows.map((f) => [f.contractId, f.fee]));
  const usedCouriers = new Set<number>();
  // Replacement purchases by payer and date: the summary counts them as PvP («PvP con naves»)
  const spend: { transactionId: number; journalRefId: number | null; characterId: number; date: Date; amount: number }[] = [];

  const losses = rows.map((r) => {
    const victim = r.characterId!;
    const at = r.time.getTime();
    const windowEndsAt = new Date(at + REPLACEMENT_DAYS * DAY_MS);
    const inWindow = (d: Date) => d.getTime() >= at && d.getTime() <= windowEndsAt.getTime();
    const shipValue = valueOf(r.shipTypeId, 1);
    // Fit (fitted modules and drones) and cargo (holds and hangars), at the average price
    const fitItems = r.items.filter((i) => !i.copy && !isCargo(i));
    const cargoItems = r.items.filter((i) => !i.copy && isCargo(i));
    const fitValue = fitItems.reduce((v, i) => v + valueOf(i.typeId, i.destroyed + i.dropped), 0);
    const cargoValue = cargoItems.reduce((v, i) => v + valueOf(i.typeId, i.destroyed + i.dropped), 0);
    const value = shipValue + fitValue + cargoValue;

    // This ship's insurance payout: the pilot's first one after the loss (if ESI says which type, that type)
    const payout = payouts.find(
      (j) =>
        !usedPayouts.has(j.id) &&
        j.characterId === victim &&
        j.date.getTime() >= at &&
        j.date.getTime() - at <= INSURANCE_WINDOW_MS &&
        (j.contextIdType !== 'type_id' || j.contextId === r.shipTypeId),
    );
    if (payout) usedPayouts.add(payout.id);

    // Replacement: hull, fit and cargo bought by any of your pilots within the window, up to the quantities
    // lost. Same type first; then, for the fit, a module from the same market group
    const needOf = (items: KillmailItem[]) => {
      const m = new Map<number, number>();
      for (const i of items) m.set(i.typeId, (m.get(i.typeId) ?? 0) + i.destroyed + i.dropped);
      return m;
    };
    const fitNeed = needOf(fitItems);
    const cargoNeed = needOf(cargoItems);
    let hullNeed = 1;
    const lost = new Set([r.shipTypeId, ...fitNeed.keys(), ...cargoNeed.keys()]);
    let replacement = 0;
    let substitutes = 0;
    let hull: (typeof purchases)[number] | undefined;
    const buyers = new Map<number, number>(); // pilot → ISK spent on replacement
    const take = (i: number, qty: number) => {
      const t = purchases[i];
      qtyLeft[i] -= qty;
      replacement += qty * t.unitPrice;
      buyers.set(t.characterId, (buyers.get(t.characterId) ?? 0) + qty * t.unitPrice);
      spend.push({ transactionId: t.id, journalRefId: t.journalRefId, characterId: t.characterId, date: t.date, amount: qty * t.unitPrice });
    };
    // Purchases within the window: positions [start, end) of `purchases`
    const start = firstPurchaseFrom(at);
    let end = start;
    while (end < purchases.length && purchaseTimes[end] <= windowEndsAt.getTime()) end++;
    for (let i = start; i < end; i++) {
      const t = purchases[i];
      if (hullNeed && t.typeId === r.shipTypeId && qtyLeft[i] > 0) {
        take(i, 1);
        hullNeed = 0;
        hull ??= t;
      }
      for (const need of [fitNeed, cargoNeed]) {
        const left = qtyLeft[i];
        const want = need.get(t.typeId) ?? 0;
        if (left <= 0 || !want) continue;
        const qty = Math.min(left, want);
        take(i, qty);
        need.set(t.typeId, want - qty);
      }
    }
    // Missing fit, by market group: a purchase only looks at the types in its group
    const missingByGroup = new Map<number, number[]>();
    for (const [typeId, want] of fitNeed) {
      const group = groupOf.get(typeId);
      if (!want || group === undefined) continue;
      missingByGroup.set(group, [...(missingByGroup.get(group) ?? []), typeId]);
    }
    for (let i = start; i < end && missingByGroup.size; i++) {
      const t = purchases[i];
      const group = groupOf.get(t.typeId);
      if (group === undefined || t.typeId === r.shipTypeId) continue;
      for (const typeId of missingByGroup.get(group) ?? []) {
        const want = fitNeed.get(typeId) ?? 0;
        const left = qtyLeft[i];
        if (left <= 0 || !want || typeId === t.typeId) continue;
        const qty = Math.min(left, want);
        take(i, qty);
        fitNeed.set(typeId, want - qty);
        substitutes += qty;
      }
    }
    // Who replaced it: whoever bought the hull; if only fit was bought, whoever spent the most
    const buyerId = hull?.characterId ?? [...buyers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    // Transport: the first courier in the window carrying this hull (or, failing that, part of the lost fit)
    const carries = (c: (typeof couriers)[number], types: (id: number) => boolean) => (c.items ?? []).some((i) => types(i.typeId));
    const courier =
      couriers.find((c) => !usedCouriers.has(c.contractId) && inWindow(c.dateIssued) && carries(c, (id) => id === r.shipTypeId)) ??
      couriers.find((c) => !usedCouriers.has(c.contractId) && inWindow(c.dateIssued) && carries(c, (id) => lost.has(id)));
    if (courier) usedCouriers.add(courier.contractId);
    const transport = courier ? (courier.reward ?? 0) + (feeOf.get(courier.contractId) ?? 0) : 0;

    const system = systemById.get(r.systemId);
    const insurance = payout?.amount ?? 0;
    // What is still to be replaced, at the ESI average price, by part. Counts as replaced if less than 2 % of what
    // was lost is missing (ammo, loose drones…): «por reponer» must not stay open over a load of ammo
    const missingOf = (need: Map<number, number>) =>
      [...need.entries()].reduce((v, [typeId, qty]) => v + (qty > 0 ? (price.get(typeId) ?? 0) * qty : 0), 0);
    const missHull = hullNeed ? (price.get(r.shipTypeId) ?? 0) : 0;
    const missFit = missingOf(fitNeed);
    const missCargo = missingOf(cargoNeed);
    const significant = missHull + missFit + missCargo > 0.02 * value;
    // No history: the loss predates the first stored entry; whether anything missing was replaced is unknown
    const noHistory = !historyFrom || r.time < historyFrom;
    // A loss under 1 M (capsule, rookie ship) isn't expected to be replaced: it doesn't stay open
    const trivial = value < 1_000_000;
    const state: 'replaced' | 'pending' | 'unreplaced' | 'nohistory' = !significant
      ? 'replaced'
      : noHistory
        ? 'nohistory'
        : now < windowEndsAt && !trivial
          ? 'pending'
          : 'unreplaced';
    const toReplace = significant && state !== 'nohistory' ? missHull + missFit + missCargo : 0;
    // Who paid what: the victim receives the insurance; each buyer pays their replacement; the courier's issuer, the transport
    const replacementBy: Record<number, number> = Object.fromEntries(buyers);
    return {
      killmailId: r.killmailId,
      time: r.time,
      characterId: victim,
      pilot: nameOf.get(victim) ?? null,
      shipTypeId: r.shipTypeId,
      ship: r.ship,
      systemId: r.systemId,
      system: system?.name ?? systemName.get(r.systemId) ?? null,
      security: system?.security ?? null,
      attackers: r.attackers,
      shipValue,
      fitValue,
      cargoValue,
      value,
      insurance,
      replacement,
      transport,
      // Insurance − replacement − transport, whichever pilot pays (what the ship moved in your wallets)
      walletEffect: insurance - replacement - transport,
      // What losing it cost you: the wallet part plus what didn't come back (or is still to be replaced, at the average price)
      cost: insurance - replacement - transport - toReplace,
      windowEndsAt,
      // replaced: replaced (or nearly); pending: something is missing and the window is still open (the figure is «hasta ahora»);
      // unreplaced: the window closed without replacing everything (toReplace = what didn't come back, at the average price);
      // nohistory: predates the first stored entry (what's missing doesn't count: it's unknown)
      state,
      open: state === 'pending',
      toReplace,
      // What the missing part is (at the average price): hull, fit (fitted modules and drones) and cargo
      missing: significant ? { hull: missHull, fit: missFit, cargo: missCargo } : { hull: 0, fit: 0, cargo: 0 },
      // Fit units replaced with an equivalent module (same market group)
      substitutes,
      trivial,
      replacementBy,
      transportBy: courier?.issuerId ?? null,
      replacedBy: buyerId ? { id: buyerId, name: nameOf.get(buyerId) ?? null } : null,
      shipReplacedAt: hull?.date ?? null,
      // «Jita» from «Jita IV - Moon 4 - Caldari Navy Assembly Plant»
      replacedIn: hull?.location ? hull.location.split(' - ')[0].replace(/\s+[IVXLC]+$/, '') : null,
      courier: courier ? { contractId: courier.contractId, by: nameOf.get(courier.issuerId) ?? null, at: courier.dateIssued } : null,
    };
  });

  return { pilots, nameOf, rows, losses, unpriced, historyFrom, spend, usedCouriers };
}

// Ships lost in the last `days` days and how they affect the wallet. The ship was paid for when bought (a trading
// expense); losing it doesn't move the wallet. What does move it, per loss:
// - the insurance that pays it out (+, in the wallet of whoever lost it);
// - the replacement (−): lost hull and fit bought on the market by ANY of your pilots in the following
//   days (e.g. a shopping alt in Jita), excluding trades between your pilots;
// - the transport (−): the courier issued by any of your pilots carrying that hull or that fit
//   (reward + fee; the contracts scope is needed to know what it carries).
// Donations, contracts and trades between your pilots to move it don't count: they sum to zero.
// Insurance premiums for the period are kept separate: they also pay for ships you're still flying.
// All of this is already in the summary's net (insurance in PvP, purchases in trading, courier in logistics): this explains it.
// Value lost: hull + fit (destroyed and dropped) at the ESI average price, like the inventory
export async function shipLosses(days: number, characterId?: number) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);

  const { pilots, nameOf, rows, losses, unpriced, historyFrom, spend, usedCouriers } = await allLosses(now);
  const inView = pilots.filter((p) => !characterId || p.id === characterId);
  const lacks = (scope: string) => (p: (typeof pilots)[number]) => !p.scopes.split(' ').includes(scope);
  // Pilots in this view who can't read their killmails (linked before the scope was requested)
  const missingScope = inView.filter(lacks(LOSSES_SCOPE)).map(({ id, name }) => ({ id, name }));
  // Any of your pilots can issue the courier: without the contracts scope, their transport isn't visible
  const missingContracts = pilots.filter(lacks(CONTRACTS_SCOPE)).map(({ id, name }) => ({ id, name }));


  // Insurance premiums paid in the period: separate, because they also insure ships you're still flying
  const [prem] = await db
    .select({ total: sql<number>`coalesce(sum(-${walletJournal.amount}), 0)` })
    .from(walletJournal)
    .where(
      and(
        eq(walletJournal.refType, 'insurance'),
        sql`${walletJournal.amount} < 0`,
        gte(walletJournal.date, from),
        characterId ? eq(walletJournal.characterId, characterId) : undefined,
      ),
    );

  // The view: its pilots' losses. The figures tell the story of THEIR ships, whoever pays:
  // what they cost you = insurance − replacement − transport − what didn't come back − what's still to replace (estimated).
  // In a pilot's view, HIS wallet flow from losses is also shown separately (ownWallet): his ships' insurance
  // and what he paid (also for your other pilots' ships); who paid for his, in paidByOthers
  type Row = (typeof losses)[number];
  const inPeriod = losses.filter((l) => l.time >= from);
  const view = inPeriod.filter((l) => !characterId || l.characterId === characterId);
  const sum = (rows: Row[], f: (l: Row) => number) => rows.reduce((n, l) => n + f(l), 0);
  // What a pilot paid for a loss (replacement + courier)
  const paidBy = (l: Row, id: number) => (l.replacementBy[id] ?? 0) + (l.transportBy === id ? l.transport : 0);
  const forOthers = characterId
    ? inPeriod
        .filter((l) => l.characterId !== characterId && paidBy(l, characterId) > 0)
        .map((l) => ({ killmailId: l.killmailId, ship: l.ship, pilot: l.pilot, amount: paidBy(l, characterId) }))
    : [];
  const byOthers = new Map<number, number>();
  if (characterId)
    for (const l of view)
      for (const id of new Set([...Object.keys(l.replacementBy).map(Number), ...(l.transportBy ? [l.transportBy] : [])]))
        if (id !== characterId) byOthers.set(id, (byOthers.get(id) ?? 0) + paidBy(l, id));

  const insurance = sum(view, (l) => l.insurance);
  const replacement = sum(view, (l) => l.replacement);
  const transport = sum(view, (l) => l.transport);
  const toReplace = sum(view, (l) => (l.state === 'pending' ? l.toReplace : 0));
  const unreplaced = sum(view, (l) => (l.state === 'unreplaced' ? l.toReplace : 0));
  const forOthersTotal = forOthers.reduce((n, f) => n + f.amount, 0);
  const ownWallet = characterId
    ? (() => {
        const rep = sum(view, (l) => l.replacementBy[characterId] ?? 0);
        const tr = sum(view, (l) => (l.transportBy === characterId ? l.transport : 0));
        return { insurance, replacement: rep, transport: tr, forOthers: forOthersTotal, total: insurance - rep - tr - forOthersTotal };
      })()
    : null;
  return {
    period: { days, from },
    replacementDays: REPLACEMENT_DAYS,
    // Pilots in the view; who can't read their losses and who don't expose their couriers
    pilots: inView.length,
    missingScope,
    missingContracts,
    totals: {
      count: view.length,
      value: sum(view, (l) => l.value),
      shipValue: sum(view, (l) => l.shipValue),
      fitValue: sum(view, (l) => l.fitValue),
      cargoValue: sum(view, (l) => l.cargoValue),
      // Losses predating the history: what's still to replace doesn't count
      noHistory: view.filter((l) => l.state === 'nohistory').length,
      insurance,
      replacement,
      transport,
      // What they moved in your wallets (in the consolidated view, the sum of the Wallet column)
      walletEffect: insurance - replacement - transport,
      // Net worth that didn't come back (window closed) and what's still to replace (window open, estimated)
      unreplaced,
      toReplace,
      open: view.filter((l) => l.state === 'pending').length,
      // What they cost you: the sum of the Coste column (includes the estimated still-to-replace)
      cost: insurance - replacement - transport - unreplaced - toReplace,
      // The firm part: without what's still to replace (an estimate that can still change)
      firmCost: insurance - replacement - transport - unreplaced,
      premiums: prem?.total ?? 0,
      // Unpriced types among the view's losses (the allocation looks at all of them, but the note is about these)
      unpricedTypes: new Set(
        rows
          .filter((r) => r.time >= from && (!characterId || r.characterId === characterId))
          .flatMap((r) => [r.shipTypeId, ...r.items.filter((i) => !i.copy).map((i) => i.typeId)])
          .filter((t) => unpriced.has(t)),
      ).size,
    },
    // A pilot's view: his wallet flow from losses, what he paid for others' ships and who paid for his
    ownWallet,
    forOthers,
    paidByOthers: [...byOthers.entries()].map(([id, amount]) => ({ id, name: nameOf.get(id) ?? null, amount })),
    historyFrom,
    // Most recent first
    losses: view.reverse(),
    // For the summary (not for the web): replacement purchases for all losses, by payer and date,
    // and the couriers that carried lost ships (their journal entries have the contract as context_id)
    spend,
    shipCouriers: [...usedCouriers],
  };
}
