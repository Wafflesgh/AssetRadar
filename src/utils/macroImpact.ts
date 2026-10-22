/**
 * macroImpact.ts — "What does it mean?" for the Indonesia Macro cards: each indicator maps to an
 * economic concept with a typical cause-and-effect chain for when it rises / is high and when it
 * falls / is low (texts in i18n `impact.<concept>.up|down`, bullets separated by new lines). The
 * current reading (above / near / below its 10-year average, rising or falling) picks which chain
 * applies now. Each concept also says what the indicator is, whether its effect is global or felt in
 * Indonesia only (`IMPACT_INFO.scope`, texts `impact.<concept>.what|scopeWhy|up.sum|down.sum`),
 * and a sentiment for Indonesia from the chain that applies now and which direction is good for
 * Indonesia (`good`, matching the server's higherIsBetter). `impact.<concept>.link` (or the
 * per-series `impact.s.<id>.link`) gives dated facts on Indonesia's direct exposure, and
 * `IMPACT_RELATED` + `impact.<concept>.chain` link each indicator to the other cards on the page
 * (per series: `IMPACT_RELATED_BY_SERIES` + `impact.s.<id>.chain`).
 * Education only: real outcomes depend on many other conditions.
 */
import { latest, zScore10y, type MacroPoint } from './macro.ts';

export const IMPACT_CONCEPTS = [
  'rate',
  'fedSpread',
  'inflation',
  'administered',
  'volatileFood',
  'gdp',
  'confidence',
  'reserves',
  'tradeBalance',
  'exports',
  'imports',
  'currentAccount',
  'usdIdr',
  'reer',
  'eido',
  'govDebt',
  'privateCredit',
  'housePrices',
  'lq45',
  'coal',
  'metals',
  'oil',
  'gold',
  'fedFunds',
  'ust10',
  'dxy',
  'vix',
  'china',
  'regionalFx',
  'palmOil',
  'nickel',
  'tin',
  'rubber',
  'cocoa',
  'coffee',
  'rice',
  'size',
  'investment',
  'consumptionShare',
  'sectors',
  'leading',
  'business',
  'unemployment',
  'participation',
  'population',
  'inequality',
  'money',
  'financialDepth',
  'lending',
  'deposit',
  'fdi',
  'remittances',
  'externalDebt',
  'openness',
  'military',
  'foreignStocks',
  'foreignBonds',
  'foreignSrbi',
  'portfolio',
  'foreignHoldings',
  'niip',
] as const;

export type ImpactConcept = (typeof IMPACT_CONCEPTS)[number];

/** Macro series / indicator id → concept (several series share one). */
export const IMPACT_BY_SERIES: Record<string, ImpactConcept> = {
  biRate: 'rate',
  policyRate: 'rate',
  biFedSpread: 'fedSpread',
  inflationYoy: 'inflation',
  inflationMom: 'inflation',
  inflationAnnual: 'inflation',
  coreInflation: 'inflation',
  administeredInflation: 'administered',
  volatileFoodInflation: 'volatileFood',
  gdpYoy: 'gdp',
  gdpAnnual: 'gdp',
  consumerConfidence: 'confidence',
  reserves: 'reserves',
  tradeBalance: 'tradeBalance',
  exports: 'exports',
  imports: 'imports',
  currentAccount: 'currentAccount',
  usdIdr: 'usdIdr',
  reer: 'reer',
  eido: 'eido',
  govDebt: 'govDebt',
  privateCredit: 'privateCredit',
  housePrices: 'housePrices',
  lq45: 'lq45',
  coal: 'coal',
  copper: 'metals',
  aluminium: 'metals',
  brent: 'oil',
  goldMonthly: 'gold',
  fedFunds: 'fedFunds',
  ust10: 'ust10',
  dxy: 'dxy',
  vix: 'vix',
  sse: 'china',
  hsi: 'china',
  'fx-thb': 'regionalFx',
  'fx-php': 'regionalFx',
  'fx-inr': 'regionalFx',
  'fx-myr': 'regionalFx',
  'fx-cny': 'regionalFx',
  'fx-sgd': 'regionalFx',
  coalAustralia: 'coal',
  palmOil: 'palmOil',
  nickel: 'nickel',
  tin: 'tin',
  rubber: 'rubber',
  cocoa: 'cocoa',
  coffeeRobusta: 'coffee',
  riceThai: 'rice',
  gdpUsd: 'size',
  gdpPerCapita: 'size',
  gdpPerCapitaPpp: 'size',
  investmentGdp: 'investment',
  householdConsumption: 'consumptionShare',
  agricultureShare: 'sectors',
  industryShare: 'sectors',
  manufacturingShare: 'sectors',
  servicesShare: 'sectors',
  leadingIndicator: 'leading',
  businessConfidence: 'business',
  unemployment: 'unemployment',
  laborParticipation: 'participation',
  population: 'population',
  poverty: 'inequality',
  gini: 'inequality',
  m2Growth: 'money',
  m2Gdp: 'financialDepth',
  lendingRate: 'lending',
  depositRate: 'deposit',
  fdiGdp: 'fdi',
  remittances: 'remittances',
  externalDebt: 'externalDebt',
  tradeOpenness: 'openness',
  militarySpending: 'military',
  gdpDeflator: 'inflation',
  foreignStockFlow: 'foreignStocks',
  foreignGovBondFlow: 'foreignBonds',
  foreignBiSecFlow: 'foreignSrbi',
  portfolioFlow: 'portfolio',
  fdiInflowQ: 'fdi',
  foreignStockHoldings: 'foreignHoldings',
  foreignDebtHoldings: 'foreignHoldings',
  netIip: 'niip',
};

/** global = a world force felt everywhere; indonesia = felt inside Indonesia; both = world price or flow with a large Indonesian effect. */
export type ImpactScope = 'global' | 'indonesia' | 'both';

/** Per concept: where the effect is felt, and which direction is good for Indonesia (null = mixed). */
export const IMPACT_INFO: Record<ImpactConcept, { scope: ImpactScope; good: 'up' | 'down' | null }> = {
  rate: { scope: 'indonesia', good: 'down' },
  fedSpread: { scope: 'both', good: 'up' },
  inflation: { scope: 'indonesia', good: 'down' },
  administered: { scope: 'indonesia', good: 'down' },
  volatileFood: { scope: 'indonesia', good: 'down' },
  gdp: { scope: 'indonesia', good: 'up' },
  confidence: { scope: 'indonesia', good: 'up' },
  reserves: { scope: 'indonesia', good: 'up' },
  tradeBalance: { scope: 'indonesia', good: 'up' },
  exports: { scope: 'indonesia', good: 'up' },
  imports: { scope: 'indonesia', good: null },
  currentAccount: { scope: 'indonesia', good: 'up' },
  usdIdr: { scope: 'both', good: 'down' },
  reer: { scope: 'indonesia', good: null },
  eido: { scope: 'both', good: 'up' },
  govDebt: { scope: 'indonesia', good: 'down' },
  privateCredit: { scope: 'indonesia', good: 'up' },
  housePrices: { scope: 'indonesia', good: null },
  lq45: { scope: 'indonesia', good: 'up' },
  coal: { scope: 'both', good: 'up' },
  metals: { scope: 'both', good: 'up' },
  oil: { scope: 'global', good: 'down' },
  gold: { scope: 'global', good: null },
  fedFunds: { scope: 'global', good: 'down' },
  ust10: { scope: 'global', good: 'down' },
  dxy: { scope: 'global', good: 'down' },
  vix: { scope: 'global', good: 'down' },
  china: { scope: 'global', good: 'up' },
  regionalFx: { scope: 'both', good: null },
  palmOil: { scope: 'both', good: 'up' },
  nickel: { scope: 'both', good: 'up' },
  tin: { scope: 'both', good: 'up' },
  rubber: { scope: 'both', good: 'up' },
  cocoa: { scope: 'both', good: 'up' },
  coffee: { scope: 'both', good: 'up' },
  rice: { scope: 'both', good: 'down' },
  size: { scope: 'indonesia', good: 'up' },
  investment: { scope: 'indonesia', good: 'up' },
  consumptionShare: { scope: 'indonesia', good: null },
  sectors: { scope: 'indonesia', good: null },
  leading: { scope: 'indonesia', good: 'up' },
  business: { scope: 'indonesia', good: 'up' },
  unemployment: { scope: 'indonesia', good: 'down' },
  participation: { scope: 'indonesia', good: 'up' },
  population: { scope: 'indonesia', good: null },
  inequality: { scope: 'indonesia', good: 'down' },
  money: { scope: 'indonesia', good: null },
  financialDepth: { scope: 'indonesia', good: 'up' },
  lending: { scope: 'indonesia', good: 'down' },
  deposit: { scope: 'indonesia', good: null },
  fdi: { scope: 'both', good: 'up' },
  remittances: { scope: 'both', good: 'up' },
  externalDebt: { scope: 'both', good: 'down' },
  openness: { scope: 'both', good: null },
  military: { scope: 'indonesia', good: null },
  foreignStocks: { scope: 'both', good: 'up' },
  foreignBonds: { scope: 'both', good: 'up' },
  foreignSrbi: { scope: 'both', good: null },
  portfolio: { scope: 'both', good: 'up' },
  foreignHoldings: { scope: 'both', good: null },
  niip: { scope: 'both', good: 'up' },
};

/** Other macro cards each concept is linked with, in cause-and-effect order (series ids). */
export const IMPACT_RELATED: Record<ImpactConcept, string[]> = {
  rate: ['inflationYoy', 'usdIdr', 'biFedSpread', 'privateCredit', 'housePrices', 'gdpYoy', 'lq45'],
  fedSpread: ['biRate', 'fedFunds', 'foreignGovBondFlow', 'foreignBiSecFlow', 'usdIdr', 'reserves'],
  inflation: ['administeredInflation', 'volatileFoodInflation', 'coreInflation', 'usdIdr', 'biRate', 'consumerConfidence'],
  administered: ['brent', 'govDebt', 'inflationYoy'],
  volatileFood: ['riceThai', 'inflationYoy', 'consumerConfidence'],
  gdp: ['consumerConfidence', 'privateCredit', 'exports', 'biRate', 'lq45'],
  confidence: ['inflationYoy', 'biRate', 'gdpYoy', 'lq45'],
  reserves: ['tradeBalance', 'currentAccount', 'portfolioFlow', 'usdIdr', 'ust10', 'goldMonthly'],
  tradeBalance: ['coal', 'palmOil', 'nickel', 'exports', 'imports', 'reserves', 'usdIdr'],
  exports: ['coal', 'palmOil', 'nickel', 'sse', 'tradeBalance'],
  imports: ['brent', 'fx-cny', 'usdIdr', 'tradeBalance'],
  currentAccount: ['tradeBalance', 'biFedSpread', 'portfolioFlow', 'fdiInflowQ', 'eido', 'usdIdr'],
  usdIdr: ['dxy', 'fedFunds', 'biFedSpread', 'portfolioFlow', 'reserves', 'inflationYoy', 'govDebt'],
  reer: ['usdIdr', 'inflationYoy', 'exports', 'imports'],
  regionalFx: ['usdIdr', 'dxy', 'exports'],
  eido: ['vix', 'fedFunds', 'foreignStockFlow', 'lq45', 'usdIdr'],
  govDebt: ['biRate', 'ust10', 'foreignGovBondFlow', 'usdIdr', 'brent'],
  privateCredit: ['biRate', 'housePrices', 'gdpYoy'],
  housePrices: ['biRate', 'privateCredit', 'consumerConfidence'],
  lq45: ['eido', 'foreignStockFlow', 'vix', 'biRate', 'gdpYoy'],
  coal: ['coalAustralia', 'sse', 'exports', 'tradeBalance', 'usdIdr'],
  metals: ['sse', 'nickel', 'exports'],
  oil: ['imports', 'tradeBalance', 'administeredInflation', 'govDebt', 'inflationYoy'],
  gold: ['dxy', 'vix', 'reserves', 'usdIdr'],
  fedFunds: ['ust10', 'dxy', 'biFedSpread', 'usdIdr', 'biRate'],
  ust10: ['fedFunds', 'govDebt', 'reserves', 'eido'],
  dxy: ['usdIdr', 'coal', 'palmOil', 'goldMonthly'],
  vix: ['eido', 'lq45', 'usdIdr'],
  china: ['coal', 'nickel', 'exports', 'fx-cny'],
  palmOil: ['exports', 'tradeBalance', 'fx-myr', 'fx-inr', 'inflationYoy'],
  nickel: ['sse', 'exports', 'fx-php'],
  tin: ['exports'],
  rubber: ['exports', 'fx-thb'],
  cocoa: ['exports'],
  coffee: ['exports'],
  rice: ['fx-thb', 'volatileFoodInflation', 'inflationYoy', 'biRate'],
  size: ['gdpYoy', 'population', 'usdIdr', 'householdConsumption'],
  investment: ['fdiGdp', 'privateCredit', 'biRate', 'gdpYoy'],
  consumptionShare: ['consumerConfidence', 'inflationYoy', 'gdpYoy', 'investmentGdp'],
  sectors: ['gdpYoy', 'exports', 'unemployment', 'palmOil', 'coal'],
  leading: ['businessConfidence', 'consumerConfidence', 'gdpYoy', 'lq45'],
  business: ['leadingIndicator', 'investmentGdp', 'manufacturingShare', 'biRate'],
  unemployment: ['gdpYoy', 'laborParticipation', 'poverty', 'consumerConfidence'],
  participation: ['unemployment', 'population', 'gdpYoy'],
  population: ['laborParticipation', 'gdpPerCapita', 'householdConsumption'],
  inequality: ['unemployment', 'volatileFoodInflation', 'gdpPerCapita'],
  money: ['biRate', 'inflationYoy', 'privateCredit', 'm2Gdp'],
  financialDepth: ['privateCredit', 'm2Growth', 'lendingRate'],
  lending: ['biRate', 'privateCredit', 'investmentGdp'],
  deposit: ['biRate', 'inflationYoy', 'lendingRate'],
  fdi: ['fdiGdp', 'fdiInflowQ', 'investmentGdp', 'currentAccount', 'usdIdr', 'fx-sgd'],
  remittances: ['currentAccount', 'fx-myr', 'householdConsumption'],
  externalDebt: ['usdIdr', 'reserves', 'fedFunds', 'govDebt', 'netIip'],
  openness: ['exports', 'imports', 'sse', 'coal'],
  military: ['govDebt'],
  foreignStocks: ['fedFunds', 'dxy', 'vix', 'lq45', 'eido', 'usdIdr', 'foreignStockHoldings'],
  foreignBonds: ['biFedSpread', 'ust10', 'foreignGovBondFlow', 'usdIdr', 'reserves', 'govDebt', 'foreignDebtHoldings'],
  foreignSrbi: ['biRate', 'biFedSpread', 'usdIdr', 'reserves'],
  portfolio: ['foreignStockFlow', 'foreignGovBondFlow', 'foreignBiSecFlow', 'currentAccount', 'usdIdr', 'reserves'],
  foreignHoldings: ['foreignStockFlow', 'lq45', 'usdIdr', 'netIip'],
  niip: ['fdiInflowQ', 'foreignStockHoldings', 'foreignDebtHoldings', 'externalDebt', 'reserves'],
};

/** Series whose links differ from their concept's (with `impact.s.<id>.chain`). */
export const IMPACT_RELATED_BY_SERIES: Record<string, string[]> = {
  foreignDebtHoldings: ['foreignGovBondFlow', 'foreignBiSecFlow', 'usdIdr', 'externalDebt', 'netIip'],
};

export type ImpactSentiment = 'strongPositive' | 'positive' | 'neutral' | 'negative' | 'strongNegative' | 'mixed';

export type ImpactLevel = 'high' | 'normal' | 'low';

export interface ImpactReading {
  concept: ImpactConcept;
  z: number | null;
  /** Latest value against its 10-year average (|z| ≤ 0.5 = normal; null under 8 points). */
  level: ImpactLevel | null;
  /** Direction of the latest change. */
  trend: 'rising' | 'falling' | 'flat' | null;
  /** The chain that applies now: high level wins, else the latest move; null = unclear. */
  active: 'up' | 'down' | null;
  /** For Indonesia: mixed when both directions have good and bad sides; strong when |z| ≥ 1.5. */
  sentiment: ImpactSentiment;
}

/** Concept of a series (for its explanation even without data). */
export function impactConcept(seriesId: string): ImpactConcept | null {
  return IMPACT_BY_SERIES[seriesId] ?? null;
}

export function impactReading(seriesId: string, points: MacroPoint[]): ImpactReading | null {
  const concept = IMPACT_BY_SERIES[seriesId];
  if (!concept) return null;
  const raw = zScore10y(points);
  // One decimal, never "-0"
  const z = raw === null ? null : Math.round(raw * 10) / 10 || 0;
  const level: ImpactLevel | null = z === null ? null : z > 0.5 ? 'high' : z < -0.5 ? 'low' : 'normal';
  const l = latest(points);
  const trend = !l || l.change === null ? null : l.change > 0 ? 'rising' : l.change < 0 ? 'falling' : 'flat';
  const active = level === 'high' ? 'up' : level === 'low' ? 'down' : trend === 'rising' ? 'up' : trend === 'falling' ? 'down' : null;
  const good = IMPACT_INFO[concept].good;
  let sentiment: ImpactSentiment = 'neutral';
  if (good === null) sentiment = 'mixed';
  else if (active) {
    const strong = z !== null && Math.abs(z) >= 1.5 && (level === 'high' || level === 'low');
    sentiment = active === good ? (strong ? 'strongPositive' : 'positive') : strong ? 'strongNegative' : 'negative';
  }
  return { concept, z, level, trend, active, sentiment };
}

/** Bullet lines of one translated chain. */
export function impactBullets(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
