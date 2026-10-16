function intOrDefault(name: string, fallback: number): number {
  const v = Bun.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} debe ser un entero >= 0 (valor: ${v})`);
  return n;
}

function required(name: string): string {
  const v = Bun.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} (revisa .env)`);
  return v;
}

export const env = {
  clientId: required('EVE_CLIENT_ID'),
  callbackUrl: required('EVE_CALLBACK_URL'),
  encKey: required('ENC_KEY'),
  esiCompatDate: Bun.env.ESI_COMPAT_DATE ?? '2025-12-16',
  esiUserAgent: Bun.env.ESI_USER_AGENT ?? 'eve-ledger/0.1',
  port: Number(Bun.env.PORT ?? 3000),
  // This machine only: the API serves the wallet without login, it must not be visible from the local network
  host: Bun.env.HOST || '127.0.0.1',
  // Dashboard (apps/web): the browser returns there after the EVE login
  webUrl: (Bun.env.WEB_URL ?? 'http://localhost:4321').replace(/\/$/, ''),
  // Desktop app: the login opened in the system browser; it returns to ${WEB_URL}/vinculado (a page
  // that shows the result and tries to close itself) instead of Pilotos, which is already visible in the app window
  authDonePage: Bun.env.AUTH_DONE_PAGE === '1',
  // Minutes between automatic syncs of all characters (0 = disabled)
  syncIntervalMin: intOrDefault('SYNC_INTERVAL_MIN', 60),
  // «Omega de todas las cuentas» indicator: how many accounts and PLEX per month of Omega for each
  omegaAccounts: intOrDefault('OMEGA_ACCOUNTS', 5),
  omegaPlexPerMonth: intOrDefault('OMEGA_PLEX_PER_MONTH', 500),
};
