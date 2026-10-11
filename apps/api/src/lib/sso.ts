import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env';

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const JWKS = createRemoteJWKSet(new URL('https://login.eveonline.com/oauth/jwks'));

// Todos deben estar también en la app de developers.eveonline.com, o el login de EVE rechaza la petición
export const SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-killmails.read_killmails.v1',
  'esi-contracts.read_character_contracts.v1',
  // Doctrinas: qué fits puede volar cada piloto y cuánto le falta de un plan (skills y atributos)
  'esi-skills.read_skills.v1',
  // Opcional: nombres y sistema de las citadelas donde guardas cosas o comercias (GET /universe/structures/{id})
  'esi-universe.read_structures.v1',
];
// Los que no faltan «de verdad»: sin ellos todo funciona (las citadelas salen como «Estructura #id»). No encienden
// la línea de salud ni el aviso de Pilotos; /characters los da aparte (missingOptionalScopes)
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

// Solo el Client ID, nunca un Client Secret (decisión del usuario: nadie tiene que crear una app en
// developers.eveonline.com ni guardar un secreto): PKCE, el login lleva el reto de un verificador aleatorio que solo
// conoce la API, y canje y renovación van con el Client ID. `characters.auth_method` = 'secret' queda para los
// pilotos vinculados con secreto en versiones anteriores: ya no se pueden renovar y hay que revincularlos
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

// EVE rota el refresh token: siempre guardar el que venga en la respuesta. Un piloto vinculado con Client Secret
// (versiones anteriores) no se puede renovar sin él; el texto «refresh token» hace que el dashboard lo muestre como
// «Token caducado» con «Revincular»
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
