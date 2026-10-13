import type { APIRoute } from 'astro';
import { BACKUP_NAME, fetchBackup } from '../../lib/api';

// Download a backup: the web requests it from the API (which only listens on this machine) and hands it over as-is
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
