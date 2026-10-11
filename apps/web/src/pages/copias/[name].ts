import type { APIRoute } from 'astro';
import { BACKUP_NAME, fetchBackup } from '../../lib/api';

// Descargar una copia de seguridad: la web la pide a la API (que solo escucha en esta máquina) y la entrega tal cual
export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? '';
  if (!BACKUP_NAME.test(name)) return new Response('Not found', { status: 404 });
  const res = await fetchBackup(name);
  if (!res.ok || !res.body) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    headers: {
      'content-type': 'application/vnd.sqlite3',
      'content-disposition': `attachment; filename="${name}"`,
      ...(res.headers.get('content-length') ? { 'content-length': res.headers.get('content-length')! } : {}),
    },
  });
};
