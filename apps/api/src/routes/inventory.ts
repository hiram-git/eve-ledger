import { Elysia, t } from 'elysia';
import { getMap } from '../services/geo';
import { getInventory, listAssets } from '../services/inventory';

export const inventoryRoutes = new Elysia()
  // Valor del inventario consolidado: por personaje, por ubicación e ítems más valiosos
  .get('/inventory', () => getInventory())
  // Mapa «tu New Eden»: inventario por sistema y dónde se ganó ISK hoy
  .get('/map', () => getMap())
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
