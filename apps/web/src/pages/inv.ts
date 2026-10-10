import type { APIRoute } from 'astro';
import { safeBack } from '../lib/safe-back';
import { INV_COOKIE } from '../lib/inventory-pref';

// Patrimonio con o sin inventario: guarda la elección en una cookie (1 año) y vuelve a la página de origen
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get('to');
  // Solo rutas locales: nunca redirigir fuera del dashboard
  const back = safeBack(url.searchParams.get('back'));
  if (to === '0' || to === '1') cookies.set(INV_COOKIE, to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return redirect(back, 303);
};
