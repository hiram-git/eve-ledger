const num = (digits: number) =>
  new Intl.NumberFormat('es', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Notación de EVE: k / M / B (mil millones)
export function isk(value: number, { sign = false } = {}): string {
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1e9 ? [1e9, ' B'] : abs >= 1e6 ? [1e6, ' M'] : abs >= 1e3 ? [1e3, ' k'] : [1, ''];
  const scaled = abs / div;
  // Por debajo de 1000 se muestran decimales si los hay (precios unitarios de minerales, p. ej.)
  const digits = div === 1 ? (Number.isInteger(abs) ? 0 : 2) : scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : '';
  return `${prefix}${num(digits).format(scaled)}${suffix}`;
}

// Signo menos tipográfico (U+2212), igual que en las cifras abreviadas
export const iskFull = (value: number) => `${num(2).format(value).replace('-', '−')} ISK`;

export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));

export function ago(iso: string | null): string {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

export function until(iso: string): string {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (min < 1) return 'en menos de 1 min';
  if (min < 60) return `en ${min} min`;
  return `en ${Math.round(min / 60)} h`;
}

// Nombres legibles de los ref_type más comunes; el resto se muestra tal cual
const REF_TYPES: Record<string, string> = {
  bounty_prizes: 'Recompensas (ratting)',
  ess_escrow_transfer: 'ESS',
  agent_mission_reward: 'Misiones',
  agent_mission_time_bonus_reward: 'Bonus de misión',
  market_transaction: 'Mercado',
  market_escrow: 'Escrow de mercado',
  transaction_tax: 'Impuesto de venta',
  brokers_fee: 'Comisión de broker',
  player_donation: 'Donaciones',
  player_trading: 'Intercambio directo',
  corporation_account_withdrawal: 'Retiro de corporación',
  contract_price: 'Contratos',
  contract_reward: 'Contratos (recompensa)',
  contract_collateral: 'Contratos (garantía)',
  contract_brokers_fee: 'Contratos (comisión)',
  contract_sales_tax: 'Contratos (impuesto)',
  planetary_import_tax: 'PI: impuesto de importación',
  planetary_export_tax: 'PI: impuesto de exportación',
  industry_job_tax: 'Impuesto de industria',
  reprocessing_tax: 'Impuesto de reprocesado',
  jump_clone_activation_fee: 'Activación de clon',
  jump_clone_installation_fee: 'Instalación de clon',
  skill_purchase: 'Compra de skills',
  insurance: 'Seguros',
  structure_gate_jump: 'Saltos Ansiblex',
  daily_goal_payouts: 'Metas diarias',
};

export const refTypeLabel = (ref: string) => REF_TYPES[ref] ?? ref.replaceAll('_', ' ');
