import { env } from './env';

const raw = Buffer.from(env.encKey, 'base64');
if (raw.length !== 32) throw new Error('ENC_KEY debe ser de 32 bytes en base64');

const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

// Formato: base64(iv).base64(ciphertext+tag)
export async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(ct).toString('base64')}`;
}

export async function decrypt(payload: string): Promise<string> {
  const [ivB64, ctB64] = payload.split('.');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(ivB64, 'base64') },
    key,
    Buffer.from(ctB64, 'base64'),
  );
  return new TextDecoder().decode(pt);
}
