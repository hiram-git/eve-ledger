import type { APIRoute } from 'astro';
import { safeBackUrl } from '../../lib/safe-back';
import { ActionError, addFit, createDoctrine, deleteDoctrine, deleteFit, deletePlan, refreshPrices, setPlan } from '../../lib/api';

// Formularios de Doctrinas: crear o borrar doctrinas y fits, importar o quitar el plan (.emp, que se reenvía a la
// API en base64). Vuelve a /doctrinas con el resultado en la query y un ancla al sitio tocado
const MAX_PLAN_BYTES = 1_000_000;

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const back = safeBackUrl('/doctrinas');
  const action = String(form.get('action') ?? '');
  const id = Number(form.get('id') ?? 0);
  let anchor = '';
  const ok = (what: string, extra: Record<string, string> = {}) => {
    back.searchParams.set('ok', what);
    for (const [k, v] of Object.entries(extra)) back.searchParams.set(k, v);
  };
  try {
    if (action === 'create') {
      const name = String(form.get('name') ?? '');
      const r = await createDoctrine(name);
      ok('doctrine', { name: name.trim().slice(0, 80) });
      anchor = `doctrina-${r.id}`;
    } else if (action === 'prices') {
      const r = await refreshPrices();
      ok('prices', { n: String(r.updated) });
    } else if (action === 'delete-doctrine' && id) {
      await deleteDoctrine(id);
      ok('deleted');
    } else if (action === 'add-fit' && id) {
      const r = await addFit(id, String(form.get('eft') ?? ''));
      ok('fit');
      // Las líneas que ESI no reconoce, para que el usuario vea qué se quedó fuera (recortado: va en la URL)
      if (r.ignored.length) back.searchParams.set('ignored', r.ignored.slice(0, 12).join(' · ').slice(0, 600));
      anchor = `fit-${r.id}`;
    } else if (action === 'delete-fit' && id) {
      await deleteFit(id);
      ok('deleted');
      const doctrine = Number(form.get('doctrine') ?? 0);
      if (doctrine) anchor = `doctrina-${doctrine}`;
    } else if (action === 'plan' && id) {
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) throw new ActionError('no_file', null);
      if (file.size > MAX_PLAN_BYTES) throw new ActionError('emp_too_big', null);
      const data = Buffer.from(await file.arrayBuffer()).toString('base64');
      const r = await setPlan(id, data, file.name.slice(0, 200));
      ok('plan', { name: r.name, n: String(r.skills) });
      anchor = `fit-${id}`;
    } else if (action === 'delete-plan' && id) {
      await deletePlan(id);
      ok('deleted');
      anchor = `fit-${id}`;
    }
  } catch (err) {
    // Lo que no es un error de lo pegado (código de la API) suele ser ESI sin responder al resolver los nombres
    back.searchParams.set('error', err instanceof ActionError ? err.code : 'esi');
    if (err instanceof ActionError && err.detail) back.searchParams.set('detail', err.detail.slice(0, 200));
    if (!(err instanceof ActionError)) console.error(err);
    anchor = action === 'add-fit' ? `doctrina-${id}` : action === 'plan' ? `fit-${id}` : '';
  }
  return redirect(back.pathname + back.search + (anchor ? `#${anchor}` : ''), 303);
};
