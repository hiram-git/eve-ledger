// Doctrines: read EFT fits and EVEMon plans, count SP and time, and say who flies what.
// ESI is mocked (there's no network from here): /universe/ids, /universe/types and /universe/groups with a few types
import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

// Test types: [name, group, category, rank, primary, secondary, [skill, level]…]
type Fake = [string, number, number, number | null, number | null, number | null, [number, number][], boolean?];
const TYPES: Record<number, Fake> = {
  587: ['Rifter', 25, 6, null, null, null, [[3329, 1]]],
  2048: ['Damage Control II', 60, 7, null, null, null, [[3394, 3]]],
  2488: ['Warrior II', 100, 18, null, null, null, [[24241, 2]]],
  37627: ['Heavy Energy Neutralizer II', 71, 7, null, null, null, [[3423, 4]]],
  3329: ['Minmatar Frigate', 257, 16, 2, 167, 168, [[3327, 1]]],
  3327: ['Spaceship Command', 257, 16, 1, 167, 168, []],
  3394: ['Hull Upgrades', 1210, 16, 2, 166, 168, [[3392, 2]]],
  3392: ['Mechanics', 1210, 16, 1, 166, 168, []],
  24241: ['Light Drone Operation', 273, 16, 1, 166, 167, [[3436, 1]]],
  3436: ['Drones', 273, 16, 1, 166, 167, []],
  3423: ['Capacitor Emission Systems', 255, 16, 2, 165, 166, []],
  // Omega only (attribute 1047) and a ship that requires it
  16591: ['Heavy Assault Cruisers', 257, 16, 6, 167, 168, [[3329, 1]], true],
  12015: ['Muninn', 358, 6, null, null, null, [[16591, 1]]],
};
// Lowest sell in Jita (the neutralizer has no orders: it stays without a price); 40520/45635 = injectors
const JITA: Record<number, number> = { 587: 500_000, 2048: 1_200_000, 2488: 300_000, 40520: 800_000_000, 45635: 180_000_000 };
const GROUP_CATEGORY = Object.fromEntries(Object.values(TYPES).map((t) => [t[1], t[2]]));
const REQ_ATTRS = [
  [182, 277],
  [183, 278],
  [184, 279],
] as const;
const esiCalls: string[] = [];
class FakeEsiError extends Error {
  constructor(public status: number) {
    super(`ESI ${status}`);
  }
}
mock.module(`${API}/lib/esi.ts`, () => ({
  EsiError: FakeEsiError,
  esiGet: async (path: string) => {
    esiCalls.push(path);
    const type = path.match(/^\/universe\/types\/(\d+)$/);
    if (type) {
      const t = TYPES[Number(type[1])];
      if (!t) throw new FakeEsiError(404);
      const [name, group, , rank, pri, sec, req, omegaOnly] = t;
      const dogma_attributes = req.flatMap(([s, l], i) => [
        { attribute_id: REQ_ATTRS[i][0], value: s },
        { attribute_id: REQ_ATTRS[i][1], value: l },
      ]);
      if (omegaOnly) dogma_attributes.push({ attribute_id: 1047, value: 1 });
      if (rank) dogma_attributes.push({ attribute_id: 275, value: rank }, { attribute_id: 180, value: pri! }, { attribute_id: 181, value: sec! });
      return { data: { type_id: Number(type[1]), name, group_id: group, dogma_attributes }, headers: new Headers() };
    }
    const group = path.match(/^\/universe\/groups\/(\d+)$/);
    if (group) return { data: { group_id: Number(group[1]), category_id: GROUP_CATEGORY[Number(group[1])] }, headers: new Headers() };
    // The Forge sell orders: only those in the Jita system count (30000142)
    const orders = path.match(/^\/markets\/10000002\/orders\/\?order_type=sell&type_id=(\d+)&page=1$/);
    if (orders) {
      const price = JITA[Number(orders[1])];
      const data = price ? [{ price, is_buy_order: false, system_id: 30000142 }, { price: price / 2, is_buy_order: false, system_id: 30000144 }] : [];
      return { data, headers: new Headers({ 'x-pages': '1' }) };
    }
    throw new Error(`ESI no simulado: ${path}`);
  },
  esiPost: async (path: string, body: string[]) => {
    esiCalls.push(path);
    if (path !== '/universe/ids') throw new Error(`ESI no simulado: ${path}`);
    const byName = new Map(Object.entries(TYPES).map(([id, t]) => [t[0].toLowerCase(), { id: Number(id), name: t[0] }]));
    return { data: { inventory_types: body.map((n) => byName.get(n.toLowerCase())).filter(Boolean) }, headers: new Headers() };
  },
}));

const { db, runMigrations } = await import(`${API}/db/client.ts`);
const s = await import(`${API}/db/schema.ts`);
const { parseEft } = await import(`${API}/lib/eft.ts`);
const { parseEmp } = await import(`${API}/lib/emp.ts`);
const { spForLevel, withPrerequisites, evaluate } = await import(`${API}/lib/skill-math.ts`);
const { addFit, budget, createDoctrine, listDoctrines, refreshDoctrineDogma, setPlan, DoctrineError, renameDoctrine, deleteDoctrine } = await import(`${API}/services/doctrines.ts`);
const { injectorsFor, largeYield } = await import(`${API}/lib/injectors.ts`);
const { inArray } = await import('drizzle-orm');
runMigrations();

const PILOTS = [9101, 9102, 9103, 9104, 9105];
const SKILLS = 'esi-wallet.read_character_wallet.v1 esi-skills.read_skills.v1';
async function clean() {
  await db.delete(s.doctrines);
  await db.delete(s.characterSkills).where(inArray(s.characterSkills.characterId, PILOTS));
  await db.delete(s.characterAttributes).where(inArray(s.characterAttributes.characterId, PILOTS));
  await db.delete(s.characters).where(inArray(s.characters.id, PILOTS));
}
beforeAll(clean);
afterAll(clean);

const EFT = `[Rifter, Prueba DPS]
Damage Control II

[Empty Med slot]

Warrior II x5

Heavy Energy Neutralizer II x1
`;

test('lee un fit EFT: ranuras, munición, drones y carga', () => {
  const fit = parseEft(`[Rorqual, Beehive - SIR - DPS V26.1]
Damage Control II
Drone Damage Amplifier II

Capital Shield Extender II
EM Shield Hardener II /OFFLINE

Heavy Energy Neutralizer II
Heavy Gremlin Compiler Error, Nanite Repair Paste
[Empty High slot]



Hornet II x100
Wasp II x30

Cap Booster 3200 x8
Target Painter II`);
  expect(fit.ship).toBe('Rorqual');
  expect(fit.name).toBe('Beehive - SIR - DPS V26.1');
  const fitted = fit.lines.filter((l) => l.kind === 'fitted');
  expect(fitted.map((l) => l.block)).toEqual([0, 0, 1, 1, 2, 2]);
  expect(fitted.find((l) => l.name.startsWith('EM'))?.name).toBe('EM Shield Hardener II');
  expect(fit.lines.find((l) => l.kind === 'charge')?.name).toBe('Nanite Repair Paste');
  const bay = fit.lines.filter((l) => l.kind === 'bay');
  expect(bay.map((l) => [l.name, l.quantity])).toEqual([
    ['Hornet II', 100],
    ['Wasp II', 30],
    ['Cap Booster 3200', 8],
    ['Target Painter II', 1],
  ]);
  expect(() => parseEft('Damage Control II')).toThrow('no_header');
  // A mid block with only empty slots still counts: the highs don't become mids
  const empty = parseEft('[Rifter, Tackle]\nDamage Control II\n\n[Empty Med slot]\n\nHeavy Energy Neutralizer II\n\nWarrior II x2');
  expect(empty.slotBlocks).toEqual([0, 1, 2]);
  expect(empty.lines.find((l) => l.name === 'Heavy Energy Neutralizer II')?.block).toBe(2);
});

test('lee un plan de EVEMon comprimido o en XML, con el nivel más alto de cada skill', () => {
  const xml = `<?xml version="1.0"?><plan name="Beehive &amp; Rorqual" revision="1">
    <entry skillID="3327" skill="Spaceship Command" level="1" priority="3" type="Planned"><notes>x</notes></entry>
    <entry skillID="3327" skill="Spaceship Command" level="4" priority="3" type="Planned"/>
    <entry skillID="3329" skill="Minmatar Frigate" level="2" priority="3" type="Planned"/></plan>`;
  const fromGz = parseEmp(Bun.gzipSync(new TextEncoder().encode(xml)));
  const fromXml = parseEmp(new TextEncoder().encode(xml));
  expect(fromGz).toEqual(fromXml);
  expect(fromGz.name).toBe('Beehive & Rorqual');
  expect(fromGz.skills).toEqual([
    { skillId: 3327, level: 4 },
    { skillId: 3329, level: 2 },
  ]);
  expect(() => parseEmp(new TextEncoder().encode('hola'))).toThrow('not_a_plan');
});

test('SP por nivel, prerrequisitos en cadena y tiempo de entrenamiento', () => {
  expect([1, 2, 3, 4, 5].map((l) => spForLevel(1, l))).toEqual([250, 1415, 8000, 45255, 256000]);
  const info = (id: number) => {
    const t = TYPES[id];
    return t ? { rank: t[3], primaryAttr: t[4], secondaryAttr: t[5], required: t[6].map(([skillId, level]) => ({ skillId, level })) } : undefined;
  };
  // Hull Upgrades III requires Mechanics II
  expect([...withPrerequisites([{ skillId: 3394, level: 3 }], info)]).toEqual([
    [3394, 3],
    [3392, 2],
  ]);
  const attributes = { charisma: 20, intelligence: 20, memory: 20, perception: 20, willpower: 20 };
  const req = new Map([[3394, 3], [3392, 2]]);
  const omega = evaluate(req, { clone: 'omega', attributes, skills: new Map([[3392, { trained: 1, active: 1, sp: 250 }]]) }, info);
  // 16,000 SP of Hull Upgrades III (rank 2) + 1,165 of Mechanics II, at 20 + 20/2 = 30 SP per minute
  expect(omega.missingSp).toBe(16000 + 1165);
  expect(omega.minutes).toBeCloseTo((16000 + 1165) / 30, 6);
  const alpha = evaluate(req, { clone: 'alpha', attributes, skills: new Map([[3392, { trained: 1, active: 1, sp: 250 }]]) }, info);
  expect(alpha.minutes).toBeCloseTo(omega.minutes! * 2, 6);
});

test('inyectores: tramos por SP totales, SP sin asignar primero y pequeños si salen más baratos', () => {
  expect([4_999_999, 5_000_000, 50_000_000, 80_000_000].map(largeYield)).toEqual([500_000, 400_000, 300_000, 150_000]);
  const price = { large: 800_000_000, small: 180_000_000 };
  // 600,000 SP with 4.9 M: a large gives 500,000 (still below 5 M); 100,000 left at 80,000 per small = 2
  expect(injectorsFor(600_000, 4_900_000, 0, price)).toEqual({ sp: 600_000, large: 1, small: 2, cost: 800_000_000 + 2 * 180_000_000 });
  // Unallocated SP are spent first
  expect(injectorsFor(600_000, 4_900_000, 650_000, price)).toEqual({ sp: 0, large: 0, small: 0, cost: 0 });
  // No prices: 5 or more small → one large; the cost is unknown
  expect(injectorsFor(350_000, 10_000_000, 0, { large: null, small: null })).toEqual({ sp: 350_000, large: 1, small: 0, cost: null });
});

test('presupuesto: con todo el wallet o reservando el Omega, en horas de ratting y días', () => {
  const funds = { wallet: 600, omegaReserve: 500, iskPerHour: 100, dailyNet: 50 };
  expect(budget(1000, funds)).toEqual({
    need: 1000,
    wallet: { short: 400, hours: 4, days: 8 },
    withOmega: { short: 900, hours: 9, days: 18 },
  });
  expect(budget(100, funds).wallet).toEqual({ short: 0, hours: 0, days: 0 });
  // Without a PLEX price there's no Omega scenario; without a positive rate, no days
  expect(budget(1000, { ...funds, omegaReserve: null, dailyNet: -5 })).toEqual({ need: 1000, wallet: { short: 400, hours: 4, days: null }, withOmega: null });
});

test('importa un fit y un plan, y dice qué piloto vuela qué', async () => {
  const { id } = await createDoctrine('  Frigates  ');
  const fit = await addFit(id, EFT);
  expect(fit.ignored).toEqual([]);
  await expect(addFit(id, '[Nave Inventada, X]\nDamage Control II')).rejects.toBeInstanceOf(DoctrineError);
  const plan = Bun.gzipSync(
    new TextEncoder().encode(
      '<plan name="Rifter óptimo"><entry skillID="3329" level="4"/><entry skillID="3327" level="4"/></plan>',
    ),
  );
  expect(await setPlan(fit.id, plan, 'rifter.emp')).toEqual({ name: 'Rifter óptimo', skills: 2 });

  const now = new Date();
  await db.insert(s.characters).values([
    { id: 9101, name: 'A Omega', ownerHash: 'a', scopes: SKILLS, refreshToken: 'x', skillsAt: now },
    { id: 9102, name: 'B Alfa', ownerHash: 'b', scopes: SKILLS, refreshToken: 'x', skillsAt: now, clone: 'alpha' },
    { id: 9103, name: 'C Novato', ownerHash: 'c', scopes: SKILLS, refreshToken: 'x', skillsAt: now },
    { id: 9104, name: 'D Sin permiso', ownerHash: 'd', scopes: 'esi-wallet.read_character_wallet.v1', refreshToken: 'x' },
    { id: 9105, name: 'E Sin sync', ownerHash: 'e', scopes: SKILLS, refreshToken: 'x' },
  ]);
  const attrs = { charisma: 20, intelligence: 20, memory: 20, perception: 20, willpower: 20, updatedAt: now };
  await db.insert(s.characterAttributes).values(PILOTS.slice(0, 3).map((characterId) => ({ characterId, ...attrs })));
  const all: [number, number, number][] = [
    [3327, 3, 8000],
    [3329, 1, 500],
    [3392, 2, 1415],
    [3394, 3, 16000],
    [3436, 1, 250],
    [24241, 2, 1415],
  ];
  const skill = (characterId: number, [skillId, level, sp]: [number, number, number], active = level) => ({ characterId, skillId, trainedLevel: level, activeLevel: active, sp });
  await db.insert(s.characterSkills).values([
    ...all.map((x) => skill(9101, x)),
    // The Alpha has Light Drone Operation II trained, but can only use it at level I
    ...all.map((x) => skill(9102, x, x[0] === 24241 ? 1 : x[1])),
    // The newbie doesn't have Hull Upgrades and is missing Mechanics II
    ...all.filter(([id]) => id !== 3394 && id !== 3392).map((x) => skill(9103, x)),
    skill(9103, [3392, 1, 250]),
  ]);

  const view = await listDoctrines();
  const f = view.doctrines.find((d) => d.id === id)!.fits[0];
  expect(f.ship).toBe('Rifter');
  expect(f.slots.low).toBe(1);
  expect(f.drones).toBe(5);
  expect(f.cargo).toBe(1);
  // The cargo (the neutralizer) doesn't count: hull, Damage Control II and Warrior II with their prerequisites = 6 skills
  expect(f.required).toBe(6);
  const by = new Map(f.pilots.map((p) => [p.characterId, p]));
  expect(by.get(9101)!.status).toBe('ok');
  expect(by.get(9102)!.status).toBe('omega');
  expect(by.get(9103)!.status).toBe('missing');
  expect(by.get(9103)!.fly!.missing.map((m) => m.name)).toEqual(['Hull Upgrades', 'Mechanics']);
  expect(by.get(9103)!.fly!.minutes).toBeCloseTo((16000 + 1165) / 30, 6);
  expect(by.get(9104)!.status).toBe('noScope');
  expect(by.get(9105)!.status).toBe('noData');
  // Plan: Spaceship Command IV (45,255 SP, has 8,000) and Minmatar Frigate IV (90,510 SP, has 500)
  const p = by.get(9101)!.plan!;
  expect(p.targetSp).toBe(45255 + 90510);
  expect(p.haveSp).toBe(8000 + 500);
  expect(p.missing.length).toBe(2);
  // Cost in Jita (only orders in the Jita system): hull 0.5 M + Damage Control II 1.2 M + 5 Warrior II 1.5 M;
  // the neutralizer in the cargo has no orders
  expect(f.cost).toMatchObject({ hull: 500_000, fitted: 1_200_000, drones: 1_500_000, cargo: 0, unpriced: 1, total: 3_200_000 });
  // The newbie is missing 17,165 SP: with 0 total SP, a small gives 100,000 and is cheaper than a large
  expect(by.get(9103)!.injectors!.fly).toEqual({ sp: 17165, large: 0, small: 1, cost: 180_000_000 });
  expect(by.get(9103)!.budget!.need).toBe(3_200_000 + 180_000_000);
  // Whoever can already fly it only needs the fit; so does an Alpha who only needs Omega
  expect(by.get(9101)!.injectors!.fly).toBeNull();
  expect(by.get(9101)!.budget!.need).toBe(3_200_000);
  expect(by.get(9102)!.budget!.need).toBe(3_200_000);
  expect(by.get(9104)!.budget).toBeNull();
  // The Alpha has Light Drone Operation II trained but only uses level I: the fit requires Omega
  expect(f.clone).toBe('omega');
  expect(f.omegaSkills).toEqual([]);

  // A ship that requires an Omega-only skill: Omega even if nobody has trained it, and the Alpha comes out as «omega»
  const muninn = await addFit(id, '[Muninn, Prueba]\nDamage Control II');
  const m = (await listDoctrines()).doctrines.find((d) => d.id === id)!.fits.find((x) => x.id === muninn.id)!;
  expect(m.clone).toBe('omega');
  expect(m.omegaSkills).toEqual(['Heavy Assault Cruisers']);
  expect(m.pilots.find((x) => x.characterId === 9102)!.status).toBe('omega');
  expect(m.pilots.find((x) => x.characterId === 9101)!.status).toBe('missing');
  // Each type is requested from ESI only once: the second import no longer calls /universe/types
  const before = esiCalls.filter((c) => c.startsWith('/universe/types')).length;
  await addFit(id, EFT);
  expect(esiCalls.filter((c) => c.startsWith('/universe/types')).length).toBe(before);
});

test('renombra una doctrina: recorta el nombre, rechaza el vacío y la que no existe', async () => {
  const { id } = await createDoctrine('Temporal');
  expect(await renameDoctrine(id, '  Beehive  ')).toEqual({ id, name: 'Beehive' });
  await expect(renameDoctrine(id, '   ')).rejects.toMatchObject({ code: 'name' });
  await expect(renameDoctrine(999_999, 'X')).rejects.toMatchObject({ code: 'doctrine' });
  expect((await listDoctrines()).doctrines.find((d) => d.id === id)?.name).toBe('Beehive');
  await deleteDoctrine(id);
});

test('las skills guardadas sin saber si son solo Omega se vuelven a pedir una vez', async () => {
  const { eq } = await import('drizzle-orm');
  await db.update(s.typeDogma).set({ omegaOnly: null }).where(eq(s.typeDogma.typeId, 16591));
  const before = esiCalls.filter((c) => c === '/universe/types/16591').length;
  await refreshDoctrineDogma();
  const [row] = await db.select().from(s.typeDogma).where(eq(s.typeDogma.typeId, 16591));
  expect(row.omegaOnly).toBe(true);
  expect(esiCalls.filter((c) => c === '/universe/types/16591').length).toBe(before + 1);
  // Once the data is there, it isn't requested again
  await refreshDoctrineDogma();
  expect(esiCalls.filter((c) => c === '/universe/types/16591').length).toBe(before + 1);
});
