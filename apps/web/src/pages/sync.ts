import type { APIRoute } from 'astro';
import { syncAll, syncOne } from '../lib/api';

// Botones «Sincronizar»: todos los pilotos, o uno solo si el formulario trae `character`.
// Vuelve a la página de origen con el resultado en la query
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const rawBack = String(form.get('back') ?? '/');
  // Solo rutas locales: nunca redirigir fuera del dashboard
  const back = new URL(rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : '/', 'http://local');
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
