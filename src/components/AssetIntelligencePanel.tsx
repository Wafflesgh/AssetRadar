import { useEffect, useState, useCallback, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Newspaper,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { AssetIntelligence } from '../config/assets.ts';
import { fetchAssetIntelligence } from '../services/marketDataService.ts';

interface AssetIntelligencePanelProps {
  symbol: string;
  assetName: string;
}

export function AssetIntelligencePanel({
  symbol,
  assetName,
}: AssetIntelligencePanelProps) {
  const [data, setData] = useState<AssetIntelligence | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const aiRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadIntelligence = useCallback(
    async (opts: { silent?: boolean; allowAiRetry?: boolean } = {}) => {
      const { silent = false, allowAiRetry = true } = opts;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await fetchAssetIntelligence(symbol);
        setData(res);
        // Hasil AI Gemini disiapkan di latar belakang server; ambil ulang sekali setelah 8 detik
        if (!res.aiPowered && allowAiRetry) {
          if (aiRetryTimer.current) clearTimeout(aiRetryTimer.current);
          aiRetryTimer.current = setTimeout(() => {
            loadIntelligence({ silent: true, allowAiRetry: false });
          }, 8000);
        }
      } catch {
        if (!silent) setError('Data analisis sentimen dan berita belum dapat dimuat.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    loadIntelligence();
    return () => {
      if (aiRetryTimer.current) clearTimeout(aiRetryTimer.current);
    };
  }, [loadIntelligence]);

  const sentimentColor =
    data?.sentimentLabel === 'Bullish'
      ? 'var(--color-up)'
      : data?.sentimentLabel === 'Bearish'
        ? 'var(--color-down)'
        : 'var(--color-gold)';

  const SentimentIcon =
    data?.sentimentLabel === 'Bullish'
      ? TrendingUp
      : data?.sentimentLabel === 'Bearish'
        ? TrendingDown
        : Minus;

  return (
    <section
      aria-label={`Analisis Sentimen dan Berita ${assetName}`}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* Left Column: Market Sentiment Analysis (5 cols on lg) */}
      <div
        className="lg:col-span-5 p-5 md:p-6 rounded-xl border flex flex-col justify-between space-y-5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Sparkles
                  className="w-3.5 h-3.5"
                  style={{ color: 'var(--accent-radar)' }}
                />
                <span>Analisis Sentimen Pasar</span>
                {data?.aiPowered && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Diperkaya AI</span>
                  </>
                )}
              </div>
              <h2 className="text-lg font-bold mt-0.5">
                Sentimen {assetName}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => loadIntelligence()}
              disabled={loading}
              aria-label="Muat ulang analisis sentimen dan berita"
              className="p-2 rounded-lg border text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3 py-4">
              <div
                className="h-8 w-40 rounded-lg animate-pulse"
                style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
              />
              <div
                className="h-3 w-full rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
              />
              <div
                className="h-16 w-full rounded-lg animate-pulse"
                style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
              />
            </div>
          ) : error || !data ? (
            <div className="py-6 space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {error || 'Data sentimen tidak tersedia'}
              </p>
              <button
                type="button"
                onClick={() => loadIntelligence()}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold border"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                Coba lagi
              </button>
            </div>
          ) : (
            <>
              {/* Score & Label Display */}
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SentimentIcon
                      className="w-5 h-5"
                      style={{ color: sentimentColor }}
                    />
                    <span
                      className="text-xl font-bold"
                      style={{ color: sentimentColor }}
                    >
                      {data.sentimentLabel}
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-2xl font-mono-num font-bold tabular-nums"
                      style={{ color: sentimentColor }}
                    >
                      {data.sentimentScore}
                    </span>
                    <span
                      className="text-xs font-mono-num"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      /100
                    </span>
                  </div>
                </div>

                {/* Sentiment Meter Bar */}
                <div className="space-y-1">
                  <div
                    className="w-full h-2 rounded-full overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-canvas)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${data.sentimentScore}%`,
                        backgroundColor: sentimentColor,
                      }}
                    />
                  </div>
                  <div
                    className="flex justify-between text-[10px] font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span>Bearish (0–42)</span>
                    <span>Netral (43–57)</span>
                    <span>Bullish (58–100)</span>
                  </div>
                </div>
              </div>

              {/* Narrative Summary */}
              <p className="text-xs md:text-sm leading-relaxed">
                {data.summary}
              </p>

              {/* Key Factors */}
              {data.keyFactors.length > 0 && (
                <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <h3
                    className="text-xs font-semibold"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Faktor Penggerak Utama:
                  </h3>
                  <ul className="space-y-1.5 text-xs">
                    {data.keyFactors.map((factor, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span
                          className="font-mono-num font-bold"
                          style={{ color: 'var(--accent-radar)' }}
                        >
                          0{idx + 1}.
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {factor}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <p
          className="text-[11px] pt-3 border-t"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          Indikator sentimen dihitung dari momentum harga 24 jam dan nada tajuk berita pasar
          terkini. Bukan rekomendasi jual/beli.
        </p>
      </div>

      {/* Right Column: Related Market News (7 cols on lg) */}
      <div
        className="lg:col-span-7 p-5 md:p-6 rounded-xl border flex flex-col justify-between space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div
                className="flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Newspaper
                  className="w-3.5 h-3.5"
                  style={{ color: 'var(--accent-radar)' }}
                />
                <span>Berita Pasar Terkait</span>
                <span aria-hidden="true">·</span>
                <span>Google News Indonesia</span>
              </div>
              <h2 className="text-lg font-bold mt-0.5">
                Berita yang Mempengaruhi {assetName}
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="h-16 w-full rounded-xl animate-pulse"
                  style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
                />
              ))}
            </div>
          ) : !data || data.news.length === 0 ? (
            <div
              className="p-6 rounded-xl border text-center space-y-2"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <p className="text-sm font-medium">
                Belum ada berita terbaru yang terindeks saat ini.
              </p>
              <button
                type="button"
                onClick={() => loadIntelligence()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                Coba lagi
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {data.news.map((item) => {
                const itemColor =
                  item.sentiment === 'Bullish'
                    ? 'var(--color-up)'
                    : item.sentiment === 'Bearish'
                      ? 'var(--color-down)'
                      : 'var(--text-secondary)';

                return (
                  <article key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block space-y-1"
                    >
                      <div
                        className="flex flex-wrap items-center gap-1.5 text-[11px]"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {item.source}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.publishedAt}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold" style={{ color: itemColor }}>
                          Nada: {item.sentiment}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-xs md:text-sm font-semibold group-hover:underline leading-snug">
                          {item.title}
                        </h3>
                        <ExternalLink
                          className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60 group-hover:opacity-100"
                          style={{ color: 'var(--accent-radar)' }}
                        />
                      </div>
                    </a>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <p
          className="text-[11px] pt-3 border-t"
          style={{
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
        >
          Klik judul berita untuk membaca artikel lengkap dari media sumber terkait.
        </p>
      </div>
    </section>
  );
}
