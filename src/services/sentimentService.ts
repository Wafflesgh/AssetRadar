/**
 * sentimentService.ts — Browser helpers and response types for the stage-4 endpoints:
 * multi-horizon sentiment, rankings, validation evidence, technical projections and the
 * Binance (public market data) tables, candles and derivatives statistics.
 */
import type { Horizon, HorizonHeadline } from '../sentiment/newsHorizon.ts';
import type { ComponentResult, Confidence, Cadence, SentimentLabel5 } from '../sentiment/horizons.ts';
import type { PillarId, PillarScore } from '../sentiment/pillars.ts';
import type { RawFactors } from '../sentiment/factors.ts';
import type { HybridModel, HybridVariant } from '../sentiment/hybridValue.ts';
import type { Level, PatternTarget, RangeBand } from '../sentiment/projections.ts';
import type { HorizonEvidence } from '../sentiment/validation.ts';
import type { Catalyst } from '../sentiment/cadence.ts';
import type { Kline, DerivativesSnapshot, PremiumIndex } from '../crypto/binance.ts';

export interface ScanProgress {
  kind: 'monthly' | 'statements' | 'analyst';
  done: number;
  failed: number;
  total: number;
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface ScanStatus {
  market: 'idx' | 'us';
  progress: ScanProgress[];
  freshness: Record<ScanProgress['kind'], { oldest: number | null; newest: number | null; count: number }>;
}

export interface HorizonResult {
  horizon: Horizon;
  score: number | null;
  label: SentimentLabel5 | null;
  confidence: Confidence;
  confidenceReasons: string[];
  components: ComponentResult[];
  coverage: number;
  reweighted: boolean;
  cadence: Cadence;
  cadenceReason: string | null;
  news: { points: number; cap: number; count: number; headlines: HorizonHeadline[] } | null;
  nextCatalyst: (Catalyst & { daysUntil: number }) | null;
}

export interface SentimentV2 {
  symbol: string;
  code: string;
  group: string;
  generatedAt: number;
  /** Today's live price used as the Short horizon's provisional candle (null: closed candles only). */
  liveBar?: { price: number; at: number; date: string } | null;
  horizons: Record<Horizon, HorizonResult>;
  pillars: {
    scores: Record<PillarId, PillarScore>;
    dUp: boolean;
    dDown: boolean;
    distressWarning: boolean;
    fairValue: number | null;
    hybridDiscount: number | null;
    raw: RawFactors;
  } | null;
  market: {
    market: 'idx' | 'us';
    n: number;
    smallPeerGroup: boolean;
    liquidityThreshold: number | null;
    hybrid: HybridModel | null;
    hybridErrors: Record<HybridVariant, number | null>;
  } | null;
  notApplicable: 'no-statements' | null;
  technicalParts: Record<string, number> | null;
  macro: { score: number | null; rateChange3m: number | null; inflationChange3m: number | null; dataDate: string | null } | null;
  freshness: { prices: string | null; statements: string | null; news: number | null; scans: ScanStatus | null };
  disclaimer: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** fresh: ask the server to recompute instead of answering from its 2-minute cache. */
export const fetchSentimentV2 = (symbol: string, fresh = false) =>
  getJson<SentimentV2>(`/api/sentiment/v2?symbol=${encodeURIComponent(symbol)}${fresh ? '&fresh=1' : ''}`);

export interface RankingRow {
  symbol: string;
  code: string;
  name: string;
  industry: string | null;
  score: number | null;
  label: SentimentLabel5 | null;
  confidence: Confidence;
  coverage: number;
  pillars: Record<PillarId, number | null>;
  distressWarning: boolean;
}

export interface RankingsResponse {
  market: 'idx' | 'us';
  horizon: Horizon;
  n: number;
  top: RankingRow[];
  bottom: RankingRow[];
  scans: ScanStatus;
  disclaimer: string;
}

export const fetchSentimentRankings = (market: 'idx' | 'us', horizon: Horizon, limit = 20) =>
  getJson<RankingsResponse>(`/api/sentiment/rankings?market=${market}&horizon=${horizon}&limit=${limit}`);

export interface ValidationResponse {
  market: 'idx' | 'us' | 'crypto';
  status: 'ready' | 'computing' | 'waiting-for-data';
  result: {
    generatedAt: number;
    scope: string[];
    horizons: Partial<Record<Horizon, HorizonEvidence>>;
    pillars?: Record<PillarId, HorizonEvidence>;
    halfLifeDays?: number | null;
    stocks?: number;
    pairs?: number;
    fundamentalYears?: number | null;
    dWindow?: { paper: number | null; recent: number | null; chosen: 'paper' | 'recent'; holdout: number | null };
  } | null;
  disclaimer: string;
}

export const fetchSentimentValidation = (market: 'idx' | 'us' | 'crypto') => getJson<ValidationResponse>(`/api/sentiment/validation?market=${market}`);

export interface ProjectionRange extends Partial<RangeBand> {
  id: string;
  unavailable?: string;
  limitedHistoryBars?: number;
}

export interface Projections {
  symbol: string;
  currency: string;
  price: number | null;
  asOf: string | null;
  ranges: ProjectionRange[];
  atr: number | null;
  atrLevels: Array<{ k: number; up: number; down: number }>;
  levels: Level[];
  nearest: { resistance: Level | null; support: Level | null; upsidePct: number | null; downsidePct: number | null; rewardRisk: number | null } | null;
  patterns: PatternTarget[];
  volatility: number | null;
  volatilityMethod: string;
  lotSize: number;
  fibonacci: boolean;
  disclaimer: string;
}

export const fetchProjections = (symbol: string, fibonacci = false) =>
  getJson<Projections>(`/api/projections?symbol=${encodeURIComponent(symbol)}${fibonacci ? '&fib=1' : ''}`);

export interface BinanceStatus {
  availability: 'ok' | 'rate-limited' | 'ip-banned' | 'region-blocked' | 'unreachable';
  message: string | null;
  futuresMessage: string | null;
  weightUsed: number;
  weightBudget: number;
  weightLimit: number;
  resumeAt: number | null;
  stream: string;
  tickersAt: number | null;
  universeAt: number | null;
  pairs: number;
  scan: { done: number; total: number };
}

export interface BinanceRow {
  rank: number;
  symbol: string;
  base: string;
  price: number | null;
  change1h: number | null;
  change4h: number | null;
  change24h: number | null;
  change7d: number | null;
  quoteVolume: number | null;
  fundingRate: number | null;
  futures: string | null;
  futuresMultiplier: number | null;
  assetId: string | null;
  updatedAt: number | null;
  scores: Record<Horizon, { score: number | null; label: SentimentLabel5 | null }>;
}

export const fetchBinanceTable = () => getJson<{ status: BinanceStatus; rows: BinanceRow[]; serverTime: number }>('/api/crypto/binance');

export const fetchBinanceKlines = (symbol: string, interval: '1h' | '4h' | '1d' | '1w') =>
  getJson<{ symbol: string; interval: string; klines: Kline[]; closed: number; status: BinanceStatus }>(
    `/api/crypto/binance/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}`
  );

export const fetchBinanceDerivatives = (contract: string) =>
  getJson<DerivativesSnapshot & { funding: PremiumIndex | null }>(`/api/crypto/binance/derivatives?contract=${encodeURIComponent(contract)}`);
