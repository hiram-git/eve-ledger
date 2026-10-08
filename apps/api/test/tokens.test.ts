// Renovación de tokens sin Client Secret (PKCE): EVE invalida cada refresh token en cuanto se usa.
// Con el SSO simulado: el token nuevo se guarda aunque falle la validación, dos renovaciones a la vez usan
// el refresh token una sola vez, y revincular durante una renovación no pisa los tokens nuevos
import { expect, mock, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR = join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

// EVE simulado: cada refresh token vale una sola vez (como sin Client Secret) y devuelve uno nuevo
const valid = new Set<string>();
let n = 0;
let verifyFails = false;
const calls: string[] = [];
mock.module(`${API}/lib/sso.ts`, () => ({
  refreshAccessToken: async (rt: string, method: string) => {
    calls.push(`${method}:${rt}`);
    await Bun.sleep(30);
    if (!valid.delete(rt)) throw new Error('SSO 400: {"error":"invalid_grant"}');
    const next = `rt${++n}`;
    valid.add(next);
    return { access_token: `at${n}`, refresh_token: next, expires_in: 1199, token_type: 'Bearer' };
  },
  verifyAccessToken: async () => {
    if (verifyFails) throw new Error('JWKS: sin red');
    return { characterId: 1, name: 'Piloto', ownerHash: 'own', scopes: [] };
  },
}));

const { db, runMigrations } = await import(`${API}/db/client.ts`);
const { characters } = await import(`${API}/db/schema.ts`);
const { encrypt, decrypt } = await import(`${API}/lib/crypto.ts`);
const { getAccessToken } = await import(`${API}/lib/tokens.ts`);
const { eq } = await import('drizzle-orm');
runMigrations();

async function reset(rt: string) {
  valid.clear(); valid.add(rt); calls.length = 0; verifyFails = false;
  await db.delete(characters);
  await db.insert(characters).values({ id: 1, name: 'Piloto', ownerHash: 'own', scopes: '', authMethod: 'pkce', refreshToken: await encrypt(rt), accessToken: null, tokenExpiresAt: null });
}
const storedRefresh = async () => decrypt((await db.query.characters.findFirst({ where: eq(characters.id, 1) }))!.refreshToken);

test('renueva y guarda el refresh token nuevo (PKCE)', async () => {
  await reset('rt0');
  expect(await getAccessToken(1)).toMatch(/^at\d+$/);
  expect(valid.has(await storedRefresh())).toBe(true);
  expect(calls[0]).toBe('pkce:rt0');
});

test('si falla la validación, el refresh token nuevo no se pierde', async () => {
  await reset('rtA');
  verifyFails = true;
  await expect(getAccessToken(1)).rejects.toThrow('JWKS');
  // El viejo ya no vale en EVE, pero el guardado sí: la siguiente renovación funciona
  verifyFails = false;
  expect(await getAccessToken(1)).toMatch(/^at\d+$/);
  expect(calls.length).toBe(2);
});

test('dos renovaciones a la vez usan el refresh token una sola vez', async () => {
  await reset('rtB');
  const [a, b] = await Promise.all([getAccessToken(1), getAccessToken(1)]);
  expect(a).toBe(b);
  expect(calls.length).toBe(1);
});

test('revincular durante la renovación no pisa los tokens nuevos', async () => {
  await reset('rtC');
  const p = getAccessToken(1);
  await Bun.sleep(5);
  // La callback del login guarda tokens nuevos mientras la renovación está en vuelo
  valid.add('rtNEW');
  await db.update(characters).set({ refreshToken: await encrypt('rtNEW'), accessToken: await encrypt('atNEW'), tokenExpiresAt: new Date(Date.now() + 1_000_000) }).where(eq(characters.id, 1));
  expect(await p).toBe('atNEW');
  expect(await storedRefresh()).toBe('rtNEW');
});
