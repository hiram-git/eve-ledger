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
];

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

// Con Client Secret, el canje y la renovación se firman con él (Basic). Sin secreto, PKCE: el login lleva el reto
// de un verificador aleatorio que solo conoce la API, y canje y renovación van solo con el Client ID.
// Cada piloto guarda con cuál se vinculó (`characters.auth_method`) y se renueva igual
export type AuthMethod = 'secret' | 'pkce';

export const loginMethod = (): AuthMethod => (env.clientSecret ? 'secret' : 'pkce');

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

export async function newPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(state: string, codeChallenge?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: env.callbackUrl,
    client_id: env.clientId,
    scope: SCOPES.join(' '),
    state,
  });
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return `${AUTHORIZE_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>, method: AuthMethod): Promise<TokenResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (method === 'secret') {
    // El texto «refresh token» hace que el dashboard lo muestre como «Token caducado» con «Revincular»
    if (!env.clientSecret) throw new Error('Sin Client Secret no se puede renovar el refresh token (se vinculó con secreto): revincúlalo');
    headers.Authorization = `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`;
  } else {
    body = { ...body, client_id: env.clientId };
  }
  const res = await fetch(TOKEN_URL, { method: 'POST', headers, body: new URLSearchParams(body) });
  if (!res.ok) throw new Error(`SSO ${res.status}: ${await res.text()}`);
  return res.json() as Promise<TokenResponse>;
}

// Sin verificador, con el secreto; con él, PKCE
export const exchangeCode = (code: string, codeVerifier?: string) =>
  codeVerifier
    ? tokenRequest({ grant_type: 'authorization_code', code, code_verifier: codeVerifier }, 'pkce')
    : tokenRequest({ grant_type: 'authorization_code', code }, 'secret');

// EVE rota el refresh token: siempre guardar el que venga en la respuesta
export const refreshAccessToken = (refreshToken: string, method: AuthMethod) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, method);

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
