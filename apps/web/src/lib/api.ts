import { API_URL } from 'astro:env/server';

export type Flow = { income: number; expenses: number; net: number };

// accounts: PLEX comprado o vendido en el mercado (coste de las cuentas, aparte del resultado de juego)
export type Activity = 'pve' | 'pvp' | 'trading' | 'logistics' | 'other' | 'accounts';

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
  // Movido con tus otros pilotos: recibido y enviado (en la vista de un piloto pueden diferir)
  internalReceived: number;
  internalSent: number;
  // PLEX comprado y vendido en el mercado en el período (unidades)
  accounts: { plexBought: number; plexSold: number };
  characters: (Flow & {
    id: number;
    name: string;
    lastSyncAt: string | null;
    balance: number | null;
    balanceAt: string | null;
    // Recibido de tus otros pilotos y enviado a ellos en el período (fuera de income/expenses/net)
    internalReceived: number;
    internalSent: number;
  })[];
  // Brutos por actividad (totals también es bruto); el neto del trading es su margen
  byActivity: (Flow & { activity: Activity; count: number; refTypes: (Flow & { refType: string; count: number })[] })[];
  // «PvP con naves»: compras de reposición y couriers de naves perdidas movidos a PvP (ship_replacement, ship_transport)
  shipFlow: { replacement: number; transport: number };
  // accounts: PLEX comprado (−) o vendido (+) ese día, ya incluido en ingresos/gastos
  daily: (Flow & { date: string; accounts: number })[];
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

// Naves perdidas del período (killmails) y lo que movieron en el wallet: seguro (+), primas (−) y reposición (−).
// Valor perdido = casco + equipo al precio medio de ESI (ya pagado al comprarlo: no es un movimiento del wallet)
export type Loss = {
  killmailId: number;
  time: string;
  characterId: number;
  pilot: string | null;
  shipTypeId: number;
  ship: string | null;
  systemId: number;
  system: string | null;
  security: number | null;
  attackers: number;
  shipValue: number;
  fitValue: number;
  cargoValue: number;
  value: number;
  insurance: number;
  replacement: number;
  transport: number;
  walletEffect: number;
  // Lo que te costó: walletEffect − lo que no volvió o falta por reponer (precio medio)
  cost: number;
  windowEndsAt: string;
  // replaced: repuesta (o casi); pending: falta algo y la ventana sigue abierta (cifra «hasta ahora»);
  // unreplaced: la ventana se cerró sin reponerlo todo (toReplace = lo que no volvió, al precio medio)
  // nohistory: anterior al primer movimiento guardado (lo que falte no cuenta: no se sabe si se repuso)
  state: 'replaced' | 'pending' | 'unreplaced' | 'nohistory';
  open: boolean;
  toReplace: number;
  // Lo que falta, por partes (precio medio): casco, equipo (montado y drones) y carga
  missing: { hull: number; fit: number; cargo: number };
  // Unidades de equipo repuestas con un módulo equivalente (mismo grupo de mercado)
  substitutes: number;
  // Menos de 1 M (cápsula, nave de iniciación): se pliega en la tabla
  trivial: boolean;
  replacementBy: Record<string, number>;
  transportBy: number | null;
  replacedBy: { id: number; name: string | null } | null;
  shipReplacedAt: string | null;
  replacedIn: string | null;
  courier: { contractId: number; by: string | null; at: string } | null;
};
export type Losses = {
  period: { days: number; from: string };
  replacementDays: number;
  pilots: number;
  missingScope: { id: number; name: string }[];
  missingContracts: { id: number; name: string }[];
  totals: {
    count: number;
    value: number;
    shipValue: number;
    fitValue: number;
    cargoValue: number;
    noHistory: number;
    insurance: number;
    premiums: number;
    replacement: number;
    transport: number;
    // Lo que movieron en tus wallets (suma de la columna Wallet)
    walletEffect: number;
    unreplaced: number;
    toReplace: number;
    open: number;
    // Lo que te costaron: suma de la columna Coste. Las primas van aparte
    cost: number;
    // Lo firme: Coste sin lo que falta por reponer (estimado al precio medio, aún puede cambiar)
    firmCost: number;
    unpricedTypes: number;
  };
  // Vista de un piloto: el flujo de su wallet por pérdidas (seguro de sus naves y lo que él pagó)
  ownWallet: { insurance: number; replacement: number; transport: number; forOthers: number; total: number } | null;
  forOthers: { killmailId: number; ship: string | null; pilot: string | null; amount: number }[];
  paidByOthers: { id: number; name: string | null; amount: number }[];
  // Primer movimiento guardado: las pérdidas anteriores son «sin historial»
  historyFrom: string | null;
  losses: Loss[];
};
export const getLosses = (days: number, characterId?: number) =>
  call<Losses>(`/losses?days=${days}${characterId ? `&characterId=${characterId}` : ''}`);
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
    avgDailyNet: number;
    paceDays: number;
    // Coste de un mes de Omega repartido en 30 días, y qué parte de él paga tu ritmo diario
    costPerDay: number | null;
    paceShare: number | null;
    balances: { characterId: number; balance: number | null }[];
  };
  // ISK por hora de ratting: pagos de recompensas (uno cada 20 min) como reloj
  ratting: {
    days: number;
    tickMinutes: number;
    ticks: number;
    hours: number;
    isk: number;
    iskPerHour: number | null;
    // De dónde sale el ISK: recompensas, ESS, escalaciones vendidas y loot vendido al buyback
    parts: { bounties: number; ess: number; escalations: number; loot: number };
    recent: { days: number; hours: number; iskPerHour: number | null };
    byPilot: { characterId: number; name: string; ticks: number; hours: number; isk: number; iskPerHour: number | null }[];
    bySystem: { systemId: number; name: string | null; security: number | null; ticks: number; hours: number; isk: number; iskPerHour: number }[];
  };
  // Fondo de reposición: cuántas veces repones cada nave perdida con el saldo, y lo que te costaron en horas
  replacement: {
    available: number;
    iskPerHour: number | null;
    ships: { shipTypeId: number; ship: string | null; lostAt: string; value: number; times: number | null; hours: number | null }[];
    days: number;
    count: number;
    cost: number;
    costHours: number | null;
    noScope: boolean;
  };
  // Comisiones e impuestos del mercado frente a lo vendido
  fees: { days: number; total: number; sales: number; share: number | null; byType: { refType: string; total: number }[] };
};
export const getIndicators = () => call<Indicators>('/indicators');
