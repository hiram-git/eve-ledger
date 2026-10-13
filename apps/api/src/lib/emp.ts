// EVEMon skill plans (.emp): a gzip-compressed XML, with one entry per skill and level:
//   <plan name="Beehive - Rorqual"> <entry skillID="3327" skill="Spaceship Command" level="1" …/> …
// Uncompressed XML works too. Only the highest level of each skill in the plan counts
import type { RequiredSkill } from '../db/schema';

export type EmpPlan = { name: string; skills: RequiredSkill[] };

const MAX_COMPRESSED = 1_000_000;
const MAX_XML = 5_000_000;

export class EmpError extends Error {}

const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

export function parseEmp(bytes: Uint8Array): EmpPlan {
  if (bytes.length > MAX_COMPRESSED) throw new EmpError('too_big');
  let raw: Uint8Array = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      raw = Bun.gunzipSync(new Uint8Array(bytes));
    } catch {
      throw new EmpError('not_a_plan');
    }
  }
  if (raw.length > MAX_XML) throw new EmpError('too_big');
  const xml = new TextDecoder().decode(raw);
  const plan = xml.match(/<plan\b[^>]*>/);
  if (!plan) throw new EmpError('not_a_plan');
  const name = unescape(plan[0].match(/\bname="([^"]*)"/)?.[1] ?? '').trim();

  const best = new Map<number, number>();
  for (const entry of xml.matchAll(/<entry\b[^>]*>/g)) {
    const id = Number(entry[0].match(/\bskillID="(\d+)"/)?.[1]);
    const level = Number(entry[0].match(/\blevel="(\d)"/)?.[1]);
    if (!Number.isInteger(id) || id <= 0 || !(level >= 1 && level <= 5)) continue;
    best.set(id, Math.max(best.get(id) ?? 0, level));
  }
  if (!best.size) throw new EmpError('empty');
  return { name, skills: [...best].map(([skillId, level]) => ({ skillId, level })) };
}
