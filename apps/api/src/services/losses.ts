import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  characters,
  killmails,
  marketPrices,
  names,
  systems,
  walletJournal,
  walletTransactions,
  type KillmailItem,
} from '../db/schema';
import { esiGet } from '../lib/esi';
import { CONTRACTS_SCOPE, courierContracts } from './contracts';

export const LOSSES_SCOPE = 'esi-killmails.read_killmails.v1';

// GET /characters/{id}/killmails/recent: muertes y pérdidas de los últimos ~90 días (solo id + hash)
type EsiKillmailRef = { killmail_id: number; killmail_hash: string };
// GET /killmails/{id}/{hash}: público e inmutable
type EsiItem = {
  item_type_id: number;
  quantity_destroyed?: number;
  quantity_dropped?: number;
  singleton: number; // 2 = copia de blueprint
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
// Detalles nuevos por sync: el resto llega en el siguiente (no hace falta gastar el límite de ESI de golpe)
const MAX_NEW = 100;
const CHUNK = 500;
// El seguro paga al instante de perder la nave; se deja margen por si ESI lo fecha unos minutos después
const INSURANCE_WINDOW_MS = 60 * 60_000;
// Compras del mismo casco y equipo en los días siguientes a la pérdida: lo que costó reponerla
export const REPLACEMENT_DAYS = 7;

// Los contenedores de la bodega traen sus ítems anidados: se aplanan
function flatten(items: EsiItem[] = [], out: KillmailItem[] = []): KillmailItem[] {
  for (const i of items) {
    const destroyed = i.quantity_destroyed ?? 0;
    const dropped = i.quantity_dropped ?? 0;
    if (destroyed || dropped) out.push({ typeId: i.item_type_id, destroyed, dropped, ...(i.singleton === 2 ? { copy: true } : {}) });
    flatten(i.items, out);
  }
  return out;
}

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

  // Los killmails no cambian: solo se piden los que aún no están guardados
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
}

// Naves perdidas en los últimos `days` días y cómo tocan el wallet. La nave se pagó al comprarla (un gasto de
// trading); perderla no mueve el wallet. Lo que lo mueve, por pérdida:
// - el seguro que la paga (+, en el wallet de quien la perdió);
// - la reposición (−): casco y equipo perdidos comprados en el mercado por CUALQUIERA de tus pilotos en los
//   días siguientes (p. ej. un alter de compras en Jita), sin las operaciones entre tus pilotos;
// - el transporte (−): el courier que emite cualquiera de tus pilotos y lleva ese casco o ese equipo
//   (recompensa + comisión; hace falta el permiso de contratos para saber qué lleva).
// Las donaciones, contratos y trades entre tus pilotos para moverla no cuentan: suman cero.
// Las primas de seguro del período van aparte: también pagan naves que sigues volando.
// Todo ya está en el neto del resumen (seguro en PvP, compras en trading, courier en logística): esto lo explica.
// Valor perdido: casco + equipo (destruido y soltado) al precio medio de ESI, como el inventario
export async function shipLosses(days: number, characterId?: number) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(todayStart.getTime() - (days - 1) * DAY_MS);

  const pilots = await db.select({ id: characters.id, name: characters.name, scopes: characters.scopes }).from(characters);
  const linked = new Set(pilots.map((p) => p.id));
  const linkedIds = [...linked];
  const inView = pilots.filter((p) => !characterId || p.id === characterId);
  const lacks = (scope: string) => (p: (typeof pilots)[number]) => !p.scopes.split(' ').includes(scope);
  // Pilotos de esta vista que no pueden leer sus killmails (vinculados antes de pedir el permiso)
  const missingScope = inView.filter(lacks(LOSSES_SCOPE)).map(({ id, name }) => ({ id, name }));
  // Cualquiera de tus pilotos puede emitir el courier: sin el permiso de contratos, su transporte no se ve
  const missingContracts = pilots.filter(lacks(CONTRACTS_SCOPE)).map(({ id, name }) => ({ id, name }));
  const nameOf = new Map(pilots.map((p) => [p.id, p.name]));

  const rows = inView.length
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
        .where(
          and(
            inArray(
              killmails.victimCharacterId,
              inView.map((p) => p.id),
            ),
            gte(killmails.time, from),
          ),
        )
        .orderBy(asc(killmails.time))
    : [];

  // Sistemas: nombre y seguridad de la caché del mapa; si no está, el nombre de /universe/names
  const systemIds = [...new Set(rows.map((r) => r.systemId))];
  const systemRows = systemIds.length
    ? await db.select({ id: systems.id, name: systems.name, security: systems.security }).from(systems).where(inArray(systems.id, systemIds))
    : [];
  const systemNameRows = systemIds.length
    ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, systemIds))
    : [];
  const systemById = new Map(systemRows.map((s) => [s.id, s]));
  const systemName = new Map(systemNameRows.map((s) => [s.id, s.name]));

  // Precios medios de ESI de casco y equipo
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

  const victims = [...new Set(rows.map((r) => r.characterId!))];
  const firstLoss = rows[0]?.time;
  const lastLoss = rows.at(-1)?.time;

  // Pagos del seguro (ref_type insurance positivo) de los pilotos que perdieron naves: cada uno se usa una vez
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

  // Compras de mercado de cualquiera de tus pilotos tras las pérdidas (sin las operaciones entre tus pilotos)
  const purchases = rows.length
    ? (
        await db
          .select({
            id: walletTransactions.transactionId,
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
              inArray(walletTransactions.typeId, typeIds),
            ),
          )
          .orderBy(asc(walletTransactions.date))
      ).filter((t) => !t.clientId || !linked.has(t.clientId))
    : [];
  const left = new Map(purchases.map((t) => [t.id, t.quantity]));

  // Couriers de tus pilotos tras las pérdidas (los cancelados o borrados devuelven la recompensa) y sus comisiones
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

  const losses = rows.map((r) => {
    const victim = r.characterId!;
    const at = r.time.getTime();
    const windowEndsAt = new Date(at + REPLACEMENT_DAYS * DAY_MS);
    const inWindow = (d: Date) => d.getTime() >= at && d.getTime() <= windowEndsAt.getTime();
    const shipValue = valueOf(r.shipTypeId, 1);
    const fitValue = r.items.reduce((v, i) => v + valueOf(i.typeId, i.destroyed + i.dropped, i.copy), 0);

    // El pago del seguro de esta nave: el primero del piloto tras la pérdida (si ESI dice de qué tipo es, ese tipo)
    const payout = payouts.find(
      (j) =>
        !usedPayouts.has(j.id) &&
        j.characterId === victim &&
        j.date.getTime() >= at &&
        j.date.getTime() - at <= INSURANCE_WINDOW_MS &&
        (j.contextIdType !== 'type_id' || j.contextId === r.shipTypeId),
    );
    if (payout) usedPayouts.add(payout.id);

    // Reposición: casco y equipo comprados por cualquiera de tus pilotos en la ventana, hasta las cantidades perdidas
    const lost = new Map<number, number>([[r.shipTypeId, 1]]);
    for (const i of r.items) if (!i.copy) lost.set(i.typeId, (lost.get(i.typeId) ?? 0) + i.destroyed + i.dropped);
    const need = new Map(lost);
    let replacement = 0;
    let hull: (typeof purchases)[number] | undefined;
    const buyers = new Map<number, number>(); // piloto → ISK gastado en reponer
    for (const t of purchases) {
      const qtyLeft = left.get(t.id) ?? 0;
      const want = need.get(t.typeId) ?? 0;
      if (!qtyLeft || !want || !inWindow(t.date)) continue;
      const qty = Math.min(qtyLeft, want);
      left.set(t.id, qtyLeft - qty);
      need.set(t.typeId, want - qty);
      replacement += qty * t.unitPrice;
      buyers.set(t.characterId, (buyers.get(t.characterId) ?? 0) + qty * t.unitPrice);
      if (t.typeId === r.shipTypeId && !hull) hull = t;
    }
    // Quién repuso: quien compró el casco; si solo se compró equipo, quien más gastó
    const buyerId = hull?.characterId ?? [...buyers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    // Transporte: el primer courier de la ventana que lleva este casco (o, si no, parte del equipo perdido)
    const carries = (c: (typeof couriers)[number], types: (id: number) => boolean) => (c.items ?? []).some((i) => types(i.typeId));
    const courier =
      couriers.find((c) => !usedCouriers.has(c.contractId) && inWindow(c.dateIssued) && carries(c, (id) => id === r.shipTypeId)) ??
      couriers.find((c) => !usedCouriers.has(c.contractId) && inWindow(c.dateIssued) && carries(c, (id) => lost.has(id)));
    if (courier) usedCouriers.add(courier.contractId);
    const transport = courier ? (courier.reward ?? 0) + (feeOf.get(courier.contractId) ?? 0) : 0;

    const system = systemById.get(r.systemId);
    const insurance = payout?.amount ?? 0;
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
      value: shipValue + fitValue,
      insurance,
      replacement,
      transport,
      walletEffect: insurance - replacement - transport,
      // La reposición aún puede cambiar mientras dure la ventana
      windowEndsAt,
      open: now < windowEndsAt,
      replacedBy: buyerId ? { id: buyerId, name: nameOf.get(buyerId) ?? null } : null,
      shipReplacedAt: hull?.date ?? null,
      // «Jita» de «Jita IV - Moon 4 - Caldari Navy Assembly Plant»
      replacedIn: hull?.location ? hull.location.split(' - ')[0].replace(/\s+[IVXLC]+$/, '') : null,
      courier: courier ? { contractId: courier.contractId, by: nameOf.get(courier.issuerId) ?? null, at: courier.dateIssued } : null,
    };
  });

  // Primas de seguro pagadas en el período: aparte, porque también aseguran naves que sigues volando
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

  const sum = (k: 'value' | 'shipValue' | 'fitValue' | 'insurance' | 'replacement' | 'transport' | 'walletEffect') =>
    losses.reduce((n, l) => n + l[k], 0);
  return {
    period: { days, from },
    replacementDays: REPLACEMENT_DAYS,
    // Pilotos de la vista; quiénes no pueden leer sus pérdidas y quiénes no dejan ver sus couriers
    pilots: inView.length,
    missingScope,
    missingContracts,
    totals: {
      count: losses.length,
      value: sum('value'),
      shipValue: sum('shipValue'),
      fitValue: sum('fitValue'),
      insurance: sum('insurance'),
      replacement: sum('replacement'),
      transport: sum('transport'),
      // Suma de las filas: seguro − reposición − transporte
      walletEffect: sum('walletEffect'),
      // Pérdidas cuya reposición aún puede cambiar: el total es provisional
      open: losses.filter((l) => l.open).length,
      premiums: prem?.total ?? 0,
      unpricedTypes: unpriced.size,
    },
    // La más reciente primero
    losses: losses.reverse(),
  };
}
