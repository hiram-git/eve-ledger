// This machine only. The API listens on 127.0.0.1, but that does not stop the user's own browser: a site it
// visits can point its domain at 127.0.0.1 (DNS rebinding) and read the wallet through the desktop app's fixed
// port (47300), or send a POST with a form. Any Host that is not local is rejected, as is any non-GET request
// with a foreign Origin. ALLOWED_HOSTS (comma-separated) adds names by hand, for
// example if someone exposes the API on their network with HOST=0.0.0.0
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

const hostname = (value: string) => {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
};

export function allowedHosts(extra = Bun.env.ALLOWED_HOSTS ?? '', bind = Bun.env.HOST ?? ''): Set<string> {
  const names = [...LOCAL, ...extra.split(',')];
  // The interface it listens on, if it is a specific one (not 0.0.0.0 or ::)
  if (bind && !['0.0.0.0', '::', '[::]'].includes(bind)) names.push(bind.includes(':') && !bind.startsWith('[') ? `[${bind}]` : bind);
  return new Set(names.map((n) => hostname(n.trim())).filter((n): n is string => !!n));
}

// null if the request may proceed; otherwise, the 403 response
export function localOnly(request: Request, allowed = allowedHosts()): Response | null {
  const host = request.headers.get('host');
  const name = host ? hostname(host) : null;
  if (!name || !allowed.has(name)) return new Response('Host no permitido: EVE Ledger solo responde en esta máquina', { status: 403 });
  const origin = request.headers.get('origin');
  if (origin && request.method !== 'GET' && request.method !== 'HEAD') {
    let from: string | null = null;
    try {
      from = new URL(origin).hostname.toLowerCase();
    } catch {}
    if (!from || !allowed.has(from)) return new Response('Origen no permitido', { status: 403 });
  }
  return null;
}
