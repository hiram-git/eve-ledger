import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characterAttributes, characters, characterSkills } from '../db/schema';
import { esiGet } from '../lib/esi';
import type { StepResult } from './sync';

// Skills y atributos de cada piloto: para saber qué fits puede volar y cuánto le falta de un plan
export const SKILLS_SCOPE = 'esi-skills.read_skills.v1';

// GET /characters/{id}/skills
type EsiSkills = {
  skills: { skill_id: number; active_skill_level: number; trained_skill_level: number; skillpoints_in_skill: number }[];
  total_sp: number;
  unallocated_sp?: number;
};

// GET /characters/{id}/attributes (con los implantes ya sumados)
type EsiAttributes = { charisma: number; intelligence: number; memory: number; perception: number; willpower: number };

const CHUNK = 500;

export async function fetchSkills(characterId: number, r: StepResult) {
  const { data } = await esiGet<EsiSkills>(`/characters/${characterId}/skills`, characterId);
  const { data: attrs } = await esiGet<EsiAttributes>(`/characters/${characterId}/attributes`, characterId);
  r.pages = 2;
  r.fetched = data.skills.length;
  const rows = data.skills.map((s) => ({
    characterId,
    skillId: s.skill_id,
    trainedLevel: s.trained_skill_level,
    activeLevel: s.active_skill_level,
    sp: s.skillpoints_in_skill,
  }));
  // Una foto: se reemplaza entera (una skill no se «desentrena», pero así no queda nada viejo)
  db.transaction((tx) => {
    tx.delete(characterSkills).where(eq(characterSkills.characterId, characterId)).run();
    for (let i = 0; i < rows.length; i += CHUNK) tx.insert(characterSkills).values(rows.slice(i, i + CHUNK)).run();
    const now = new Date();
    tx.insert(characterAttributes)
      .values({ characterId, ...pickAttrs(attrs), updatedAt: now })
      .onConflictDoUpdate({ target: characterAttributes.characterId, set: { ...pickAttrs(attrs), updatedAt: now } })
      .run();
    tx.update(characters)
      .set({ totalSp: data.total_sp, unallocatedSp: data.unallocated_sp ?? 0, skillsAt: now })
      .where(eq(characters.id, characterId))
      .run();
  });
  r.inserted = rows.length;
}

const pickAttrs = (a: EsiAttributes) => ({
  charisma: a.charisma,
  intelligence: a.intelligence,
  memory: a.memory,
  perception: a.perception,
  willpower: a.willpower,
});
