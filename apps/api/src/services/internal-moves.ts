import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, contracts, marketPrices, names, type ContractItem } from '../db/schema';
import { periodFrom } from '../lib/period';
import { allLosses } from './losses';
import { internalTransfers } from './summary';

// What a move is, for the web: ISK given (donation, direct trade, other contract payments) or items handed over
// (item exchange contract, market trade between your pilots)
export const moveKind = (refType: string) =>
  refType === 'player_donation'
    ? 'donation'
    : refType === 'player_trading'
      ? 'trade'
      : refType === 'market_transaction'
        ? 'market'
        : refType.startsWith('contract')
          ? 'contract'
          : 'other';

// Balances «Entre tus pilotos»: everything moved between two of your pilots in the period. The ISK is the same set
// of transfers the summary keeps out of every net (so the section adds up to the wallet reconciliation's «moved with
// your other pilots»); items come from item exchanges (read in the sync) and market trades between them, at the ESI
// average price. A move inside a lost ship's replacement window that carries a lost type, or pays the pilot who
// bought or carried the replacement, says which loss it belongs to. All of it sums zero in the consolidated
export async function internalMoves(days: number, characterId?: number) {
  const now = new Date();
  const from = periodFrom(days, now);
  const pilots = await db.select({ id: characters.id, name: characters.name }).from(characters);
  const nameOf = new Map(pilots.map((p) => [p.id, p.name]));

  const exchanges = (
    await db
      .select()
      .from(contracts)
      .where(and(eq(contracts.type, 'item_exchange'), eq(contracts.status, 'finished')))
  ).filter((c) => {
    const other = c.acceptorId ?? c.assigneeId;
    return nameOf.has(c.issuerId) && other !== null && nameOf.has(other) && other !== c.issuerId && (c.dateCompleted ?? c.dateIssued) >= from;
  });
  const exchangeById = new Map(exchanges.map((c) => [c.contractId, c]));

  // giver hands over the items (or the ISK, when there are no items); ISK goes iskFrom → iskTo
  type Move = {
    date: Date;
    refType: string;
    giver: number;
    receiver: number;
    isk: number;
    iskFrom: number;
    iskTo: number;
    items: ContractItem[] | null; // null: an exchange whose items the sync hasn't read yet
    contractId: number | null;
  };
  const moves: Move[] = [];
  for (const t of await internalTransfers(from)) {
    const c = t.contractId !== null && t.refType === 'contract_price' ? exchangeById.get(t.contractId) : undefined;
    if (t.typeId !== null) {
      // Market trade: the seller (who received the ISK) handed over the item
      moves.push({ ...t, giver: t.to, receiver: t.from, isk: t.amount, iskFrom: t.from, iskTo: t.to, items: [{ typeId: t.typeId, quantity: t.quantity ?? 1 }] });
    } else if (c) {
      exchangeById.delete(c.contractId);
      moves.push({ ...t, giver: c.issuerId, receiver: t.from, isk: t.amount, iskFrom: t.from, iskTo: t.to, items: c.items });
    } else moves.push({ ...t, giver: t.from, receiver: t.to, isk: t.amount, iskFrom: t.from, iskTo: t.to, items: [] });
  }
  // Exchanges with no payment in the journal (a 0 ISK contract from your alt to your main): items only
  for (const c of exchangeById.values()) {
    const other = (c.acceptorId ?? c.assigneeId)!;
    moves.push({
      date: c.dateCompleted ?? c.dateIssued,
      refType: 'contract_price',
      giver: c.issuerId,
      receiver: other,
      isk: 0,
      iskFrom: other,
      iskTo: c.issuerId,
      items: c.items,
      contractId: c.contractId,
    });
  }
  const inView = moves.filter((m) => !characterId || m.giver === characterId || m.receiver === characterId);

  const typeIds = [...new Set(inView.flatMap((m) => m.items?.map((i) => i.typeId) ?? []))];
  const [prices, typeNames] = typeIds.length
    ? await Promise.all([
        db.select().from(marketPrices).where(inArray(marketPrices.typeId, typeIds)),
        db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, typeIds)),
      ])
    : [[], []];
  const priceOf = new Map(prices.map((p) => [p.typeId, p.averagePrice ?? p.adjustedPrice ?? 0]));
  const typeName = new Map(typeNames.map((n) => [n.id, n.name]));

  // Replacement windows of the losses: what was lost and who paid to replace it or carried it
  const { losses, rows } = await allLosses(now);
  const lostTypes = new Map(rows.map((r) => [r.killmailId, new Set([r.shipTypeId, ...r.items.map((i) => i.typeId)])]));
  const replacementOf = (m: Move) =>
    losses.find((l) => {
      if (m.date < l.time || m.date > l.windowEndsAt) return false;
      if (m.items?.length) return m.items.some((i) => lostTypes.get(l.killmailId)?.has(i.typeId));
      const helpers = new Set([...Object.keys(l.replacementBy).map(Number), l.transportBy]);
      return helpers.has(m.receiver);
    });

  const pilot = (id: number) => ({ id, name: nameOf.get(id) ?? null });
  const out = inView
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((m) => {
      const items = m.items?.map((i) => ({ ...i, name: typeName.get(i.typeId) ?? null, value: (priceOf.get(i.typeId) ?? 0) * i.quantity })) ?? null;
      const loss = replacementOf(m);
      return {
        date: m.date,
        kind: moveKind(m.refType),
        refType: m.refType,
        giver: pilot(m.giver),
        receiver: pilot(m.receiver),
        isk: m.isk,
        iskFrom: m.iskFrom,
        iskTo: m.iskTo,
        items,
        value: items?.reduce((s, i) => s + i.value, 0) ?? 0,
        contractId: m.contractId,
        replacement: loss ? { killmailId: loss.killmailId, ship: loss.ship, pilot: loss.pilot } : null,
      };
    });

  // For the view: ISK and items received and handed over (the ISK is the reconciliation's «moved with your other
  // pilots»); in the consolidated, what moved among all. By kind, the signed ISK of the view (consolidated: moved)
  const totals = { iskReceived: 0, iskSent: 0, itemsReceived: 0, itemsSent: 0 };
  const byKind: Record<string, number> = {};
  for (const m of out) {
    const signed = characterId ? (m.iskTo === characterId ? m.isk : 0) - (m.iskFrom === characterId ? m.isk : 0) : m.isk;
    if (m.isk) byKind[m.kind] = (byKind[m.kind] ?? 0) + signed;
    if (!characterId || m.iskTo === characterId) totals.iskReceived += m.isk;
    if (!characterId || m.iskFrom === characterId) totals.iskSent += m.isk;
    if (!characterId || m.receiver.id === characterId) totals.itemsReceived += m.value;
    if (!characterId || m.giver.id === characterId) totals.itemsSent += m.value;
  }
  return { moves: out, totals, byKind, unread: out.filter((m) => m.items === null).length };
}
