// Lo que comparten la semilla (bun) y las pruebas (Playwright, en Node): sin importar nada de la API
export const PILOTS = {
  aria: { id: 9_000_001, name: 'Aria Vex' }, // Omega, todos los permisos
  kade: { id: 9_000_002, name: 'Kade Morrow' }, // Alfa, sin el permiso opcional de citadelas
  nyx: { id: 9_000_003, name: 'Nyx Adari' }, // vinculado hace 3 h, sin ningún sync
} as const;

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3999);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4399);
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
