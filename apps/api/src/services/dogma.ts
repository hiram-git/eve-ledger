// Dogma of the types used by doctrines: name, category, required skills and, for skills, rank and attributes.
// Public and static (GET /universe/types/{id} and /universe/groups/{id}): requested once and stored in type_dogma.
// Required skills are followed in a chain (the prerequisites of the prerequisites) until all are known
import { inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { typeDogma, type RequiredSkill } from '../db/schema';
import { EsiError, esiGet, esiPost } from '../lib/esi';

export const CATEGORY = { ship: 6, module: 7, charge: 8, skill: 16, drone: 18, implant: 20, subsystem: 32, fighter: 87 } as const;

// requiredSkill1…6 and their level (requiredSkill1Level…6Level), rank (skillTimeConstant) and skill attributes
const REQUIRED = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
] as const;
const RANK = 275;
const PRIMARY = 180;
const SECONDARY = 181;
// canNotBeTrainedOnTrial: the skill is Omega-only (Alpha level caps aren't in ESI: cloneGrades in the SDE)
const OMEGA_ONLY = 1047;

type EsiType = { type_id: number; name: string; group_id: number; dogma_attributes?: { attribute_id: number; value: number }[] };
type EsiGroup = { group_id: number; category_id: number };
type EsiIds = { inventory_types?: { id: number; name: string }[] };

export type TypeInfo = typeof typeDogma.$inferSelect;

// At most this many ESI calls per import (a fit with its plan needs about 150 the first time)
const MAX_LOOKUPS = 600;

export function dogmaRow(t: EsiType, categoryId: number): typeof typeDogma.$inferInsert {
  const attr = new Map((t.dogma_attributes ?? []).map((a) => [a.attribute_id, a.value]));
  const required: RequiredSkill[] = [];
  for (const [skill, level] of REQUIRED) {
    const id = attr.get(skill);
    const lv = attr.get(level);
    if (id && lv) required.push({ skillId: Math.round(id), level: Math.round(lv) });
  }
  return {
    typeId: t.type_id,
    name: t.name,
    groupId: t.group_id,
    categoryId,
    rank: attr.get(RANK) ?? null,
    primaryAttr: attr.has(PRIMARY) ? Math.round(attr.get(PRIMARY)!) : null,
    secondaryAttr: attr.has(SECONDARY) ? Math.round(attr.get(SECONDARY)!) : null,
    required,
    omegaOnly: categoryId === CATEGORY.skill ? attr.get(OMEGA_ONLY) === 1 : null,
    updatedAt: new Date(),
  };
}

export async function loadDogma(ids: number[]): Promise<Map<number, TypeInfo>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(typeDogma).where(inArray(typeDogma.typeId, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.typeId, r]));
}

// The requested types and all the skills they require (in a chain). Returns those known at the end; an id that
// ESI doesn't recognize (404) is left out
export async function ensureDogma(ids: number[]): Promise<Map<number, TypeInfo>> {
  const known = await loadDogma(ids);
  const groupCategory = new Map<number, number>();
  for (const t of known.values()) groupCategory.set(t.groupId, t.categoryId);
  const queue = [...new Set(ids)];
  const seen = new Set<number>();
  let lookups = 0;
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    let row = known.get(id);
    // A skill stored before attribute 1047 was read is requested again once
    if (row && row.categoryId === CATEGORY.skill && row.omegaOnly === null) row = undefined;
    if (!row) {
      const stored = (await loadDogma([id])).get(id);
      const stale = !!stored && stored.categoryId === CATEGORY.skill && stored.omegaOnly === null;
      if (stored && !stale) row = stored;
      // With no calls left to spend, the old row still works (it only lacks whether it's Omega-only)
      else if (lookups >= MAX_LOOKUPS) row = stored;
      else {
        try {
          lookups++;
          const { data } = await esiGet<EsiType>(`/universe/types/${id}`);
          let category = groupCategory.get(data.group_id);
          if (category === undefined) {
            lookups++;
            category = (await esiGet<EsiGroup>(`/universe/groups/${data.group_id}`)).data.category_id;
            groupCategory.set(data.group_id, category);
          }
          const values = dogmaRow(data, category);
          db.insert(typeDogma).values(values).onConflictDoUpdate({ target: typeDogma.typeId, set: values }).run();
          row = (await loadDogma([id])).get(id);
        } catch (err) {
          if (err instanceof EsiError && err.status === 404) continue;
          // ESI down while refreshing an already stored skill: keep the one we had
          if (!stored) throw err;
          row = stored;
        }
      }
      if (row) known.set(id, row);
    }
    for (const r of row?.required ?? []) if (!seen.has(r.skillId)) queue.push(r.skillId);
  }
  return known;
}

// English names (the EFT ones) → type id, with POST /universe/ids (up to 500 names per call).
// The map key is lowercase: some websites' EFT doesn't respect capitalization
export async function resolveTypeNames(names: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 500) {
    const { data } = await esiPost<EsiIds>('/universe/ids', unique.slice(i, i + 500));
    for (const t of data.inventory_types ?? []) out.set(t.name.toLowerCase(), t.id);
  }
  return out;
}
