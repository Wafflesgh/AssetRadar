/**
 * analysisText.ts — Shows the server's evidence analysis (technical scorecard, chart patterns,
 * Piotroski signals, evidence components, summary) in the chosen language. The server sends the
 * English text plus translation keys; anything without a known key stays in English.
 */
import type { AssetAnalysis, EvidenceComponent } from '../ai/analysis.ts';
import type { FScoreSignal } from '../ai/fundamentals.ts';
import type { ChartPattern, TechnicalSignal } from '../ai/technical.ts';
import { getLang, t, tOr } from './index.ts';
import { renderParts } from './textParts.ts';

export const signalLabel = (s: TechnicalSignal) => tOr(`ta.sig.${s.id}`, s.label);
export const signalMethod = (s: TechnicalSignal) => tOr(`ta.method.${s.id}`, s.method);
export const signalReading = (s: TechnicalSignal) => renderParts(getLang(), s.readingParts, s.reading);

export const patternName = (p: ChartPattern) => tOr(`ta.pat.${p.id}.name`, p.name);
export const patternDescription = (p: ChartPattern) => renderParts(getLang(), p.descParts, p.description);

export const componentLabel = (c: EvidenceComponent) => (c.labelKey ? tOr(c.labelKey, c.label) : c.label);
export const componentExplanation = (c: EvidenceComponent) => renderParts(getLang(), c.explanationParts, c.explanation);

export const fScoreLabel = (s: FScoreSignal) => tOr(`fs.${s.id}`, s.label);
export const fScoreGroup = (group: string) => tOr(`fs.group.${group}`, group);

/** Piotroski detail: numbers stay, the few words around them are translated. */
export function fScoreDetail(detail: string): string {
  if (detail === 'Not reported (common for banks)') return t('fs.notReportedBanks');
  if (detail === 'Not reported') return t('common.notReported');
  return detail.replace(/ of assets$/, ` ${t('fs.ofAssets')}`).replace(/ shares$/, ` ${t('fs.shares')}`);
}

export const analysisSummary = (a: Pick<AssetAnalysis, 'summary' | 'summaryParts'>) => renderParts(getLang(), a.summaryParts, a.summary);

/** Key factors in the chosen language (falls back per factor). */
export function analysisKeyFactors(a: Pick<AssetAnalysis, 'keyFactors' | 'keyFactorParts'>): string[] {
  return a.keyFactors.map((text, i) => renderParts(getLang(), a.keyFactorParts?.[i], text));
}
