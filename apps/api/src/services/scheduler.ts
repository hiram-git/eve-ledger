import { desc } from 'drizzle-orm';
import { db } from '../db/client';
import { syncLog } from '../db/schema';
import { env } from '../lib/env';
import { syncAll } from './sync';

// Margen al arrancar para no sincronizar en mitad del arranque (o de cada recarga de `bun --watch`)
const STARTUP_DELAY_MS = 15_000;

type LastRun = { startedAt: Date; finishedAt: Date; inserted: number; errors: number; characters: number };

const state: {
  timer?: ReturnType<typeof setTimeout>;
  nextRunAt?: Date;
  running: boolean;
  lastRun?: LastRun;
} = { running: false };

const intervalMs = () => env.syncIntervalMin * 60_000;

function schedule(at: number) {
  clearTimeout(state.timer);
  const delay = Math.max(0, at - Date.now());
  state.nextRunAt = new Date(Date.now() + delay);
  state.timer = setTimeout(run, delay);
}

async function run() {
  // Siguiente ejecución contada desde el inicio de esta: cada N minutos exactos, sin solaparse
  const startedAt = new Date();
  state.running = true;
  state.nextRunAt = undefined;
  try {
    const results = await syncAll();
    const errors = results.filter((r) => r.error);
    state.lastRun = {
      startedAt,
      finishedAt: new Date(),
      inserted: results.reduce((n, r) => n + r.inserted, 0),
      errors: errors.length,
      characters: results.length,
    };
    console.log(
      `[cron] sync: ${state.lastRun.inserted} movimientos nuevos en ${results.length} personajes` +
        (errors.length ? `, ${errors.length} con error: ${errors.map((r) => `${r.name}: ${r.error}`).join(' | ')}` : ''),
    );
  } catch (err) {
    console.error('[cron] sync falló:', err);
  } finally {
    state.running = false;
    schedule(startedAt.getTime() + intervalMs());
  }
}

export async function startScheduler() {
  if (env.syncIntervalMin <= 0) {
    console.log('[cron] desactivado (SYNC_INTERVAL_MIN=0)');
    return;
  }

  // Si la API se reinicia, continuar el ritmo según el último sync registrado
  // en vez de volver a llamar a ESI en cada arranque
  const [last] = await db.select({ startedAt: syncLog.startedAt }).from(syncLog).orderBy(desc(syncLog.id)).limit(1);
  const dueAt = last ? last.startedAt.getTime() + intervalMs() : 0;
  schedule(Math.max(Date.now() + STARTUP_DELAY_MS, dueAt));
  console.log(`[cron] sync cada ${env.syncIntervalMin} min; próximo: ${state.nextRunAt?.toLocaleString()}`);
}

export function schedulerStatus() {
  return {
    enabled: env.syncIntervalMin > 0,
    intervalMin: env.syncIntervalMin,
    running: state.running,
    nextRunAt: state.nextRunAt ?? null,
    lastRun: state.lastRun ?? null,
  };
}
