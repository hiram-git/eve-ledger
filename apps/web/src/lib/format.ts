import { DEFAULT_LANG, t, type Lang } from './i18n';

// Formato de números de cada idioma (1.234,5 en es/de, 1,234.5 en en)
const LOCALE: Record<Lang, string> = { es: 'es', en: 'en', de: 'de' };

const num = (digits: number, lang: Lang) =>
  new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Notación de EVE: k / M / B (mil millones), igual en los tres idiomas porque es la del juego
export function isk(value: number, { sign = false, lang = DEFAULT_LANG }: { sign?: boolean; lang?: Lang } = {}): string {
  const abs = Math.abs(value);
  const [div, suffix] = abs >= 1e9 ? [1e9, ' B'] : abs >= 1e6 ? [1e6, ' M'] : abs >= 1e3 ? [1e3, ' k'] : [1, ''];
  const scaled = abs / div;
  // Por debajo de 1000 se muestran decimales si los hay (precios unitarios de minerales, p. ej.)
  const digits = div === 1 ? (Number.isInteger(abs) ? 0 : 2) : scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : '';
  return `${prefix}${num(digits, lang).format(scaled)}${suffix}`;
}

// Signo menos tipográfico (U+2212), igual que en las cifras abreviadas
// sign: «+» en los positivos (netos), como en la cifra abreviada
export const iskFull = (value: number, lang: Lang = DEFAULT_LANG, sign = false) =>
  `${sign && value > 0 ? '+' : ''}${num(2, lang).format(value).replace('-', '−')} ISK`;

export const shortDate = (iso: string, lang: Lang = DEFAULT_LANG) =>
  new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));

// «25 sept, 09:47» en hora de EVE (UTC)
export const shortDateTime = (iso: string, lang: Lang = DEFAULT_LANG) =>
  new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(
    new Date(iso),
  );

export const longDate = (iso: string, lang: Lang = DEFAULT_LANG) =>
  new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );

// Tiempo relativo con el formato de cada idioma («hace 5 min», «5 min ago», «vor 5 Min.»)
function relative(minutes: number, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'always', style: 'short' });
  const abs = Math.abs(minutes);
  if (abs < 60) return rtf.format(Math.round(minutes), 'minute');
  const hours = minutes / 60;
  if (Math.abs(hours) < 48) return rtf.format(Math.round(hours), 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

// Duración hasta un instante futuro («18 h», «3 d»): lo que falta, sin «dentro de»
export function remaining(iso: string, lang: Lang = DEFAULT_LANG): string {
  const hours = Math.max(1, (new Date(iso).getTime() - Date.now()) / 3_600_000);
  const [n, unit] = hours < 48 ? [Math.round(hours), 'hour'] : [Math.round(hours / 24), 'day'];
  return new Intl.NumberFormat(LOCALE[lang], { style: 'unit', unit, unitDisplay: 'short' }).format(n);
}

export function ago(iso: string | null, lang: Lang = DEFAULT_LANG): string {
  if (!iso) return t(lang).never;
  const min = (Date.now() - new Date(iso).getTime()) / 60_000;
  return min < 1 ? t(lang).now : relative(-min, lang);
}

export function until(iso: string, lang: Lang = DEFAULT_LANG): string {
  const min = (new Date(iso).getTime() - Date.now()) / 60_000;
  return relative(Math.max(1, min), lang);
}

// Nombres legibles de los ref_type más comunes; el resto se muestra tal cual
const REF_TYPES: Record<string, Record<Lang, string>> = {
  bounty_prizes: { es: 'Recompensas (ratting)', en: 'Bounties (ratting)', de: 'Kopfgelder (Ratting)' },
  ess_escrow_transfer: { es: 'ESS', en: 'ESS', de: 'ESS' },
  agent_mission_reward: { es: 'Misiones', en: 'Missions', de: 'Missionen' },
  agent_mission_time_bonus_reward: { es: 'Bonus de misión', en: 'Mission time bonus', de: 'Missions-Zeitbonus' },
  market_transaction: { es: 'Mercado', en: 'Market', de: 'Markt' },
  // ESI asienta así las compras de mercado del comprador (y el escrow de las órdenes de compra)
  market_escrow: { es: 'Compras de mercado', en: 'Market purchases', de: 'Marktkäufe' },
  transaction_tax: { es: 'Impuesto de venta', en: 'Sales tax', de: 'Verkaufssteuer' },
  brokers_fee: { es: 'Comisión de broker', en: 'Broker fee', de: 'Maklergebühr' },
  player_donation: { es: 'Donaciones', en: 'Donations', de: 'Spenden' },
  player_trading: { es: 'Intercambio directo', en: 'Direct trade', de: 'Direkthandel' },
  corporation_account_withdrawal: { es: 'Retiro de corporación', en: 'Corp withdrawal', de: 'Corp-Abhebung' },
  contract_price: { es: 'Contratos', en: 'Contracts', de: 'Verträge' },
  contract_reward: { es: 'Contratos (recompensa)', en: 'Contracts (reward)', de: 'Verträge (Belohnung)' },
  contract_reward_deposited: { es: 'Courier (recompensa)', en: 'Courier (reward)', de: 'Kurier (Belohnung)' },
  contract_reward_refund: { es: 'Courier (recompensa devuelta)', en: 'Courier (reward refund)', de: 'Kurier (Belohnung zurück)' },
  contract_collateral_payout: { es: 'Courier (garantía cobrada)', en: 'Courier (collateral payout)', de: 'Kurier (Sicherheit ausgezahlt)' },
  contract_collateral_refund: { es: 'Courier (garantía devuelta)', en: 'Courier (collateral refund)', de: 'Kurier (Sicherheit zurück)' },
  contract_collateral: { es: 'Contratos (garantía)', en: 'Contracts (collateral)', de: 'Verträge (Sicherheit)' },
  contract_brokers_fee: { es: 'Contratos (comisión)', en: 'Contracts (broker fee)', de: 'Verträge (Maklergebühr)' },
  contract_sales_tax: { es: 'Contratos (impuesto)', en: 'Contracts (sales tax)', de: 'Verträge (Steuer)' },
  planetary_import_tax: { es: 'PI: impuesto de importación', en: 'PI: import tax', de: 'PI: Importsteuer' },
  planetary_export_tax: { es: 'PI: impuesto de exportación', en: 'PI: export tax', de: 'PI: Exportsteuer' },
  industry_job_tax: { es: 'Impuesto de industria', en: 'Industry tax', de: 'Industriesteuer' },
  reprocessing_tax: { es: 'Impuesto de reprocesado', en: 'Reprocessing tax', de: 'Wiederaufbereitungssteuer' },
  jump_clone_activation_fee: { es: 'Activación de clon', en: 'Jump clone activation', de: 'Sprungklon-Aktivierung' },
  jump_clone_installation_fee: { es: 'Instalación de clon', en: 'Jump clone installation', de: 'Sprungklon-Installation' },
  skill_purchase: { es: 'Compra de skills', en: 'Skill purchase', de: 'Skill-Kauf' },
  insurance: { es: 'Seguros', en: 'Insurance', de: 'Versicherung' },
  kill_right_fee: { es: 'Kill rights', en: 'Kill rights', de: 'Kill-Rights' },
  // No son ref_types de ESI: el resumen mueve a PvP la reposición y el courier de las naves perdidas
  ship_replacement: { es: 'Reposición de naves perdidas', en: 'Lost ship replacement', de: 'Ersatz verlorener Schiffe' },
  ship_transport: { es: 'Courier de naves perdidas', en: 'Lost ship courier', de: 'Kurier verlorener Schiffe' },
  war_fee: { es: 'Tasas de guerra', en: 'War fees', de: 'Kriegsgebühren' },
  war_fee_surrender: { es: 'Rendición de guerra', en: 'War surrender', de: 'Kapitulation' },
  war_ally_contract: { es: 'Aliados de guerra', en: 'War allies', de: 'Kriegsverbündete' },
  bounty_prize: { es: 'Recompensas (ratting)', en: 'Bounties (ratting)', de: 'Kopfgelder (Ratting)' },
  agent_mission_collateral_paid: { es: 'Misiones (garantía)', en: 'Missions (collateral)', de: 'Missionen (Sicherheit)' },
  agent_mission_collateral_refunded: { es: 'Misiones (garantía devuelta)', en: 'Missions (collateral refund)', de: 'Missionen (Sicherheit zurück)' },
  corporate_reward_payout: { es: 'Recompensas de corporación', en: 'Corporation rewards', de: 'Corp-Belohnungen' },
  market_provider_tax: { es: 'Impuesto del mercado', en: 'Market provider tax', de: 'Marktanbietersteuer' },
  contract_price_payment_corp: { es: 'Contratos (pago de corp)', en: 'Contracts (corp payment)', de: 'Verträge (Corp-Zahlung)' },
  contract_deposit: { es: 'Contratos (depósito)', en: 'Contracts (deposit)', de: 'Verträge (Kaution)' },
  contract_deposit_refund: { es: 'Contratos (depósito devuelto)', en: 'Contracts (deposit refund)', de: 'Verträge (Kaution zurück)' },
  contract_auction_bid: { es: 'Subastas (puja)', en: 'Auctions (bid)', de: 'Auktionen (Gebot)' },
  contract_auction_bid_refund: { es: 'Subastas (puja devuelta)', en: 'Auctions (bid refund)', de: 'Auktionen (Gebot zurück)' },
  contract_auction_sold: { es: 'Subastas (venta)', en: 'Auctions (sold)', de: 'Auktionen (verkauft)' },
  structure_gate_jump: { es: 'Saltos Ansiblex', en: 'Ansiblex jumps', de: 'Ansiblex-Sprünge' },
  daily_goal_payouts: { es: 'Metas diarias', en: 'Daily goals', de: 'Tagesziele' },
};

export const refTypeLabel = (ref: string, lang: Lang = DEFAULT_LANG) =>
  REF_TYPES[ref]?.[lang] ?? ref.replaceAll('_', ' ');
