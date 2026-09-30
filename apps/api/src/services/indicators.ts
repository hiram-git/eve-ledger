import { eq, sum } from 'drizzle-orm';
import { db } from '../db/client';
import { assets, characters, marketPrices } from '../db/schema';
import { env } from '../lib/env';
import { PLEX_TYPE_ID, getQuote } from './quotes';
import { dailyNetRate, lastBalance } from './summary';

// PLEX: con él se paga el Omega. Precio = venta más baja del mercado (se refresca en cada sync);
// mientras no haya cotización, la media global de ESI.
// Ritmo: neto diario de los últimos 7 días, frente al coste diario del Omega (un mes = 30 días)
const PACE_DAYS = 7;
const OMEGA_MONTH_DAYS = 30;

export async function omegaIndicator() {
  const accounts = env.omegaAccounts;
  const plexPerMonth = env.omegaPlexPerMonth;
  const plexNeeded = accounts * plexPerMonth;

  const [price] = await db.select().from(marketPrices).where(eq(marketPrices.typeId, PLEX_TYPE_ID));
  const quote = await getQuote(PLEX_TYPE_ID);
  const average = price?.averagePrice ?? price?.adjustedPrice ?? null;
  const market = quote?.sellMin ?? null;
  const plexPrice = market ?? average;
  const plexPriceSource = market !== null ? ('market' as const) : average !== null ? ('average' as const) : null;
  const plexPriceUpdatedAt = market !== null ? quote!.updatedAt : average !== null ? price!.updatedAt : null;

  // Saldo de los wallets de los pilotos vinculados. Del inventario solo cuenta el PLEX que ya tienes:
  // el resto no es dinero hasta que se vende
  const chars = await db.select({ id: characters.id, lastSyncAt: characters.lastSyncAt }).from(characters);
  const balances = await Promise.all(chars.map((c) => lastBalance(c.id)));
  const available = balances.reduce((acc, b) => acc + (b?.balance ?? 0), 0);
  const [owned] = await db.select({ qty: sum(assets.quantity) }).from(assets).where(eq(assets.typeId, PLEX_TYPE_ID));
  const plexOwned = Number(owned?.qty ?? 0);
  const plexMissing = Math.max(0, plexNeeded - plexOwned);

  const cost = plexPrice === null ? null : plexNeeded * plexPrice;
  // Lo que queda por pagar: los PLEX que faltan, al precio actual
  const costMissing = plexPrice === null ? null : plexMissing * plexPrice;
  const missing = costMissing === null ? null : Math.max(0, costMissing - available);
  const surplus = costMissing === null ? null : Math.max(0, available - costMissing);
  const covered = cost === null ? 0 : Math.min(cost, available + Math.min(plexOwned, plexNeeded) * plexPrice!);
  const progress = cost === null || cost === 0 ? null : covered / cost;

  // ¿Tus pilotos se pagan el Omega? El Omega se renueva cada mes, así que «cuánto falta» no basta:
  // se compara lo que cuesta al día con lo que ganas al día. El ritmo se mide por piloto sobre los
  // días con datos (uno con el sync atascado cuenta hasta su último sync; uno sin sync no cuenta)
  const rates = await Promise.all(chars.map((c) => dailyNetRate(c.id, c.lastSyncAt, PACE_DAYS)));
  const pace = rates.reduce((acc: number, r) => acc + (r ?? 0), 0);
  const costPerDay = cost === null ? null : cost / OMEGA_MONTH_DAYS;
  const paceShare = costPerDay ? pace / costPerDay : null;

  return {
    accounts,
    plexPerMonth,
    months: 1,
    plexNeeded,
    plexOwned,
    plexMissing,
    plexPrice,
    plexAveragePrice: average,
    plexPriceSource,
    plexPriceUpdatedAt,
    cost,
    costMissing,
    available,
    missing,
    surplus,
    progress,
    avgDailyNet: pace,
    paceDays: PACE_DAYS,
    costPerDay,
    paceShare,
    // Saldo de cada piloto: la web dice cuánto de «available» viene de pilotos con datos viejos
    balances: chars.map((c, i) => ({ characterId: c.id, balance: balances[i]?.balance ?? null })),
  };
}

export async function getIndicators() {
  return { omega: await omegaIndicator() };
}
