/**
 * IndonesianStocksView.tsx — "Indonesian Stocks" page (#/idx): every stock listed on the
 * Indonesia Stock Exchange with search, sector and board filters, sorting by market cap, daily
 * or weekly change and value traded, pagination, and today's top gainers / losers / most active.
 * The full list comes from the server's background sweep (every 5 min while IDX is open, 30 min
 * when closed); rows on screen are also priced every 10 s. IDX prices are delayed.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Star, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { ALL_ASSETS, AssetConfig, PriceTick } from '../config/assets.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { fetchIdxSnapshot, type IdxRow, type IdxSnapshot } from '../services/marketDataService.ts';
import { formatIdrCompact, formatPercent, formatRupiah } from '../utils/format.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';
import { Pct } from './MarketTable.tsx';

const IDX_ASSETS = ALL_ASSETS.filter((a) => a.group === 'idStock');
const SECTORS = [...new Set(IDX_ASSETS.map((a) => a.sector).filter((s): s is string => Boolean(s)))].sort();
const BOARDS = [...new Set(IDX_ASSETS.map((a) => a.board).filter((s): s is string => Boolean(s)))].sort();
const PAGE_SIZE = 50;

type SortKey = 'marketCap' | 'day' | 'week' | 'value' | 'code';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'marketCap', label: 'Market cap' },
  { key: 'day', label: '% day' },
  { key: 'week', label: '% week' },
  { key: 'value', label: 'Value traded' },
  { key: 'code', label: 'Code' },
];

interface Row {
  asset: AssetConfig;
  price: number | null;
  day: number | null;
  week: number | null;
  value: number | null;
  marketCap: number | null;
  updatedAt: number | null;
  failed: boolean;
}

interface IndonesianStocksViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
}

export function IndonesianStocksView({ ticks, onSelectAsset, watchlist, onToggleWatchlist }: IndonesianStocksViewProps) {
  const [snap, setSnap] = useState<IdxSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('');
  const [board, setBoard] = useState('');
  const [sort, setSort] = useState<SortKey>('marketCap');
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchIdxSnapshot()
        .then((d) => {
          if (!alive) return;
          setSnap(d);
          setState('ready');
        })
        .catch(() => alive && setState((s) => (s === 'ready' ? s : 'error')));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [reload]);

  // Merge the sweep with fresher on-screen quotes (core IDX stocks are always live in ticks)
  const rows = useMemo<Row[]>(() => {
    const bySymbol = new Map<string, IdxRow>((snap?.rows ?? []).map((r) => [r.symbol, r]));
    return IDX_ASSETS.map((asset) => {
      const r = bySymbol.get(asset.symbol);
      const t = ticks[asset.symbol];
      const live = t && t.status !== 'error' && Number.isFinite(t.price) ? t : undefined;
      const price = live?.price ?? r?.price ?? null;
      return {
        asset,
        price,
        day: live?.changePct24h ?? r?.changePct24h ?? null,
        week: live?.changePct7d ?? r?.changePct7d ?? null,
        value: live?.valueTraded ?? r?.valueTraded ?? null,
        marketCap: price !== null && asset.supply ? price * asset.supply : r?.marketCapIdr ?? null,
        updatedAt: live?.updatedAt ?? r?.updatedAt ?? null,
        failed: price === null && Boolean(snap),
      };
    });
  }, [snap, ticks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!sector || r.asset.sector === sector) &&
        (!board || r.asset.board === board) &&
        (!q ||
          r.asset.shortName.toLowerCase().includes(q) ||
          r.asset.name.toLowerCase().includes(q) ||
          r.asset.keywords?.some((k) => k.includes(q)))
    );
    const val = (r: Row): number | string | null =>
      sort === 'code' ? r.asset.shortName : sort === 'day' ? r.day : sort === 'week' ? r.week : sort === 'value' ? r.value : r.marketCap;
    return list.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1; // missing data always last
      if (vb === null) return -1;
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return desc ? -cmp : cmp;
    });
  }, [rows, query, sector, board, sort, desc]);

  useEffect(() => setPage(0), [query, sector, board, sort, desc]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useTrackedSymbols(pageRows.map((r) => r.asset.symbol));

  const priced = rows.filter((r) => r.price !== null);
  const top = (pick: (r: Row) => number | null, dir: 1 | -1) =>
    priced
      .filter((r) => pick(r) !== null && (dir === 1 ? (pick(r) as number) > 0 : (pick(r) as number) < 0))
      .sort((a, b) => dir * ((pick(b) as number) - (pick(a) as number)))
      .slice(0, 6);
  const gainers = top((r) => r.day, 1);
  const losers = top((r) => r.day, -1);
  const active = [...priced].filter((r) => r.value).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6);

  const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
  const select = 'px-2.5 py-2 rounded-lg border text-xs bg-transparent';

  return (
    <div className="space-y-6">
      <section className="p-5 md:p-6 rounded-xl border space-y-2" style={card}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          <span>Indonesia Stock Exchange</span>
          <span aria-hidden="true">·</span>
          <span>{IDX_ASSETS.length} listed stocks</span>
          <span aria-hidden="true">·</span>
          <span>{snap?.marketOpen ? 'Market open' : 'Market closed'}</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Indonesian Stocks</h1>
        <p className="text-sm max-w-3xl" style={{ color: 'var(--text-secondary)' }}>
          Every stock on the IDX (list from idx.co.id, updated {snap?.listUpdated ?? '—'}). Prices from Yahoo Finance are
          delayed; the full list refreshes every {snap ? Math.round(snap.refreshMs / 60_000) : 5} minutes
          {snap?.sweptAt ? ` (last ${formatRelativeTime(snap.sweptAt).replace('updated ', '')})` : ''}, and rows on your screen
          every 10 seconds. Value traded ≈ price × volume.
        </p>
      </section>

      {state === 'error' && !snap ? (
        <div className="p-6 rounded-xl border text-sm space-y-3" style={card} role="alert">
          <p>Data unavailable</p>
          <button
            type="button"
            onClick={() => setReload((r) => r + 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4" aria-label="Today's IDX movers">
            <MoverCard title="Top gainers today" icon={<TrendingUp className="w-4 h-4" />} color="var(--color-up)" rows={gainers} metric={(r) => formatPercent(r.day ?? undefined)} onSelect={onSelectAsset} loading={!snap} />
            <MoverCard title="Top losers today" icon={<TrendingDown className="w-4 h-4" />} color="var(--color-down)" rows={losers} metric={(r) => formatPercent(r.day ?? undefined)} onSelect={onSelectAsset} loading={!snap} />
            <MoverCard title="Most active (value traded)" icon={<Zap className="w-4 h-4" />} color="var(--accent-radar)" rows={active} metric={(r) => formatIdrCompact(r.value)} onSelect={onSelectAsset} loading={!snap} />
          </section>

          <section className="space-y-3" aria-labelledby="idx-table-heading">
            <h2 id="idx-table-heading" className="sr-only">
              All Indonesian stocks
            </h2>
            <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by code, name or industry (BBRI, bank, coal…)"
                aria-label="Filter Indonesian stocks"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm bg-transparent"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <div className="grid grid-cols-2 sm:flex gap-2">
                <select aria-label="Sector" value={sector} onChange={(e) => setSector(e.target.value)} className={select} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)' }}>
                  <option value="">All sectors</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select aria-label="Listing board" value={board} onChange={(e) => setBoard(e.target.value)} className={select} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)' }}>
                  <option value="">All boards</option>
                  {BOARDS.map((b) => (
                    <option key={b} value={b}>
                      {b} board
                    </option>
                  ))}
                </select>
                <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={select} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)' }}>
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      Sort: {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setDesc((d) => !d)}
                  className="px-2.5 py-2 rounded-lg border text-xs font-semibold"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  aria-label={desc ? 'Sorted high to low, switch to low to high' : 'Sorted low to high, switch to high to low'}
                >
                  {desc ? 'High → low' : 'Low → high'}
                </button>
              </div>
            </div>

            <div className="rounded-xl border overflow-hidden" style={card}>
              <table className="w-full text-sm table-fixed sm:table-auto">
                <caption className="sr-only">Indonesian stocks</caption>
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-left" style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <th scope="col" className="px-2 sm:px-3 py-2 font-semibold">Stock</th>
                    <th scope="col" className="px-3 py-2 font-semibold hidden lg:table-cell">Sector</th>
                    <th scope="col" className="px-2 sm:px-3 py-2 font-semibold text-right w-[34%] sm:w-auto">Price</th>
                    <th scope="col" className="px-2 sm:px-3 py-2 font-semibold text-right w-[20%] sm:w-auto">Day</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-right hidden sm:table-cell">Week</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-right hidden md:table-cell">Value traded</th>
                    <th scope="col" className="px-3 py-2 font-semibold text-right hidden md:table-cell">Market cap</th>
                    <th scope="col" className="px-1 py-2 w-9">
                      <span className="sr-only">Watchlist</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const starred = watchlist.includes(r.asset.symbol);
                    return (
                      <tr
                        key={r.asset.symbol}
                        onClick={() => onSelectAsset(r.asset.symbol)}
                        className="border-t cursor-pointer hover:bg-[var(--bg-surface-subtle)]"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <td className="px-2 sm:px-3 py-2 min-w-0">
                          <span className="font-bold font-mono-num text-[13px] block">{r.asset.shortName}</span>
                          <span className="text-[11px] truncate block" style={{ color: 'var(--text-secondary)' }} title={r.asset.name}>
                            {r.asset.name}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>
                          {r.asset.sector}
                          <span className="block text-[10px]">{r.asset.industry}</span>
                        </td>
                        {r.price === null ? (
                          <td colSpan={5} className="px-2 sm:px-3 py-2 text-xs" style={{ color: r.failed ? 'var(--color-down)' : 'var(--text-secondary)' }}>
                            {r.failed ? 'Data unavailable' : 'Loading…'}
                          </td>
                        ) : (
                          <>
                            <td className="px-2 sm:px-3 py-2 text-right font-mono-num font-semibold text-xs sm:text-[13px] whitespace-nowrap">
                              {formatRupiah(r.price)}
                            </td>
                            <td className="px-2 sm:px-3 py-2 text-right">
                              <Pct value={r.day ?? undefined} bold />
                            </td>
                            <td className="px-3 py-2 text-right hidden sm:table-cell">
                              <Pct value={r.week ?? undefined} />
                            </td>
                            <td className="px-3 py-2 text-right font-mono-num text-xs hidden md:table-cell">{formatIdrCompact(r.value)}</td>
                            <td className="px-3 py-2 text-right font-mono-num text-xs hidden md:table-cell">{formatIdrCompact(r.marketCap)}</td>
                          </>
                        )}
                        <td className="px-1 py-2 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleWatchlist(r.asset.symbol);
                            }}
                            aria-label={starred ? `Remove ${r.asset.name} from Watchlist` : `Add ${r.asset.name} to Watchlist`}
                            aria-pressed={starred}
                            className="p-1 rounded"
                            style={{ color: starred ? 'var(--color-gold)' : 'var(--text-secondary)' }}
                          >
                            <Star className="w-4 h-4" fill={starred ? 'currentColor' : 'none'} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
                        No stock matches these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>
                {filtered.length} stocks · page {page + 1} of {pages}
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  type="button"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border disabled:opacity-40"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MoverCard({
  title,
  icon,
  color,
  rows,
  metric,
  onSelect,
  loading,
}: {
  title: string;
  icon: ReactNode;
  color: string;
  rows: Row[];
  metric: (r: Row) => string;
  onSelect: (symbol: string) => void;
  loading: boolean;
}) {
  return (
    <div className="p-4 rounded-xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}>
      <h3 className="text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color }}>
        {icon}
        {title}
      </h3>
      {loading ? (
        <p className="text-xs py-3" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-xs py-3" style={{ color: 'var(--text-secondary)' }}>
          No data yet today.
        </p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li key={r.asset.symbol}>
              <button
                type="button"
                onClick={() => onSelect(r.asset.symbol)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-left hover:bg-[var(--bg-surface-subtle)]"
              >
                <span className="min-w-0">
                  <span className="font-mono-num font-bold text-[13px]">{r.asset.shortName}</span>
                  <span className="text-[11px] ml-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {r.asset.name}
                  </span>
                </span>
                <span className="font-mono-num text-xs font-bold shrink-0" style={{ color }}>
                  {metric(r)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
