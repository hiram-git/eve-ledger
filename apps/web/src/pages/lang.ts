import type { APIRoute } from 'astro';
import { safeBack } from '../lib/safe-back';
import { LANG_COOKIE, isLang } from '../lib/i18n';

// Language selector: stores the choice in a cookie (1 year) and returns to the originating page
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get('to');
  // Local paths only: never redirect outside the dashboard
  const back = safeBack(url.searchParams.get('back'));
  if (isLang(to)) cookies.set(LANG_COOKIE, to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return redirect(back, 303);
};
