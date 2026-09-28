import { sql, type SQL } from 'drizzle-orm';

// Actividad de cada ref_type del journal: responde «¿de dónde sale el ISK?» en términos de juego,
// no de ESI. Lo que no está en ninguna lista cuenta como «otros» (skills, clones, donaciones, PI…).
export const ACTIVITIES = ['pve', 'pvp', 'trading', 'other'] as const;
export type Activity = (typeof ACTIVITIES)[number];

const REF_TYPES: Record<Exclude<Activity, 'other'>, string[]> = {
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

export const activityOf = (refType: SQL | { getSQL(): SQL }) =>
  sql<Activity>`(case
    when ${refType} in (${list(REF_TYPES.pve)}) then 'pve'
    when ${refType} in (${list(REF_TYPES.pvp)}) then 'pvp'
    when ${refType} in (${list(REF_TYPES.trading)}) then 'trading'
    else 'other' end)`;

type Flow = { income: number; expenses: number };

// El trading cuenta como margen neto: ventas − compras − comisiones del mismo ámbito
// (período, día o piloto). Si el margen es positivo suma a ingresos; si es negativo, a gastos.
// El neto no cambia; solo evita que mover ISK por el mercado infle ingresos y gastos.
export function foldTrading(rows: (Flow & { activity: Activity })[]): Flow & { net: number } {
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    if (r.activity === 'trading') {
      const margin = r.income - r.expenses;
      if (margin > 0) income += margin;
      else expenses -= margin;
    } else {
      income += r.income;
      expenses += r.expenses;
    }
  }
  return { income, expenses, net: income - expenses };
}

// foldTrading por grupos (día, personaje…)
export function foldBy<K, R extends Flow & { activity: Activity }>(rows: R[], key: (r: R) => K) {
  const groups = new Map<K, R[]>();
  for (const r of rows) {
    const k = key(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return new Map([...groups].map(([k, g]) => [k, foldTrading(g)]));
}
