/**
 * AssetSearch.tsx — Search box with a results dropdown for picking any of the tracked assets
 * by code, name or keyword ("bbca", "nvidia", "crude oil", "nikkei"). Keyboard friendly:
 * ↑/↓ to move, Enter to pick, Esc to close. Results show the live price and 24h change (stocks
 * outside the core price loop are priced as soon as they appear), and the header search also
 * offers the last 5 picks.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Clock, Search, X } from 'lucide-react';
import { ASSET_GROUPS, AssetConfig, PriceTick, getAssetBySymbol, searchAssets } from '../config/assets.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { formatAssetPrice, formatPercent } from '../utils/format.ts';
import { getRecentSearches, saveRecentSearch } from '../utils/storage.ts';

const GROUP_LABEL: Record<string, string> = Object.fromEntries(ASSET_GROUPS.map((g) => [g.key, g.title]));

interface AssetSearchProps {
  onSelect: (asset: AssetConfig) => void;
  ticks?: Record<string, PriceTick>;
  placeholder?: string;
  /** Shown as the input's accessible name. */
  label?: string;
  /** Keep the chosen asset's name in the box after picking (for "current selection" pickers). */
  selected?: AssetConfig;
  className?: string;
  limit?: number;
  /** id of the input (so a keyboard shortcut can focus it). */
  inputId?: string;
  autoFocus?: boolean;
  /** Remember picks and show the last 5 when the box is empty. */
  recent?: boolean;
  /** Called after Escape (e.g. to close a full-screen search). */
  onEscape?: () => void;
  /** Render the results in the page flow instead of a floating dropdown (full-screen search). */
  inline?: boolean;
}

export function AssetSearch({
  onSelect,
  ticks,
  placeholder = 'Search assets: BBCA, Nvidia, gold, Nikkei, EUR…',
  label = 'Search assets',
  selected,
  className = '',
  limit = 12,
  inputId,
  autoFocus = false,
  recent = false,
  onEscape,
  inline = false,
}: AssetSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const [recentSymbols, setRecentSymbols] = useState<string[]>(() => (recent ? getRecentSearches() : []));
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    if (query.trim()) return searchAssets(query, limit);
    return recentSymbols.map((s) => getAssetBySymbol(s)).filter((a): a is AssetConfig => Boolean(a));
  }, [query, limit, recentSymbols]);
  const showingRecent = !query.trim() && results.length > 0;

  useEffect(() => setActive(0), [query]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (asset: AssetConfig) => {
    if (recent) {
      saveRecentSearch(asset.symbol);
      setRecentSymbols(getRecentSearches());
    }
    onSelect(asset);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      setOpen(false);
      onEscape?.();
    }
  };

  const showList = open && (query.trim().length > 0 || showingRecent);
  // Price what is listed (IDX universe stocks are not in the core loop)
  useTrackedSymbols(showList ? results.map((r) => r.symbol) : []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          autoFocus={autoFocus}
          type="search"
          role="combobox"
          aria-label={label}
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && results[active] ? `${listId}-${results[active].id}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={selected ? `${selected.code} · ${selected.name} — type to change` : placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 bg-transparent outline-none text-sm"
          style={{ color: 'var(--text-primary)' }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="p-0.5 rounded"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching assets"
          className={
            inline
              ? 'mt-2 overflow-y-auto rounded-lg border'
              : 'absolute z-40 left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-lg border shadow-lg'
          }
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {showingRecent && (
            <li role="presentation" className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <Clock className="w-3 h-3" /> Recent
            </li>
          )}
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              No asset matches "{query.trim()}".
            </li>
          ) : (
            results.map((asset, i) => {
              const tick = ticks?.[asset.symbol];
              const live = tick && tick.status !== 'error' && Number.isFinite(tick.price);
              const pct = tick?.changePct24h;
              return (
                <li
                  key={asset.id}
                  id={`${listId}-${asset.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // mousedown so the pick happens before the input blurs
                    e.preventDefault();
                    pick(asset);
                  }}
                  className="px-3 py-2 flex items-center justify-between gap-3 cursor-pointer text-sm"
                  style={{ backgroundColor: i === active ? 'var(--accent-radar-soft)' : 'transparent' }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold">{asset.shortName.length <= 6 ? asset.shortName : asset.code}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded truncate"
                        style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)' }}
                      >
                        {asset.sector ? `${GROUP_LABEL[asset.group]} · ${asset.sector}` : GROUP_LABEL[asset.group]}
                      </span>
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {asset.name}
                    </div>
                  </div>
                  {live && (
                    <div className="text-right shrink-0">
                      <div className="font-mono-num text-xs font-semibold tabular-nums">
                        {formatAssetPrice(tick.price, asset)}
                      </div>
                      <div
                        className="font-mono-num text-[11px] tabular-nums"
                        style={{
                          color:
                            pct === undefined || pct === 0
                              ? 'var(--text-secondary)'
                              : pct > 0
                                ? 'var(--color-up)'
                                : 'var(--color-down)',
                        }}
                      >
                        {formatPercent(pct)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
