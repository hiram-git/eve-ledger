import { sql, type SQL } from 'drizzle-orm';

// Actividad de cada ref_type del journal: responde «¿de dónde sale el ISK?» en términos de juego,
// no de ESI. Lo que no está en ninguna lista cuenta como «otros» (skills, clones, donaciones, PI…).
// Logística: lo que pagas (o cobras) por mover cosas con couriers.
// Cuentas (decisión del usuario, decimosexta crítica): comprar o vender PLEX en el mercado es el coste de las
// cuentas (Omega), no trading ni juego; va aparte del resultado y del ritmo del Omega
export const ACTIVITIES = ['pve', 'pvp', 'trading', 'logistics', 'other', 'accounts'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const PLEX_TYPE_ID = 44992;

const REF_TYPES: Record<Exclude<Activity, 'other' | 'accounts'>, string[]> = {
  logistics: [
    'contract_reward',
    'contract_reward_deposited',
    'contract_reward_refund',
    'contract_collateral',
    'contract_collateral_payout',
    'contract_collateral_refund',
  ],
  pve: [
    'bounty_prizes',
    'bounty_prize',
    'ess_escrow_transfer',
    'agent_mission_reward',
    'agent_mission_time_bonus_reward',
    'agent_mission_collateral_paid',
    'agent_mission_collateral_refunded',
    'corporate_reward_payout',
  ],
  pvp: ['insurance', 'kill_right_fee', 'war_fee', 'war_fee_surrender', 'war_ally_contract'],
  // Todo lo que forma el margen de comprar y vender: operaciones, escrow, comisiones e impuestos
  trading: [
    'market_transaction',
    'market_escrow',
    'transaction_tax',
    'brokers_fee',
    'market_provider_tax',
    'player_trading',
    'contract_price',
    'contract_price_payment_corp',
    'contract_brokers_fee',
    'contract_sales_tax',
    'contract_deposit',
    'contract_deposit_refund',
    'contract_auction_bid',
    'contract_auction_bid_refund',
    'contract_auction_sold',
  ],
};

const list = (refs: string[]) => sql.join(refs.map((r) => sql`${r}`), sql`, `);

type Column = SQL | { getSQL(): SQL };

// La comisión de un contrato es logística si el contrato es un courier (los conocemos con el permiso de
// contratos: context_id = contract_id); si no, es la de un contrato de compraventa (trading)
// Lo que el rateo también da y el wallet no etiqueta como tal (decisión del usuario):
// - escalación vendida: donación que te hace alguien que no es tu piloto, por un importe redondo (múltiplo de 50 M:
//   150, 300, 450 M); las demás donaciones siguen en «otros»;
// - loot vendido: lo que cobras de un contrato de intercambio que acepta una corporación (el buyback de la corp,
//   `contract_price_payment_corp`). Las ventas de mercado no cuentan: mezclan exploración, gas…
// Las dos son PvE y suman al ISK/h de ratting. Las recompensas de las escalaciones ya están en bounty_prizes
const ESCALATION_STEP = 50_000_000;
export const refKindOf = (refType: Column, amount: Column, firstPartyId: Column) =>
  sql<string>`(case
    when ${refType} = 'player_donation' and ${amount} > 0
      and abs(${amount} - round(${amount} / ${ESCALATION_STEP}) * ${ESCALATION_STEP}) < 0.5
      and (${firstPartyId} is null or ${firstPartyId} not in (select id from characters)) then 'escalation_sale'
    when ${refType} = 'contract_price_payment_corp' and ${amount} > 0 then 'loot_buyback'
    else ${refType} end)`;
export const PVE_EXTRA_KINDS = ['escalation_sale', 'loot_buyback'];

// Una compra o venta de mercado es de las cuentas si su transacción (context_id) es de PLEX.
// refKind: refKindOf(...) del mismo movimiento (las escalaciones vendidas y el loot del buyback son PvE)
export const activityOf = (refType: Column, contextId: Column, refKind: Column) =>
  sql<Activity>`(case
    when ${refKind} in (${list(PVE_EXTRA_KINDS)}) then 'pve'
    when ${refType} in ('market_transaction', 'market_escrow')
      and ${contextId} in (select transaction_id from wallet_transactions where type_id = ${PLEX_TYPE_ID}) then 'accounts'
    when ${refType} = 'contract_brokers_fee'
      and ${contextId} in (select contract_id from contracts where type = 'courier') then 'logistics'
    when ${refType} in (${list(REF_TYPES.logistics)}) then 'logistics'
    when ${refType} in (${list(REF_TYPES.pve)}) then 'pve'
    when ${refType} in (${list(REF_TYPES.pvp)}) then 'pvp'
    when ${refType} in (${list(REF_TYPES.trading)}) then 'trading'
    else 'other' end)`;
