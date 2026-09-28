import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from './env';

const AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const JWKS = createRemoteJWKSet(new URL('https://login.eveonline.com/oauth/jwks'));

export const SCOPES = ['esi-wallet.read_character_wallet.v1', 'esi-assets.read_assets.v1'];

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

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: env.callbackUrl,
    client_id: env.clientId,
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`SSO ${res.status}: ${await res.text()}`);
  return res.json() as Promise<TokenResponse>;
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: 'authorization_code', code });

// EVE rota el refresh token: siempre guardar el que venga en la respuesta
export const refreshAccessToken = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

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
