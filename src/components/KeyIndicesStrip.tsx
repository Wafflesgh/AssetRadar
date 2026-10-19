/**
 * KeyIndicesStrip.tsx — Radar strip of the main stock indices, IHSG first: price, 24h change and
 * whether the exchange is open right now. Scrolls sideways on small screens; click opens detail.
 */
import { PriceTick, getAssetByCode } from '../config/assets.ts';
import { formatAssetPrice } from '../utils/format.ts';
import { isExchangeOpen } from '../utils/marketHours.ts';
import { Pct } from './MarketTable.tsx';

const KEY_INDEX_CODES = ['JCI', 'SPX', 'NDX', 'DJI', 'N225', 'HSI', 'SSE', 'KOSPI', 'STI', 'FTSE', 'DAX', 'NIFTY'];

export function KeyIndicesStrip({ ticks, onSelect }: { ticks: Record<string, PriceTick>; onSelect: (symbol: string) => void }) {
  const now = Date.now();
  const assets = KEY_INDEX_CODES.map((c) => getAssetByCode(c)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  return (
    <section aria-labelledby="key-indices-heading" className="space-y-2">
      <h2 id="key-indices-heading" className="text-base md:text-lg font-bold tracking-tight">
        Key Indices
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
        {assets.map((a, i) => {
          const t = ticks[a.symbol];
          const ok = t && t.status !== 'error' && Number.isFinite(t.price);
          const open = isExchangeOpen(a.exchange, now);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.symbol)}
              className="shrink-0 min-w-36 text-left p-3 rounded-xl border hover:border-[var(--accent-radar)]"
              style={{
                backgroundColor: i === 0 ? 'var(--accent-radar-soft)' : 'var(--bg-surface)',
                borderColor: i === 0 ? 'var(--accent-radar)' : 'var(--border-subtle)',
              }}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: open ? 'var(--color-up)' : 'var(--text-secondary)' }}
                  role="img"
                  aria-label={open ? 'Market open' : 'Market closed'}
                />
                {a.code === 'JCI' ? 'IHSG (JCI)' : a.shortName}
              </span>
              <span className="block font-mono-num font-semibold text-sm mt-1">{ok ? formatAssetPrice(t.price, a) : t ? 'Data unavailable' : '…'}</span>
              <Pct value={ok ? t.changePct24h : undefined} bold />
              <span className="text-[10px] ml-1.5" style={{ color: 'var(--text-secondary)' }}>
                {open ? 'open' : 'closed'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
