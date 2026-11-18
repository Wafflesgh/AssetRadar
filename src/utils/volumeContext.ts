/** volumeContext.ts — Today's reported share volume relative to completed IDX sessions. */
import { wibDate } from './sync.ts';
export function volumeContext(bars: { date: string; volume?: number }[], now: number) {
  const today = wibDate(now);
  const current = bars.find(b => b.date === today)?.volume;
  const baseline = [...bars].filter(b => b.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)
    .map(b => b.volume).filter((v): v is number => v !== undefined && Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  if (baseline.length < 10 || current === undefined || !Number.isFinite(current) || current < 0) return null;
  const middle = Math.floor(baseline.length / 2);
  const median = baseline.length % 2 ? baseline[middle] : (baseline[middle - 1] + baseline[middle]) / 2;
  if (median <= 0) return null;
  const ratio = current / median;
  return { median, ratio, shares: current, lots: current / 100, sessions: baseline.length,
    band: ratio >= 1.5 ? 'busy' as const : ratio <= 0.67 ? 'quiet' as const : 'usual' as const };
}
