import { sql, type SQL } from 'drizzle-orm';

// Actividad de cada ref_type del journal: responde «¿de dónde sale el ISK?» en términos de juego,
// no de ESI. Lo que no está en ninguna lista cuenta como «otros» (skills, clones, donaciones, PI…).
// Logística: lo que pagas (o cobras) por mover cosas con couriers
export const ACTIVITIES = ['pve', 'pvp', 'trading', 'logistics', 'other'] as const;
export type Activity = (typeof ACTIVITIES)[number];

const REF_TYPES: Record<Exclude<Activity, 'other'>, string[]> = {
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
export const activityOf = (refType: Column, contextId: Column) =>
  sql<Activity>`(case
    when ${refType} = 'contract_brokers_fee'
      and ${contextId} in (select contract_id from contracts where type = 'courier') then 'logistics'
    when ${refType} in (${list(REF_TYPES.logistics)}) then 'logistics'
    when ${refType} in (${list(REF_TYPES.pve)}) then 'pve'
    when ${refType} in (${list(REF_TYPES.pvp)}) then 'pvp'
    when ${refType} in (${list(REF_TYPES.trading)}) then 'trading'
    else 'other' end)`;
