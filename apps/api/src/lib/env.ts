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
  clientSecret: required('EVE_CLIENT_SECRET'),
  callbackUrl: required('EVE_CALLBACK_URL'),
  encKey: required('ENC_KEY'),
  esiCompatDate: Bun.env.ESI_COMPAT_DATE ?? '2025-12-16',
  esiUserAgent: Bun.env.ESI_USER_AGENT ?? 'eve-ledger/0.1',
  port: Number(Bun.env.PORT ?? 3000),
  // Minutos entre syncs automáticos de todos los personajes (0 = desactivado)
  syncIntervalMin: intOrDefault('SYNC_INTERVAL_MIN', 60),
};
