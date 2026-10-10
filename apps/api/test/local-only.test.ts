// Solo esta máquina: Host local y, en lo que no es GET, sin Origin ajeno (DNS rebinding y formularios de otras webs)
import { expect, test } from 'bun:test';
import { allowedHosts, localOnly } from '../src/lib/local-only';

const allowed = allowedHosts('', '127.0.0.1');
const req = (host: string | null, method = 'GET', origin?: string) => {
  const headers = new Headers();
  if (host !== null) headers.set('host', host);
  if (origin) headers.set('origin', origin);
  return new Request('http://127.0.0.1:47300/summary', { method, headers });
};
const status = (r: Request) => localOnly(r, allowed)?.status ?? 200;

test('acepta los nombres locales con cualquier puerto', () => {
  for (const h of ['127.0.0.1:47300', 'localhost:3000', 'LOCALHOST', '[::1]:47300', 'localhost.:4321']) expect(status(req(h))).toBe(200);
});

test('rechaza un Host ajeno (DNS rebinding) o sin Host', () => {
  for (const h of ['evil.example:47300', 'evil.example', '127.0.0.1.evil.example', '192.168.1.10:47300']) expect(status(req(h))).toBe(403);
  expect(status(req(null))).toBe(403);
});

test('rechaza un POST desde otra web y acepta el de la propia web o sin Origin', () => {
  expect(status(req('127.0.0.1:47300', 'POST', 'https://evil.example'))).toBe(403);
  expect(status(req('127.0.0.1:47300', 'POST', 'null'))).toBe(403);
  expect(status(req('127.0.0.1:47300', 'POST', 'http://127.0.0.1:47321'))).toBe(200);
  expect(status(req('127.0.0.1:47300', 'POST'))).toBe(200);
  // Un GET con Origin ajeno no cambia nada: el navegador no deja leer la respuesta sin CORS
  expect(status(req('127.0.0.1:47300', 'GET', 'https://evil.example'))).toBe(200);
});

test('ALLOWED_HOSTS y una interfaz concreta en HOST añaden nombres', () => {
  const lan = allowedHosts('ledger.lan, otra.lan', '192.168.1.10');
  expect(localOnly(req('ledger.lan:47300'), lan)).toBeNull();
  expect(localOnly(req('192.168.1.10:47300'), lan)).toBeNull();
  expect(localOnly(req('evil.example'), lan)?.status).toBe(403);
  // 0.0.0.0 no autoriza nada por sí mismo
  expect(allowedHosts('', '0.0.0.0').has('0.0.0.0')).toBe(false);
});
