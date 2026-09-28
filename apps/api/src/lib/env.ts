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
};
