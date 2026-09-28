import { API_URL } from 'astro:env/server';

export type Flow = { income: number; expenses: number; net: number };

export type MarketItem = {
  typeId: number;
  name: string | null;
  quantity: number;
  isk: number;
  trades: number;
  avgPrice: number;
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
  byRefType: (Flow & { refType: string; count: number })[];
  daily: (Flow & { date: string })[];
  today: Flow;
  previous: Flow & { complete: boolean };
  coverage: { firstEntryAt: string | null; coveredDays: number };
  market: { sold: MarketItem[]; bought: MarketItem[] };
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
export const loginUrl = `${API_URL}/auth/login`;
export const syncLogUrl = `${API_URL}/sync/log`;
