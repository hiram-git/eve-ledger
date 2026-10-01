import type { AstroGlobal } from 'astro';

export const INV_COOKIE = 'inv';

// Patrimonio con inventario o solo wallets (por defecto: solo wallets, el dinero que paga el Omega).
// ?inv=1 / ?inv=0 en la URL manda sobre la cookie para esa vista
export function withInventory(astro: Pick<AstroGlobal, 'cookies' | 'url'>): { on: boolean; override: '0' | '1' | null } {
  const q = astro.url.searchParams.get('inv');
  if (q === '0' || q === '1') return { on: q === '1', override: q };
  return { on: astro.cookies.get(INV_COOKIE)?.value === '1', override: null };
}
