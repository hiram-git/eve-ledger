import { API_URL } from 'astro:env/server';

export type Flow = { income: number; expenses: number; net: number };

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
};

export type SyncAllResult = { inserted: number; errors: number };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status} en ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const getSummary = (days: number) => call<Summary>(`/summary?days=${days}`);
export const syncAll = () => call<SyncAllResult>('/sync/all', { method: 'POST' });
export const loginUrl = `${API_URL}/auth/login`;
