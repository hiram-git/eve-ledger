import { Elysia, t } from 'elysia';
import { refreshDoctrinePrices } from '../services/jita';
import { addFit, createDoctrine, deleteDoctrine, deleteFit, deletePlan, DoctrineError, listDoctrines, renameDoctrine, setClone, setPlan } from '../services/doctrines';

const id = t.Object({ id: t.Numeric({ minimum: 1 }) });

// Errors in what the user pastes or uploads: 400 with a code the web translates
const fail = (err: unknown, status: (code: 400, body: unknown) => unknown) => {
  if (err instanceof DoctrineError) return status(400, { error: err.code, detail: err.detail ?? null });
  throw err;
};

// Doctrines: EFT fits, skill plans (.emp) and which pilot flies what. Alpha or Omega for each pilot
export const doctrineRoutes = new Elysia()
  .get('/doctrines', () => listDoctrines())
  .post(
    '/doctrines',
    async ({ body, status }) => {
      try {
        return await createDoctrine(body.name);
      } catch (err) {
        return fail(err, status);
      }
    },
    { body: t.Object({ name: t.String({ maxLength: 200 }) }) },
  )
  // Jita prices right now (the sync refreshes them hourly; with the sync off, by hand)
  .post('/doctrines/prices', async ({ status }) => {
    try {
      return { updated: await refreshDoctrinePrices({ force: true }) };
    } catch (err) {
      console.warn('[jita] falló:', err instanceof Error ? err.message : err);
      return status(502, { error: 'esi' });
    }
  })
  .put(
    '/doctrines/:id',
    async ({ params, body, status }) => {
      try {
        return await renameDoctrine(params.id, body.name);
      } catch (err) {
        return fail(err, status);
      }
    },
    { params: id, body: t.Object({ name: t.String({ maxLength: 200 }) }) },
  )
  .delete('/doctrines/:id', async ({ params }) => {
    await deleteDoctrine(params.id);
    return { ok: true };
  }, { params: id })
  .post(
    '/doctrines/:id/fits',
    async ({ params, body, status }) => {
      try {
        return await addFit(params.id, body.eft);
      } catch (err) {
        return fail(err, status);
      }
    },
    { params: id, body: t.Object({ eft: t.String({ maxLength: 50_000 }) }) },
  )
  .delete('/fits/:id', async ({ params }) => {
    await deleteFit(params.id);
    return { ok: true };
  }, { params: id })
  // The .emp arrives in base64 (the web receives it in a form and forwards it)
  .put(
    '/fits/:id/plan',
    async ({ params, body, status }) => {
      try {
        return await setPlan(params.id, Buffer.from(body.data, 'base64'), body.filename ?? '');
      } catch (err) {
        return fail(err, status);
      }
    },
    { params: id, body: t.Object({ data: t.String({ maxLength: 1_400_000 }), filename: t.Optional(t.String({ maxLength: 300 })) }) },
  )
  .delete('/fits/:id/plan', async ({ params }) => {
    await deletePlan(params.id);
    return { ok: true };
  }, { params: id })
  .put(
    '/characters/:id/clone',
    async ({ params, body, status }) => ((await setClone(params.id, body.clone)) ? { ok: true } : status(404, { error: 'pilot' })),
    { params: id, body: t.Object({ clone: t.Union([t.Literal('omega'), t.Literal('alpha')]) }) },
  );
