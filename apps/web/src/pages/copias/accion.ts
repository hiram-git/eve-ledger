import type { APIRoute } from 'astro';
import { ActionError, BACKUP_NAME, createBackup, restoreBackup, restoreUpload } from '../../lib/api';
import { safeBackUrl } from '../../lib/safe-back';

// Backups (Pilotos panel): make one now, restore a stored one or an uploaded file. Returns to
// Pilotos with the result in the query and the panel's anchor, where the notice is rendered
export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const back = safeBackUrl('/pilotos');
  const action = String(form.get('action') ?? '');
  try {
    if (action === 'create') {
      const b = await createBackup();
      back.searchParams.set('ok', 'backup');
      back.searchParams.set('name', b.name);
    } else if (action === 'restore') {
      const name = String(form.get('name') ?? '');
      if (!BACKUP_NAME.test(name)) throw new ActionError('not_found', null);
      const r = await restoreBackup(name);
      back.searchParams.set('ok', 'restored');
      back.searchParams.set('pilots', String(r.info.pilots));
      back.searchParams.set('entries', String(r.info.entries));
    } else if (action === 'upload') {
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) throw new ActionError('no_file', null);
      const r = await restoreUpload(await file.arrayBuffer());
      back.searchParams.set('ok', 'restored');
      back.searchParams.set('pilots', String(r.info.pilots));
      back.searchParams.set('entries', String(r.info.entries));
    }
  } catch (err) {
    back.searchParams.set('error', err instanceof ActionError ? err.code : 'api');
    if (!(err instanceof ActionError)) console.error(err);
  }
  back.searchParams.set('at', 'copias');
  return redirect(`${back.pathname}${back.search}#copias`, 303);
};
