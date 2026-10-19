import { Star, Trash2, ArrowUpRight, Radar } from 'lucide-react';
import { ASSETS, PriceTick } from '../config/assets.ts';
import {
  formatRupiah,
  formatUsdPerOz,
  formatPoints,
  formatPercent,
} from '../utils/format.ts';

interface WatchlistViewProps {
  watchlist: string[];
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
  onRemoveFromWatchlist: (symbol: string) => void;
  onGoToRadar: () => void;
}

export function WatchlistView({
  watchlist,
  ticks,
  onSelectAsset,
  onRemoveFromWatchlist,
  onGoToRadar,
}: WatchlistViewProps) {
  const watchlistedAssets = watchlist
    .map((sym) => ASSETS.find((a) => a.symbol === sym))
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>Daftar Pantau Pribadi</span>
          <span aria-hidden="true">·</span>
          <span>Tersimpan di Perangkat (localStorage)</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Watchlist Aset Favorit
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Aset yang Anda tandai bintang dari halaman Radar atau Detail muncul di sini beserta
          harga terkininya.
        </p>
      </header>

      {watchlistedAssets.length === 0 ? (
        <section
          aria-label="Watchlist Kosong"
          className="p-8 md:p-12 rounded-xl border text-center space-y-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center border"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--color-gold)',
            }}
          >
            <Star className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-base font-bold">Belum ada aset di Watchlist Anda</h2>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Tambahkan instrumen favorit seperti Bitcoin, Emas Spot, atau IHSG dari halaman Radar
              agar lebih cepat dipantau.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToRadar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            style={{
              backgroundColor: 'var(--accent-radar)',
              color: '#0B1220',
            }}
          >
            <Radar className="w-4 h-4" />
            <span>Jelajahi Aset di Radar</span>
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {watchlistedAssets.map((asset) => {
            const tick = ticks[asset.symbol];
            const isLoaded = tick && tick.status !== 'error' && Number.isFinite(tick.price);
            const priceDisplay = !isLoaded
              ? 'Memuat...'
              : asset.currency === 'IDR'
                ? formatRupiah(tick.price, 0)
                : asset.currency === 'PTS'
                  ? formatPoints(tick.price)
                  : formatUsdPerOz(tick.price);

            const pct = tick?.changePct24h;
            const pctColor =
              pct !== undefined && pct > 0
                ? 'var(--color-up)'
                : pct !== undefined && pct < 0
                  ? 'var(--color-down)'
                  : 'var(--text-secondary)';

            return (
              <article
                key={asset.id}
                className="p-5 rounded-xl border flex flex-col justify-between gap-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span className="font-mono-num font-medium">{asset.symbol}</span>
                      <span aria-hidden="true">·</span>
                      <span>{tick?.source || asset.sourceLabel}</span>
                    </div>
                    <h2 className="text-base font-bold mt-0.5">{asset.name}</h2>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-lg font-mono-num font-bold tabular-nums">
                        {priceDisplay}
                      </span>
                      {pct !== undefined && (
                        <span
                          className="text-xs font-mono-num font-semibold tabular-nums"
                          style={{ color: pctColor }}
                        >
                          {formatPercent(pct)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveFromWatchlist(asset.symbol)}
                    aria-label={`Hapus ${asset.name} dari Watchlist`}
                    className="p-2 rounded-lg border transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--color-down)',
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectAsset(asset.symbol)}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <span>Buka Grafik &amp; Sentimen {asset.shortName}</span>
                  <ArrowUpRight
                    className="w-3.5 h-3.5"
                    style={{ color: 'var(--accent-radar)' }}
                  />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
