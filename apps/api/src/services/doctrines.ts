// Doctrinas: fits pegados en formato EFT y, por fit, el plan de skills de la comunidad (.emp de EVEMon).
// Para cada piloto: si puede volar el fit (casco, módulos, munición y drones; la carga no cuenta) y cuánto le
// falta del plan (SP y tiempo de entrenamiento con sus atributos; un Alfa, a la mitad)
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characterAttributes, characters, characterSkills, doctrines, fitPlans, fits, typeDogma, type FitItem, type FitSection } from '../db/schema';
import { EftError, parseEft } from '../lib/eft';
import { EmpError, parseEmp } from '../lib/emp';
import { INJECTOR, injectorsFor, type InjectorPlan } from '../lib/injectors';
import { evaluate, withPrerequisites, type Evaluation, type PilotSkills, type SkillInfo } from '../lib/skill-math';
import { CATEGORY, ensureDogma, resolveTypeNames } from './dogma';
import { omegaIndicator, rattingIndicator } from './indicators';
import { loadJitaPrices, refreshJitaPrices, type JitaPrice } from './jita';
import { SKILLS_SCOPE } from './skills';

export class DoctrineError extends Error {
  constructor(
    public code: string,
    public detail?: unknown,
  ) {
    super(code);
  }
}

const FITTED: FitSection[] = ['low', 'mid', 'high', 'rig', 'subsystem'];

export async function createDoctrine(name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new DoctrineError('name');
  const [row] = await db.insert(doctrines).values({ name: clean }).returning({ id: doctrines.id });
  return row;
}

export async function deleteDoctrine(id: number) {
  await db.delete(doctrines).where(eq(doctrines.id, id));
}

export async function deleteFit(id: number) {
  await db.delete(fits).where(eq(fits.id, id));
}

export async function deletePlan(fitId: number) {
  await db.delete(fitPlans).where(eq(fitPlans.fitId, fitId));
}

export async function setClone(characterId: number, clone: 'omega' | 'alpha') {
  const r = await db.update(characters).set({ clone }).where(eq(characters.id, characterId)).returning({ id: characters.id });
  return r.length > 0;
}

// Pega un fit EFT en una doctrina. Los nombres se resuelven con ESI; los que no reconoce se ignoran y se devuelven
export async function addFit(doctrineId: number, eft: string) {
  const doctrine = await db.query.doctrines.findFirst({ where: eq(doctrines.id, doctrineId) });
  if (!doctrine) throw new DoctrineError('doctrine');
  let parsed;
  try {
    parsed = parseEft(eft);
  } catch (err) {
    if (err instanceof EftError) throw new DoctrineError(`eft_${err.message}`);
    throw err;
  }
  const ids = await resolveTypeNames([parsed.ship, ...parsed.lines.map((l) => l.name)]);
  const shipId = ids.get(parsed.ship.toLowerCase());
  if (!shipId) throw new DoctrineError('unknown_ship', parsed.ship);
  const ignored = [...new Set(parsed.lines.filter((l) => !ids.has(l.name.toLowerCase())).map((l) => l.name))];
  const dogma = await ensureDogma([...new Set([shipId, ...ids.values()])]);
  if (dogma.get(shipId)?.categoryId !== CATEGORY.ship) throw new DoctrineError('not_a_ship', parsed.ship);

  // Ranuras por el orden de los bloques sin cantidades (también los vacíos); bodega o carga por la categoría del tipo
  const acc = new Map<string, FitItem>();
  for (const l of parsed.lines) {
    const typeId = ids.get(l.name.toLowerCase());
    if (!typeId) continue;
    const category = dogma.get(typeId)?.categoryId;
    const section: FitSection =
      l.kind === 'charge'
        ? 'charge'
        : l.kind === 'fitted'
          ? (FITTED[parsed.slotBlocks.indexOf(l.block)] ?? 'cargo')
          : category === CATEGORY.drone || category === CATEGORY.fighter
            ? 'drone'
            : 'cargo';
    const key = `${typeId}|${section}`;
    const cur = acc.get(key) ?? { typeId, quantity: 0, section };
    cur.quantity += l.quantity;
    acc.set(key, cur);
  }
  const [row] = await db
    .insert(fits)
    .values({ doctrineId, name: parsed.name.slice(0, 120), shipTypeId: shipId, eft: eft.slice(0, 50_000), items: [...acc.values()] })
    .returning({ id: fits.id });
  // Precios de Jita del fit nuevo (y de los inyectores) ya, sin esperar al sync; si ESI falla, el fit queda igual
  await refreshJitaPrices([shipId, ...[...acc.values()].map((i) => i.typeId), INJECTOR.large, INJECTOR.small]).catch((err) =>
    console.warn('[jita] falló:', err instanceof Error ? err.message : err),
  );
  return { id: row.id, ignored };
}

// Importa el plan de skills de un fit (un .emp de EVEMon, comprimido o no). Pide a ESI el rango y los atributos
// de cada skill del plan (y de sus prerrequisitos) para poder contar SP y tiempo
export async function setPlan(fitId: number, bytes: Uint8Array, filename = '') {
  const fit = await db.query.fits.findFirst({ where: eq(fits.id, fitId) });
  if (!fit) throw new DoctrineError('fit');
  let plan;
  try {
    plan = parseEmp(bytes);
  } catch (err) {
    if (err instanceof EmpError) throw new DoctrineError(`emp_${err.message}`);
    throw err;
  }
  await ensureDogma(plan.skills.map((s) => s.skillId));
  const name = (plan.name || filename.replace(/\.emp$/i, '') || 'Plan').slice(0, 120);
  const values = { fitId, name, skills: plan.skills, createdAt: new Date() };
  await db.insert(fitPlans).values(values).onConflictDoUpdate({ target: fitPlans.fitId, set: values });
  return { name, skills: plan.skills.length };
}

// Coste del fit a la venta más baja de Jita, por partes. unpriced = tipos sin orden de venta en Jita (o aún sin
// precio): no suman, y la web lo dice
export function fitCost(shipTypeId: number, items: FitItem[], prices: Map<number, Pick<JitaPrice, 'sellMin' | 'updatedAt'>>) {
  const unpriced = new Set<number>();
  const value = (typeId: number, quantity: number) => {
    const p = prices.get(typeId)?.sellMin;
    if (p == null) {
      unpriced.add(typeId);
      return 0;
    }
    return p * quantity;
  };
  const part = (sections: FitSection[]) => items.filter((i) => sections.includes(i.section)).reduce((n, i) => n + value(i.typeId, i.quantity), 0);
  const hull = value(shipTypeId, 1);
  const fitted = part([...FITTED, 'charge']);
  const drones = part(['drone']);
  const cargo = part(['cargo']);
  const dates = [shipTypeId, ...items.map((i) => i.typeId)].map((id) => prices.get(id)?.updatedAt).filter((d): d is Date => !!d);
  return {
    total: hull + fitted + drones + cargo,
    hull,
    fitted,
    drones,
    cargo,
    unpriced: unpriced.size,
    // El precio más viejo de los que suman
    pricedAt: dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null,
  };
}

// Lo que falta del wallet para pagar algo, en los dos escenarios que pidió el usuario: con todo el saldo de los
// wallets («sin cubrir el Omega») o reservando antes lo que falta para el Omega del próximo mes («con el Omega
// cubierto»). Lo que falta, en horas de ratting (ISK/h de 30 días) y en días al ritmo de los últimos 7
export type Funds = { wallet: number; omegaReserve: number | null; iskPerHour: number | null; dailyNet: number | null };
export function budget(need: number, f: Funds) {
  const farm = (short: number) => ({
    short,
    hours: short > 0 && f.iskPerHour ? short / f.iskPerHour : short > 0 ? null : 0,
    days: short > 0 && f.dailyNet && f.dailyNet > 0 ? short / f.dailyNet : short > 0 ? null : 0,
  });
  return {
    need,
    wallet: farm(Math.max(0, need - f.wallet)),
    withOmega: f.omegaReserve === null ? null : farm(Math.max(0, need - Math.max(0, f.wallet - f.omegaReserve))),
  };
}

type MissingView = Evaluation['missing'][number] & { name: string | null };
export type EvaluationView = Omit<Evaluation, 'missing'> & { missing: MissingView[]; required: number };
export type PilotStatus = 'ok' | 'missing' | 'omega' | 'noScope' | 'noData';

export async function listDoctrines() {
  const pilots = await db
    .select({
      id: characters.id,
      name: characters.name,
      clone: characters.clone,
      scopes: characters.scopes,
      totalSp: characters.totalSp,
      unallocatedSp: characters.unallocatedSp,
      skillsAt: characters.skillsAt,
    })
    .from(characters)
    .orderBy(asc(characters.name));
  const skillRows = await db.select().from(characterSkills);
  const attrRows = await db.select().from(characterAttributes);
  const dogmaRows = await db.select().from(typeDogma);
  const docRows = await db.select().from(doctrines).orderBy(asc(doctrines.createdAt));
  const fitRows = await db.select().from(fits).orderBy(asc(fits.createdAt));
  const planRows = await db.select().from(fitPlans);
  const priceIds = [INJECTOR.large, INJECTOR.small, ...fitRows.flatMap((f) => [f.shipTypeId, ...f.items.map((i) => i.typeId)])];
  const prices = await loadJitaPrices(priceIds);
  const injectorPrice = { large: prices.get(INJECTOR.large)?.sellMin ?? null, small: prices.get(INJECTOR.small)?.sellMin ?? null };
  // Con qué se paga: el saldo de todos los wallets (el ISK se mueve entre tus pilotos), menos el Omega si se reserva
  const omega = await omegaIndicator();
  const ratting = await rattingIndicator(30);
  const funds: Funds = {
    wallet: omega.available,
    omegaReserve: omega.costMissing,
    iskPerHour: ratting.iskPerHour,
    dailyNet: omega.avgDailyNet,
  };

  const dogma = new Map(dogmaRows.map((d) => [d.typeId, d]));
  const info = (id: number): SkillInfo | undefined => dogma.get(id);
  const nameOf = (id: number) => dogma.get(id)?.name ?? null;
  const planOf = new Map(planRows.map((p) => [p.fitId, p]));
  const attrsOf = new Map(attrRows.map((a) => [a.characterId, a]));
  const skillsOf = new Map<number, PilotSkills['skills']>();
  for (const s of skillRows) {
    const m = skillsOf.get(s.characterId) ?? new Map();
    m.set(s.skillId, { trained: s.trainedLevel, active: s.activeLevel, sp: s.sp });
    skillsOf.set(s.characterId, m);
  }
  const pilotSkills = new Map<number, PilotSkills>(
    pilots.map((p) => {
      const a = attrsOf.get(p.id);
      return [
        p.id,
        {
          clone: p.clone,
          attributes: a ? { charisma: a.charisma, intelligence: a.intelligence, memory: a.memory, perception: a.perception, willpower: a.willpower } : null,
          skills: skillsOf.get(p.id) ?? new Map(),
        },
      ];
    }),
  );
  const view = (required: Map<number, number>, p: PilotSkills): EvaluationView => {
    const e = evaluate(required, p, info);
    return { ...e, required: required.size, missing: e.missing.map((m) => ({ ...m, name: nameOf(m.skillId) })) };
  };

  return {
    funds: { ...funds, omegaCost: omega.cost, injectorPrice },
    pilots: pilots.map(({ scopes, ...p }) => ({ ...p, hasScope: scopes.split(' ').includes(SKILLS_SCOPE) })),
    doctrines: docRows.map((d) => ({
      id: d.id,
      name: d.name,
      fits: fitRows
        .filter((f) => f.doctrineId === d.id)
        .map((f) => {
          // Lo que hay que poder usar para volarlo: casco, módulos, munición cargada y drones (la carga no)
          const flown = f.items.filter((i) => i.section !== 'cargo').map((i) => i.typeId);
          const fly = withPrerequisites([f.shipTypeId, ...flown].flatMap((id) => dogma.get(id)?.required ?? []), info);
          const plan = planOf.get(f.id);
          const planReq = plan ? withPrerequisites(plan.skills, info) : null;
          const cost = fitCost(f.shipTypeId, f.items, prices);
          const count = (s: FitSection) => f.items.filter((i) => i.section === s).reduce((n, i) => n + i.quantity, 0);
          return {
            id: f.id,
            name: f.name,
            shipTypeId: f.shipTypeId,
            ship: nameOf(f.shipTypeId),
            slots: { high: count('high'), mid: count('mid'), low: count('low'), rig: count('rig'), subsystem: count('subsystem') },
            drones: count('drone'),
            cargo: count('cargo'),
            required: fly.size,
            plan: plan ? { name: plan.name, skills: planReq!.size } : null,
            cost,
            // Sin skills que mirar, el presupuesto es solo el fit
            budget: budget(cost.total, funds),
            pilots: pilots.map((p) => {
              const ps = pilotSkills.get(p.id)!;
              const none = { fly: null, plan: null, injectors: null, budget: null };
              if (!p.scopes.split(' ').includes(SKILLS_SCOPE)) return { characterId: p.id, status: 'noScope' as PilotStatus, ...none };
              if (!p.skillsAt) return { characterId: p.id, status: 'noData' as PilotStatus, ...none };
              const flyView = view(fly, ps);
              const planView = planReq ? view(planReq, ps) : null;
              const status: PilotStatus = !flyView.missing.length ? 'ok' : flyView.needsOmega ? 'omega' : 'missing';
              // Inyectores para volarlo ya y para completar el plan (si se conocen los SP que faltan)
              const inject = (e: EvaluationView | null): InjectorPlan | null =>
                e && e.missingSp !== null && e.missingSp > 0 ? injectorsFor(e.missingSp, p.totalSp ?? 0, p.unallocatedSp ?? 0, injectorPrice) : null;
              const injectors = { fly: inject(flyView), plan: inject(planView) };
              // Volarlo ya: el fit más los inyectores que le faltan (un Alfa que solo necesita Omega: el fit)
              const need = injectors.fly && injectors.fly.cost === null ? null : cost.total + (injectors.fly?.cost ?? 0);
              return { characterId: p.id, status, fly: flyView, plan: planView, injectors, budget: need === null ? null : budget(need, funds) };
            }),
          };
        }),
    })),
  };
}
