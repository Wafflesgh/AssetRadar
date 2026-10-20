/**
 * ScreenerView.tsx — IDX stock screener (#/screener): filters every listed Indonesian stock by
 * sector, board, price, 1-day/1-week change, value traded, market cap, P/E, P/B, ROE, net margin,
 * DER, dividend yield, Piotroski F-score and net income growth. Shows the server's statement-scan
 * progress and the period of each row's figures; stocks without data say "Not reported". Presets,
 * saved screens (synced), sortable columns, CSV download, click a row for the stock page, tick up
 * to 4 rows to compare. A screen filters reported numbers — it is not a recommendation.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Filter, GitCompare, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { fetchScreener, type ScreenerResponse } from '../services/marketDataService.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { ALL_ASSETS } from '../config/assets.ts';
import {
  applyScreen,
  FIELD_BY_KEY,
  FIELDS,
  fieldValue,
  parseScreens,
  PRESETS,
  screenerCsv,
  type FieldKey,
  type RangeFilter,
  type Screen,
  type ScreenerRow,
} from '../utils/screener.ts';
import { getScreensRaw, saveScreens } from '../utils/storage.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';

const IDX = ALL_ASSETS.filter((a) => a.group === 'idStock');
const SECTORS = [...new Set(IDX.map((a) => a.sector).filter((s): s is string => Boolean(s)))].sort();
const BOARDS = [...new Set(IDX.map((a) => a.board).filter((s): s is string => Boolean(s)))].sort();
const PAGE = 50;
const COLUMNS: FieldKey[] = ['price', 'chg1d', 'chg1w', 'valueTraded', 'marketCap', 'pe', 'pb', 'roe', 'netMargin', 'der', 'dividendYield', 'fScore', 'netIncomeYoY'];
const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const inputStyle = { backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };

const EMPTY: Screen = { id: 'custom', name: 'Custom', filters: [], sort: { field: 'marketCap', dir: 'desc' } };

function cell(row: ScreenerRow, key: FieldKey): { text: string; color?: string; missing?: boolean } {
  const def = FIELD_BY_KEY[key];
  const v = fieldValue(row, key);
  if (v === null) return { text: def.fundamental && row.f === undefined ? 'Scanning…' : 'Not reported', missing: true };
  const shown = v / def.scale;
  const text =
    key === 'price'
      ? shown.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : key === 'fScore'
        ? `${shown}/${row.f?.fScoreMax ?? 9}`
        : shown.toLocaleString('en-US', { minimumFractionDigits: def.digits, maximumFractionDigits: def.digits });
  const signed = key === 'chg1d' || key === 'chg1w' || key === 'netIncomeYoY';
  return { text: signed && v > 0 ? `+${text}` : text, color: signed ? (v > 0 ? 'var(--color-up)' : v < 0 ? 'var(--color-down)' : undefined) : undefined };
}

interface ScreenerViewProps {
  onSelectAsset: (symbol: string) => void;
  onCompare: (symbols: string[]) => void;
}

export function ScreenerView({ onSelectAsset, onCompare }: ScreenerViewProps) {
  const [data, setData] = useState<ScreenerResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [screen, setScreen] = useState<Screen>(EMPTY);
  const [saved, setSaved] = useState<Screen[]>(() => parseScreens(getScreensRaw()));
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const [saveName, setSaveName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => onSyncApplied(['screens'], () => setSaved(parseScreens(getScreensRaw()))), []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchScreener()
        .then((d) => {
          if (!alive) return;
          setData(d);
          setState('ready');
        })
        .catch(() => alive && setState((s) => (s === 'ready' ? s : 'error')));
    load();
    // While the server is still scanning, refresh every 30 s; otherwise every 5 min
    const id = setInterval(load, data?.scan.scanning ? 30_000 : 300_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [reload, data?.scan.scanning]);

  const result = useMemo(() => (data ? applyScreen(data.rows, screen) : { rows: [], missingData: 0 }), [data, screen]);
  useEffect(() => setPage(0), [screen]);
  const pages = Math.max(1, Math.ceil(result.rows.length / PAGE));
  const shown = result.rows.slice(page * PAGE, page * PAGE + PAGE);

  const setFilter = (field: FieldKey, side: 'min' | 'max', raw: string) => {
    const value = raw.trim() === '' ? undefined : Number(raw);
    if (value !== undefined && !Number.isFinite(value)) return;
    const others = screen.filters.filter((f) => f.field !== field);
    const current: RangeFilter = screen.filters.find((f) => f.field === field) ?? { field };
    const next = { ...current, [side]: value };
    setScreen({ ...screen, id: 'custom', filters: next.min === undefined && next.max === undefined ? others : [...others, next] });
  };
  const filterValue = (field: FieldKey, side: 'min' | 'max') => {
    const v = screen.filters.find((f) => f.field === field)?.[side];
    return v === undefined ? '' : String(v);
  };
  const sortBy = (field: FieldKey | 'code') => {
    const dir = screen.sort?.field === field && screen.sort.dir === 'desc' ? 'asc' : 'desc';
    setScreen({ ...screen, sort: { field, dir: field === 'code' && screen.sort?.field !== 'code' ? 'asc' : dir } });
  };
  const persist = (list: Screen[]) => {
    saveScreens(list);
    setSaved(list);
  };
  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name) return;
    const id = `scr-${Date.now().toString(36)}`;
    persist([...saved, { ...screen, id, name, custom: true }]);
    setScreen({ ...screen, id, name, custom: true });
    setSaveName('');
  };
  const download = () => {
    const blob = new Blob([screenerCsv(result.rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assetradar-screener-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const togglePick = (symbol: string) =>
    setPicked((p) => (p.includes(symbol) ? p.filter((x) => x !== symbol) : p.length >= 4 ? p : [...p, symbol]));

  const scan = data?.scan;
  const activeFilters = screen.filters.length + (screen.sectors?.length ? 1 : 0) + (screen.boards?.length ? 1 : 0) + (screen.query ? 1 : 0);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2">
          <Filter className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} /> IDX Stock Screener
        </h1>
        <p className="text-sm" style={muted}>
          Filter every stock listed on the Indonesia Stock Exchange by price, liquidity and the ratios of its latest financial statements.{' '}
          <strong>A screen filters reported numbers — it is not a recommendation.</strong>
        </p>
      </header>

      {state === 'error' && !data && (
        <div className="p-4 rounded-xl border text-sm flex items-center justify-between gap-3" style={card}>
          <span>Data unavailable.</span>
          <button type="button" onClick={() => { setState('loading'); setReload((n) => n + 1); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}
      {state === 'loading' && !data && <p className="text-sm" style={muted}>Loading the stock list…</p>}

      {scan && (
        <div className="p-3 rounded-xl border text-xs space-y-1.5" style={card}>
          <div className="flex flex-wrap justify-between gap-2">
            <span>
              Financial statements scanned: <strong className="font-mono-num">{scan.scanned}</strong> of {scan.total} stocks
              {' · '}with ratios: <span className="font-mono-num">{scan.withData}</span>
              {scan.scanning ? ' · scanning slowly in the background…' : scan.finishedAt ? ` · last full scan ${formatRelativeTime(scan.finishedAt)}` : ''}
            </span>
            <span style={muted}>Prices {data?.pricesAt ? formatRelativeTime(data.pricesAt) : '—'} (delayed) · {data?.source}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-surface-subtle)' }} role="progressbar" aria-valuemin={0} aria-valuemax={scan.total} aria-valuenow={scan.scanned} aria-label="Statement scan progress">
            <div className="h-full" style={{ width: `${(100 * scan.scanned) / Math.max(1, scan.total)}%`, backgroundColor: 'var(--accent-radar)' }} />
          </div>
          <p style={muted}>
            Ratios use the latest annual report, or the trailing 12 months when a newer quarterly report is complete; P/E, P/B and yield use the
            current price. Stocks without reported numbers show “Not reported”.
          </p>
        </div>
      )}

      {/* Presets and saved screens */}
      <div className="flex flex-wrap gap-2">
        {[...PRESETS, ...saved].map((p) => {
          const active = screen.id === p.id;
          return (
            <span key={p.id} className="inline-flex items-center rounded-full border text-xs font-semibold" style={{ borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)', backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface)' }}>
              <button type="button" onClick={() => setScreen(p)} className="px-3 py-1.5" style={{ color: active ? 'var(--accent-radar)' : 'var(--text-primary)' }}>
                {p.name}
              </button>
              {p.custom && (
                <button type="button" aria-label={`Delete saved screen ${p.name}`} onClick={() => persist(saved.filter((x) => x.id !== p.id))} className="pr-2.5" style={muted}>
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </span>
          );
        })}
        {activeFilters > 0 && (
          <button type="button" onClick={() => setScreen(EMPTY)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Filters */}
      <section className="p-3 md:p-4 rounded-xl border space-y-3" style={card} aria-label="Filters">
        <div className="flex flex-wrap items-center gap-2">
          <input value={screen.query ?? ''} onChange={(e) => setScreen({ ...screen, query: e.target.value })} placeholder="Code or name" aria-label="Filter by code or name" className="flex-1 min-w-[8rem] px-3 py-2 rounded-lg border text-sm" style={inputStyle} />
          <select value={screen.sectors?.[0] ?? ''} onChange={(e) => setScreen({ ...screen, sectors: e.target.value ? [e.target.value] : [] })} aria-label="Sector" className="px-2 py-2 rounded-lg border text-sm max-w-full" style={inputStyle}>
            <option value="">All sectors</option>
            {SECTORS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={screen.boards?.[0] ?? ''} onChange={(e) => setScreen({ ...screen, boards: e.target.value ? [e.target.value] : [] })} aria-label="Board" className="px-2 py-2 rounded-lg border text-sm" style={inputStyle}>
            <option value="">All boards</option>
            {BOARDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <button type="button" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} className="px-3 py-2 rounded-lg border text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
            {showFilters ? 'Hide ranges' : 'Show ranges'}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-2 text-xs">
                <span className="flex-1 min-w-0 truncate" title={f.label}>
                  {f.label}
                </span>
                <input inputMode="decimal" value={filterValue(f.key, 'min')} onChange={(e) => setFilter(f.key, 'min', e.target.value)} placeholder="min" aria-label={`${f.label} minimum`} className="w-16 px-2 py-1 rounded border font-mono-num" style={inputStyle} />
                <input inputMode="decimal" value={filterValue(f.key, 'max')} onChange={(e) => setFilter(f.key, 'max', e.target.value)} placeholder="max" aria-label={`${f.label} maximum`} className="w-16 px-2 py-1 rounded border font-mono-num" style={inputStyle} />
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this screen" aria-label="Name for the saved screen" className="flex-1 min-w-[8rem] px-3 py-1.5 rounded-lg border text-xs" style={inputStyle} />
          <button type="button" onClick={saveCurrent} disabled={!saveName.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
            <Save className="w-3.5 h-3.5" /> Save screen
          </button>
          <button type="button" onClick={download} disabled={!result.rows.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </section>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            <strong className="font-mono-num">{result.rows.length}</strong> stocks match
            {result.missingData > 0 && (
              <span style={muted}> · {result.missingData} more left out because a filtered number is not reported (or not scanned yet)</span>
            )}
          </span>
          {picked.length > 0 && (
            <span className="inline-flex items-center gap-2">
              <span style={muted}>{picked.length}/4 picked</span>
              <button type="button" disabled={picked.length < 2} onClick={() => onCompare(picked)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
                <GitCompare className="w-3.5 h-3.5" /> Compare
              </button>
              <button type="button" onClick={() => setPicked([])} className="text-xs underline" style={muted}>
                clear
              </button>
            </span>
          )}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border" style={card}>
          <table className="w-full text-xs whitespace-nowrap">
            <caption className="sr-only">Screener results</caption>
            <thead>
              <tr style={muted}>
                <th className="p-2 text-left font-semibold">
                  <span className="sr-only">Pick to compare</span>
                </th>
                <th className="p-2 text-left font-semibold">
                  <button type="button" onClick={() => sortBy('code')}>
                    Stock {screen.sort?.field === 'code' ? (screen.sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                {COLUMNS.map((k) => (
                  <th key={k} className="p-2 text-right font-semibold" aria-sort={screen.sort?.field === k ? (screen.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <button type="button" onClick={() => sortBy(k)} title={FIELD_BY_KEY[k].label}>
                      {FIELD_BY_KEY[k].short} {screen.sort?.field === k ? (screen.sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                ))}
                <th className="p-2 text-left font-semibold">Figures</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.symbol} className="border-t cursor-pointer hover:opacity-80" style={{ borderColor: 'var(--border-subtle)' }} onClick={() => onSelectAsset(r.symbol)}>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.includes(r.symbol)} onChange={() => togglePick(r.symbol)} aria-label={`Pick ${r.code} to compare`} disabled={!picked.includes(r.symbol) && picked.length >= 4} />
                  </td>
                  <td className="p-2 max-w-[11rem]">
                    <span className="font-bold font-mono-num">{r.code}</span>
                    <span className="block truncate" style={muted} title={`${r.name} · ${r.sector} · ${r.board}`}>
                      {r.name}
                    </span>
                  </td>
                  {COLUMNS.map((k) => {
                    const c = cell(r, k);
                    return (
                      <td key={k} className={`p-2 text-right ${c.missing ? 'text-[10px]' : 'font-mono-num'}`} style={{ color: c.missing ? 'var(--text-secondary)' : c.color }}>
                        {c.text}
                      </td>
                    );
                  })}
                  <td className="p-2" style={muted}>
                    {r.f ? `${r.f.label}${r.f.basis === 'ttm' ? ' (TTM)' : ''}` : r.f === null ? 'Not reported' : 'Scanning…'}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 3} className="p-4 text-center text-sm" style={muted}>
                    No stock matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" className="p-1.5 rounded border disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono-num">
            {page + 1} / {pages}
          </span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page" className="p-1.5 rounded border disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <p className="text-[11px]" style={muted}>
        Educational information, not investment advice. Figures come from Yahoo Finance and may be incomplete or late; check the company's
        official reports before relying on them.
      </p>
    </div>
  );
}
