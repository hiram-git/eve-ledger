import { sql, type SQL } from 'drizzle-orm';

// Activity of each journal ref_type: answers «where does the ISK come from?» in game terms,
// not ESI terms. Anything not in any list counts as «otros» (other: skills, clones, donations, PI…).
// Logistics: what you pay (or get paid) for moving things with couriers.
// Accounts (user's decision after reviewing real data): buying or selling PLEX on the market is the cost of the
// accounts (Omega), neither trading nor gameplay; it is kept apart from the result and from the Omega rate
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
  // Everything that makes up the buy/sell margin: trades, escrow, fees and taxes
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

// A contract's fee is logistics if the contract is a courier (we know them with the contracts
// permission: context_id = contract_id); otherwise it belongs to a buy/sell contract (trading)
// What ratting also yields that the wallet doesn't label as such (user's decision):
// - sold escalation: a donation from someone who isn't your pilot, for a round amount (a multiple of 50 M:
//   150, 300, 450 M); other donations stay in «otros»;
// - sold loot: what you get from an item exchange contract accepted by a corporation (the corp buyback,
//   `contract_price_payment_corp`). Market sales don't count: they mix exploration, gas…
// Both are PvE and add to the ratting ISK/h. The escalations' bounties are already in bounty_prizes
const ESCALATION_STEP = 50_000_000;
export const refKindOf = (refType: Column, amount: Column, firstPartyId: Column) =>
  sql<string>`(case
    when ${refType} = 'player_donation' and ${amount} > 0
      and abs(${amount} - round(${amount} / ${ESCALATION_STEP}) * ${ESCALATION_STEP}) < 0.5
      and (${firstPartyId} is null or ${firstPartyId} not in (select id from characters)) then 'escalation_sale'
    when ${refType} = 'contract_price_payment_corp' and ${amount} > 0 then 'loot_buyback'
    else ${refType} end)`;
export const PVE_EXTRA_KINDS = ['escalation_sale', 'loot_buyback'];

// A market buy or sale belongs to accounts if its transaction (context_id) is for PLEX.
// refKind: refKindOf(...) of the same entry (sold escalations and buyback loot are PvE)
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
