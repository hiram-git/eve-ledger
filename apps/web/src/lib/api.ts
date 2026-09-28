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
  balance: number;
  internalTransfers: number;
  characters: (Flow & {
    id: number;
    name: string;
    lastSyncAt: string | null;
    balance: number | null;
    balanceAt: string | null;
  })[];
  // Brutos por actividad; en el trading, su neto es el margen que entra en totals
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status} en ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const getSummary = (days: number) => call<Summary>(`/summary?days=${days}`);
export const getInventory = () => call<Inventory>('/inventory');
export const getMap = () => call<GeoMap>('/map');
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
