/**
 * macroImpact.ts — "What does it mean?" for the Indonesia Macro cards: each indicator maps to an
 * economic concept with a typical cause-and-effect chain for when it rises / is high and when it
 * falls / is low (texts in i18n `impact.<concept>.up|down`, bullets separated by new lines). The
 * current reading (above / near / below its 10-year average, rising or falling) picks which chain
 * applies now. Education only: real outcomes depend on many other conditions.
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
};

export type ImpactLevel = 'high' | 'normal' | 'low';

export interface ImpactReading {
  concept: ImpactConcept;
  /** Latest value against its 10-year average (|z| ≤ 0.5 = normal; null under 8 points). */
  level: ImpactLevel | null;
  /** Direction of the latest change. */
  trend: 'rising' | 'falling' | 'flat' | null;
  /** The chain that applies now: high level wins, else the latest move; null = unclear. */
  active: 'up' | 'down' | null;
}

export function impactReading(seriesId: string, points: MacroPoint[]): ImpactReading | null {
  const concept = IMPACT_BY_SERIES[seriesId];
  if (!concept) return null;
  const z = zScore10y(points);
  const level: ImpactLevel | null = z === null ? null : z > 0.5 ? 'high' : z < -0.5 ? 'low' : 'normal';
  const l = latest(points);
  const trend = !l || l.change === null ? null : l.change > 0 ? 'rising' : l.change < 0 ? 'falling' : 'flat';
  const active = level === 'high' ? 'up' : level === 'low' ? 'down' : trend === 'rising' ? 'up' : trend === 'falling' ? 'down' : null;
  return { concept, level, trend, active };
}

/** Bullet lines of one translated chain. */
export function impactBullets(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}
