import type { APIRoute } from 'astro';
import { safeBack } from '../lib/safe-back';
import { LANG_COOKIE, isLang } from '../lib/i18n';

// Selector de idioma: guarda la elección en una cookie (1 año) y vuelve a la página de origen
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get('to');
  // Solo rutas locales: nunca redirigir fuera del dashboard
  const back = safeBack(url.searchParams.get('back'));
  if (isLang(to)) cookies.set(LANG_COOKIE, to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return redirect(back, 303);
};
