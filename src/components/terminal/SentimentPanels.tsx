/**
 * SentimentPanels.tsx — Terminal panels for stage 4: SENT (Short/Medium/Long investment sentiment
 * of the selected asset with its strongest components), LVL (68% ranges, ATR and the nearest
 * support/resistance), RANK (sentiment leaders of IDX or US) and BINANCE / BNB (the Binance
 * top-100 USDT pairs with 24h change and scores). Evidence summaries, not buy/sell signals.
 */
import { useEffect, useState } from 'react';
import type { AssetConfig } from '../../config/assets.ts';
import { t as tr, type TranslationKey } from '../../i18n/index.ts';
import type { Horizon } from '../../sentiment/newsHorizon.ts';
import {
  fetchBinanceTable,
  fetchProjections,
  fetchSentimentRankings,
  fetchSentimentV2,
  type BinanceRow,
  type Projections,
  type RankingsResponse,
  type SentimentV2,
} from '../../services/sentimentService.ts';
import { formatDecimal } from '../../utils/format.ts';
import { PanelMessage, TerminalPanel, changeColor, formatTerminalPct, formatTerminalPrice } from './TerminalPanel.tsx';

const H: Horizon[] = ['short', 'medium', 'long'];
const tColor = (s: number | null | undefined) =>
  s === null || s === undefined ? 'var(--t-muted)' : s >= 60 ? 'var(--t-up)' : s < 40 ? 'var(--t-down)' : 'var(--t-amber)';

/** Loads data on mount / when deps change and refreshes it every `everyMs`. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[], everyMs = 120_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    const run = () =>
      load()
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(false);
        })
        .catch(() => alive && setError(true));
    run();
    const timer = setInterval(run, everyMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, key]);
  return { data, error, retry: () => setKey((k) => k + 1) };
}

export function SentimentV2Panel({ asset, highlighted }: { asset: AssetConfig; highlighted?: boolean }) {
  const { data, error, retry } = useLoad<SentimentV2>(() => fetchSentimentV2(asset.symbol), [asset.symbol]);
  return (
    <TerminalPanel id="panel-sent" title={tr('term.title.sent')} subtitle={asset.code} highlighted={highlighted}>
      {error && !data ? (
        <PanelMessage kind="error" onRetry={retry} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : (
        <div className="p-2.5 space-y-2 text-[11px] terminal-mono">
          <div style={{ color: 'var(--t-muted)' }}>{tr('term.sent.cols')}</div>
          {H.map((h) => {
            const r = data.horizons[h];
            return (
              <div key={h} className="flex justify-between gap-2">
                <span className="font-bold" style={{ color: 'var(--t-amber)' }}>
                  {tr(`sent.h.${h}` as TranslationKey).toUpperCase()}
                </span>
                <span style={{ color: tColor(r.score) }}>
                  {r.score === null ? '—' : Math.round(r.score)} {r.label ? tr(`sent.label.${r.label}` as TranslationKey).toUpperCase() : ''}
                </span>
                <span style={{ color: 'var(--t-muted)' }}>{tr(`sent.conf.${r.confidence}` as TranslationKey).toUpperCase()}</span>
              </div>
            );
          })}
          <ul className="space-y-0.5 border-t pt-1.5" style={{ borderColor: 'var(--t-line)' }}>
            {data.horizons.medium.components
              .filter((c) => c.weight > 0)
              .slice(0, 4)
              .map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span style={{ color: 'var(--t-muted)' }}>{tr(`sent.comp.${c.id}` as TranslationKey)}</span>
                  <span
                    style={{
                      color: c.contribution > 0 ? 'var(--t-up)' : c.contribution < 0 ? 'var(--t-down)' : 'var(--t-text)',
                    }}
                  >
                    {c.contribution >= 0 ? '+' : ''}
                    {formatDecimal(c.contribution, 1)}
                  </span>
                </li>
              ))}
          </ul>
          <p className="text-[10px]" style={{ color: 'var(--t-muted)' }}>
            {tr('sent.disclaimer')}
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}

export function LevelsPanel({ asset, highlighted }: { asset: AssetConfig; highlighted?: boolean }) {
  const { data, error, retry } = useLoad<Projections>(() => fetchProjections(asset.symbol), [asset.symbol], 10 * 60_000);
  return (
    <TerminalPanel id="panel-lvl" title={tr('term.title.lvl')} subtitle={asset.code} highlighted={highlighted}>
      {error && !data ? (
        <PanelMessage kind="error" onRetry={retry} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : (
        <div className="p-2.5 space-y-1 text-[11px] terminal-mono">
          {data.ranges.map((r) =>
            r.low68 !== undefined && r.high68 !== undefined ? (
              <div
                key={r.id}
                style={{
                  color: r.calibration?.warning ? 'var(--t-amber)' : 'var(--t-text)',
                }}
              >
                {tr('term.lvl.range', {
                  id: r.id,
                  low: formatTerminalPrice(r.low68, asset),
                  high: formatTerminalPrice(r.high68, asset),
                })}
              </div>
            ) : null
          )}
          {data.atr !== null && <div style={{ color: 'var(--t-muted)' }}>ATR(14) {formatTerminalPrice(data.atr, asset)}</div>}
          {[...data.levels]
            .sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct))
            .slice(0, 6)
            .sort((a, b) => b.price - a.price)
            .map((l) => (
              <div key={l.price} className="flex justify-between gap-2">
                <span
                  style={{
                    color: l.kind === 'support' ? 'var(--t-up)' : 'var(--t-down)',
                  }}
                >
                  {tr(l.kind === 'support' ? 'proj.support' : 'proj.resistance').toUpperCase()}
                </span>
                <span style={{ color: 'var(--t-text)' }}>{formatTerminalPrice(l.price, asset)}</span>
                <span style={{ color: 'var(--t-muted)' }}>{formatTerminalPct(l.distancePct)}</span>
              </div>
            ))}
          <p className="text-[10px]" style={{ color: 'var(--t-muted)' }}>
            {tr('sent.disclaimer')}
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}

export function RankingsPanel({
  onSelect,
  highlighted,
  choice,
  onChoice,
}: {
  onSelect: (symbol: string) => void;
  highlighted?: boolean;
  choice: { market: 'idx' | 'us'; horizon: Horizon };
  onChoice: (c: { market: 'idx' | 'us'; horizon: Horizon }) => void;
}) {
  const { market, horizon } = choice;
  const setMarket = (m: 'idx' | 'us') => onChoice({ market: m, horizon });
  const { data, error, retry } = useLoad<RankingsResponse>(() => fetchSentimentRankings(market, horizon, 8), [market, horizon], 5 * 60_000);
  const tab = (m: 'idx' | 'us') => (
    <button
      key={m}
      type="button"
      aria-pressed={market === m}
      onClick={() => setMarket(m)}
      className="px-1.5 h-5 text-[10px] font-bold"
      style={{
        backgroundColor: market === m ? 'var(--t-amber)' : 'transparent',
        color: market === m ? '#05070A' : 'var(--t-muted)',
        borderRadius: 2,
      }}
    >
      {tr(`sent.market.${m}` as TranslationKey).toUpperCase()}
    </button>
  );
  return (
    <TerminalPanel
      id="panel-rank"
      title={tr('term.title.rank')}
      subtitle={tr(`sent.h.${horizon}` as TranslationKey)}
      highlighted={highlighted}
      right={<div className="flex">{(['idx', 'us'] as const).map(tab)}</div>}
    >
      {error && !data ? (
        <PanelMessage kind="error" onRetry={retry} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : data.top.length === 0 ? (
        <PanelMessage kind="empty" text={tr('lead.empty')} />
      ) : (
        <table className="w-full text-[11px] terminal-mono">
          <tbody>
            {[...data.top, ...data.bottom.filter((b) => !data.top.some((x) => x.symbol === b.symbol))].map((r) => (
              <tr key={r.symbol} onClick={() => onSelect(r.symbol)} className="cursor-pointer border-t" style={{ borderColor: 'var(--t-line)' }}>
                <td className="px-2 py-1 font-bold" style={{ color: 'var(--t-amber)' }}>
                  {r.code}
                </td>
                <td className="px-2 py-1 text-right" style={{ color: tColor(r.score) }}>
                  {r.score === null ? '—' : Math.round(r.score)}
                </td>
                <td className="px-2 py-1" style={{ color: tColor(r.score) }}>
                  {r.label ? tr(`sent.label.${r.label}` as TranslationKey).toUpperCase() : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TerminalPanel>
  );
}

export function BinancePanel({ highlighted }: { highlighted?: boolean }) {
  const { data, error, retry } = useLoad<{ rows: BinanceRow[] }>(() => fetchBinanceTable(), [], 15_000);
  return (
    <TerminalPanel
      id="panel-bnb"
      title={tr('term.title.bnb')}
      subtitle={tr('term.panel.BINANCE')}
      highlighted={highlighted}
      bodyClassName="overflow-y-auto max-h-80"
    >
      {error && !data ? (
        <PanelMessage kind="error" onRetry={retry} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : data.rows.length === 0 ? (
        <PanelMessage kind="empty" text={tr('bn.empty')} />
      ) : (
        <table className="w-full text-[11px] terminal-mono">
          <tbody>
            {data.rows.slice(0, 30).map((r) => (
              <tr key={r.symbol} className="border-t" style={{ borderColor: 'var(--t-line)' }}>
                <td className="px-2 py-1" style={{ color: 'var(--t-muted)' }}>
                  {r.rank}
                </td>
                <td className="px-2 py-1 font-bold" style={{ color: 'var(--t-amber)' }}>
                  <a href={`#/crypto/${encodeURIComponent(r.symbol)}`}>{r.base}</a>
                </td>
                <td className="px-2 py-1 text-right" style={{ color: 'var(--t-text)' }}>
                  {r.price === null ? '—' : formatDecimal(r.price, r.price >= 1 ? 4 : 8)}
                </td>
                <td className="px-2 py-1 text-right" style={{ color: changeColor(r.change24h ?? undefined) }}>
                  {formatTerminalPct(r.change24h ?? undefined)}
                </td>
                <td className="px-2 py-1 text-right" style={{ color: tColor(r.scores?.short?.score) }}>
                  {r.scores?.short?.score === null || r.scores?.short?.score === undefined ? '—' : Math.round(r.scores.short.score as number)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TerminalPanel>
  );
}
