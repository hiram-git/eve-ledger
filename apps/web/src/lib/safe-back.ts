// Return to the originating page after an action (?back= or form field): only routes of the dashboard itself.
// Checking that it starts with «/» and not «//» isn't enough: the browser reads «/\evil.example» and «/<tab>/evil.example»
// as another site. It's normalized with URL against a dummy origin and the path is kept only if it stays on it
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
