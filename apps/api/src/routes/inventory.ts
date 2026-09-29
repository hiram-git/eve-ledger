import { Elysia, t } from 'elysia';
import { isLinkedPilot, notLinked, pilotQuery } from '../lib/pilot-filter';
import { getMap } from '../services/geo';
import { getInventory, listAssets } from '../services/inventory';

export const inventoryRoutes = new Elysia()
  // Valor del inventario consolidado: por personaje, por ubicación e ítems más valiosos
  .get(
    '/inventory',
    async ({ query, status }) =>
      (await isLinkedPilot(query.characterId))
        ? getInventory({ characterId: query.characterId })
        : status(404, notLinked(query.characterId)),
    { query: t.Object(pilotQuery) },
  )
  // Mapa «tu New Eden»: inventario por sistema y dónde se ganó ISK hoy
  .get(
    '/map',
    async ({ query, status }) =>
      (await isLinkedPilot(query.characterId)) ? getMap(query.characterId) : status(404, notLinked(query.characterId)),
    { query: t.Object(pilotQuery) },
  )
  // Detalle de assets con nombre y valor, ordenados por valor
  .get(
    '/assets',
    ({ query }) =>
      listAssets({
        characterId: query.characterId,
        locationId: query.locationId,
        typeId: query.typeId,
        limit: query.limit ?? 200,
      }),
    {
      query: t.Object({
        characterId: t.Optional(t.Numeric()),
        locationId: t.Optional(t.Numeric()),
        typeId: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 5000 })),
      }),
    },
  );
