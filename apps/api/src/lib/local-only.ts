// Solo esta máquina. La API escucha en 127.0.0.1, pero eso no frena al navegador del propio usuario: una web que
// visita puede apuntar su dominio a 127.0.0.1 (DNS rebinding) y leer el wallet con el puerto fijo de la app de
// escritorio (47300), o mandar un POST con un formulario. Se rechaza cualquier Host que no sea local y cualquier
// petición que no sea GET con un Origin ajeno. ALLOWED_HOSTS (separados por comas) añade nombres a mano, por
// ejemplo si alguien expone la API en su red con HOST=0.0.0.0
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
  // La interfaz en la que escucha, si es una concreta (no 0.0.0.0 ni ::)
  if (bind && !['0.0.0.0', '::', '[::]'].includes(bind)) names.push(bind.includes(':') && !bind.startsWith('[') ? `[${bind}]` : bind);
  return new Set(names.map((n) => hostname(n.trim())).filter((n): n is string => !!n));
}

// null si la petición puede seguir; si no, la respuesta 403
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
