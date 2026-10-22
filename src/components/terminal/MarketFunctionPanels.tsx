/**
 * MarketFunctionPanels.tsx — Terminal market functions: MOV (biggest movers over the live
 * 5-minute window, 1H, 24H and 7D), WEI (world equity indices with session status and local
 * time), FXC (currency cross-rate matrix built from the Rupiah pairs), CURV (US Treasury
 * yield curve with the 10Y–3M spread), IDMACRO (Indonesia macro snapshot) and BRIEF (morning brief).
 */
import { t as tr, tOr, useLang, useT, type TranslationKey } from '../../i18n/index.ts';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ASSETS, PriceTick } from '../../config/assets.ts';
import { fetchIndonesiaMacro, fetchMorningBrief, fetchYieldCurve, type BriefResponse, type IndonesiaMacro, type YieldCurve } from '../../services/marketDataService.ts';
import { latest } from '../../utils/macro.ts';
import { EXCHANGE_HOURS, isExchangeOpen } from '../../utils/marketHours.ts';
import { MOVER_WINDOWS, MoverWindow, changeForWindow, liveHistory, rankMovers } from '../../utils/movers.ts';
import { formatNumber } from '../../utils/format.ts';
import { usePriceFlash, flashClass } from '../../hooks/usePriceFlash.ts';
import {
  PanelMessage,
  TerminalPanel,
  changeColor,
  formatTerminalPct,
  formatTerminalTick,
  isTickUsable,
} from './TerminalPanel.tsx';

interface PanelProps {
  ticks: Record<string, PriceTick>;
  onSelect: (symbol: string) => void;
  highlighted?: boolean;
  className?: string;
}

function TabButton({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className="px-1.5 h-5 text-[10px] font-bold"
      style={{ backgroundColor: active ? 'var(--t-amber)' : 'transparent', color: active ? '#05070A' : 'var(--t-muted)', borderRadius: 2 }}
    >
      {children}
    </button>
  );
}

// ---- MOV ------------------------------------------------------------------------------------

export function MoversTerminalPanel({ ticks, onSelect, highlighted, className }: PanelProps) {
  const [win, setWin] = useState<MoverWindow>('now');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2_000);
    return () => clearInterval(t);
  }, []);
  const { gainers, losers } = rankMovers(ASSETS, (a) => changeForWindow(ticks[a.symbol], win, liveHistory, now), 8, win === 'now' ? 0.001 : 0);
  const coverage = liveHistory.coverageMs(now);

  const list = (rows: typeof gainers, label: string) => (
    <div className="min-w-0">
      <div className="px-2 py-1 text-[10px] font-bold tracking-widest" style={{ color: 'var(--t-muted)' }}>
        {label}
      </div>
      {rows.length === 0 ? (
        <div className="px-2 pb-2 text-[11px]" style={{ color: 'var(--t-muted)' }}>{tr('term.mov.noMove')}</div>
      ) : (
        <table className="w-full text-[11px]">
          <tbody>
            {rows.map(({ item, value }) => (
              <tr key={item.id} onClick={() => onSelect(item.symbol)} className="cursor-pointer border-t" style={{ borderColor: 'var(--t-line)' }}>
                <td className="px-2 py-1 font-bold" style={{ color: 'var(--t-amber)' }}>{item.code}</td>
                <td className="px-2 py-1 text-right" style={{ color: 'var(--t-text)' }}>{formatTerminalTick(ticks[item.symbol], item)}</td>
                <td className="px-2 py-1 text-right font-bold" style={{ color: changeColor(value) }}>{formatTerminalPct(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <TerminalPanel
      id="panel-mov"
      className={className}
      title={tr('term.title.mov')}
      subtitle={win === 'now' ? tr('term.mov.live', { n: Math.min(5, Math.floor(coverage / 60_000)) }) : tr(`movers.win.${win}.hint` as TranslationKey)}
      highlighted={highlighted}
      right={
        <div className="flex" role="group" aria-label={tr('term.mov.window')}>
          {MOVER_WINDOWS.map((w) => (
            <TabButton key={w.key} active={win === w.key} onClick={() => setWin(w.key)} title={tr(`movers.win.${w.key}.hint` as TranslationKey)}>
              {w.key === 'now' ? '5M' : w.label}
            </TabButton>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-1">
        {list(gainers, tr('term.mov.gainers'))}
        {list(losers, tr('term.mov.losers'))}
      </div>
    </TerminalPanel>
  );
}

// ---- WEI ------------------------------------------------------------------------------------

const INDEX_ASSETS = ASSETS.filter((a) => a.group === 'index');

function localTime(exchange: string, now: number): string {
  const tz = (EXCHANGE_HOURS as Record<string, { timeZone: string }>)[exchange]?.timeZone;
  if (!tz) return '--:--';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export function WorldIndicesPanel({ ticks, onSelect, highlighted, className }: PanelProps) {
  const flash = usePriceFlash(ticks);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <TerminalPanel id="panel-wei" className={className} title={tr('term.title.wei')} subtitle={tr('term.wei.sub')} highlighted={highlighted} bodyClassName="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left" style={{ color: 'var(--t-muted)' }}>
            <th className="px-2 py-1 font-medium">{tr('term.col.code')}</th>
            <th className="px-2 py-1 font-medium hidden lg:table-cell">{tr('term.col.name')}</th>
            <th className="px-2 py-1 font-medium text-right">{tr('term.col.last')}</th>
            <th className="px-2 py-1 font-medium text-right">%24H</th>
            <th className="px-2 py-1 font-medium text-right hidden sm:table-cell">%7D</th>
            <th className="px-2 py-1 font-medium text-right">{tr('term.col.mkt')}</th>
          </tr>
        </thead>
        <tbody>
          {INDEX_ASSETS.map((a) => {
            const t = ticks[a.symbol];
            const usable = isTickUsable(t);
            const open = isExchangeOpen(a.exchange, now);
            const f = flash[a.symbol];
            return (
              <tr key={a.id} onClick={() => onSelect(a.symbol)} className="cursor-pointer border-t" style={{ borderColor: 'var(--t-line)' }}>
                <td className="px-2 py-1 font-bold" style={{ color: 'var(--t-amber)' }}>{a.code}</td>
                <td className="px-2 py-1 hidden lg:table-cell truncate max-w-40" style={{ color: 'var(--t-muted)' }}>{a.name}</td>
                <td key={`p-${f?.n ?? 0}`} className={`px-2 py-1 text-right ${flashClass(f)}`} style={{ color: 'var(--t-text)' }}>
                  {usable ? formatTerminalTick(t, a) : 'N/A'}
                </td>
                <td className="px-2 py-1 text-right" style={{ color: changeColor(t?.changePct24h) }}>{formatTerminalPct(t?.changePct24h)}</td>
                <td className="px-2 py-1 text-right hidden sm:table-cell" style={{ color: changeColor(t?.changePct7d) }}>{formatTerminalPct(t?.changePct7d)}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap" style={{ color: open ? 'var(--t-up)' : 'var(--t-muted)' }}>
                  {open ? 'OPEN' : 'CLSD'} {localTime(a.exchange, now)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TerminalPanel>
  );
}

// ---- FXC ------------------------------------------------------------------------------------

const FX_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'SGD', 'AUD', 'MYR', 'IDR'];

function formatCross(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1000) return formatNumber(v, 0);
  if (abs >= 10) return formatNumber(v, 2);
  if (abs >= 0.1) return formatNumber(v, 4);
  return v.toExponential(2);
}

export function FxCrossPanel({ ticks, highlighted, className }: Omit<PanelProps, 'onSelect'>) {
  // Rupiah value of one unit of each currency, plus its 24h change
  const rates = useMemo(() => {
    const out: Record<string, { idr: number; ch: number } | null> = { IDR: { idr: 1, ch: 0 } };
    for (const code of FX_CODES) {
      if (code === 'IDR') continue;
      const t = ticks[`${code}/IDR`];
      out[code] = isTickUsable(t) ? { idr: t.price, ch: (t.changePct24h ?? 0) / 100 } : null;
    }
    return out;
  }, [ticks]);
  return (
    <TerminalPanel id="panel-fxc" className={className} title={tr('term.title.fxc')} subtitle={tr('term.fxc.sub')} highlighted={highlighted} bodyClassName="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr style={{ color: 'var(--t-amber)' }}>
            <th className="px-1.5 py-1" />
            {FX_CODES.map((c) => (
              <th key={c} className="px-1.5 py-1 text-right font-bold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FX_CODES.map((row) => (
            <tr key={row} className="border-t" style={{ borderColor: 'var(--t-line)' }}>
              <th className="px-1.5 py-1 text-left font-bold" style={{ color: 'var(--t-amber)' }}>{row}</th>
              {FX_CODES.map((col) => {
                const r = rates[row];
                const c = rates[col];
                if (row === col) {
                  return <td key={col} className="px-1.5 py-1 text-right" style={{ color: 'var(--t-muted)' }}>—</td>;
                }
                if (!r || !c) return <td key={col} className="px-1.5 py-1 text-right" style={{ color: 'var(--t-muted)' }}>N/A</td>;
                const value = r.idr / c.idr;
                const ch = ((1 + r.ch) / (1 + c.ch) - 1) * 100;
                return (
                  <td key={col} className="px-1.5 py-1 text-right whitespace-nowrap" style={{ color: changeColor(Math.abs(ch) < 0.005 ? 0 : ch) }} title={`${formatTerminalPct(ch)} 24h`}>
                    {formatCross(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </TerminalPanel>
  );
}

// ---- CURV -----------------------------------------------------------------------------------

export function YieldCurvePanel({ highlighted, className }: { highlighted?: boolean; className?: string }) {
  const [data, setData] = useState<YieldCurve | null>(null);
  const [error, setError] = useState(false);
  const load = () =>
    fetchYieldCurve()
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const pts = data?.points ?? [];
  const short = pts.find((p) => p.tenor === '3M');
  const ten = pts.find((p) => p.tenor === '10Y');
  const spread = short && ten ? ten.yield - short.yield : null;

  // Chart: x by tenor index, y by yield
  const W = 300;
  const H = 110;
  const all = pts.flatMap((p) => [p.yield, p.monthAgo ?? p.yield]);
  const lo = Math.min(...all, Infinity) - 0.1;
  const hi = Math.max(...all, -Infinity) + 0.1;
  const x = (i: number) => 24 + (i * (W - 40)) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - 16 - ((v - lo) / (hi - lo || 1)) * (H - 28);
  const line = (key: 'yield' | 'monthAgo') =>
    pts
      .map((p, i) => (p[key] === null ? null : `${x(i).toFixed(1)},${y(p[key] as number).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');

  return (
    <TerminalPanel id="panel-curv" className={className} title={tr('term.title.curv')} subtitle={tr('term.curv.sub')} highlighted={highlighted}>
      {error && !data ? (
        <PanelMessage kind="error" onRetry={load} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : (
        <div className="p-2 space-y-2">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" role="img" aria-label={tr('term.curv.aria')}>
            <polyline points={line('monthAgo')} fill="none" stroke="var(--t-muted)" strokeDasharray="4 3" strokeWidth="1.2" />
            <polyline points={line('yield')} fill="none" stroke="var(--t-amber)" strokeWidth="2" />
            {pts.map((p, i) => (
              <g key={p.tenor}>
                <circle cx={x(i)} cy={y(p.yield)} r="2.5" fill="var(--t-amber)" />
                <text x={x(i)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--t-muted)">{p.tenor}</text>
                <text x={x(i)} y={y(p.yield) - 6} textAnchor="middle" fontSize="9" fill="var(--t-text)">{p.yield.toFixed(2)}</text>
              </g>
            ))}
          </svg>
          <table className="w-full text-[11px]">
            <thead>
              <tr style={{ color: 'var(--t-muted)' }} className="text-left">
                <th className="py-0.5 font-medium">{tr('term.col.tenor')}</th>
                <th className="py-0.5 font-medium text-right">{tr('term.col.yield')}</th>
                <th className="py-0.5 font-medium text-right">{tr('term.col.dday')}</th>
                <th className="py-0.5 font-medium text-right">Δ 1M</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => {
                const d = p.prevClose === null ? null : (p.yield - p.prevClose) * 100;
                const m = p.monthAgo === null ? null : (p.yield - p.monthAgo) * 100;
                return (
                  <tr key={p.tenor} className="border-t" style={{ borderColor: 'var(--t-line)' }}>
                    <td className="py-0.5 font-bold" style={{ color: 'var(--t-amber)' }}>{p.tenor}</td>
                    <td className="py-0.5 text-right">{p.yield.toFixed(3)}%</td>
                    <td className="py-0.5 text-right" style={{ color: changeColor(d ?? undefined) }}>{d === null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}bp`}</td>
                    <td className="py-0.5 text-right" style={{ color: changeColor(m ?? undefined) }}>{m === null ? '—' : `${m >= 0 ? '+' : ''}${m.toFixed(0)}bp`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {spread !== null && (
            <p className="text-[10px] leading-snug" style={{ color: spread < 0 ? 'var(--t-down)' : 'var(--t-muted)' }}>
              {tr('term.curv.spread', { v: `${spread >= 0 ? '+' : ''}${(spread * 100).toFixed(0)}` })}{' '}
              {spread < 0 ? tr('term.curv.inverted') : tr('term.curv.normal')}
            </p>
          )}
        </div>
      )}
    </TerminalPanel>
  );
}

// ---- IDMACRO --------------------------------------------------------------------------------

export function IdMacroPanel({ highlighted, className }: { highlighted?: boolean; className?: string }) {
  const [data, setData] = useState<IndonesiaMacro | null>(null);
  const [error, setError] = useState(false);
  const load = () =>
    fetchIndonesiaMacro()
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60_000);
    return () => clearInterval(t);
  }, []);
  const bi = data?.biRate.at(-1);
  return (
    <TerminalPanel id="panel-idmacro" className={className} title={tr('term.title.idmacro')} subtitle={tr('term.idm.sub')} highlighted={highlighted}>
      {error && !data ? (
        <PanelMessage kind="error" onRetry={load} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : (
        <table className="w-full text-[11px]">
          <tbody>
            {bi && (
              <tr className="border-t" style={{ borderColor: 'var(--t-line)' }}>
                <td className="px-2 py-1 font-bold" style={{ color: 'var(--t-amber)' }}>BI-RATE</td>
                <td className="px-2 py-1 text-right" style={{ color: 'var(--t-text)' }}>{bi.value.toFixed(2)}%</td>
                <td className="px-2 py-1 text-right" style={{ color: 'var(--t-muted)' }}>{bi.date}</td>
              </tr>
            )}
            {data.series
              .filter((s) => s.frequency !== 'annual')
              .map((s) => {
                const l = latest(s.points);
                if (!l) return null;
                const val = s.unit === 'Rp' ? formatNumber(l.value, 0) : s.unit === 'US$ bn' ? `$${l.value.toFixed(1)}B` : `${l.value.toFixed(2)}%`;
                return (
                  <tr key={s.id} className="border-t" style={{ borderColor: 'var(--t-line)' }}>
                    <td className="px-2 py-1" style={{ color: 'var(--t-muted)' }}>{tOr(`macro.s.${s.id}`, s.label).toUpperCase()}</td>
                    <td className="px-2 py-1 text-right" style={{ color: 'var(--t-text)' }}>{val}</td>
                    <td className="px-2 py-1 text-right whitespace-nowrap" style={{ color: 'var(--t-muted)' }}>{l.date.slice(0, 7)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
    </TerminalPanel>
  );
}

// ---- BRIEF ----------------------------------------------------------------------------------

export function BriefPanel({ highlighted, className }: { highlighted?: boolean; className?: string }) {
  const tt = useT();
  const lang = useLang();
  const [data, setData] = useState<BriefResponse | null>(null);
  const [error, setError] = useState(false);
  const load = () =>
    fetchMorningBrief()
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60_000);
    return () => clearInterval(t);
  }, [lang]);
  return (
    <TerminalPanel id="panel-brief" className={className} title={tt('term.title.brief')} subtitle={`BRIEF · ${data?.brief.date ?? ''}${data?.preview ? ` · ${tt('briefv.previewShort')}` : ''}`} highlighted={highlighted}>
      {error && !data ? (
        <PanelMessage kind="error" onRetry={load} />
      ) : !data ? (
        <PanelMessage kind="loading" />
      ) : (
        <div className="px-2 py-1.5 space-y-1.5 text-[11px]">
          {data.brief.sections
            .filter((s) => s.id !== 'forward')
            .map((s) => (
              <div key={s.id}>
                <div className="font-bold" style={{ color: 'var(--t-amber)' }}>{s.title.toUpperCase()}</div>
                {s.lines.slice(0, 6).map((l, i) => (
                  <div key={i} style={{ color: 'var(--t-text)' }}>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          <div style={{ color: 'var(--t-muted)' }}>{data.brief.disclaimer}</div>
        </div>
      )}
    </TerminalPanel>
  );
}
