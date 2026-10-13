import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { esiChecks, incursionSystems, names, systems, walletJournal } from '../db/schema';
import { esiGet } from '../lib/esi';

// Descuentos (decisión del usuario): lo que no llega al wallet de lo que ganas en PvE.
// - Impuesto de corporación: exacto. ESI lo da en cada movimiento (`tax`, `tax_receiver_id`) y `amount` ya viene
//   sin él, así que no cambia el neto: es lo que se quedó la corporación (si es tuya, sigue en su wallet).
// - Penalización de incursión: estimada. En la constelación de una incursión las recompensas se pagan a la mitad,
//   sin depender de la influencia (EVE University, «Incursions»); lo perdido = lo cobrado × p / (1 − p). ESI solo
//   dice las incursiones activas: se apuntan en cada sync y solo cuenta lo cobrado mientras se veía la incursión
//   (lo de antes del primer registro no se sabe: la cifra es «al menos»). El ESS no dice el sistema: no entra.

export const INCURSION_BOUNTY_PENALTY = 0.5;
const BOUNTY_REFS = ['bounty_prizes', 'bounty_prize'];
const ESS_REF = 'ess_escrow_transfer';
// Lo que paga impuesto a la corporación: con `tax` a null (guardado antes de leerlo) no se sabe cuánto
const TAXED_REFS = [...BOUNTY_REFS, ESS_REF, 'agent_mission_reward', 'agent_mission_time_bonus_reward'];
// Corporaciones NPC (Aliastra, State Protectorate…): sus IDs están en este rango
const NPC_CORPS = [1_000_000, 2_000_000] as const;
// Una incursión dura días: si un sistema se vuelve a ver infestado antes de 24 h (la app cerrada una noche),
// es el mismo tramo
const SAME_SPELL_MS = 24 * 3_600_000;
// Un syncAll llama a syncCharacter por cada piloto: con esto se pregunta una sola vez por ronda
const MIN_AGE_MS = 60_000;
const DAY_MS = 86_400_000;

type EsiIncursion = { constellation_id: number; infested_solar_systems: number[]; state: string };

const fetchIncursions = async () => (await esiGet<EsiIncursion[]>('/incursions/')).data;

// `fetch` y `now` se inyectan en las pruebas (test/deductions.test.ts)
export async function refreshIncursions(fetch = fetchIncursions, now = new Date()): Promise<number> {
  const [check] = await db.select().from(esiChecks).where(eq(esiChecks.name, 'incursions'));
  if (check && now.getTime() - check.checkedAt.getTime() < MIN_AGE_MS) return 0;
  const data = await fetch();
  let seen = 0;
  db.transaction((tx) => {
    for (const inc of data ?? []) {
      for (const systemId of inc.infested_solar_systems ?? []) {
        seen++;
        const [open] = tx
          .select()
          .from(incursionSystems)
          .where(and(eq(incursionSystems.systemId, systemId), gte(incursionSystems.lastSeen, new Date(now.getTime() - SAME_SPELL_MS))))
          .orderBy(desc(incursionSystems.lastSeen))
          .limit(1)
          .all();
        if (open) {
          tx.update(incursionSystems)
            .set({ lastSeen: now })
            .where(and(eq(incursionSystems.systemId, systemId), eq(incursionSystems.firstSeen, open.firstSeen)))
            .run();
        } else {
          tx.insert(incursionSystems).values({ systemId, constellationId: inc.constellation_id, firstSeen: now, lastSeen: now }).run();
        }
      }
    }
    tx.insert(esiChecks)
      .values({ name: 'incursions', firstAt: now, checkedAt: now })
      .onConflictDoUpdate({ target: esiChecks.name, set: { checkedAt: now } })
      .run();
  });
  return seen;
}

const periodFrom = (days: number) => {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
};

// Del ratting (rattingIndicator) basta con las horas y el ISK, para decir cuánto daría la hora sin descuentos
type Ratting = { hours: number; isk: number };

export async function deductionsIndicator(ratting: Ratting, days = 30) {
  const from = periodFrom(days);

  // Impuesto de corporación, por corporación y tipo de movimiento
  const taxRows = await db
    .select({
      corpId: walletJournal.taxReceiverId,
      refType: walletJournal.refType,
      tax: sql<number>`sum(${walletJournal.tax})`,
      paid: sql<number>`sum(${walletJournal.amount})`,
    })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), sql`${walletJournal.tax} > 0`))
    .groupBy(walletJournal.taxReceiverId, walletJournal.refType);
  const corpIds = [...new Set(taxRows.map((r) => r.corpId).filter((id): id is number => id !== null))];
  const corpNames = corpIds.length ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, corpIds)) : [];
  const corpName = new Map(corpNames.map((n) => [n.id, n.name]));
  const corps = new Map<number, { corpId: number | null; name: string | null; npc: boolean; tax: number; gross: number; byType: { refType: string; tax: number }[] }>();
  for (const r of taxRows) {
    const key = r.corpId ?? 0;
    const c = corps.get(key) ?? {
      corpId: r.corpId,
      name: r.corpId ? (corpName.get(r.corpId) ?? null) : null,
      npc: r.corpId !== null && r.corpId >= NPC_CORPS[0] && r.corpId < NPC_CORPS[1],
      tax: 0,
      gross: 0,
      byType: [],
    };
    c.tax += r.tax;
    c.gross += r.tax + r.paid;
    c.byType.push({ refType: r.refType, tax: r.tax });
    corps.set(key, c);
  }
  const byCorp = [...corps.values()]
    .map((c) => ({ ...c, rate: c.gross > 0 ? c.tax / c.gross : null, byType: c.byType.sort((a, b) => b.tax - a.tax) }))
    .sort((a, b) => b.tax - a.tax);
  const tax = byCorp.reduce((n, c) => n + c.tax, 0);
  // Lo que se llevó la corporación de lo que cuenta el ratting (recompensas y ESS; las misiones no)
  const rattingTax = taxRows.filter((r) => [...BOUNTY_REFS, ESS_REF].includes(r.refType)).reduce((n, r) => n + r.tax, 0);
  const [unknown] = await db
    .select({ n: sql<number>`count(*)` })
    .from(walletJournal)
    .where(and(gte(walletJournal.date, from), isNull(walletJournal.tax), inArray(walletJournal.refType, TAXED_REFS)));

  // Penalización de incursión: recompensas cobradas en un sistema mientras se le veía infestado
  const [check] = await db.select().from(esiChecks).where(eq(esiChecks.name, 'incursions'));
  const hit = await db
    .select({
      systemId: walletJournal.contextId,
      ticks: sql<number>`count(*)`,
      paid: sql<number>`sum(${walletJournal.amount})`,
    })
    .from(walletJournal)
    .where(
      and(
        gte(walletJournal.date, from),
        inArray(walletJournal.refType, BOUNTY_REFS),
        eq(walletJournal.contextIdType, 'system_id'),
        sql`${walletJournal.amount} > 0`,
        sql`exists (select 1 from ${incursionSystems} where ${incursionSystems.systemId} = ${walletJournal.contextId}
          and ${walletJournal.date} between ${incursionSystems.firstSeen} and ${incursionSystems.lastSeen})`,
      ),
    )
    .groupBy(walletJournal.contextId);
  const sysIds = hit.map((h) => h.systemId).filter((id): id is number => id !== null);
  const sysRows = sysIds.length
    ? await db.select({ id: systems.id, name: systems.name, security: systems.security }).from(systems).where(inArray(systems.id, sysIds))
    : [];
  const sysNames = sysIds.length ? await db.select({ id: names.id, name: names.name }).from(names).where(inArray(names.id, sysIds)) : [];
  const sysById = new Map(sysRows.map((s) => [s.id, s]));
  const sysName = new Map(sysNames.map((n) => [n.id, n.name]));
  const factor = INCURSION_BOUNTY_PENALTY / (1 - INCURSION_BOUNTY_PENALTY);
  const bySystem = hit
    .filter((h) => h.systemId !== null)
    .map((h) => ({
      systemId: h.systemId as number,
      name: sysById.get(h.systemId as number)?.name ?? sysName.get(h.systemId as number) ?? null,
      security: sysById.get(h.systemId as number)?.security ?? null,
      ticks: h.ticks,
      paid: h.paid,
      lost: h.paid * factor,
    }))
    .sort((a, b) => b.lost - a.lost);
  const incursion = bySystem.reduce((n, s) => n + s.lost, 0);

  // La hora de ratting sin descuentos: lo cobrado + el impuesto del ratting + la penalización
  const iskPerHour = ratting.hours ? ratting.isk / ratting.hours : null;
  const grossPerHour = ratting.hours ? (ratting.isk + rattingTax + incursion) / ratting.hours : null;

  return {
    days,
    tax,
    byCorp,
    taxUnknown: unknown?.n ?? 0,
    incursion,
    penalty: INCURSION_BOUNTY_PENALTY,
    bySystem,
    // Desde cuándo se apuntan las incursiones (null: aún no se ha mirado); antes de esa fecha no se sabe
    incursionsSince: check?.firstAt.toISOString() ?? null,
    iskPerHour,
    grossPerHour,
  };
}
