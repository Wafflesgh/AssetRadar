/**
 * crossSection.ts — Ranking helpers for the sentiment pillars: percentile = rank / (n − 1) on a
 * 0–100 scale (ties share their average rank), the AMP rank score rank − average(rank) rescaled
 * to 0–100, deciles formed on an eligible subset (e.g. liquid stocks) with every other stock placed
 * against those breakpoints, and industry adjustment (value minus the industry median).
 */

/** Average ranks (0-based) with ties sharing their mean rank; NaN values get NaN. */
export function averageRanks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).filter((x) => Number.isFinite(x.v));
  idx.sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length).fill(NaN);
  for (let k = 0; k < idx.length; ) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1].v === idx[k].v) j++;
    const r = (k + j) / 2;
    for (let m = k; m <= j; m++) out[idx[m].i] = r;
    k = j + 1;
  }
  return out;
}

/** Percentile 0–100 = rank / (n − 1) × 100 among the finite values (50 when n = 1). */
export function percentiles(values: number[]): number[] {
  const ranks = averageRanks(values);
  const n = values.filter((v) => Number.isFinite(v)).length;
  return ranks.map((r) => (Number.isFinite(r) ? (n > 1 ? (r / (n - 1)) * 100 : 50) : NaN));
}

/**
 * AMP (Asness, Moskowitz & Pedersen) rank weight rank − mean(rank), rescaled so the lowest is 0
 * and the highest 100 (identical to the percentile up to ties; kept for the documented formula).
 */
export function ampScores(values: number[]): number[] {
  const ranks = averageRanks(values);
  const finite = ranks.filter((r) => Number.isFinite(r));
  if (!finite.length) return ranks;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const w = ranks.map((r) => r - mean);
  const max = Math.max(...w.filter(Number.isFinite).map(Math.abs)) || 1;
  return w.map((x) => (Number.isFinite(x) ? 50 + (x / max) * 50 : NaN));
}

/** Decile breakpoints (9 inner cut points) from the eligible values. */
export function decileBreakpoints(eligible: number[]): number[] {
  const v = eligible.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < 10) return [];
  return Array.from({ length: 9 }, (_, k) => {
    const pos = ((k + 1) / 10) * (v.length - 1);
    const lo = Math.floor(pos);
    return v[lo] + (v[Math.min(lo + 1, v.length - 1)] - v[lo]) * (pos - lo);
  });
}

/** Decile 1–10 of a value against breakpoints (null without breakpoints or value). */
export function decileOf(value: number, breakpoints: number[]): number | null {
  if (!breakpoints.length || !Number.isFinite(value)) return null;
  let d = 1;
  for (const b of breakpoints) if (value > b) d++;
  return d;
}

export function median(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Industry-adjusted values: value − median of its industry (industries with fewer than
 * `minPeers` valid members use the market median instead, and are flagged).
 */
export function industryAdjust(values: number[], industries: Array<string | null | undefined>, minPeers = 3): { adjusted: number[]; usedMarket: boolean[] } {
  const groups = new Map<string, number[]>();
  values.forEach((v, i) => {
    const ind = industries[i];
    if (!ind || !Number.isFinite(v)) return;
    groups.set(ind, [...(groups.get(ind) ?? []), v]);
  });
  const marketMedian = median(values);
  const medians = new Map([...groups.entries()].filter(([, g]) => g.length >= minPeers).map(([k, g]) => [k, median(g)]));
  const usedMarket: boolean[] = [];
  const adjusted = values.map((v, i) => {
    const m = medians.get(industries[i] ?? '');
    usedMarket.push(m === undefined);
    return Number.isFinite(v) ? v - (m ?? marketMedian) : NaN;
  });
  return { adjusted, usedMarket };
}

/** Clamp to 0–100. */
export const clamp100 = (x: number) => Math.max(0, Math.min(100, x));
