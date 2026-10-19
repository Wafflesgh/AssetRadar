/**
 * AnalysisPanels.tsx — Terminal panels for the selected asset: INTEL (evidence score, chart
 * patterns, indicator scorecard, historical hit rate, Piotroski F-score and top news drivers,
 * from /api/market/analysis), HP (historical daily prices: open, high, low, close, change) and
 * CAL (corporate calendar of the selected stock and upcoming IDX events).
 */
import { useCallback, useEffect, useState } from 'react';
import type { AssetAnalysis } from '../../ai/analysis.ts';
import { DRIVER_LABELS } from '../../ai/newsDrivers.ts';
import { AssetConfig, OhlcCandle } from '../../config/assets.ts';
import { fetchAssetAnalysis, fetchCorporateCalendar, fetchHistory, type CalendarResponse } from '../../services/marketDataService.ts';
import { EVENT_LABELS, addDays, type CalendarEvent } from '../../utils/corporateCalendar.ts';
import { PanelMessage, TerminalPanel, changeColor, formatTerminalPct, formatTerminalPrice, toneColor } from './TerminalPanel.tsx';

const biasText = (b: number) => (b > 0 ? 'BULL' : b < 0 ? 'BEAR' : 'NEUT');
const biasColor = (b: number) => (b > 0 ? 'var(--t-up)' : b < 0 ? 'var(--t-down)' : 'var(--t-muted)');

export function IntelPanel({ asset, highlighted, className }: { asset: AssetConfig; highlighted?: boolean; className?: string }) {
  const [data, setData] = useState<AssetAnalysis | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(
    (silent = false) => {
      if (!silent) setState('loading');
      fetchAssetAnalysis(asset.symbol)
        .then((d) => {
          setData(d);
          setState('ready');
        })
        .catch(() => !silent && setState('error'));
    },
    [asset.symbol]
  );

  useEffect(() => {
    setData(null);
    load();
    const t = setInterval(() => load(true), 2 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const t = data?.technical;
  const f = data?.fundamentals;
  return (
    <TerminalPanel
      id="panel-intel"
      className={className}
      title="Intel"
      subtitle={`${asset.code} · technical + fundamental evidence`}
      highlighted={highlighted}
      bodyClassName="overflow-auto max-h-[30rem]"
      right={
        data && (
          <span className="text-[11px] font-bold" style={{ color: toneColor(data.label) }}>
            {data.score}/100 {data.label.toUpperCase()}
          </span>
        )
      }
    >
      {state === 'loading' && !data ? (
        <PanelMessage kind="loading" />
      ) : state === 'error' && !data ? (
        <PanelMessage kind="error" onRetry={() => load()} />
      ) : data ? (
        <div className="p-2 space-y-2 text-[11px]">
          <p className="leading-snug" style={{ color: 'var(--t-text)' }}>{data.summary}</p>

          <div className="space-y-0.5">
            {data.components.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate" style={{ color: 'var(--t-muted)' }}>{c.label.replace(/ \(.+\)$/, '').toUpperCase()}</span>
                <span className="relative flex-1 h-1.5" style={{ backgroundColor: 'var(--t-line)' }} aria-hidden="true">
                  <span
                    className="absolute top-0 bottom-0"
                    style={{
                      backgroundColor: biasColor(c.value),
                      width: `${Math.abs(c.value) * 50}%`,
                      left: c.value >= 0 ? '50%' : `${50 - Math.abs(c.value) * 50}%`,
                    }}
                  />
                </span>
                <span className="w-16 text-right shrink-0" style={{ color: biasColor(c.value) }}>
                  {c.contribution >= 0 ? '+' : ''}
                  {(c.contribution * 50).toFixed(1)}pt
                </span>
              </div>
            ))}
          </div>

          {t && (
            <>
              <div>
                <div className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--t-amber)' }}>PATTERNS</div>
                {t.patterns.length === 0 ? (
                  <div style={{ color: 'var(--t-muted)' }}>No classic pattern on the daily chart.</div>
                ) : (
                  t.patterns.map((p) => (
                    <div key={p.id} className="flex flex-wrap gap-x-2">
                      <span className="font-bold" style={{ color: biasColor(p.bias) }}>{p.name.toUpperCase()}</span>
                      <span style={{ color: 'var(--t-muted)' }}>{p.status}</span>
                      {p.keyLevel !== undefined && <span style={{ color: 'var(--t-muted)' }}>key {formatTerminalPrice(p.keyLevel, asset)}</span>}
                    </div>
                  ))
                )}
              </div>
              <table className="w-full">
                <tbody>
                  {t.signals.map((s) => (
                    <tr key={s.id} className="border-t" style={{ borderColor: 'var(--t-line)' }}>
                      <td className="py-0.5 pr-2 whitespace-nowrap" style={{ color: 'var(--t-muted)' }}>{s.label}</td>
                      <td className="py-0.5 pr-2" style={{ color: 'var(--t-text)' }}>{s.reading}</td>
                      <td className="py-0.5 text-right font-bold" style={{ color: biasColor(s.bias) }}>{biasText(s.bias)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {t.edge && (
                <div style={{ color: 'var(--t-muted)' }}>
                  HIST: {t.edge.lean.toUpperCase()} lean → up {Math.round(t.edge.upRate * 100)}% of {t.edge.samples} days after {t.edge.horizonDays}d vs base{' '}
                  {Math.round(t.edge.baseUpRate * 100)}%
                </div>
              )}
              <div className="flex flex-wrap gap-x-3" style={{ color: 'var(--t-muted)' }}>
                <span>SUP {formatTerminalPrice(t.indicators.support ?? undefined, asset)}</span>
                <span>RES {formatTerminalPrice(t.indicators.resistance ?? undefined, asset)}</span>
                <span>MA50 {formatTerminalPrice(t.indicators.sma50 ?? undefined, asset)}</span>
                <span>MA200 {formatTerminalPrice(t.indicators.sma200 ?? undefined, asset)}</span>
              </div>
            </>
          )}

          {f && (
            <div style={{ color: 'var(--t-muted)' }}>
              <span className="font-bold" style={{ color: 'var(--t-amber)' }}>F-SCORE {f.fScore}/{f.fScoreMax}</span>
              {f.pe !== null && <> · P/E {f.pe.toFixed(1)}</>}
              {f.pb !== null && <> · P/B {f.pb.toFixed(1)}</>}
              {f.grossProfitability !== null && <> · GP/A {(f.grossProfitability * 100).toFixed(0)}%</>} · FY {f.fiscalYearEnd.slice(0, 4)}
            </div>
          )}

          {data.news.drivers.filter((d) => d.category !== 'price').slice(0, 3).map((d) => (
            <a key={d.link + d.title} href={d.link} target="_blank" rel="noopener noreferrer" className="block hover:underline leading-snug">
              <span className="font-bold" style={{ color: biasColor(d.direction) }}>{biasText(d.direction)}</span>{' '}
              <span style={{ color: 'var(--t-muted)' }}>{DRIVER_LABELS[d.category].toUpperCase()}</span>{' '}
              <span style={{ color: 'var(--t-text)' }}>{d.title}</span>
            </a>
          ))}
        </div>
      ) : null}
    </TerminalPanel>
  );
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });

export function HistoryPanel({ asset, highlighted, className }: { asset: AssetConfig; highlighted?: boolean; className?: string }) {
  const [rows, setRows] = useState<OhlcCandle[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetchHistory(asset.symbol, 'D')
      .then((c) => setRows(c.slice(-31)))
      .catch(() => setError(true));
  }, [asset.symbol]);

  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);

  const list = rows ? rows.map((r, i) => ({ ...r, chg: i > 0 ? (r.close / rows[i - 1].close - 1) * 100 : undefined })).slice(1).reverse() : [];
  return (
    <TerminalPanel id="panel-hp" className={className} title="Historical Prices" subtitle={`HP · ${asset.code} daily`} highlighted={highlighted} bodyClassName="overflow-auto max-h-80">
      {error && !rows ? (
        <PanelMessage kind="error" onRetry={load} />
      ) : !rows ? (
        <PanelMessage kind="loading" />
      ) : (
        <table className="w-full text-[11px]">
          <thead className="sticky top-0" style={{ backgroundColor: 'var(--t-panel)' }}>
            <tr className="text-left" style={{ color: 'var(--t-muted)' }}>
              <th className="px-2 py-1 font-medium">DATE</th>
              <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">OPEN</th>
              <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">HIGH</th>
              <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">LOW</th>
              <th className="px-2 py-1 font-medium text-right">CLOSE</th>
              <th className="px-2 py-1 font-medium text-right">%CHG</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.time} className="border-t" style={{ borderColor: 'var(--t-line)' }}>
                <td className="px-2 py-0.5 whitespace-nowrap" style={{ color: 'var(--t-muted)' }}>{DAY.format(r.time * 1000)}</td>
                <td className="px-2 py-0.5 text-right hidden sm:table-cell">{formatTerminalPrice(r.open, asset)}</td>
                <td className="px-2 py-0.5 text-right hidden sm:table-cell">{formatTerminalPrice(r.high, asset)}</td>
                <td className="px-2 py-0.5 text-right hidden sm:table-cell">{formatTerminalPrice(r.low, asset)}</td>
                <td className="px-2 py-0.5 text-right" style={{ color: 'var(--t-text)' }}>{formatTerminalPrice(r.close, asset)}</td>
                <td className="px-2 py-0.5 text-right" style={{ color: changeColor(r.chg) }}>{formatTerminalPct(r.chg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TerminalPanel>
  );
}

/** CAL: the selected stock's corporate calendar plus upcoming IDX events (next 14 days). */
export function CalendarTerminalPanel({
  asset,
  onSelect,
  highlighted,
  className,
}: {
  asset: AssetConfig;
  onSelect: (symbol: string) => void;
  highlighted?: boolean;
  className?: string;
}) {
  const isStock = asset.group === 'idStock' || asset.group === 'usStock' || asset.group === 'globalStock';
  const [own, setOwn] = useState<CalendarEvent[] | null>(null);
  const [all, setAll] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState(false);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

  useEffect(() => {
    let alive = true;
    setOwn(null);
    if (isStock) fetchCorporateCalendar(asset.symbol).then((r) => alive && setOwn(r.events)).catch(() => alive && setOwn([]));
    return () => {
      alive = false;
    };
  }, [asset.symbol, isStock]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchCorporateCalendar()
        .then((r) => {
          if (!alive) return;
          setAll(r);
          setError(false);
        })
        .catch(() => alive && setError(true));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const until = addDays(today, 14);
  const upcoming = (all?.events ?? []).filter((e) => e.date >= today && e.date <= until && e.type !== 'dividend' && e.type !== 'split').slice(0, 40);
  const mine = (own ?? []).filter((e) => e.date >= addDays(today, -365)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <TerminalPanel
      id="panel-cal"
      className={className}
      title="Calendar"
      subtitle={all ? `CAL · ${all.scanned}/${all.total} IDX stocks checked${all.scanning ? ' …' : ''}` : 'CAL · corporate calendar'}
      highlighted={highlighted}
      bodyClassName="overflow-auto max-h-80"
    >
      {error && !all ? (
        <PanelMessage kind="error" onRetry={() => setError(false)} />
      ) : (
        <div className="p-2 space-y-2 text-[11px]">
          {isStock && (
            <div>
              <div className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--t-amber)' }}>
                {asset.shortName}
              </div>
              {!own ? (
                <div style={{ color: 'var(--t-muted)' }}>Loading...</div>
              ) : mine.length === 0 ? (
                <div style={{ color: 'var(--t-muted)' }}>No events in the last year or ahead.</div>
              ) : (
                mine.map((e) => (
                  <div key={e.type + e.date} className="flex justify-between gap-2">
                    <span style={{ color: e.date >= today ? 'var(--t-text)' : 'var(--t-muted)' }}>
                      {EVENT_LABELS[e.type].toUpperCase()}
                      {e.estimate ? ' (EST)' : ''}
                      {e.amount !== undefined ? ` ${formatTerminalPrice(e.amount, asset)}` : ''}
                      {e.ratio ? ` ${e.ratio}` : ''}
                    </span>
                    <span style={{ color: 'var(--t-muted)' }}>{e.date}</span>
                  </div>
                ))
              )}
            </div>
          )}
          <div>
            <div className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--t-amber)' }}>
              IDX NEXT 14 DAYS
            </div>
            {!all ? (
              <div style={{ color: 'var(--t-muted)' }}>Loading...</div>
            ) : upcoming.length === 0 ? (
              <div style={{ color: 'var(--t-muted)' }}>No events found yet.</div>
            ) : (
              <table className="w-full">
                <tbody>
                  {upcoming.map((e) => (
                    <tr key={e.symbol + e.type + e.date} onClick={() => onSelect(e.symbol)} className="cursor-pointer border-t" style={{ borderColor: 'var(--t-line)' }}>
                      <td className="py-0.5 pr-2" style={{ color: 'var(--t-muted)' }}>{e.date.slice(5)}</td>
                      <td className="py-0.5 pr-2 font-bold" style={{ color: 'var(--t-amber)' }}>{e.symbol.replace('.JK', '')}</td>
                      <td className="py-0.5" style={{ color: 'var(--t-text)' }}>
                        {EVENT_LABELS[e.type]}
                        {e.estimate ? ' (est.)' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ color: 'var(--t-muted)' }}>Source: Yahoo Finance. RUPS, cum/recording dates and rights issues not available.</div>
        </div>
      )}
    </TerminalPanel>
  );
}
