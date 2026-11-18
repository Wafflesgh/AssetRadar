/** unusualMove.ts — Sample standard deviation of completed daily percentage returns. */
import { wibDate } from './sync.ts';
export function dailySigma(closes: number[]): number | null {
  const values = closes.slice(-61);
  if (values.length < 30 || values.some(v => !Number.isFinite(v) || v <= 0)) return null;
  const returns = values.slice(1).map((v, i) => (v / values[i] - 1) * 100);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sigma = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1));
  return Number.isFinite(sigma) ? sigma : null;
}
export function completedSigma(bars: { date: string; close: number }[], now: number) {
  const closes = [...bars].filter(b => b.date < wibDate(now)).sort((a, b) => a.date.localeCompare(b.date)).slice(-61).map(b => b.close);
  return { sigma: dailySigma(closes), sessions: Math.max(0, closes.length - 1) };
}
