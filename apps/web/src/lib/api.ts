import { API_URL } from 'astro:env/server';

export type Flow = { income: number; expenses: number; net: number };

export type Activity = 'pve' | 'pvp' | 'trading' | 'other';

// Revisión de mercado: por ítem, vendido y comprado en el período
export type MarketItem = {
  typeId: number;
  name: string | null;
  soldQty: number;
  sold: number;
  boughtQty: number;
  bought: number;
  trades: number;
  net: number;
};

export type Summary = {
  period: { days: number; from: string; to: string };
  totals: Flow;
  // Piloto filtrado (null = todos); characters siempre trae la lista completa
  characterId: number | null;
  balance: number;
  internalTransfers: number;
  characters: (Flow & {
    id: number;
    name: string;
    lastSyncAt: string | null;
    balance: number | null;
    balanceAt: string | null;
  })[];
  // Brutos por actividad (totals también es bruto); el neto del trading es su margen
  byActivity: (Flow & { activity: Activity; count: number; refTypes: (Flow & { refType: string; count: number })[] })[];
  daily: (Flow & { date: string })[];
  today: Flow;
  previous: Flow & { complete: boolean };
  coverage: { firstEntryAt: string | null; coveredDays: number };
  market: { items: MarketItem[]; totals: { sold: number; bought: number; net: number; items: number } };
};

export type Inventory = {
  value: number;
  stacks: number;
  types: number;
  unpricedTypes: number;
  assetsUpdatedAt: string | null;
  pricesUpdatedAt: string | null;
  byCharacter: { characterId: number; name: string; value: number; updatedAt: string }[];
  byLocation: { locationId: number; name: string | null; value: number; stacks: number }[];
  topItems: { typeId: number; name: string | null; quantity: number; unitPrice: number; value: number }[];
};

export type GeoNode = {
  systemId: number;
  name: string;
  security: number;
  x: number;
  z: number;
  inventory: number;
  earnedToday: number;
};

export type GeoMap = {
  nodes: GeoNode[];
  unplaced: { value: number; locations: number };
  pending: number;
  todayStart: string;
};

export type SyncAllResult = { inserted: number; errors: number };

export type SyncStatus = {
  enabled: boolean;
  intervalMin: number;
  running: boolean;
  nextRunAt: string | null;
  lastRun: { startedAt: string; finishedAt: string; inserted: number; errors: number; characters: number } | null;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} en ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// characterId opcional: el ledger de un solo piloto (la API responde 404 si no está vinculado)
const pilotQuery = (characterId?: number) => (characterId ? `characterId=${characterId}` : '');
export const getSummary = (days: number, characterId?: number) =>
  call<Summary>(`/summary?days=${days}&${pilotQuery(characterId)}`);
export const getInventory = (characterId?: number) => call<Inventory>(`/inventory?${pilotQuery(characterId)}`);
export const getMap = (characterId?: number) => call<GeoMap>(`/map?${pilotQuery(characterId)}`);
export const getSyncStatus = () => call<SyncStatus>('/sync/status');
export const syncAll = () => call<SyncAllResult>('/sync/all', { method: 'POST' });

// Un solo piloto: la API responde 502 con el resultado si el sync falló, no es un error de transporte
export async function syncOne(characterId: number): Promise<SyncAllResult> {
  const res = await fetch(`${API_URL}/sync/${characterId}`, { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as { inserted?: number; error?: string };
  if (!res.ok && res.status !== 502) throw new Error(`API ${res.status}: ${body.error ?? 'error'}`);
  return { inserted: body.inserted ?? 0, errors: body.error ? 1 : 0 };
}

export type Pilot = {
  id: number;
  name: string;
  scopes: string[];
  missingScopes: string[];
  lastSyncAt: string | null;
  createdAt: string;
  lastError: { at: string | null; kind: string; message: string } | null;
};

// Accept JSON explícito: en el navegador /characters redirige a la página de pilotos
export const getPilots = () => call<Pilot[]>('/characters', { headers: { Accept: 'application/json' } });
export const loginUrl = `${API_URL}/auth/login`;
export const syncLogUrl = `${API_URL}/sync/log`;

// Omega de todas las cuentas: cuánto cuesta renovarlas (1 mes) frente al saldo de los wallets.
// Los campos que dependen del precio del PLEX son null mientras no haya precio guardado.
export type Indicators = {
  omega: {
    accounts: number;
    plexPerMonth: number;
    months: number;
    plexNeeded: number;
    // PLEX que ya tienes en inventario: se descuentan de los necesarios
    plexOwned: number;
    plexMissing: number;
    plexPrice: number | null;
    plexAveragePrice: number | null;
    // market = venta más baja de las órdenes (se refresca en cada sync); average = media global de ESI
    plexPriceSource: 'market' | 'average' | null;
    plexPriceUpdatedAt: string | null;
    cost: number | null;
    // Coste de los PLEX que faltan (lo que queda por pagar)
    costMissing: number | null;
    available: number;
    missing: number | null;
    surplus: number | null;
    progress: number | null;
    accountsCovered: number | null;
    avgDailyNet: number;
    paceDays: number;
    daysToCover: number | null;
  };
};
export const getIndicators = () => call<Indicators>('/indicators');
