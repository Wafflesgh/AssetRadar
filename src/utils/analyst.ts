/**
 * analyst.ts — Analyst consensus and earnings surprises from Yahoo quoteSummary (modules
 * earningsTrend, earningsHistory, assetProfile, defaultKeyStatistics): next-fiscal-year EPS
 * estimate (FEPS, for the hybrid fair-value model), the last four quarters' EPS surprises (a proxy
 * for SUE when quarterly history is short), and the company's sector/industry. Only today's
 * consensus is available — no estimate history — so FEPS cannot be used in back-tests.
 */

export interface EpsEstimate {
  /** Yahoo period code: "0y" = current fiscal year, "+1y" = next. */
  period: string;
  endDate: string | null;
  avg: number;
  low: number | null;
  high: number | null;
  analysts: number;
  yearAgoEps: number | null;
}

export interface EarningsSurprise {
  /** Fiscal quarter end, YYYY-MM-DD. */
  quarter: string;
  actual: number;
  estimate: number;
  /** (actual − estimate) ÷ |estimate|, in %. */
  surprisePct: number | null;
}

export interface AnalystData {
  currentYear: EpsEstimate | null;
  nextYear: EpsEstimate | null;
  surprises: EarningsSurprise[];
  sector: string | null;
  industry: string | null;
  employees: number | null;
  bookValuePerShare: number | null;
  /** Number of analysts behind the next-year estimate (0 = no coverage). */
  coverage: number;
}

const raw = (v: unknown): number | null => {
  const x = v && typeof v === 'object' ? (v as { raw?: unknown }).raw : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
};

const dateOf = (v: unknown): string | null => {
  if (v && typeof v === 'object') {
    const fmt = (v as { fmt?: unknown }).fmt;
    if (typeof fmt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fmt)) return fmt;
    const r = raw(v);
    if (r !== null) return new Date(r * 1000).toISOString().slice(0, 10);
  }
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};

function estimate(row: Record<string, unknown> | undefined): EpsEstimate | null {
  if (!row) return null;
  const e = (row.earningsEstimate ?? {}) as Record<string, unknown>;
  const avg = raw(e.avg);
  if (avg === null) return null;
  return {
    period: String(row.period ?? ''),
    endDate: dateOf(row.endDate),
    avg,
    low: raw(e.low),
    high: raw(e.high),
    analysts: raw(e.numberOfAnalysts) ?? 0,
    yearAgoEps: raw(e.yearAgoEps),
  };
}

/** Parses one quoteSummary response; missing modules give nulls, never invented values. */
export function parseAnalystData(json: unknown): AnalystData {
  const result = ((json as { quoteSummary?: { result?: unknown[] } })?.quoteSummary?.result?.[0] ?? {}) as Record<string, unknown>;
  const trend = (((result.earningsTrend as { trend?: unknown[] })?.trend ?? []) as Array<Record<string, unknown>>);
  const history = (((result.earningsHistory as { history?: unknown[] })?.history ?? []) as Array<Record<string, unknown>>);
  const profile = (result.assetProfile ?? {}) as Record<string, unknown>;
  const stats = (result.defaultKeyStatistics ?? {}) as Record<string, unknown>;

  const surprises: EarningsSurprise[] = [];
  for (const h of history) {
    const actual = raw(h.epsActual);
    const est = raw(h.epsEstimate);
    const quarter = dateOf(h.quarter);
    if (actual === null || est === null || !quarter) continue;
    surprises.push({ quarter, actual, estimate: est, surprisePct: est !== 0 ? ((actual - est) / Math.abs(est)) * 100 : null });
  }
  surprises.sort((a, b) => a.quarter.localeCompare(b.quarter));

  const nextYear = estimate(trend.find((t) => t.period === '+1y'));
  return {
    currentYear: estimate(trend.find((t) => t.period === '0y')),
    nextYear,
    surprises: surprises.slice(-4),
    sector: typeof profile.sector === 'string' && profile.sector ? profile.sector : null,
    industry: typeof profile.industry === 'string' && profile.industry ? profile.industry : null,
    employees: raw(profile.fullTimeEmployees),
    bookValuePerShare: raw(stats.bookValue),
    coverage: nextYear?.analysts ?? 0,
  };
}

/** The modules one request asks for. */
export const ANALYST_MODULES = 'earningsTrend,earningsHistory,assetProfile,defaultKeyStatistics';

/**
 * Average surprise of the reported quarters, labelled as an analyst-surprise proxy for SUE.
 * Null without at least two quarters.
 */
export function averageSurprise(surprises: EarningsSurprise[]): number | null {
  const v = surprises.map((s) => s.surprisePct).filter((x): x is number => x !== null && Number.isFinite(x));
  if (v.length < 2) return null;
  // Winsorize: a near-zero estimate can make one surprise thousands of percent
  const clipped = v.map((x) => Math.max(-100, Math.min(100, x)));
  return clipped.reduce((a, b) => a + b, 0) / clipped.length;
}
