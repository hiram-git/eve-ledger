// Solo esta máquina (la misma regla que la API, apps/api/src/lib/local-only.ts): el dashboard muestra el wallet
// sin login, así que una web que apunte su dominio a 127.0.0.1 (DNS rebinding) no debe poder leerlo con el
// puerto fijo de la app de escritorio. Se rechaza cualquier Host que no sea local. ALLOWED_HOSTS (separados por
// comas) añade nombres a mano. Los POST de otras webs ya los rechaza Astro (security.checkOrigin)
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

const hostname = (value: string) => {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
};

export function allowedHosts(extra = process.env.ALLOWED_HOSTS ?? '', bind = process.env.HOST ?? ''): Set<string> {
  const names = [...LOCAL, ...extra.split(',')];
  if (bind && !['0.0.0.0', '::', '[::]'].includes(bind)) names.push(bind.includes(':') && !bind.startsWith('[') ? `[${bind}]` : bind);
  return new Set(names.map((n) => hostname(n.trim())).filter((n): n is string => !!n));
}

export function hostAllowed(host: string | null, allowed: Set<string>): boolean {
  const name = host ? hostname(host) : null;
  return !!name && allowed.has(name);
}
