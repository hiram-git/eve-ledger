// Vuelta a la página de origen tras una acción (?back= o campo del formulario): solo rutas del propio dashboard.
// No basta con mirar que empiece por «/» y no por «//»: el navegador lee «/\evil.example» y «/<tab>/evil.example»
// como otro sitio. Se normaliza con URL contra un origen ficticio y se queda la ruta solo si sigue en él
const BASE = 'http://local.invalid';

export function safeBackUrl(raw: string | null | undefined): URL {
  try {
    const url = new URL(raw ?? '/', BASE);
    if (url.origin === BASE && (raw ?? '/').startsWith('/')) return url;
  } catch {}
  return new URL('/', BASE);
}

export const safeBack = (raw: string | null | undefined) => {
  const url = safeBackUrl(raw);
  return url.pathname + url.search;
};
