// Inyectores de skills: cuántos hacen falta para unos SP y cuánto cuestan.
// Un Large Skill Injector da 500.000 SP por debajo de 5 M SP totales, 400.000 hasta 50 M, 300.000 hasta 80 M y
// 150.000 desde ahí; el Small, la quinta parte. Cuenta el total del piloto con los SP sin asignar, que crece con
// cada inyector (el tramo puede cambiar a mitad). Los SP sin asignar que ya tiene se gastan primero
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
  // SP que hay que inyectar (lo que falta menos los SP sin asignar)
  sp: number;
  large: number;
  small: number;
  // null si falta el precio de algún inyector que se usa
  cost: number | null;
};

// Más grandes mientras quepan; el resto con pequeños salvo que un grande salga más barato (o, sin precios, si
// harían falta 5 o más pequeños)
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
  // Tope de seguridad: más de 2000 inyectores no es un plan
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
