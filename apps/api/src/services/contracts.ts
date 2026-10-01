import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { contracts } from '../db/schema';
import { esiGet } from '../lib/esi';

export const CONTRACTS_SCOPE = 'esi-contracts.read_character_contracts.v1';

// GET /characters/{id}/contracts (solo los campos que guardamos)
type EsiContract = {
  contract_id: number;
  issuer_id: number;
  acceptor_id?: number;
  assignee_id?: number;
  type: string;
  status: string;
  date_issued: string;
  date_completed?: string;
  price?: number;
  reward?: number;
  collateral?: number;
  start_location_id?: number;
  end_location_id?: number;
};
type EsiContractItem = { type_id: number; quantity: number; is_included: boolean };

const CHUNK = 500;
// Ítems de courier por sync: el resto en el siguiente
const MAX_ITEMS = 50;

export async function fetchContracts(characterId: number, r: { pages: number; fetched: number; inserted: number }) {
  const all: EsiContract[] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const { data, headers } = await esiGet<EsiContract[]>(`/characters/${characterId}/contracts?page=${page}`, characterId);
    if (page === 1) totalPages = Number(headers.get('x-pages') ?? 1) || 1;
    all.push(...data);
    r.pages = page;
  }
  r.fetched = all.length;

  // El estado cambia (outstanding → in_progress → finished): upsert, sin tocar los ítems ya guardados
  const now = new Date();
  const rows = all.map((c) => ({
    contractId: c.contract_id,
    characterId,
    issuerId: c.issuer_id,
    acceptorId: c.acceptor_id || null,
    assigneeId: c.assignee_id || null,
    type: c.type,
    status: c.status,
    dateIssued: new Date(c.date_issued),
    dateCompleted: c.date_completed ? new Date(c.date_completed) : null,
    price: c.price ?? null,
    reward: c.reward ?? null,
    collateral: c.collateral ?? null,
    startLocationId: c.start_location_id ?? null,
    endLocationId: c.end_location_id ?? null,
    updatedAt: now,
  }));
  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      tx.insert(contracts)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: contracts.contractId,
          set: {
            acceptorId: sql`excluded.acceptor_id`,
            status: sql`excluded.status`,
            dateCompleted: sql`excluded.date_completed`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    }
  });
  r.inserted = rows.length;

  // Qué lleva cada courier que emitió este piloto (los ítems no cambian: una sola vez)
  const pending = await db
    .select({ id: contracts.contractId })
    .from(contracts)
    .where(and(eq(contracts.issuerId, characterId), eq(contracts.type, 'courier'), isNull(contracts.items)))
    .limit(MAX_ITEMS);
  for (const { id } of pending) {
    const { data } = await esiGet<EsiContractItem[]>(`/characters/${characterId}/contracts/${id}/items`, characterId);
    const items = data.filter((i) => i.is_included).map((i) => ({ typeId: i.type_id, quantity: i.quantity }));
    await db.update(contracts).set({ items }).where(eq(contracts.contractId, id));
  }
}

// Couriers emitidos por tus pilotos desde un instante, con lo que llevan
export async function courierContracts(issuers: number[], from: Date) {
  if (!issuers.length) return [];
  return db
    .select({
      contractId: contracts.contractId,
      issuerId: contracts.issuerId,
      dateIssued: contracts.dateIssued,
      status: contracts.status,
      reward: contracts.reward,
      items: contracts.items,
    })
    .from(contracts)
    .where(and(eq(contracts.type, 'courier'), inArray(contracts.issuerId, issuers), gte(contracts.dateIssued, from)));
}
