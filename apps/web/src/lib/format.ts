import { DEFAULT_LANG, LANG_TAGS, t, type Lang } from './i18n';

// Number format for each language (1.234,5 in es/de, 1,234.5 in en)
const LOCALE = LANG_TAGS;

const num = (digits: number, lang: Lang) =>
  new Intl.NumberFormat(LOCALE[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });

// EVE notation: k / M / B (billion), the same in every language because it is the game's
const UNITS: [number, string][] = [
  [1, ''],
  [1e3, '\u00a0k'],
  [1e6, '\u00a0M'],
  [1e9, '\u00a0B'],
];
export function isk(value: number, { sign = false, lang = DEFAULT_LANG }: { sign?: boolean; lang?: Lang } = {}): string {
  const abs = Math.abs(value);
  // Non-breaking space between the figure and its unit: «6,41 B» does not break across two lines
  let u = abs >= 1e9 ? 3 : abs >= 1e6 ? 2 : abs >= 1e3 ? 1 : 0;
  // Below 1000 decimals are shown if there are any (unit prices of minerals, e.g.)
  const digitsFor = (x: number) => (u === 0 ? (Number.isInteger(abs) ? 0 : 2) : x >= 100 ? 0 : x >= 10 ? 1 : 2);
  let scaled = abs / UNITS[u][0];
  let digits = digitsFor(scaled);
  // Rounding can reach the next size: 999 960 000 is «1,00 B», not «1000 M», and 9 996 000 is «10,0 M», not «10,00 M»
  const rounded = Number(scaled.toFixed(digits));
  if (rounded >= 1000 && u < 3) {
    u++;
    scaled = abs / UNITS[u][0];
    digits = digitsFor(scaled);
  } else if (u > 0) digits = digitsFor(rounded);
  const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : '';
  return `${prefix}${num(digits, lang).format(scaled)}${UNITS[u][1]}`;
}

// An estimated figure: «~» and a thin space before it («~−» read as «~~»; «~ −1,05 M»)
export const approx = (formatted: string) => `~\u2009${formatted}`;

// Typographic minus sign (U+2212), as in the abbreviated figures
// sign: «+» on positives (nets), as in the abbreviated figure
export const iskFull = (value: number, lang: Lang = DEFAULT_LANG, sign = false) =>
  `${sign && value > 0 ? '+' : ''}${num(2, lang).format(value).replace('-', '−')} ISK`;

export const shortDate = (iso: string, lang: Lang = DEFAULT_LANG) =>
  new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso));

// «25 sept, 09:47» in EVE time (UTC)
export const shortDateTime = (iso: string, lang: Lang = DEFAULT_LANG) =>
  new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(
    new Date(iso),
  );

// File size in the language's format («12,4 MB», «860 kB»)
export function bytes(n: number, lang: Lang = DEFAULT_LANG): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];
  let value = n;
  let i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return new Intl.NumberFormat(LOCALE[lang], {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'short',
    maximumFractionDigits: i > 0 && value < 10 ? 1 : 0,
  }).format(value);
}

export const longDate = (iso: string, lang: Lang = DEFAULT_LANG) =>
  new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  );

// Relative time in each language's format («hace 5 min», «5 min ago», «vor 5 Min.»)
function relative(minutes: number, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(LOCALE[lang], { numeric: 'always', style: 'short' });
  const abs = Math.abs(minutes);
  if (abs < 60) return rtf.format(Math.round(minutes), 'minute');
  const hours = minutes / 60;
  if (Math.abs(hours) < 48) return rtf.format(Math.round(hours), 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

// Duration until a future instant («18 h», «3 d»): what is left, without "in"
export function remaining(iso: string, lang: Lang = DEFAULT_LANG): string {
  const hours = Math.max(1, (new Date(iso).getTime() - Date.now()) / 3_600_000);
  const [n, unit] = hours < 48 ? [Math.round(hours), 'hour'] : [Math.round(hours / 24), 'day'];
  return new Intl.NumberFormat(LOCALE[lang], { style: 'unit', unit, unitDisplay: 'short' }).format(n);
}

// Play hours (ratting): «~46 min», «20 h», «312 h» (in hours even if it is days: it is time played, not calendar time)
export function hoursPlayed(hours: number, lang: Lang = DEFAULT_LANG): string {
  if (hours < 1) return duration(hours * 60, lang);
  return new Intl.NumberFormat(LOCALE[lang], { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 0 }).format(Math.round(hours));
}

// Training time: «12 d 4 h», «5 h 20 min», «45 min» (each language's short units)
export function duration(minutes: number, lang: Lang = DEFAULT_LANG): string {
  const unit = (n: number, u: string) => new Intl.NumberFormat(LOCALE[lang], { style: 'unit', unit: u, unitDisplay: 'short' }).format(n);
  const total = Math.max(1, Math.round(minutes));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return h > 0 ? `${unit(d, 'day')} ${unit(h, 'hour')}` : unit(d, 'day');
  if (h > 0) return m > 0 ? `${unit(h, 'hour')} ${unit(m, 'minute')}` : unit(h, 'hour');
  return unit(m, 'minute');
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

// Readable names of the most common ref_types; the rest are shown as they are
const REF_TYPES: Record<string, Record<Lang, string>> = {
  bounty_prizes: { es: 'Recompensas (ratting)', en: 'Bounties (ratting)', de: 'Kopfgelder (Ratting)', pt: 'Recompensas (ratting)', zh: '赏金（刷怪）', ru: 'Награды (ратинг)' },
  ess_escrow_transfer: { es: 'ESS', en: 'ESS', de: 'ESS', pt: 'ESS', zh: 'ESS', ru: 'ESS' },
  agent_mission_reward: { es: 'Misiones', en: 'Missions', de: 'Missionen', pt: 'Missões', zh: '任务', ru: 'Миссии' },
  agent_mission_time_bonus_reward: { es: 'Bonus de misión', en: 'Mission time bonus', de: 'Missions-Zeitbonus', pt: 'Bônus de missão', zh: '任务时间奖励', ru: 'Бонус за время миссии' },
  market_transaction: { es: 'Mercado', en: 'Market', de: 'Markt', pt: 'Mercado', zh: '市场', ru: 'Рынок' },
  // This is how ESI books the buyer's market purchases (and the escrow of buy orders)
  market_escrow: { es: 'Compras de mercado', en: 'Market purchases', de: 'Marktkäufe', pt: 'Compras no mercado', zh: '市场买入', ru: 'Покупки на рынке' },
  transaction_tax: { es: 'Impuesto de venta', en: 'Sales tax', de: 'Verkaufssteuer', pt: 'Imposto de venda', zh: '交易税', ru: 'Налог с продаж' },
  brokers_fee: { es: 'Comisión de broker', en: 'Broker fee', de: 'Maklergebühr', pt: 'Taxa de corretagem', zh: '中介费', ru: 'Брокерская комиссия' },
  player_donation: { es: 'Donaciones', en: 'Donations', de: 'Spenden', pt: 'Doações', zh: '转账', ru: 'Переводы' },
  player_trading: { es: 'Intercambio directo', en: 'Direct trade', de: 'Direkthandel', pt: 'Troca direta', zh: '直接交易', ru: 'Прямой обмен' },
  corporation_account_withdrawal: { es: 'Retiro de corporación', en: 'Corp withdrawal', de: 'Corp-Abhebung', pt: 'Saque da corporação', zh: '军团提款', ru: 'Снятие со счёта корпорации' },
  contract_price: { es: 'Contratos', en: 'Contracts', de: 'Verträge', pt: 'Contratos', zh: '合同', ru: 'Контракты' },
  contract_reward: { es: 'Contratos (recompensa)', en: 'Contracts (reward)', de: 'Verträge (Belohnung)', pt: 'Contratos (recompensa)', zh: '合同（报酬）', ru: 'Контракты (награда)' },
  contract_reward_deposited: { es: 'Courier (recompensa)', en: 'Courier (reward)', de: 'Kurier (Belohnung)', pt: 'Courier (recompensa)', zh: '快递（报酬）', ru: 'Курьер (награда)' },
  contract_reward_refund: { es: 'Courier (recompensa devuelta)', en: 'Courier (reward refund)', de: 'Kurier (Belohnung zurück)', pt: 'Courier (recompensa devolvida)', zh: '快递（报酬退回）', ru: 'Курьер (возврат награды)' },
  contract_collateral_payout: { es: 'Courier (garantía cobrada)', en: 'Courier (collateral payout)', de: 'Kurier (Sicherheit ausgezahlt)', pt: 'Courier (garantia recebida)', zh: '快递（抵押金赔付）', ru: 'Курьер (выплата залога)' },
  contract_collateral_refund: { es: 'Courier (garantía devuelta)', en: 'Courier (collateral refund)', de: 'Kurier (Sicherheit zurück)', pt: 'Courier (garantia devolvida)', zh: '快递（抵押金退回）', ru: 'Курьер (возврат залога)' },
  contract_collateral: { es: 'Contratos (garantía)', en: 'Contracts (collateral)', de: 'Verträge (Sicherheit)', pt: 'Contratos (garantia)', zh: '合同（抵押金）', ru: 'Контракты (залог)' },
  contract_brokers_fee: { es: 'Contratos (comisión)', en: 'Contracts (broker fee)', de: 'Verträge (Maklergebühr)', pt: 'Contratos (taxa)', zh: '合同（中介费）', ru: 'Контракты (комиссия)' },
  contract_sales_tax: { es: 'Contratos (impuesto)', en: 'Contracts (sales tax)', de: 'Verträge (Steuer)', pt: 'Contratos (imposto)', zh: '合同（交易税）', ru: 'Контракты (налог)' },
  planetary_import_tax: { es: 'PI: impuesto de importación', en: 'PI: import tax', de: 'PI: Importsteuer', pt: 'PI: imposto de importação', zh: '行星开发：进口税', ru: 'PI: налог на импорт' },
  planetary_export_tax: { es: 'PI: impuesto de exportación', en: 'PI: export tax', de: 'PI: Exportsteuer', pt: 'PI: imposto de exportação', zh: '行星开发：出口税', ru: 'PI: налог на экспорт' },
  industry_job_tax: { es: 'Impuesto de industria', en: 'Industry tax', de: 'Industriesteuer', pt: 'Imposto de indústria', zh: '工业税', ru: 'Налог на производство' },
  reprocessing_tax: { es: 'Impuesto de reprocesado', en: 'Reprocessing tax', de: 'Wiederaufbereitungssteuer', pt: 'Imposto de reprocessamento', zh: '提炼税', ru: 'Налог на переработку' },
  jump_clone_activation_fee: { es: 'Activación de clon', en: 'Jump clone activation', de: 'Sprungklon-Aktivierung', pt: 'Ativação de clone', zh: '跳跃克隆激活', ru: 'Активация джамп-клона' },
  jump_clone_installation_fee: { es: 'Instalación de clon', en: 'Jump clone installation', de: 'Sprungklon-Installation', pt: 'Instalação de clone', zh: '跳跃克隆安装', ru: 'Установка джамп-клона' },
  skill_purchase: { es: 'Compra de skills', en: 'Skill purchase', de: 'Skill-Kauf', pt: 'Compra de skills', zh: '购买技能', ru: 'Покупка навыков' },
  project_discovery_reward: { es: 'Project Discovery', en: 'Project Discovery', de: 'Project Discovery', pt: 'Project Discovery', zh: 'Project Discovery', ru: 'Project Discovery' },
  air_career_program_reward: { es: 'Programa AIR', en: 'AIR career program', de: 'AIR-Karriereprogramm', pt: 'Programa AIR', zh: 'AIR 职业计划', ru: 'Программа AIR' },
  manufacturing: { es: 'Fabricación', en: 'Manufacturing', de: 'Fertigung', pt: 'Fabricação', zh: '制造', ru: 'Производство' },
  insurance: { es: 'Seguros', en: 'Insurance', de: 'Versicherung', pt: 'Seguros', zh: '保险', ru: 'Страховка' },
  kill_right_fee: { es: 'Kill rights', en: 'Kill rights', de: 'Kill-Rights', pt: 'Kill rights', zh: '击杀权', ru: 'Килл-райты' },
  // Not ESI ref_types: sold escalations (round donations from outside) and loot sold to the buyback (PvE)
  escalation_sale: { es: 'Escalaciones vendidas', en: 'Escalations sold', de: 'Verkaufte Eskalationen', pt: 'Escalations vendidas', zh: '出售的升级任务', ru: 'Проданные эскалации' },
  loot_buyback: { es: 'Loot vendido (buyback)', en: 'Loot sold (buyback)', de: 'Verkaufter Loot (Buyback)', pt: 'Loot vendido (buyback)', zh: '出售的战利品（回收）', ru: 'Проданный лут (байбэк)' },
  // Neither are these: the summary moves the replacement and courier of lost ships to PvP
  ship_replacement: { es: 'Reposición de naves perdidas', en: 'Lost ship replacement', de: 'Ersatz verlorener Schiffe', pt: 'Reposição de naves perdidas', zh: '损失舰船补船', ru: 'Замена потерянных кораблей' },
  ship_transport: { es: 'Courier de naves perdidas', en: 'Lost ship courier', de: 'Kurier verlorener Schiffe', pt: 'Courier de naves perdidas', zh: '损失舰船快递', ru: 'Курьер потерянных кораблей' },
  war_fee: { es: 'Tasas de guerra', en: 'War fees', de: 'Kriegsgebühren', pt: 'Taxas de guerra', zh: '战争费用', ru: 'Военные взносы' },
  war_fee_surrender: { es: 'Rendición de guerra', en: 'War surrender', de: 'Kapitulation', pt: 'Rendição de guerra', zh: '战争投降', ru: 'Капитуляция в войне' },
  war_ally_contract: { es: 'Aliados de guerra', en: 'War allies', de: 'Kriegsverbündete', pt: 'Aliados de guerra', zh: '战争盟友', ru: 'Союзники в войне' },
  bounty_prize: { es: 'Recompensas (ratting)', en: 'Bounties (ratting)', de: 'Kopfgelder (Ratting)', pt: 'Recompensas (ratting)', zh: '赏金（刷怪）', ru: 'Награды (ратинг)' },
  agent_mission_collateral_paid: { es: 'Misiones (garantía)', en: 'Missions (collateral)', de: 'Missionen (Sicherheit)', pt: 'Missões (garantia)', zh: '任务（抵押金）', ru: 'Миссии (залог)' },
  agent_mission_collateral_refunded: { es: 'Misiones (garantía devuelta)', en: 'Missions (collateral refund)', de: 'Missionen (Sicherheit zurück)', pt: 'Missões (garantia devolvida)', zh: '任务（抵押金退回）', ru: 'Миссии (возврат залога)' },
  corporate_reward_payout: { es: 'Recompensas de corporación', en: 'Corporation rewards', de: 'Corp-Belohnungen', pt: 'Recompensas da corporação', zh: '军团奖励', ru: 'Награды корпорации' },
  market_provider_tax: { es: 'Impuesto del mercado', en: 'Market provider tax', de: 'Marktanbietersteuer', pt: 'Imposto do mercado', zh: '市场提供方税', ru: 'Налог рынка' },
  contract_price_payment_corp: { es: 'Contratos (pago de corp)', en: 'Contracts (corp payment)', de: 'Verträge (Corp-Zahlung)', pt: 'Contratos (pagamento da corp)', zh: '合同（军团付款）', ru: 'Контракты (оплата корпорацией)' },
  contract_deposit: { es: 'Contratos (depósito)', en: 'Contracts (deposit)', de: 'Verträge (Kaution)', pt: 'Contratos (depósito)', zh: '合同（押金）', ru: 'Контракты (депозит)' },
  contract_deposit_refund: { es: 'Contratos (depósito devuelto)', en: 'Contracts (deposit refund)', de: 'Verträge (Kaution zurück)', pt: 'Contratos (depósito devolvido)', zh: '合同（押金退回）', ru: 'Контракты (возврат депозита)' },
  contract_auction_bid: { es: 'Subastas (puja)', en: 'Auctions (bid)', de: 'Auktionen (Gebot)', pt: 'Leilões (lance)', zh: '拍卖（出价）', ru: 'Аукционы (ставка)' },
  contract_auction_bid_refund: { es: 'Subastas (puja devuelta)', en: 'Auctions (bid refund)', de: 'Auktionen (Gebot zurück)', pt: 'Leilões (lance devolvido)', zh: '拍卖（出价退回）', ru: 'Аукционы (возврат ставки)' },
  contract_auction_sold: { es: 'Subastas (venta)', en: 'Auctions (sold)', de: 'Auktionen (verkauft)', pt: 'Leilões (venda)', zh: '拍卖（售出）', ru: 'Аукционы (продажа)' },
  structure_gate_jump: { es: 'Saltos Ansiblex', en: 'Ansiblex jumps', de: 'Ansiblex-Sprünge', pt: 'Saltos Ansiblex', zh: 'Ansiblex 跳跃', ru: 'Прыжки через Ansiblex' },
  daily_goal_payouts: { es: 'Metas diarias', en: 'Daily goals', de: 'Tagesziele', pt: 'Metas diárias', zh: '每日目标', ru: 'Ежедневные цели' },
};

export const refTypeLabel = (ref: string, lang: Lang = DEFAULT_LANG) =>
  REF_TYPES[ref]?.[lang] ?? ref.replaceAll('_', ' ');
