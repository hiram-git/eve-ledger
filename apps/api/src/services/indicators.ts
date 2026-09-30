import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { characters, marketPrices } from '../db/schema';
import { env } from '../lib/env';
import { pricesUpdatedAt } from './prices';
import { getSummary, lastBalance } from './summary';

// PLEX (tipo 44992): con él se paga el Omega. Precio = media global de ESI, el mismo del inventario
const PLEX_TYPE_ID = 44992;
// Ritmo con el que se estima cuánto falta: neto medio de los últimos 7 días
const PACE_DAYS = 7;

export async function omegaIndicator() {
  const accounts = env.omegaAccounts;
  const plexPerMonth = env.omegaPlexPerMonth;
  const plexNeeded = accounts * plexPerMonth;

  const [price] = await db.select().from(marketPrices).where(eq(marketPrices.typeId, PLEX_TYPE_ID));
  const plexPrice = price?.averagePrice ?? price?.adjustedPrice ?? null;

  // Saldo de los wallets de los pilotos vinculados; el inventario no cuenta
  const chars = await db.select({ id: characters.id }).from(characters);
  const balances = await Promise.all(chars.map((c) => lastBalance(c.id)));
  const available = balances.reduce((sum, b) => sum + (b?.balance ?? 0), 0);

  const cost = plexPrice === null ? null : plexNeeded * plexPrice;
  const missing = cost === null ? null : Math.max(0, cost - available);
  const surplus = cost === null ? null : Math.max(0, available - cost);
  const progress = cost === null || cost === 0 ? null : Math.min(1, available / cost);
  // Cuántas cuentas cubre hoy el saldo (cada una cuesta lo mismo)
  const accountsCovered =
    cost === null || accounts === 0 ? null : Math.min(accounts, Math.floor(available / (cost / accounts)));

  const pace = chars.length ? (await getSummary(PACE_DAYS)).totals.net / PACE_DAYS : 0;
  const daysToCover = missing === null ? null : missing === 0 ? 0 : pace > 0 ? Math.ceil(missing / pace) : null;

  return {
    accounts,
    plexPerMonth,
    months: 1,
    plexNeeded,
    plexPrice,
    plexPriceUpdatedAt: await pricesUpdatedAt(),
    cost,
    available,
    missing,
    surplus,
    progress,
    accountsCovered,
    avgDailyNet: pace,
    paceDays: PACE_DAYS,
    daysToCover,
  };
}

export async function getIndicators() {
  return { omega: await omegaIndicator() };
}
