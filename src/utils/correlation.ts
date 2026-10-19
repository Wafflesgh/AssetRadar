/**
 * correlation.ts — Pearson correlation of daily returns between assets, aligned on shared
 * trading dates, used by the server for the 30-day correlation matrix.
 */
export interface DatedClose {
  date: string; // YYYY-MM-DD
  close: number;
}

/** Pearson correlation coefficient. Returns null with too little data or zero variance. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  const r = cov / Math.sqrt(varA * varB);
  return Math.max(-1, Math.min(1, r));
}

/**
 * Aligns two price series on the dates both have (crypto trades 7 days a week, stocks only
 * on exchange days), computes daily returns, then the Pearson correlation over the last
 * `windowDays` returns.
 */
export function correlateSeries(
  a: DatedClose[],
  b: DatedClose[],
  windowDays: number
): number | null {
  const mapB = new Map(b.map((p) => [p.date, p.close]));
  const aligned = a
    .filter((p) => mapB.has(p.date))
    .sort((x, y) => x.date.localeCompare(y.date))
    .map((p) => [p.close, mapB.get(p.date) as number] as const);
  if (aligned.length < 4) return null;
  const retA: number[] = [];
  const retB: number[] = [];
  for (let i = 1; i < aligned.length; i++) {
    const [pa, pb] = aligned[i - 1];
    const [ca, cb] = aligned[i];
    if (pa > 0 && pb > 0) {
      retA.push(ca / pa - 1);
      retB.push(cb / pb - 1);
    }
  }
  return pearson(retA.slice(-windowDays), retB.slice(-windowDays));
}

/** Symmetric correlation matrix; the diagonal is 1 when the series has data. */
export function correlationMatrixFromSeries(
  seriesList: DatedClose[][],
  windowDays: number
): Array<Array<number | null>> {
  const n = seriesList.length;
  const matrix: Array<Array<number | null>> = Array.from({ length: n }, () =>
    Array<number | null>(n).fill(null)
  );
  for (let i = 0; i < n; i++) {
    matrix[i][i] = seriesList[i].length > 1 ? 1 : null;
    for (let j = i + 1; j < n; j++) {
      const r = correlateSeries(seriesList[i], seriesList[j], windowDays);
      matrix[i][j] = r;
      matrix[j][i] = r;
    }
  }
  return matrix;
}
