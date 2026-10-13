// What the seed (bun) and the tests (Playwright, on Node) share: without importing anything from the API
export const PILOTS = {
  aria: { id: 9_000_001, name: 'Aria Vex' }, // Omega, all scopes
  kade: { id: 9_000_002, name: 'Kade Morrow' }, // Alpha, without the optional citadels scope
  nyx: { id: 9_000_003, name: 'Nyx Adari' }, // linked 3 h ago, without any sync
} as const;

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3999);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4399);
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
