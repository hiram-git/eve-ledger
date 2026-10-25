// The ESI client's limits, against a fake fetch: a 420 waits as long as ESI says and retries once, few errors left
// pauses the next call, and a call already waiting respects a pause that got longer meanwhile
import { afterAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(import.meta.dir, '../src');
Bun.env.DB_PATH ||= join(mkdtempSync(join(tmpdir(), 'eve-ledger-test-')), 'ledger.db');
Bun.env.MIGRATIONS_DIR ||= join(import.meta.dir, '../drizzle');
Bun.env.ENC_KEY ||= Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
Bun.env.EVE_CLIENT_ID ||= 'test';
Bun.env.EVE_CALLBACK_URL ||= 'http://127.0.0.1/auth/callback';

type Reply = { status?: number; remain?: number; reset?: number; delay?: number };
const replies = new Map<string, Reply[]>();
const sent: { path: string; at: number }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
  const path = new URL(url).pathname;
  sent.push({ path, at: Date.now() });
  const r = replies.get(path)?.shift() ?? {};
  if (r.delay) await Bun.sleep(r.delay);
  const headers = new Headers();
  if (r.remain !== undefined) headers.set('x-esi-error-limit-remain', String(r.remain));
  if (r.reset !== undefined) headers.set('x-esi-error-limit-reset', String(r.reset));
  return new Response(r.status && r.status >= 400 ? 'error' : '[]', { status: r.status ?? 200, headers });
}) as unknown as typeof fetch;
afterAll(() => {
  globalThis.fetch = realFetch;
});

// Other test files replace esi.ts with a mock in the shared module registry: this one needs the real module
const { esiGet } = await import(`${API}/lib/esi.ts?real`);

test('un 420 espera lo que dice ESI y reintenta una sola vez', async () => {
  replies.set('/a/', [{ status: 420, remain: 0, reset: 0 }, {}]);
  const started = Date.now();
  await esiGet('/a/');
  const calls = sent.filter((c) => c.path === '/a/');
  expect(calls).toHaveLength(2);
  // reset 0 → pause of 1 s
  expect(calls[1].at - started).toBeGreaterThanOrEqual(950);
  replies.set('/b/', [{ status: 420, remain: 0, reset: 0 }, { status: 420, remain: 0, reset: 0 }]);
  await expect(esiGet('/b/')).rejects.toThrow('420');
  expect(sent.filter((c) => c.path === '/b/')).toHaveLength(2);
}, 10_000);

test('con pocos errores restantes, la siguiente llamada espera; y si la pausa se alarga, también', async () => {
  await Bun.sleep(1100); // the previous test's pause is over
  // A call already in flight will answer in 0.6 s that the error limit is exhausted for 2 s more (pause of 3 s)
  replies.set('/slow/', [{ status: 420, remain: 0, reset: 2, delay: 600 }, {}]);
  const slow = esiGet('/slow/').catch(() => {});
  replies.set('/c/', [{ remain: 5, reset: 0 }]); // fewer than 10 errors left: pause of 1 s
  await esiGet('/c/');
  const pausedAt = Date.now();
  // This one waits for the 1 s pause; meanwhile the slow answer makes it longer, and it must wait for that too
  await esiGet('/d/');
  await slow;
  const d = sent.find((c) => c.path === '/d/')!;
  expect(d.at - pausedAt).toBeGreaterThanOrEqual(3000);
}, 15_000);
