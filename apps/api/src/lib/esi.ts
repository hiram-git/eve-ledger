import { env } from './env';
import { getAccessToken } from './tokens';

const BASE = 'https://esi.evetech.net';

export async function esiGet<T>(path: string, characterId?: number): Promise<{ data: T; headers: Headers }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Compatibility-Date': env.esiCompatDate,
    'User-Agent': env.esiUserAgent,
  };
  if (characterId) headers.Authorization = `Bearer ${await getAccessToken(characterId)}`;

  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`ESI ${res.status} en ${path}: ${await res.text()}`);
  return { data: (await res.json()) as T, headers: res.headers };
}
