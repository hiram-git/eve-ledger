// Shares (donuts): at most 7 slices, in fixed order (slice i always gets color i, in the legend
// too); from the seventh on, «Otros N» (Others N) with the sum of the rest
export const MAX_SLICES = 7;

export type Slice = { label: string; value: number };

export const fold = <T extends Slice>(items: T[], otherLabel: (n: number) => string): (T | Slice)[] => {
  if (items.length <= MAX_SLICES) return items;
  const head = items.slice(0, MAX_SLICES - 1);
  const rest = items.slice(MAX_SLICES - 1);
  return [...head, { label: otherLabel(rest.length), value: rest.reduce((n, i) => n + i.value, 0) }];
};

// A slice's percentage of the total («93 %»; under 1 % reads «<1 %»)
export const shareOf = (value: number, total: number, lang: string) => {
  if (total <= 0 || value <= 0) return '0 %';
  const p = value / total;
  if (p < 0.01) return `<1 %`;
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(p);
};
