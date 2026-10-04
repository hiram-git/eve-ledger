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
  // Opcional: sin secreto, el login de EVE usa PKCE (src/lib/sso.ts)
  clientSecret: Bun.env.EVE_CLIENT_SECRET?.trim() ?? '',
  callbackUrl: required('EVE_CALLBACK_URL'),
  encKey: required('ENC_KEY'),
  esiCompatDate: Bun.env.ESI_COMPAT_DATE ?? '2025-12-16',
  esiUserAgent: Bun.env.ESI_USER_AGENT ?? 'eve-ledger/0.1',
  port: Number(Bun.env.PORT ?? 3000),
  // Solo esta máquina: la API sirve el wallet sin login, no debe verse desde la red local
  host: Bun.env.HOST || '127.0.0.1',
  // Dashboard (apps/web): el navegador vuelve ahí tras el login de EVE
  webUrl: (Bun.env.WEB_URL ?? 'http://localhost:4321').replace(/\/$/, ''),
  // Minutos entre syncs automáticos de todos los personajes (0 = desactivado)
  syncIntervalMin: intOrDefault('SYNC_INTERVAL_MIN', 60),
  // Indicador «Omega de todas las cuentas»: cuántas cuentas y PLEX por mes de Omega de cada una
  omegaAccounts: intOrDefault('OMEGA_ACCOUNTS', 5),
  omegaPlexPerMonth: intOrDefault('OMEGA_PLEX_PER_MONTH', 500),
};
