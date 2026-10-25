import { desc } from 'drizzle-orm';
import { db, rawDb } from '../db/client';
import { syncLog } from '../db/schema';
import { env } from '../lib/env';
import { maybeAutoBackup } from './backups';
import { syncAll } from './sync';

// Startup delay so as not to sync in the middle of starting up (or of each `bun --watch` reload)
const STARTUP_DELAY_MS = 15_000;

type LastRun = { startedAt: Date; finishedAt: Date; inserted: number; errors: number; characters: number; failed: number[] };

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
  // Next run counted from the start of this one: every N minutes exactly, without overlapping
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
      failed: errors.map((r) => r.characterId),
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
    // With this round's data already stored
    maybeAutoBackup();
  }
}

export async function startScheduler() {
  if (env.syncIntervalMin <= 0) {
    console.log('[cron] desactivado (SYNC_INTERVAL_MIN=0)');
    return;
  }

  // If the API restarts, keep the pace according to the last logged sync
  // instead of calling ESI again on every startup
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
    lastRun: state.lastRun ? { ...state.lastRun, failed: undefined, errors: stillFailing(state.lastRun) } : null,
    // The most recent good sync of any pilot: after a restart there's no lastRun until the first round (up to an hour),
    // and the header on a phone said «cada 60 min» with data from minutes ago
    lastSyncAt: lastGoodSync(),
  };
}

// Pilots of the last round that still have no good sync after their failure in it (a manual sync or a relink may have
// fixed them since, even while the round went on). A pilot the round skipped because a manual sync of it was running
// logged nothing in the round: that manual sync's own steps decide
export function stillFailing(run: Pick<LastRun, 'startedAt' | 'failed'>) {
  if (!run.failed.length) return 0;
  const row = rawDb()
    .query(
      `select count(*) as n from characters c join (select character_id, max(finished_at) as failed_at from sync_log
         where error is not null and started_at >= ? group by character_id) f on f.character_id = c.id
       where c.id in (${run.failed.map(() => '?').join(',')}) and (c.last_sync_at is null or c.last_sync_at < f.failed_at)`,
    )
    .get(Math.floor(run.startedAt.getTime() / 1000), ...run.failed) as { n: number };
  return row.n;
}

function lastGoodSync(): Date | null {
  const row = rawDb().query('select max(last_sync_at) as at from characters').get() as { at: number | null };
  return row.at ? new Date(row.at * 1000) : null;
}
