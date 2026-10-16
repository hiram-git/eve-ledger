// Skill math: SP per level, chained prerequisites and training time
import type { RequiredSkill } from '../db/schema';

// EVE attributes by their dogma id (what each skill's primaryAttribute and secondaryAttribute store)
export const ATTRIBUTE_BY_ID = { 164: 'charisma', 165: 'intelligence', 166: 'memory', 167: 'perception', 168: 'willpower' } as const;
export type Attributes = Record<(typeof ATTRIBUTE_BY_ID)[keyof typeof ATTRIBUTE_BY_ID], number>;

// SP to have a skill at a level: 250 × rank × √32^(level − 1) (level 5 of a rank 1 skill = 256,000)
export const spForLevel = (rank: number, level: number) => (level <= 0 ? 0 : Math.ceil(250 * rank * Math.pow(2, 2.5 * (level - 1))));

export type SkillInfo = {
  rank: number | null;
  primaryAttr: number | null;
  secondaryAttr: number | null;
  required: RequiredSkill[];
  // Omega only (an Alpha cannot train it); null = unknown
  omegaOnly?: boolean | null;
};

// What a fit or plan requires, with each skill's prerequisites (and theirs) at the requested level
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
  // Missing SP (0 if already trained but an Alpha cannot use it) and training minutes
  sp: number | null;
  minutes: number | null;
  // Trained to that level, but as an Alpha it cannot be used (the Alpha cap is below it)
  omegaOnly: boolean;
  // Skill an Alpha cannot train at all
  omegaSkill: boolean;
};

export type Evaluation = {
  missing: MissingSkill[];
  missingSp: number | null;
  minutes: number | null;
  // SP the set requires and SP already held of them: a plan's progress
  targetSp: number | null;
  haveSp: number | null;
  // Only missing Omega: everything is trained, but as an Alpha it cannot be used
  needsOmega: boolean;
  // An Alpha cannot fly it: missing an Omega-only skill or a level above its cap
  alphaBlocked: boolean;
};

// SP per minute in a skill: primary + secondary / 2; an Alpha, half that
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
    missing.push({ skillId, active: s.active, trained: s.trained, need, sp, minutes: m, omegaOnly, omegaSkill: i?.omegaOnly === true });
    missingSp = missingSp === null || sp === null ? null : missingSp + sp;
    minutes = minutes === null || m === null ? null : minutes + m;
  }
  missing.sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
  return {
    missing,
    missingSp,
    minutes,
    targetSp,
    haveSp,
    needsOmega: missing.length > 0 && missing.every((m) => m.omegaOnly),
    alphaBlocked: pilot.clone === 'alpha' && missing.some((m) => m.omegaOnly || m.omegaSkill),
  };
}
