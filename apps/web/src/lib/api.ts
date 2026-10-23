import { API_URL } from 'astro:env/server';

export type Flow = { income: number; expenses: number; net: number };

// accounts: PLEX bought or sold on the market (the cost of the accounts, kept apart from the game result)
export type Activity = 'pve' | 'pvp' | 'trading' | 'logistics' | 'other' | 'accounts';
// Fixed order of the activities (the API's, apps/api/src/lib/activities.ts): each one's row and colour do not
// change with the period or the pilot, even when the API omits those without movements
export const ACTIVITIES: readonly Activity[] = ['pve', 'pvp', 'trading', 'logistics', 'other', 'accounts'];

// Market review: per item, sold and bought in the period
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
  // Filtered pilot (null = all); characters always carries the full list
  characterId: number | null;
  balance: number;
  internalTransfers: number;
  // Moved with your other pilots: received and sent (in a single pilot's view they can differ)
  internalReceived: number;
  internalSent: number;
  // PLEX bought and sold on the market in the period (units)
  accounts: { plexBought: number; plexSold: number };
  characters: (Flow & {
    id: number;
    name: string;
    lastSyncAt: string | null;
    // Balance: the wallet balance ESI returns on each sync (or, if there is none yet, the last journal entry's)
    balance: number | null;
    balanceAt: string | null;
    // The last journal entry's balance: the reconciliation balances against it (the wallet can be ahead)
    journalBalance: number | null;
    // Balance it entered the period with (partial: its history starts inside the period, at openingAt)
    openingBalance: number | null;
    openingAt: string | null;
    openingPartial: boolean;
    // Received from your other pilots and sent to them in the period. net = income − expenses (earned in game);
    // walletChange = net + received − sent, how much its wallet changed (openingBalance + walletChange = balance)
    internalReceived: number;
    internalSent: number;
    walletChange: number;
  })[];
  // Gross per activity (totals is gross too); the trading net is its margin
  byActivity: (Flow & { activity: Activity; count: number; refTypes: (Flow & { refType: string; count: number })[] })[];
  // «PvP con naves»: replacement purchases and couriers of lost ships moved to PvP (ship_replacement, ship_transport)
  shipFlow: { replacement: number; transport: number };
  // accounts: PLEX bought (−) or sold (+) that day, already included in income/expenses
  // internal: in a single pilot's view, what was moved with your other pilots that day (not in net nor in income/expenses)
  daily: (Flow & { date: string; accounts: number; internal: number })[];
  today: Flow;
  // accounts, lossesNotBack, lossesToReplace: what the Net card takes out of the previous period's result too
  previous: Flow & { complete: boolean; accounts: number; lossesNotBack: number; lossesToReplace: number };
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

// Optional characterId: the ledger of a single pilot (the API returns 404 if it is not linked)
const pilotQuery = (characterId?: number) => (characterId ? `characterId=${characterId}` : '');
export const getSummary = (days: number, characterId?: number) =>
  call<Summary>(`/summary?days=${days}&${pilotQuery(characterId)}`);
export const getInventory = (characterId?: number) => call<Inventory>(`/inventory?${pilotQuery(characterId)}`);

// Ships lost in the period (killmails) and what they moved in the wallet: insurance (+), premiums (−) and replacement (−).
// Value lost = hull + fitting at ESI's average price (already paid when bought: not a wallet movement)
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
  // What it cost you: walletEffect − what did not come back or is still to replace (average price)
  cost: number;
  windowEndsAt: string;
  // replaced: replaced (or nearly); pending: something is missing and the window is still open (figure "so far");
  // unreplaced: the window closed without replacing everything (toReplace = what did not come back, at average price)
  // nohistory: before the first stored movement (whatever is missing does not count: unknown whether it was replaced)
  state: 'replaced' | 'pending' | 'unreplaced' | 'nohistory';
  open: boolean;
  toReplace: number;
  // What is missing, by part (average price): hull, fitting (fitted and drones) and cargo
  missing: { hull: number; fit: number; cargo: number };
  // Fitting units replaced with an equivalent module (same market group)
  substitutes: number;
  // Under 1 M (capsule, rookie ship): folded in the table
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
    // What they moved in your wallets (sum of the Wallet column)
    walletEffect: number;
    unreplaced: number;
    toReplace: number;
    open: number;
    // What they cost you: sum of the Coste column. Premiums go separately
    cost: number;
    // The firm part: Coste without what is still to replace (estimated at average price, can still change)
    firmCost: number;
    unpricedTypes: number;
  };
  // Single pilot's view: its wallet flow from losses (insurance on its ships and what it paid)
  ownWallet: { insurance: number; replacement: number; transport: number; forOthers: number; total: number } | null;
  forOthers: { killmailId: number; ship: string | null; pilot: string | null; amount: number }[];
  paidByOthers: { id: number; name: string | null; amount: number }[];
  // First stored movement: earlier losses are "no history"
  historyFrom: string | null;
  losses: Loss[];
};
export const getLosses = (days: number, characterId?: number) =>
  call<Losses>(`/losses?days=${days}${characterId ? `&characterId=${characterId}` : ''}`);
export const getMap = (characterId?: number) => call<GeoMap>(`/map?${pilotQuery(characterId)}`);
export const getSyncStatus = () => call<SyncStatus>('/sync/status');
export const syncAll = () => call<SyncAllResult>('/sync/all', { method: 'POST' });

// A single pilot: the API returns 502 with the result if the sync failed; it is not a transport error
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
  // Optional scopes not granted (citadel names): not a problem, just an improvement
  missingOptionalScopes: string[];
  lastSyncAt: string | null;
  createdAt: string;
  // Last link (the first one or the latest relink)
  linkedAt: string;
  // Alpha trains at half speed and cannot use every skill (the user marks it in Pilotos)
  clone: 'omega' | 'alpha';
  lastError: { at: string | null; kind: string; message: string } | null;
};

// Explicit JSON Accept: in the browser /characters redirects to the pilots page
export const getPilots = () => call<Pilot[]>('/characters', { headers: { Accept: 'application/json' } });
export const loginUrl = `${API_URL}/auth/login`;
export const syncLogUrl = `${API_URL}/sync/log`;

// Omega for all accounts: how much renewing them costs (1 month) versus the wallet balance.
// Fields that depend on the PLEX price are null while no price is stored.
export type Indicators = {
  omega: {
    accounts: number;
    plexPerMonth: number;
    months: number;
    plexNeeded: number;
    // PLEX you already have in inventory: subtracted from the ones needed
    plexOwned: number;
    plexMissing: number;
    plexPrice: number | null;
    plexAveragePrice: number | null;
    // market = lowest sell order (refreshed on each sync); average = ESI's global average
    plexPriceSource: 'market' | 'average' | null;
    plexPriceUpdatedAt: string | null;
    cost: number | null;
    // Cost of the missing PLEX (what is left to pay)
    costMissing: number | null;
    available: number;
    missing: number | null;
    surplus: number | null;
    progress: number | null;
    avgDailyNet: number;
    paceDays: number;
    // Cost of one month of Omega spread over 30 days, and what share of it your daily pace pays
    costPerDay: number | null;
    paceShare: number | null;
    balances: { characterId: number; balance: number | null }[];
  };
  // ISK per hour of ratting: bounty payments (one every 20 min) as a clock
  ratting: {
    days: number;
    tickMinutes: number;
    ticks: number;
    hours: number;
    isk: number;
    iskPerHour: number | null;
    // Where the ISK comes from: bounties, ESS, sold escalations and loot sold to the buyback
    parts: { bounties: number; ess: number; escalations: number; loot: number };
    recent: { days: number; hours: number; iskPerHour: number | null };
    byPilot: { characterId: number; name: string; ticks: number; hours: number; isk: number; iskPerHour: number | null }[];
    bySystem: { systemId: number; name: string | null; security: number | null; ticks: number; hours: number; isk: number; iskPerHour: number }[];
    // Systems outside the top 6, grouped, and bounties whose system the journal does not say
    bySystemRest: { systems: number; ticks: number; hours: number; isk: number };
    bySystemUnknown: { ticks: number; hours: number; isk: number };
  };
  // Your days: game net per day (without PLEX or what was moved between your pilots), consolidated
  days: {
    days: number;
    withData: number;
    positive: number;
    negative: number;
    best: { date: string; net: number } | null;
    worst: { date: string; net: number } | null;
    streak: number;
    avg: number | null;
    firstAt: string | null;
  };
  // Replacement fund: how many times you can replace each lost ship with the balance, and what they cost you in hours
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
  // Market fees and taxes versus what was sold
  fees: { days: number; total: number; sales: number; share: number | null; byType: { refType: string; total: number }[] };
  // Deductions: corporation tax (exact) and incursion penalty (estimated)
  deductions: {
    days: number;
    tax: number;
    byCorp: { corpId: number | null; name: string | null; npc: boolean; tax: number; gross: number; rate: number | null; byType: { refType: string; tax: number }[] }[];
    taxUnknown: number;
    incursion: number;
    penalty: number;
    bySystem: { systemId: number; name: string | null; security: number | null; ticks: number; paid: number; lost: number }[];
    incursionsSince: string | null;
    iskPerHour: number | null;
    grossPerHour: number | null;
  };
  // Loyalty points: LP by corporation, valued (estimate) at the best exchange of its LP store; EverMarks (Paragon) apart
  loyalty: {
    days: number;
    // Pilots with the optional scope (synced: a loyalty sync finished) and those without it
    pilots: { characterId: number; name: string; synced: boolean }[];
    missingScope: { characterId: number; name: string }[];
    corps: {
      corporationId: number;
      name: string | null;
      npc: boolean;
      points: number;
      byPilot: { characterId: number; name: string; points: number }[];
      iskPerLp: number | null;
      value: number | null;
      offer: { typeId: number; name: string | null; quantity: number; lpCost: number; iskCost: number; required: number } | null;
      storeRead: boolean;
      // Change over the period (earned minus spent); null without any log entry
      change: number | null;
    }[];
    evermarks: { points: number; byPilot: { characterId: number; name: string; points: number }[]; change: number | null } | null;
    points: number;
    value: number;
    valuedCorps: number;
    unvaluedCorps: number;
    storesPending: number;
    change: number | null;
    historySince: string | null;
    changePartial: boolean;
  };
};
export const getIndicators = () => call<Indicators>('/indicators');

// Doctrines: EFT fits with their skill plan (EVEMon .emp) and which pilot flies what
export type MissingSkill = {
  skillId: number;
  name: string | null;
  // Level required, the one it can use (active) and the trained one (an Alpha does not use everything trained)
  need: number;
  active: number;
  trained: number;
  // SP and minutes missing; null if the rank or the attributes are unknown
  sp: number | null;
  minutes: number | null;
  // Trained but unusable as Alpha / skill an Alpha cannot train
  omegaOnly: boolean;
  omegaSkill: boolean;
};
export type SkillEvaluation = {
  missing: MissingSkill[];
  missingSp: number | null;
  minutes: number | null;
  targetSp: number | null;
  haveSp: number | null;
  needsOmega: boolean;
  required: number;
  alphaBlocked: boolean;
};
// Which clone a fit needs: omega (certain), alpha (an Alpha flies it, or nothing is Omega-only nor needs level V),
// alphaUnsure (nothing is Omega-only but it needs level V) or unknown (skills still without the data)
export type CloneNeed = 'omega' | 'alpha' | 'alphaUnsure' | 'unknown';
// ok: can fly it; missing: lacks skills; omega: has them but an Alpha cannot use them;
// noScope: missing the skills scope; noData: no skills sync yet
export type FitPilotStatus = 'ok' | 'missing' | 'omega' | 'noScope' | 'noData';
// Injectors for some SP (unallocated ones are spent first); cost null if a price is missing
export type InjectorPlan = { sp: number; large: number; small: number; cost: number | null };
// What the wallet is short of: with the whole balance, or reserving next month's Omega first (null without a PLEX price).
// In ratting hours (null without ISK/h) and in days at the 7-day pace (null without a positive pace)
export type Shortfall = { short: number; hours: number | null; days: number | null };
export type Budget = { need: number; wallet: Shortfall; withOmega: Shortfall | null };
export type DoctrineFit = {
  id: number;
  name: string;
  shipTypeId: number;
  ship: string | null;
  slots: { high: number; mid: number; low: number; rig: number; subsystem: number };
  drones: number;
  cargo: number;
  required: number;
  clone: CloneNeed;
  // Fit skills that only an Omega can train
  omegaSkills: string[];
  plan: { name: string; skills: number } | null;
  // At Jita's lowest sell price; unpriced = types without a price (not added)
  cost: { total: number; hull: number; fitted: number; drones: number; cargo: number; unpriced: number; pricedAt: string | null };
  budget: Budget;
  pilots: {
    characterId: number;
    status: FitPilotStatus;
    fly: SkillEvaluation | null;
    plan: SkillEvaluation | null;
    injectors: { fly: InjectorPlan | null; plan: InjectorPlan | null } | null;
    // Fly it now: the fit plus the injectors it is missing (null if the injector price is missing)
    budget: Budget | null;
  }[];
};
export type DoctrinesView = {
  funds: {
    wallet: number;
    omegaReserve: number | null;
    omegaCost: number | null;
    iskPerHour: number | null;
    dailyNet: number | null;
    injectorPrice: { large: number | null; small: number | null };
  };
  pilots: {
    id: number;
    name: string;
    clone: 'omega' | 'alpha';
    totalSp: number | null;
    unallocatedSp: number | null;
    skillsAt: string | null;
    hasScope: boolean;
  }[];
  doctrines: { id: number; name: string; fits: DoctrineFit[] }[];
};
export const getDoctrines = () => call<DoctrinesView>('/doctrines');

// Doctrinas writes: the API returns 400 with a code (that the web translates) if what was pasted is invalid
export class ActionError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string | null,
  ) {
    super(code);
  }
}
async function write<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
  // 409: you have to wait (restoring a backup while a sync is running)
  if (res.status === 400 || res.status === 404 || res.status === 409)
    throw new ActionError(data.error ?? 'request', data.detail == null ? null : String(data.detail));
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} en ${path}`);
  return data as T;
}
export const createDoctrine = (name: string) => write<{ id: number }>('POST', '/doctrines', { name });
export const renameDoctrine = (id: number, name: string) => write<{ id: number; name: string }>('PUT', `/doctrines/${id}`, { name });
export const deleteDoctrine = (id: number) => write('DELETE', `/doctrines/${id}`);
export const addFit = (doctrineId: number, eft: string) =>
  write<{ id: number; ignored: string[] }>('POST', `/doctrines/${doctrineId}/fits`, { eft });
export const deleteFit = (id: number) => write('DELETE', `/fits/${id}`);
export const setPlan = (fitId: number, data: string, filename: string) =>
  write<{ name: string; skills: number }>('PUT', `/fits/${fitId}/plan`, { data, filename });
export const refreshPrices = () => write<{ updated: number }>('POST', '/doctrines/prices');
export const deletePlan = (fitId: number) => write('DELETE', `/fits/${fitId}/plan`);
export const setClone = (characterId: number, clone: 'omega' | 'alpha') =>
  write('PUT', `/characters/${characterId}/clone`, { clone });

// Database backups (apps/api/src/services/backups.ts)
export type BackupKind = 'auto' | 'manual' | 'restore' | 'update';
export type Backup = { name: string; kind: BackupKind; createdAt: string; size: number };
export type BackupsView = { dir: string; keep: Record<BackupKind, number>; backups: Backup[]; busy: boolean };
export type BackupInfo = { pilots: number; entries: number; firstEntryAt: string | null; lastEntryAt: string | null };
export type Restored = { info: BackupInfo; safety: Backup | null };
// Only names in the backup format: the same the API accepts
export const BACKUP_NAME = /^ledger-\d{8}-\d{6}-(auto|manual|restore|update)\.db$/;
export const getBackups = () => call<BackupsView>('/backups');
export const createBackup = () => write<Backup>('POST', '/backups');
export const restoreBackup = (name: string) => write<Restored>('POST', `/backups/${encodeURIComponent(name)}/restore`);
// The raw backup, to download it from the web
export const fetchBackup = (name: string) => fetch(`${API_URL}/backups/${encodeURIComponent(name)}`);
export async function restoreUpload(bytes: ArrayBuffer): Promise<Restored> {
  const res = await fetch(`${API_URL}/backups/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
  if (res.status === 400 || res.status === 404 || res.status === 409)
    throw new ActionError(data.error ?? 'request', data.detail == null ? null : String(data.detail));
  if (res.status === 413) throw new ActionError('too_big', null);
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} en /backups/upload`);
  return data as Restored;
}
