import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env';

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const JWKS = createRemoteJWKSet(new URL('https://login.eveonline.com/oauth/jwks'));

// All of them must also be in the app on developers.eveonline.com, or the EVE login rejects the request
export const SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-contracts.read_character_contracts.v1',
  // Doctrinas: which fits each pilot can fly and how much of a plan it is missing (skills and attributes)
  'esi-skills.read_skills.v1',
  // Optional: names and system of the citadels where you store things or trade (GET /universe/structures/{id})
  'esi-universe.read_structures.v1',
];
// The ones that are not "really" missing: everything works without them (citadels show as «Estructura #id»). They do not
// light up the health line or the Pilotos notice; /characters reports them separately (missingOptionalScopes)
export const OPTIONAL_SCOPES = ['esi-universe.read_structures.v1'];

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
};

export type EveIdentity = {
  characterId: number;
  name: string;
  ownerHash: string;
  scopes: string[];
};

// Only the Client ID, never a Client Secret (user's decision: nobody has to create an app on
// developers.eveonline.com or keep a secret): PKCE, the login carries the challenge of a random verifier that only
// the API knows, and exchange and refresh go with the Client ID. `characters.auth_method` = 'secret' remains for
// pilots linked with a secret in earlier versions: they can no longer be refreshed and have to be relinked
export type AuthMethod = 'secret' | 'pkce';

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: env.callbackUrl,
    client_id: env.clientId,
    scope: SCOPES.join(' '),
    state,
  });
  params.set('code_challenge', codeChallenge);
  params.set('code_challenge_method', 'S256');
  return `${AUTHORIZE_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const res = await fetch(TOKEN_URL, { method: 'POST', headers, body: new URLSearchParams({ ...body, client_id: env.clientId }) });
  if (!res.ok) throw new Error(`SSO ${res.status}: ${await res.text()}`);
  return res.json() as Promise<TokenResponse>;
}

export const exchangeCode = (code: string, codeVerifier: string) =>
  tokenRequest({ grant_type: 'authorization_code', code, code_verifier: codeVerifier });

// EVE rotates the refresh token: always store the one in the response. A pilot linked with a Client Secret
// (earlier versions) cannot be refreshed without it; the text «refresh token» makes the dashboard show it as
// «Token caducado» with «Revincular»
export async function refreshAccessToken(refreshToken: string, method: AuthMethod) {
  if (method === 'secret') throw new Error('Este piloto se vinculó con Client Secret, que ya no se usa: el refresh token no se puede renovar, revincúlalo');
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function verifyAccessToken(token: string): Promise<EveIdentity> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ['login.eveonline.com', 'https://login.eveonline.com'],
    audience: 'EVE Online',
  });

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.clientId)) throw new Error('El token no pertenece a esta aplicación');

  const sub = String(payload.sub ?? ''); // "CHARACTER:EVE:<id>"
  const characterId = Number(sub.split(':').at(-1));
  if (!sub.startsWith('CHARACTER:EVE:') || !characterId) throw new Error(`sub inválido: ${sub}`);

  const scp = payload.scp as string | string[] | undefined;
  return {
    characterId,
    name: String(payload.name),
    ownerHash: String(payload.owner),
    scopes: scp ? (Array.isArray(scp) ? scp : [scp]) : [],
  };
}
