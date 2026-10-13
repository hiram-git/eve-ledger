import type { APIRoute } from 'astro';
import { getSyncStatus } from '../lib/api';

// Sync state for the dashboard auto-refresh (the browser does not call the API directly)
export const GET: APIRoute = async () => {
  try {
    const s = await getSyncStatus();
    return Response.json({ running: s.running, lastRunAt: s.lastRun?.finishedAt ?? null });
  } catch {
    return Response.json({ error: 'API no disponible' }, { status: 502 });
  }
};
