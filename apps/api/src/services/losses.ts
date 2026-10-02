import { and, asc, eq, gte, inArray, lt, min, sql } from 'drizzle-orm';
import { db } from '../db/client';
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

// GET /characters/{id}/killmails/recent: muertes y pérdidas de los últimos ~90 días (solo id + hash)
type EsiKillmailRef = { killmail_id: number; killmail_hash: string };
// GET /killmails/{id}/{hash}: público e inmutable
type EsiItem = {
  item_type_id: number;
  flag: number;
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

// Los contenedores de la bodega traen sus ítems anidados: se aplanan con el flag del contenedor
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

// Flags de lo que va montado en la nave: ranuras baja/media/alta (11–34), bahía de drones (87), rigs (92–99),
// subsistemas (125–132) y cazas (158–163). Lo demás (bodega, bodegas especiales, hangares) es carga
const FITTED_FLAGS: [number, number][] = [
  [11, 34],
  [87, 87],
  [92, 99],
  [125, 132],
  [158, 163],
];
// Sin flag (killmail aún sin completar, o −1 si ESI no lo dio) cuenta como equipo, como antes
export const isCargo = (i: KillmailItem) =>
  i.flag !== undefined && i.flag >= 0 && !FITTED_FLAGS.some(([lo, hi]) => i.flag! >= lo && i.flag! <= hi);
// Killmails guardados antes de pedir el flag: se vuelven a pedir (son públicos e inmutables) como mucho estos por sync
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

  // Los guardados sin flag (antes de distinguir equipo y carga): se completan
  const incomplete = (await db.select({ id: killmails.killmailId, hash: killmails.hash, items: killmails.items }).from(killmails))
    .filter((k) => k.items.some((i) => i.flag === undefined))
    .slice(0, MAX_BACKFILL);
  for (const k of incomplete) {
    try {
      const { data } = await esiGet<EsiKillmail>(`/killmails/${k.id}/${k.hash}`);
      await db.update(killmails).set({ items: flatten(data.victim.items) }).where(eq(killmails.killmailId, k.id));
    } catch (err) {
      // Un killmail que ESI ya no da no debe parar el sync ni volver a pedirse: flag −1 (cuenta como equipo)
      if (!(err instanceof EsiError) || err.status >= 500) throw err;
      await db
        .update(killmails)
        .set({ items: k.items.map((i) => ({ ...i, flag: i.flag ?? -1 })) })
        .where(eq(killmails.killmailId, k.id));
    }
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

  // Todas las pérdidas de tus pilotos (no solo las de la vista): las compras y los couriers se reparten entre
  // pérdidas en orden, y la vista de un piloto necesita saber qué pagó para las naves de los demás
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
        .where(
          and(
            inArray(killmails.victimCharacterId, linkedIds),
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

  // Grupo de mercado de lo perdido: un módulo del mismo grupo (Republic Fleet en vez de Domination) también
  // repone el equipo. Los tipos se resuelven en el sync (tabla types); sin grupo conocido, solo el mismo tipo
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

  // Desde cuándo hay historial: una pérdida anterior no pudo emparejarse con ninguna compra
  const [firstEntry] = await db.select({ at: min(walletJournal.date) }).from(walletJournal);
  const historyFrom = firstEntry?.at ?? null;

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
  // Cantidad aún sin usar de cada compra (id de ESI + piloto)
  const keyOf = (t: { id: number; characterId: number }) => `${t.id}|${t.characterId}`;
  const qtyLeft0 = new Map(purchases.map((t) => [keyOf(t), t.quantity]));

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
  // Compras de reposición por pagador y fecha: el resumen las cuenta como PvP («PvP con naves»)
  const spend: { transactionId: number; journalRefId: number | null; characterId: number; date: Date; amount: number }[] = [];

  const losses = rows.map((r) => {
    const victim = r.characterId!;
    const at = r.time.getTime();
    const windowEndsAt = new Date(at + REPLACEMENT_DAYS * DAY_MS);
    const inWindow = (d: Date) => d.getTime() >= at && d.getTime() <= windowEndsAt.getTime();
    const shipValue = valueOf(r.shipTypeId, 1);
    // Equipo (lo montado y los drones) y carga (bodegas y hangares), al precio medio
    const fitItems = r.items.filter((i) => !i.copy && !isCargo(i));
    const cargoItems = r.items.filter((i) => !i.copy && isCargo(i));
    const fitValue = fitItems.reduce((v, i) => v + valueOf(i.typeId, i.destroyed + i.dropped), 0);
    const cargoValue = cargoItems.reduce((v, i) => v + valueOf(i.typeId, i.destroyed + i.dropped), 0);
    const value = shipValue + fitValue + cargoValue;

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

    // Reposición: casco, equipo y carga comprados por cualquiera de tus pilotos en la ventana, hasta las
    // cantidades perdidas. Primero el mismo tipo; después, para el equipo, un módulo del mismo grupo de mercado
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
    const buyers = new Map<number, number>(); // piloto → ISK gastado en reponer
    const take = (t: (typeof purchases)[number], qty: number) => {
      qtyLeft0.set(keyOf(t), (qtyLeft0.get(keyOf(t)) ?? 0) - qty);
      replacement += qty * t.unitPrice;
      buyers.set(t.characterId, (buyers.get(t.characterId) ?? 0) + qty * t.unitPrice);
      spend.push({ transactionId: t.id, journalRefId: t.journalRefId, characterId: t.characterId, date: t.date, amount: qty * t.unitPrice });
    };
    const inWindowPurchases = purchases.filter((t) => inWindow(t.date));
    for (const t of inWindowPurchases) {
      if (hullNeed && t.typeId === r.shipTypeId && (qtyLeft0.get(keyOf(t)) ?? 0) > 0) {
        take(t, 1);
        hullNeed = 0;
        hull ??= t;
      }
      for (const need of [fitNeed, cargoNeed]) {
        const left = qtyLeft0.get(keyOf(t)) ?? 0;
        const want = need.get(t.typeId) ?? 0;
        if (!left || !want) continue;
        const qty = Math.min(left, want);
        take(t, qty);
        need.set(t.typeId, want - qty);
      }
    }
    for (const t of inWindowPurchases) {
      const group = groupOf.get(t.typeId);
      if (group === undefined || t.typeId === r.shipTypeId) continue;
      for (const [typeId, want] of fitNeed) {
        const left = qtyLeft0.get(keyOf(t)) ?? 0;
        if (!left || !want || typeId === t.typeId || groupOf.get(typeId) !== group) continue;
        const qty = Math.min(left, want);
        take(t, qty);
        fitNeed.set(typeId, want - qty);
        substitutes += qty;
      }
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
    // Lo que falta por reponer, al precio medio de ESI, por partes. Se da por repuesta si falta menos del 2 % de
    // lo perdido (munición, drones sueltos…): «por reponer» no debe quedarse abierto por una carga de munición
    const missingOf = (need: Map<number, number>) =>
      [...need.entries()].reduce((v, [typeId, qty]) => v + (qty > 0 ? (price.get(typeId) ?? 0) * qty : 0), 0);
    const missHull = hullNeed ? (price.get(r.shipTypeId) ?? 0) : 0;
    const missFit = missingOf(fitNeed);
    const missCargo = missingOf(cargoNeed);
    const significant = missHull + missFit + missCargo > 0.02 * value;
    // Sin historial: la pérdida es anterior al primer movimiento guardado; lo que falte no se sabe si se repuso
    const noHistory = !historyFrom || r.time < historyFrom;
    // Una pérdida de menos de 1 M (cápsula, nave de iniciación) no espera reposición: no queda abierta
    const trivial = value < 1_000_000;
    const state: 'replaced' | 'pending' | 'unreplaced' | 'nohistory' = !significant
      ? 'replaced'
      : noHistory
        ? 'nohistory'
        : now < windowEndsAt && !trivial
          ? 'pending'
          : 'unreplaced';
    const toReplace = significant && state !== 'nohistory' ? missHull + missFit + missCargo : 0;
    // Quién pagó qué: la víctima cobra el seguro; cada comprador paga su reposición; quien emite el courier, el transporte
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
      // Seguro − reposición − transporte, lo pague el piloto que sea (lo que la nave movió en tus wallets)
      walletEffect: insurance - replacement - transport,
      // Lo que te costó perderla: lo del wallet y además lo que no volvió (o falta por reponer, al precio medio)
      cost: insurance - replacement - transport - toReplace,
      windowEndsAt,
      // replaced: repuesta (o casi); pending: falta algo y la ventana sigue abierta (la cifra es «hasta ahora»);
      // unreplaced: la ventana se cerró sin reponerlo todo (toReplace = lo que no volvió, al precio medio);
      // nohistory: anterior al primer movimiento guardado (no cuenta lo que falte: no se sabe)
      state,
      open: state === 'pending',
      toReplace,
      // De qué es lo que falta (al precio medio): casco, equipo (montado y drones) y carga
      missing: significant ? { hull: missHull, fit: missFit, cargo: missCargo } : { hull: 0, fit: 0, cargo: 0 },
      // Unidades de equipo repuestas con un módulo equivalente (mismo grupo de mercado)
      substitutes,
      trivial,
      replacementBy,
      transportBy: courier?.issuerId ?? null,
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

  // La vista: las pérdidas de sus pilotos. Las cifras cuentan la historia de SUS naves, la pague quien la pague:
  // lo que te costaron = seguro − reposición − transporte − lo que no volvió − lo que falta por reponer (estimado).
  // En la vista de un piloto, además, el flujo de SU wallet por pérdidas va aparte (ownWallet): el seguro de sus
  // naves y lo que él pagó (también para las naves de sus otros pilotos); quién pagó por las suyas, en paidByOthers
  type Row = (typeof losses)[number];
  const view = losses.filter((l) => !characterId || l.characterId === characterId);
  const sum = (rows: Row[], f: (l: Row) => number) => rows.reduce((n, l) => n + f(l), 0);
  // Lo que pagó un piloto por una pérdida (reposición + courier)
  const paidBy = (l: Row, id: number) => (l.replacementBy[id] ?? 0) + (l.transportBy === id ? l.transport : 0);
  const forOthers = characterId
    ? losses
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
    // Pilotos de la vista; quiénes no pueden leer sus pérdidas y quiénes no dejan ver sus couriers
    pilots: inView.length,
    missingScope,
    missingContracts,
    totals: {
      count: view.length,
      value: sum(view, (l) => l.value),
      shipValue: sum(view, (l) => l.shipValue),
      fitValue: sum(view, (l) => l.fitValue),
      cargoValue: sum(view, (l) => l.cargoValue),
      // Pérdidas anteriores al historial: no cuentan lo que falte por reponer
      noHistory: view.filter((l) => l.state === 'nohistory').length,
      insurance,
      replacement,
      transport,
      // Lo que movieron en tus wallets (en el consolidado, la suma de la columna Wallet)
      walletEffect: insurance - replacement - transport,
      // Patrimonio que no volvió (ventana cerrada) y lo que falta por reponer (ventana abierta, estimado)
      unreplaced,
      toReplace,
      open: view.filter((l) => l.state === 'pending').length,
      // Lo que te costaron: la suma de la columna Coste (incluye lo estimado por reponer)
      cost: insurance - replacement - transport - unreplaced - toReplace,
      // Lo firme: sin lo que falta por reponer (una estimación que aún puede cambiar)
      firmCost: insurance - replacement - transport - unreplaced,
      premiums: prem?.total ?? 0,
      unpricedTypes: unpriced.size,
    },
    // Vista de un piloto: el flujo de su wallet por pérdidas, lo que pagó por naves de otros y quién pagó por las suyas
    ownWallet,
    forOthers,
    paidByOthers: [...byOthers.entries()].map(([id, amount]) => ({ id, name: nameOf.get(id) ?? null, amount })),
    historyFrom,
    // La más reciente primero
    losses: view.reverse(),
    // Para el resumen (no para la web): las compras de reposición de todas las pérdidas, por pagador y fecha,
    // y los couriers que llevaron naves perdidas (sus movimientos del journal tienen el contrato como context_id)
    spend,
    shipCouriers: [...usedCouriers],
  };
}
