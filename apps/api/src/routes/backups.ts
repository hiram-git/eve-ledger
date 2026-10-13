import { Elysia, t } from 'elysia';
import {
  BackupError,
  backupPath,
  backupsView,
  createBackup,
  inspectBackupByName,
  restoreBackup,
  restoreUpload,
} from '../services/backups';

// What isn't valid (unknown name, file that isn't a backup, from a newer version, sync running)
// gives a code the web translates; 409 if you have to wait
const fail = (err: unknown, status: (code: number, body: unknown) => unknown) => {
  if (err instanceof BackupError) {
    const code = err.code === 'not_found' ? 404 : err.code === 'busy' ? 409 : 400;
    return status(code, { error: err.code, detail: err.message });
  }
  throw err;
};

export const backupRoutes = new Elysia({ prefix: '/backups' })
  .get('/', () => backupsView())
  .post('/', () => createBackup('manual'))
  // What's inside a backup (pilots, transactions and since when), to confirm before restoring it
  .get(
    '/:name/info',
    ({ params, status }) => {
      try {
        return inspectBackupByName(params.name);
      } catch (err) {
        return fail(err, status);
      }
    },
    { params: t.Object({ name: t.String() }) },
  )
  .get(
    '/:name',
    ({ params, status }) => {
      try {
        const path = backupPath(params.name);
        return new Response(Bun.file(path), {
          headers: {
            'content-type': 'application/vnd.sqlite3',
            'content-disposition': `attachment; filename="${params.name}"`,
          },
        });
      } catch (err) {
        return fail(err, status);
      }
    },
    { params: t.Object({ name: t.String() }) },
  )
  .post(
    '/:name/restore',
    ({ params, status }) => {
      try {
        return restoreBackup(params.name);
      } catch (err) {
        return fail(err, status);
      }
    },
    { params: t.Object({ name: t.String() }) },
  )
  // Restore an uploaded file (a backup downloaded earlier or from another machine), raw: no JSON or base64,
  // which with a database of hundreds of MB would exceed the request limit
  .post(
    '/upload',
    async ({ request, status }) => {
      try {
        return restoreUpload(new Uint8Array(await request.arrayBuffer()));
      } catch (err) {
        return fail(err, status);
      }
    },
    { parse: 'none' },
  );
