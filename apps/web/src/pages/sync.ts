import type { APIRoute } from 'astro';
import { safeBackUrl } from '../lib/safe-back';
import { syncAll, syncOne } from '../lib/api';

// «Sincronizar» buttons: all pilots, or just one if the form carries `character`.
// Returns to the originating page with the result in the query
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  // Local paths only: never redirect outside the dashboard
  const back = safeBackUrl(String(form.get('back') ?? '/'));
  const character = Number(form.get('character') ?? 0);
  try {
    const r = character ? await syncOne(character) : await syncAll();
    back.searchParams.set('synced', `${r.inserted}`);
    if (r.errors) back.searchParams.set('syncErrors', `${r.errors}`);
  } catch (err) {
    back.searchParams.set('syncFailed', err instanceof Error ? err.message : String(err));
  }
  return redirect(back.pathname + back.search, 303);
};
