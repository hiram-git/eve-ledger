// Repartos (tortas): como mucho 7 porciones, en orden fijo (la porción i lleva siempre el color i, también en la
// leyenda); a partir de la séptima, «Otros N» con la suma del resto
export const MAX_SLICES = 7;

export type Slice = { label: string; value: number };

export const fold = <T extends Slice>(items: T[], otherLabel: (n: number) => string): (T | Slice)[] => {
  if (items.length <= MAX_SLICES) return items;
  const head = items.slice(0, MAX_SLICES - 1);
  const rest = items.slice(MAX_SLICES - 1);
  return [...head, { label: otherLabel(rest.length), value: rest.reduce((n, i) => n + i.value, 0) }];
};

// Porcentaje de una porción sobre el total («93 %»; menos de 1 % se dice «<1 %»)
export const shareOf = (value: number, total: number, lang: string) => {
  if (total <= 0 || value <= 0) return '0 %';
  const p = value / total;
  if (p < 0.01) return `<1 %`;
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(p);
};
