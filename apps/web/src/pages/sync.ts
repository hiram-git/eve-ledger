import type { APIRoute } from 'astro';
import { syncAll } from '../lib/api';

// Botón "Sincronizar ahora": llama a POST /sync/all de la API y vuelve al dashboard
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const days = String(form.get('days') ?? '30');
  const params = new URLSearchParams({ days });
  try {
    const r = await syncAll();
    params.set('synced', `${r.inserted}`);
    if (r.errors) params.set('syncErrors', `${r.errors}`);
  } catch (err) {
    params.set('syncFailed', err instanceof Error ? err.message : String(err));
  }
  return redirect(`/?${params}`, 303);
};
