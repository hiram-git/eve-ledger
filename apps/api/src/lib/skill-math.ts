// Cuentas de skills: SP por nivel, prerrequisitos en cadena y tiempo de entrenamiento
import type { RequiredSkill } from '../db/schema';

// Atributos de EVE por su id de dogma (lo que guardan primaryAttribute y secondaryAttribute de cada skill)
export const ATTRIBUTE_BY_ID = { 164: 'charisma', 165: 'intelligence', 166: 'memory', 167: 'perception', 168: 'willpower' } as const;
export type Attributes = Record<(typeof ATTRIBUTE_BY_ID)[keyof typeof ATTRIBUTE_BY_ID], number>;

// SP para tener una skill a un nivel: 250 × rango × √32^(nivel − 1) (nivel 5 de una de rango 1 = 256.000)
export const spForLevel = (rank: number, level: number) => (level <= 0 ? 0 : Math.ceil(250 * rank * Math.pow(2, 2.5 * (level - 1))));

export type SkillInfo = { rank: number | null; primaryAttr: number | null; secondaryAttr: number | null; required: RequiredSkill[] };

// Lo que pide un fit o un plan, con los prerrequisitos de cada skill (y los de esos) al nivel que piden
export function withPrerequisites(targets: Iterable<RequiredSkill>, info: (skillId: number) => SkillInfo | undefined): Map<number, number> {
  const out = new Map<number, number>();
  const stack = [...targets];
  while (stack.length) {
    const { skillId, level } = stack.pop()!;
    if (level <= 0 || (out.get(skillId) ?? 0) >= level) continue;
    out.set(skillId, level);
    for (const r of info(skillId)?.required ?? []) stack.push(r);
  }
  return out;
}

export type PilotSkills = {
  clone: 'omega' | 'alpha';
  attributes: Attributes | null;
  skills: Map<number, { trained: number; active: number; sp: number }>;
};

export type MissingSkill = {
  skillId: number;
  active: number;
  trained: number;
  need: number;
  // SP que faltan (0 si ya está entrenada pero un Alfa no puede usarla) y minutos de entrenamiento
  sp: number | null;
  minutes: number | null;
  omegaOnly: boolean;
};

export type Evaluation = {
  missing: MissingSkill[];
  missingSp: number | null;
  minutes: number | null;
  // SP que pide el conjunto y SP que ya tiene de ellos: el progreso de un plan
  targetSp: number | null;
  haveSp: number | null;
  // Le falta solo ser Omega: tiene entrenado todo, pero como Alfa no puede usarlo
  needsOmega: boolean;
};

// SP por minuto en una skill: primario + secundario / 2; un Alfa, la mitad
export function spPerMinute(info: SkillInfo | undefined, pilot: PilotSkills): number | null {
  if (!info?.primaryAttr || !info.secondaryAttr || !pilot.attributes) return null;
  const a = pilot.attributes[ATTRIBUTE_BY_ID[info.primaryAttr as keyof typeof ATTRIBUTE_BY_ID]];
  const b = pilot.attributes[ATTRIBUTE_BY_ID[info.secondaryAttr as keyof typeof ATTRIBUTE_BY_ID]];
  if (a === undefined || b === undefined) return null;
  const rate = a + b / 2;
  return pilot.clone === 'alpha' ? rate / 2 : rate;
}

export function evaluate(required: Map<number, number>, pilot: PilotSkills, info: (skillId: number) => SkillInfo | undefined): Evaluation {
  const missing: MissingSkill[] = [];
  let missingSp: number | null = 0;
  let minutes: number | null = 0;
  let targetSp: number | null = 0;
  let haveSp: number | null = 0;
  for (const [skillId, need] of required) {
    const s = pilot.skills.get(skillId) ?? { trained: 0, active: 0, sp: 0 };
    const i = info(skillId);
    const target = i?.rank ? spForLevel(i.rank, need) : null;
    if (target === null) targetSp = haveSp = null;
    else if (targetSp !== null && haveSp !== null) {
      targetSp += target;
      haveSp += Math.min(s.sp, target);
    }
    if (s.active >= need) continue;
    const omegaOnly = s.trained >= need;
    const sp = omegaOnly ? 0 : target === null ? null : Math.max(0, target - s.sp);
    const rate = spPerMinute(i, pilot);
    const m = sp === null ? null : sp === 0 ? 0 : rate ? sp / rate : null;
    missing.push({ skillId, active: s.active, trained: s.trained, need, sp, minutes: m, omegaOnly });
    missingSp = missingSp === null || sp === null ? null : missingSp + sp;
    minutes = minutes === null || m === null ? null : minutes + m;
  }
  missing.sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
  return { missing, missingSp, minutes, targetSp, haveSp, needsOmega: missing.length > 0 && missing.every((m) => m.omegaOnly) };
}
