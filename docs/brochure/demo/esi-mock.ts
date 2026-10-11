// ESI simulado para la demostración (bun --preload): la API resuelve los fits, las skills y los precios de Jita
// con los tipos de types.ts, sin red. Todo lo demás de ESI responde 503 (la demo no sincroniza)
import { mock } from 'bun:test';
import { PRICE, TYPES } from './types';

const API = `${import.meta.dir}/../../../apps/api/src`;
const GROUP_CATEGORY = Object.fromEntries(Object.values(TYPES).map((t) => [t[1], t[2]]));
const REQ = [[182, 277], [183, 278], [184, 279]] as const;
class EsiError extends Error {
  constructor(public status: number) {
    super(`ESI ${status}`);
  }
}
const real = await import(`${API}/lib/esi.ts`);
mock.module(`${API}/lib/esi.ts`, () => ({
  ...real,
  EsiError,
  esiGet: async (path: string) => {
    const type = path.match(/^\/universe\/types\/(\d+)$/);
    if (type) {
      const t = TYPES[Number(type[1])];
      if (!t) throw new EsiError(404);
      const [name, group, , rank, pri, sec, req, omegaOnly] = t;
      const dogma_attributes = req.flatMap(([s, l], i) => [{ attribute_id: REQ[i][0], value: s }, { attribute_id: REQ[i][1], value: l }]);
      if (omegaOnly) dogma_attributes.push({ attribute_id: 1047, value: 1 });
      if (rank) dogma_attributes.push({ attribute_id: 275, value: rank }, { attribute_id: 180, value: pri! }, { attribute_id: 181, value: sec! });
      return { data: { type_id: Number(type[1]), name, group_id: group, dogma_attributes }, headers: new Headers() };
    }
    const group = path.match(/^\/universe\/groups\/(\d+)$/);
    if (group) return { data: { group_id: Number(group[1]), category_id: GROUP_CATEGORY[Number(group[1])] }, headers: new Headers() };
    const orders = path.match(/^\/markets\/(\d+)\/orders\/\?.*type_id=(\d+)/);
    if (orders) {
      const p = PRICE[Number(orders[2])];
      const data = p ? [{ price: p, is_buy_order: false, system_id: 30000142 }, { price: p * 0.8, is_buy_order: false, system_id: 30000144 }] : [];
      return { data, headers: new Headers({ 'x-pages': '1' }) };
    }
    throw new EsiError(503);
  },
  esiPost: async (path: string, body: string[]) => {
    if (path !== '/universe/ids') throw new EsiError(503);
    const byName = new Map(Object.entries(TYPES).map(([id, t]) => [t[0].toLowerCase(), { id: Number(id), name: t[0] }]));
    return { data: { inventory_types: body.map((n) => byName.get(n.toLowerCase())).filter(Boolean) }, headers: new Headers() };
  },
}));
