import { env } from './env';
import { getAccessToken } from './tokens';

const BASE = 'https://esi.evetech.net';

// If fewer errors than this remain in the ESI window, we pause until it resets
const ERROR_LIMIT_FLOOR = 10;

// Time until which ESI must not be called (shared by all calls)
let pausedUntil = 0;

export class EsiError extends Error {
  constructor(
    public status: number,
    public path: string,
    body: string,
  ) {
    super(`ESI ${status} en ${path}: ${body}`);
  }
}

function headerSeconds(headers: Headers, name: string): number | undefined {
  const v = headers.get(name);
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function pauseFor(seconds: number, reason: string) {
  const until = Date.now() + (seconds + 1) * 1000;
  if (until > pausedUntil) {
    pausedUntil = until;
    console.warn(`[esi] ${reason}: pausa de ${seconds + 1}s`);
  }
}

// Reads ESI's limit headers and schedules a pause if needed
function trackLimits(res: Response) {
  const h = res.headers;

  // Error limit: X-ESI-Error-Limit-Remain / -Reset (420 when exhausted)
  const remain = headerSeconds(h, 'x-esi-error-limit-remain');
  const reset = headerSeconds(h, 'x-esi-error-limit-reset');
  if (reset !== undefined && (res.status === 420 || (remain !== undefined && remain < ERROR_LIMIT_FLOOR))) {
    pauseFor(reset, `límite de errores (quedan ${remain ?? 0})`);
  }

  // Rate limit per route group: 429 + Retry-After
  if (res.status === 429) pauseFor(headerSeconds(h, 'retry-after') ?? 60, 'rate limit 429');
}

async function waitIfPaused() {
  const ms = pausedUntil - Date.now();
  if (ms > 0) await Bun.sleep(ms);
}

type EsiResponse<T> = { data: T; headers: Headers };

async function esiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  { characterId, body }: { characterId?: number; body?: unknown } = {},
): Promise<EsiResponse<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Compatibility-Date': env.esiCompatDate,
    'User-Agent': env.esiUserAgent,
  };
  if (characterId) headers.Authorization = `Bearer ${await getAccessToken(characterId)}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const payload = body === undefined ? undefined : JSON.stringify(body);

  // At most one retry, and only after waiting as long as ESI asked (420/429)
  for (let attempt = 0; ; attempt++) {
    await waitIfPaused();
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    trackLimits(res);

    if (res.ok) return { data: (await res.json()) as T, headers: res.headers };
    if ((res.status === 420 || res.status === 429) && attempt === 0) continue;
    throw new EsiError(res.status, path, await res.text());
  }
}

export const esiGet = <T>(path: string, characterId?: number) => esiRequest<T>('GET', path, { characterId });

export const esiPost = <T>(path: string, body: unknown, characterId?: number) =>
  esiRequest<T>('POST', path, { characterId, body });
