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

// Lo que no vale (nombre desconocido, archivo que no es una copia, de una versión más nueva, sync en marcha)
// da un código que la web traduce; 409 si hay que esperar
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
  // Qué hay dentro de una copia (pilotos, movimientos y desde cuándo), para confirmar antes de restaurarla
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
  // Restaurar un archivo subido (una copia descargada antes o de otro equipo), en crudo: sin JSON ni base64,
  // que con una base de cientos de MB pasaría del límite de la petición
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
