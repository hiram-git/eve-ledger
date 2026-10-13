// Skill injectors: how many are needed for a number of SP and how much they cost.
// A Large Skill Injector gives 500,000 SP below 5 M total SP, 400,000 up to 50 M, 300,000 up to 80 M and
// 150,000 from there on; the Small, a fifth of that. It counts the pilot's total including unallocated SP, which grows with
// each injector (the bracket can change midway). The unallocated SP they already have are spent first
export const INJECTOR = { large: 40520, small: 45635 } as const;

const TIERS: [number, number][] = [
  [5_000_000, 500_000],
  [50_000_000, 400_000],
  [80_000_000, 300_000],
  [Infinity, 150_000],
];
export const largeYield = (totalSp: number) => TIERS.find(([max]) => totalSp < max)![1];
export const smallYield = (totalSp: number) => largeYield(totalSp) / 5;

export type InjectorPlan = {
  // SP to inject (what's missing minus the unallocated SP)
  sp: number;
  large: number;
  small: number;
  // null if the price of any injector used is missing
  cost: number | null;
};

// Large ones while they fit; the rest with small ones unless a large one is cheaper (or, without prices, if
// 5 or more small ones would be needed)
export function injectorsFor(
  neededSp: number,
  totalSp: number,
  unallocatedSp: number,
  price: { large: number | null; small: number | null },
): InjectorPlan {
  const sp = Math.max(0, Math.ceil(neededSp - unallocatedSp));
  let need = sp;
  let total = totalSp + unallocatedSp;
  let large = 0;
  let small = 0;
  // Safety cap: more than 2000 injectors isn't a plan
  while (need > 0 && large + small < 2000) {
    const y = largeYield(total);
    if (need >= y) {
      large++;
      need -= y;
      total += y;
      continue;
    }
    const s = smallYield(total);
    const smalls = Math.ceil(need / s);
    const oneLargeCheaper =
      price.large !== null && price.small !== null ? price.large <= smalls * price.small : smalls >= 5;
    if (oneLargeCheaper) large++;
    else small += smalls;
    need = 0;
  }
  const cost =
    (large && price.large === null) || (small && price.small === null) ? null : large * (price.large ?? 0) + small * (price.small ?? 0);
  return { sp, large, small, cost };
}
