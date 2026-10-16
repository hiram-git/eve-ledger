// This machine only (same rule as the API, apps/api/src/lib/local-only.ts): the dashboard shows the wallet
// without login, so a website pointing its domain at 127.0.0.1 (DNS rebinding) must not be able to read it via the
// desktop app's fixed port. Any non-local Host is rejected. ALLOWED_HOSTS (comma-separated)
// adds names manually. POSTs from other websites are already rejected by Astro (security.checkOrigin)
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
