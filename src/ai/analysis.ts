/**
 * analysis.ts — Evidence-weighted sentiment for one asset. Instead of "the headline says up,
 * so bullish", the score is a weighted sum of separately measured pieces of evidence, each
 * with its reading, contribution and the research it rests on:
 *
 *  - Technical scorecard (trend, MACD, RSI, Bollinger, breakout) — Brock, Lakonishok & LeBaron (1992)
 *  - Momentum, 12-1 month time-series momentum — Moskowitz, Ooi & Pedersen (2012); Asness,
 *    Moskowitz & Pedersen, "Value and Momentum Everywhere" (2013)
 *  - Value: long-run reversal vs the 5-year average price (AMP 2013's value measure for
 *    non-equity assets), or earnings yield for stocks
 *  - Quality (stocks): Piotroski (2000) F-score and Novy-Marx (2013) gross profitability
 *  - News drivers: event-classified, source- and recency-weighted headlines (Tetlock 2007)
 *
 * Bettman, Sault & Schultz (2009) find fundamental and technical information are complements,
 * so agreement between the two is reported explicitly. The result describes the evidence; it
 * is not a buy/sell signal or a forecast.
 */
import type { AssetGroup, SentimentLabel } from '../config/assets.ts';
import type { FundamentalReport } from './fundamentals.ts';
import type { NewsDriverReport } from './newsDrivers.ts';
import { DRIVER_LABELS } from './newsDrivers.ts';
import type { TechnicalReport } from './technical.ts';
import { part, type TextPart } from '../i18n/textParts.ts';

export type ComponentId = 'technical' | 'momentum' | 'value' | 'quality' | 'news';

export interface EvidenceComponent {
  id: ComponentId;
  label: string;
  /** −1 … +1 reading of this piece of evidence. */
  value: number;
  /** Share of the final score (weights of available components sum to 1). */
  weight: number;
  /** value × weight. */
  contribution: number;
  explanation: string;
  reference: string;
  /** Translation keys for the label and the explanation (src/i18n/textParts.ts). */
  labelKey?: string;
  explanationParts?: TextPart[];
}

export interface AssetAnalysis {
  symbol: string;
  generatedAt: number;
  /** −1 … +1 composite, plus the 0–100 version used by the existing UI. */
  composite: number;
  score: number;
  label: SentimentLabel;
  /** Plain-language "why" built from the largest contributions. */
  summary: string;
  keyFactors: string[];
  /** The same summary and key factors as translation keys. */
  summaryParts?: TextPart[];
  keyFactorParts?: TextPart[][];
  components: EvidenceComponent[];
  /** Do technical and fundamental evidence point the same way? */
  agreement: 'agree' | 'conflict' | 'n/a';
  technical: TechnicalReport | null;
  fundamentals: FundamentalReport | null;
  news: NewsDriverReport;
  /** Years of daily history the analysis used. */
  historyYears: number;
}

const BASE_WEIGHTS: Record<ComponentId, number> = {
  technical: 0.3,
  momentum: 0.15,
  value: 0.1,
  quality: 0.15,
  news: 0.3,
};

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;

export const LABEL_THRESHOLD = 0.15;

export function labelOf(composite: number): SentimentLabel {
  return composite > LABEL_THRESHOLD ? 'Bullish' : composite < -LABEL_THRESHOLD ? 'Bearish' : 'Neutral';
}

/** Annualized volatility of daily log returns over the last year. */
function yearlyVol(closes: number[], yearBars: number): number | null {
  const n = Math.min(yearBars, closes.length - 1);
  if (n < 60) return null;
  const rets: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(v * yearBars);
}

export function buildAnalysis(input: {
  symbol: string;
  group: AssetGroup;
  closes: number[];
  technical: TechnicalReport | null;
  fundamentals: FundamentalReport | null;
  news: NewsDriverReport;
  now?: number;
}): AssetAnalysis {
  const { closes, technical, fundamentals, news } = input;
  const raw: Array<Omit<EvidenceComponent, 'weight' | 'contribution'>> = [];

  if (technical) {
    const bull = technical.signals.filter((s) => s.bias > 0).length;
    const bear = technical.signals.filter((s) => s.bias < 0).length;
    const pats = technical.patterns.map((p) => `${p.name} (${p.status})`).join(', ');
    raw.push({
      id: 'technical',
      label: 'Technical scorecard',
      value: technical.score,
      explanation: `${bull} of ${technical.signals.length} indicators lean bullish, ${bear} bearish.${pats ? ` Chart patterns: ${pats}.` : ''}`,
      labelKey: 'an.comp.technical',
      explanationParts: [
        part('an.tech.count', { bull, n: technical.signals.length, bear }),
        ...(pats
          ? [part('an.tech.patterns', { list: technical.patterns.map((p) => `@ta.pat.${p.id}.name (@ta.status.${p.status})`).join(', ') })]
          : []),
      ],
      reference: 'Moving-average and breakout rules — Brock, Lakonishok & LeBaron (1992); patterns — Lo, Mamaysky & Wang (2000)',
    });
  }

  const yearBars = input.group === 'crypto' ? 365 : 252;
  const vol = yearlyVol(closes, yearBars);
  const mom = technical?.indicators.momentum12_1 ?? null;
  if (mom !== null && vol) {
    // Scale by volatility like the TSMOM papers: a 1-sigma yearly move saturates the reading
    raw.push({
      id: 'momentum',
      label: 'Momentum (12-1 month)',
      value: clamp(mom / vol),
      explanation: `Return from 12 months to 1 month ago is ${signed(mom)} against ${(vol * 100).toFixed(0)}% yearly volatility. ${
        mom >= 0 ? 'Past winners have tended to keep outperforming' : 'Past losers have tended to keep underperforming'
      } for several more months.`,
      labelKey: 'an.comp.momentum',
      explanationParts: [part(mom >= 0 ? 'an.mom.up' : 'an.mom.down', { mom: signed(mom), vol: (vol * 100).toFixed(0) })],
      reference: 'Moskowitz, Ooi & Pedersen (2012); Asness, Moskowitz & Pedersen (2013)',
    });
  }

  const isStock = input.group === 'idStock' || input.group === 'usStock' || input.group === 'globalStock';
  if (isStock && fundamentals?.earningsYield !== null && fundamentals?.earningsYield !== undefined) {
    // Earnings yield vs a ~5% long-run equity norm: 10% → +1 (cheap), 0% or losses → −1
    const ey = fundamentals.earningsYield;
    raw.push({
      id: 'value',
      label: 'Value (earnings yield)',
      value: clamp((ey - 0.05) / 0.05),
      explanation: `Earnings yield ${(ey * 100).toFixed(1)}%${fundamentals.pe ? ` (P/E ${fundamentals.pe.toFixed(1)})` : ''}${fundamentals.pb ? `, P/B ${fundamentals.pb.toFixed(1)}` : ''}. Cheaper stocks have earned a value premium on average.`,
      labelKey: 'an.comp.valueEy',
      explanationParts: [
        part('an.value.ey', {
          ey: `${(ey * 100).toFixed(1)}%${fundamentals.pe ? ` (P/E ${fundamentals.pe.toFixed(1)})` : ''}${fundamentals.pb ? `, P/B ${fundamentals.pb.toFixed(1)}` : ''}`,
        }),
      ],
      reference: 'Asness, Moskowitz & Pedersen (2013); Fama & French (1992)',
    });
  } else if (closes.length >= 3 * yearBars) {
    // Value for non-equity assets: log of the average price ~4.5–5 years ago over today's price
    const early = closes.slice(0, Math.min(125, Math.floor(closes.length / 6)));
    const avg = early.reduce((a, b) => a + b, 0) / early.length;
    const v = Math.log(avg / closes[closes.length - 1]);
    raw.push({
      id: 'value',
      label: 'Value (5-year reversal)',
      value: clamp(v / 1),
      explanation: `Price is ${signed(-v, 0)} versus its average ${(closes.length / yearBars).toFixed(1)} years ago (log scale). Assets far above their long-run level have tended to mean-revert over years, not weeks.`,
      labelKey: 'an.comp.valueRev',
      explanationParts: [part('an.value.rev', { v: signed(-v, 0), years: (closes.length / yearBars).toFixed(1) })],
      reference: 'Asness, Moskowitz & Pedersen (2013) value measure; De Bondt & Thaler (1985)',
    });
  }

  if (isStock && fundamentals) {
    const f9 = (fundamentals.fScore / fundamentals.fScoreMax) * 9;
    const value = f9 >= 8 ? 1 : f9 >= 6 ? 0.5 : f9 >= 4 ? 0 : f9 >= 2 ? -0.5 : -1;
    raw.push({
      id: 'quality',
      label: 'Quality (Piotroski F-score)',
      value,
      explanation: `F-score ${fundamentals.fScore} of ${fundamentals.fScoreMax} signals passed (FY ending ${fundamentals.fiscalYearEnd}).${
        fundamentals.grossProfitability !== null ? ` Gross profitability ${(fundamentals.grossProfitability * 100).toFixed(1)}% of assets.` : ''
      } High scorers have outperformed low scorers.`,
      labelKey: 'an.comp.quality',
      explanationParts: [
        part('an.quality.f', { f: fundamentals.fScore, max: fundamentals.fScoreMax, fy: fundamentals.fiscalYearEnd }),
        ...(fundamentals.grossProfitability !== null
          ? [part('an.quality.gp', { gp: `${(fundamentals.grossProfitability * 100).toFixed(1)}%` })]
          : []),
        part('an.quality.note'),
      ],
      reference: 'Piotroski (2000); Novy-Marx (2013) gross profitability',
    });
  }

  const eventDrivers = news.drivers.filter((d) => d.category !== 'price');
  const signOf = (net: number) => (net > 0.01 ? '(+)' : net < -0.01 ? '(−)' : '(·)');
  const top = news.byCategory.slice(0, 3).map((c) => `${c.label} ${signOf(c.net)}`);
  const topKeys = news.byCategory.slice(0, 3).map((c) => `@driver.${c.category} ${signOf(c.net)}`);
  raw.push({
    id: 'news',
    label: 'News & events',
    value: clamp(news.netTone * news.confidence),
    explanation:
      news.drivers.length === 0
        ? 'No recent headlines for this asset.'
        : `${eventDrivers.length} event headline${eventDrivers.length === 1 ? '' : 's'}${top.length ? `: ${top.join(', ')}` : ''}. ${news.priceReportCount} headline${
            news.priceReportCount === 1 ? '' : 's'
          } only describe the price move and carry little weight. Evidence strength ${(news.confidence * 100).toFixed(0)}%.`,
    reference: 'Tetlock (2007) media tone; event classification with source and recency weights',
    labelKey: 'an.comp.news',
    explanationParts:
      news.drivers.length === 0
        ? [part('an.news.none')]
        : [
            part(topKeys.length ? 'an.news.eventsList' : 'an.news.events', { n: eventDrivers.length, list: topKeys.join(', ') }),
            part('an.news.priceOnly', { n: news.priceReportCount }),
            part('an.news.strength', { v: (news.confidence * 100).toFixed(0) }),
          ],
  });

  const totalBase = raw.reduce((a, c) => a + BASE_WEIGHTS[c.id], 0);
  const components: EvidenceComponent[] = raw.map((c) => {
    const weight = BASE_WEIGHTS[c.id] / totalBase;
    return { ...c, weight, contribution: c.value * weight };
  });
  const composite = clamp(components.reduce((a, c) => a + c.contribution, 0));
  const label = labelOf(composite);

  // Technical vs fundamental agreement (Bettman et al. 2009: the two are complements)
  const tech = components.find((c) => c.id === 'technical');
  const fundParts = components.filter((c) => c.id === 'quality' || c.id === 'value' || c.id === 'news');
  const fundNet = fundParts.reduce((a, c) => a + c.contribution, 0);
  const agreement: AssetAnalysis['agreement'] =
    !tech || Math.abs(tech.value) < 0.2 || Math.abs(fundNet) < 0.03 ? 'n/a' : Math.sign(tech.value) === Math.sign(fundNet) ? 'agree' : 'conflict';

  const sorted = [...components].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const pushes = sorted.filter((c) => Math.sign(c.contribution) === Math.sign(composite) && Math.abs(c.contribution) > 0.01);
  const against = sorted.filter((c) => Math.sign(c.contribution) === -Math.sign(composite) && Math.abs(c.contribution) > 0.01);
  const name = (c: EvidenceComponent) => c.label.replace(/ \(.+\)$/, '').toLowerCase();
  let summary =
    label === 'Neutral'
      ? `The evidence is mixed (${Math.round(50 + 50 * composite)}/100): ${
          sorted[0] ? `${name(sorted[0])} ${sorted[0].contribution >= 0 ? 'leans bullish' : 'leans bearish'}` : 'little data'
        }${sorted[1] ? `, ${name(sorted[1])} ${sorted[1].contribution >= 0 ? 'bullish' : 'bearish'}` : ''}.`
      : `Leaning ${label.toLowerCase()} (${Math.round(50 + 50 * composite)}/100) mainly because of ${pushes
          .slice(0, 2)
          .map(name)
          .join(' and ')}${against.length ? `; ${against.slice(0, 2).map(name).join(' and ')} point${against.length === 1 ? 's' : ''} the other way` : ''}.`;
  if (agreement === 'agree') summary += ' Technical and fundamental evidence agree.';
  if (agreement === 'conflict') summary += ' Technical and fundamental evidence disagree, so conviction is lower.';

  // The same summary as translation keys
  const nameKey = (c: EvidenceComponent) => `@an.short.${c.id}`;
  const dirKey = (c: EvidenceComponent, lean: boolean) => `@an.dir.${lean ? 'lean' : 'plain'}.${c.contribution >= 0 ? 'bull' : 'bear'}`;
  const scoreText = Math.round(50 + 50 * composite);
  const summaryParts: TextPart[] =
    label === 'Neutral'
      ? [
          part('an.sum.mixed', {
            score: scoreText,
            first: sorted[0] ? `${nameKey(sorted[0])} ${dirKey(sorted[0], true)}` : '@an.sum.littleData',
            second: sorted[1] ? `, ${nameKey(sorted[1])} ${dirKey(sorted[1], false)}` : '',
          }),
        ]
      : [
          part(against.length ? 'an.sum.leanAgainst' : 'an.sum.lean', {
            label: `@an.label.${label}`,
            score: scoreText,
            pushes: pushes.slice(0, 2).map(nameKey).join(' @an.and '),
            against: against.slice(0, 2).map(nameKey).join(' @an.and '),
          }),
        ];
  if (agreement === 'agree') summaryParts.push(part('an.sum.agree'));
  if (agreement === 'conflict') summaryParts.push(part('an.sum.conflict'));

  const keyFactors: string[] = [];
  const keyFactorParts: TextPart[][] = [];
  if (technical) {
    const strongest = [...technical.signals].sort((a, b) => b.weight * Math.abs(b.bias) - a.weight * Math.abs(a.bias))[0];
    if (strongest) {
      keyFactors.push(strongest.reading);
      keyFactorParts.push(strongest.readingParts ?? []);
    }
    const p = technical.patterns[0];
    if (p) {
      const biasWord = p.bias > 0 ? 'bullish' : p.bias < 0 ? 'bearish' : 'neutral';
      keyFactors.push(`${p.name} ${p.status} — textbook bias ${biasWord}`);
      keyFactorParts.push([part('an.kf.pattern', { name: `@ta.pat.${p.id}.name`, status: `@ta.status.${p.status}`, bias: `@an.bias.${biasWord}` })]);
    }
  }
  const topDriver = eventDrivers.find((d) => d.direction !== 0);
  if (topDriver) {
    keyFactors.push(`${DRIVER_LABELS[topDriver.category]}: ${topDriver.title}`);
    keyFactorParts.push([part('an.kf.driver', { label: `@driver.${topDriver.category}`, title: topDriver.title })]);
  }
  if (fundamentals) {
    keyFactors.push(`Piotroski F-score ${fundamentals.fScore}/${fundamentals.fScoreMax}`);
    keyFactorParts.push([part('an.kf.fscore', { f: fundamentals.fScore, max: fundamentals.fScoreMax })]);
  }

  return {
    symbol: input.symbol,
    generatedAt: input.now ?? Date.now(),
    composite,
    score: Math.round(50 + 50 * composite),
    label,
    summary,
    keyFactors: keyFactors.slice(0, 4),
    summaryParts,
    keyFactorParts: keyFactorParts.slice(0, 4),
    components,
    agreement,
    technical,
    fundamentals,
    news,
    historyYears: Math.round((closes.length / yearBars) * 10) / 10,
  };
}
