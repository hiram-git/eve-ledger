import type { APIRoute } from 'astro';
import { INV_COOKIE } from '../lib/inventory-pref';

// Patrimonio con o sin inventario: guarda la elección en una cookie (1 año) y vuelve a la página de origen
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get('to');
  const rawBack = url.searchParams.get('back') ?? '/';
  // Solo rutas locales: nunca redirigir fuera del dashboard
  const back = rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : '/';
  if (to === '0' || to === '1') cookies.set(INV_COOKIE, to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return redirect(back, 303);
};
