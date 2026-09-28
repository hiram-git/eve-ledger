import type { APIRoute } from 'astro';
import { getSyncStatus } from '../lib/api';

// Estado del sync para el auto-refresco del dashboard (el navegador no llama a la API directamente)
export const GET: APIRoute = async () => {
  try {
    const s = await getSyncStatus();
    return Response.json({ running: s.running, lastRunAt: s.lastRun?.finishedAt ?? null });
  } catch {
    return Response.json({ error: 'API no disponible' }, { status: 502 });
  }
};
