/**
 * hybridValue.ts — Bettman, Sault & Schultz (2009) hybrid price model, re-estimated every month
 * per market by cross-sectional OLS (the paper's USD coefficients are never applied to Rupiah
 * stocks or crypto): P = a + b1·BVPS + b2·EPS + b3·FEPS + b4·P(t−5) + b5·D_Up + b6·D_Down.
 * Model 4 drops FEPS when fewer than half the stocks have analyst coverage. The 1% most extreme
 * residuals are trimmed and the model refitted (robust). A scaled variant divides every per-share
 * term by P(t−5) to tame the price-level effect; `chooseVariant` keeps the one that predicts
 * better on the held-out half. Fair value = model price; discount = (fair − price) ÷ price.
 * Warning shown with it: the high R² comes mostly from P(t−5) explaining today's price level,
 * not from predicting returns.
 */

export interface HybridRow {
  symbol: string;
  price: number;
  bvps: number | null;
  eps: number | null;
  feps: number | null;
  priceT5: number | null;
  dUp: 0 | 1;
  dDown: 0 | 1;
}

export type HybridVariant = 'levels' | 'scaled';

export interface HybridModel {
  variant: HybridVariant;
  /** Model 5 (with FEPS) or Model 4 (without). */
  model: 5 | 4;
  terms: string[];
  /** Columns of the full design kept in the fit (constant columns, e.g. no D_Down stock, are dropped). */
  columns: number[];
  coefficients: number[];
  n: number;
  r2: number;
  trimmed: number;
}

/** Solves (XᵀX) b = Xᵀy by Gaussian elimination with partial pivoting; null when singular. */
export function ols(X: number[][], y: number[]): { b: number[]; r2: number } | null {
  const k = X[0]?.length ?? 0;
  if (!k || X.length <= k) return null;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) A[r][c] += X[i][r] * X[i][c];
      A[r][k] += X[i][r] * y[i];
    }
  }
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  const b = A.map((row, i) => row[k] / row[i]);
  const mean = y.reduce((s, v) => s + v, 0) / y.length;
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < X.length; i++) {
    const fit = X[i].reduce((s, x, j) => s + x * b[j], 0);
    ssr += (y[i] - fit) ** 2;
    sst += (y[i] - mean) ** 2;
  }
  return { b, r2: sst > 0 ? 1 - ssr / sst : 0 };
}

function design(row: HybridRow, useFeps: boolean, variant: HybridVariant): { x: number[]; y: number } | null {
  const p5 = row.priceT5;
  if (row.bvps === null || row.eps === null || p5 === null || !(p5 > 0) || !(row.price > 0)) return null;
  if (useFeps && row.feps === null) return null;
  const s = variant === 'scaled' ? p5 : 1;
  const x = [1, row.bvps / s, row.eps / s];
  if (useFeps) x.push((row.feps as number) / s);
  x.push(variant === 'scaled' ? 1 : p5, row.dUp, row.dDown);
  // The scaled variant's P(t−5)/P(t−5) term is the intercept again: drop the duplicate column
  if (variant === 'scaled') x.splice(x.length - 3, 1);
  return { x, y: row.price / s };
}

const termsFor = (useFeps: boolean, variant: HybridVariant) => {
  const t = ['a', 'BVPS', 'EPS', ...(useFeps ? ['FEPS'] : []), 'P(t−5)', 'D_Up', 'D_Down'];
  return variant === 'scaled' ? t.filter((x) => x !== 'P(t−5)') : t;
};

/** Fits the model on the rows (needs ≥ 30 complete stocks); trims the top 1% absolute residuals. */
export function fitHybrid(rows: HybridRow[], variant: HybridVariant = 'levels'): HybridModel | null {
  const covered = rows.filter((r) => r.feps !== null).length;
  const useFeps = covered >= rows.length / 2;
  const full = rows.map((r) => design(r, useFeps, variant)).filter((d): d is { x: number[]; y: number } => d !== null);
  if (full.length < 30) return null;
  // Keep the intercept and every column that varies
  const width = full[0].x.length;
  const columns = Array.from({ length: width }, (_, j) => j).filter((j) => j === 0 || full.some((d) => d.x[j] !== full[0].x[j]));
  let data = full.map((d) => ({ x: columns.map((j) => d.x[j]), y: d.y }));
  let fit = ols(data.map((d) => d.x), data.map((d) => d.y));
  if (!fit) return null;
  const resid = data.map((d) => Math.abs(d.y - d.x.reduce((s, x, j) => s + x * (fit as { b: number[] }).b[j], 0)));
  const cut = [...resid].sort((a, b) => a - b)[Math.floor(resid.length * 0.99)];
  const kept = data.filter((_, i) => resid[i] <= cut);
  const trimmed = data.length - kept.length;
  if (trimmed > 0 && kept.length >= 30) {
    const refit = ols(kept.map((d) => d.x), kept.map((d) => d.y));
    if (refit) {
      fit = refit;
      data = kept;
    }
  }
  const terms = termsFor(useFeps, variant);
  return { variant, model: useFeps ? 5 : 4, terms: columns.map((j) => terms[j]), columns, coefficients: fit.b, n: data.length, r2: fit.r2, trimmed };
}

/** Model price of one stock (null when its inputs are incomplete). */
export function fairValue(model: HybridModel, row: HybridRow): number | null {
  const d = design(row, model.model === 5, model.variant);
  if (!d) return null;
  const fit = model.columns.reduce((s, col, j) => s + d.x[col] * model.coefficients[j], 0);
  const value = model.variant === 'scaled' ? fit * (row.priceT5 as number) : fit;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** (fair − price) ÷ price: positive = trades below the model price. */
export function discount(model: HybridModel, row: HybridRow): number | null {
  const f = fairValue(model, row);
  return f === null ? null : (f - row.price) / row.price;
}

/**
 * Fits both variants on even-indexed rows and keeps the one with the lower median absolute log
 * error on the odd-indexed rows; the chosen variant is then refitted on all rows.
 */
export function chooseVariant(rows: HybridRow[]): { model: HybridModel | null; errors: Record<HybridVariant, number | null> } {
  const train = rows.filter((_, i) => i % 2 === 0);
  const test = rows.filter((_, i) => i % 2 === 1);
  const errors: Record<HybridVariant, number | null> = { levels: null, scaled: null };
  for (const variant of ['levels', 'scaled'] as HybridVariant[]) {
    const m = fitHybrid(train, variant);
    if (!m) continue;
    const e = test
      .map((r) => fairValue(m, r))
      .map((f, i) => (f === null ? NaN : Math.abs(Math.log(f / test[i].price))))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    errors[variant] = e.length ? e[Math.floor(e.length / 2)] : null;
  }
  const pick: HybridVariant =
    errors.scaled !== null && (errors.levels === null || errors.scaled < errors.levels) ? 'scaled' : 'levels';
  return { model: fitHybrid(rows, pick) ?? fitHybrid(rows, pick === 'scaled' ? 'levels' : 'scaled'), errors };
}
