import type { AstroGlobal } from 'astro';

export const INV_COOKIE = 'inv';

// Net worth with inventory or wallets only (default: wallets only, the money that pays for Omega).
// ?inv=1 / ?inv=0 in the URL overrides the cookie for that view
export function withInventory(astro: Pick<AstroGlobal, 'cookies' | 'url'>): { on: boolean; override: '0' | '1' | null } {
  const q = astro.url.searchParams.get('inv');
  if (q === '0' || q === '1') return { on: q === '1', override: q };
  return { on: astro.cookies.get(INV_COOKIE)?.value === '1', override: null };
}
