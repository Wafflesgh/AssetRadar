/**
 * App.tsx — Root component: holds the global state (live prices, connection state, theme,
 * timeframe, watchlist, selected asset), syncs it with the URL hash, and lays out the page
 * (desktop sidebar / mobile bottom nav, header, the active view and the disclaimer footer).
 */
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Sun, Moon, Wifi } from 'lucide-react';
import {
  ASSETS,
  getAssetBySymbol,
  PriceTick,
  TimeframeInterval,
} from './config/assets.ts';
import {
  getSavedTheme,
  saveTheme,
  resolveEffectiveTheme,
  ThemePreference,
  getSavedTimeframe,
  saveTimeframe,
  getSavedWatchlist,
  saveWatchlist,
  getStartInTerminal,
  saveStartInTerminal,
} from './utils/storage.ts';
import {
  MarketDataManager,
  ConnectionState,
} from './services/marketDataService.ts';
import { parseHashRoute, buildHashRoute } from './utils/router.ts';
import { SidebarNav, BottomNav, NavTab } from './components/Navigation.tsx';
import { RadarLogo } from './components/RadarLogo.tsx';
import { RadarView } from './components/RadarView.tsx';
import { AssetDetailView } from './components/AssetDetailView.tsx';
import { WatchlistView } from './components/WatchlistView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { TerminalView } from './components/terminal/TerminalView.tsx';
import { GeoAlertBanner } from './components/GeoAlertBanner.tsx';
import { AdvisorView } from './components/AdvisorView.tsx';

// Lazy: the Risk Profile page pulls in recharts, which most visits never need
const RiskProfileView = lazy(() =>
  import('./components/RiskProfileView.tsx').then((m) => ({ default: m.RiskProfileView }))
);

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'radar';
    // The "Open the app in Terminal mode" option only applies when the URL has no hash
    if (!window.location.hash && getStartInTerminal()) return 'terminal';
    return parseHashRoute(window.location.hash).tab;
  });
  const [startInTerminal, setStartInTerminal] = useState<boolean>(() => getStartInTerminal());
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    if (typeof window === 'undefined') return 'BTC/IDR';
    return parseHashRoute(window.location.hash).assetSymbol ?? 'BTC/IDR';
  });
  const [ticks, setTicks] = useState<Record<string, PriceTick>>({});
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('live');
  const [timeframe, setTimeframe] = useState<TimeframeInterval>(() =>
    getSavedTimeframe()
  );
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    getSavedTheme()
  );
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() =>
    resolveEffectiveTheme(getSavedTheme())
  );
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    getSavedWatchlist()
  );

  const managerRef = useRef<MarketDataManager | null>(null);

  // Sync URL hash with browser Back/Forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) {
      window.history.replaceState(
        null,
        '',
        buildHashRoute(activeTab, selectedSymbol)
      );
    }

    const handleHashChange = () => {
      const parsed = parseHashRoute(window.location.hash);
      setActiveTab(parsed.tab);
      if (parsed.assetSymbol) {
        setSelectedSymbol(parsed.assetSymbol);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Start live market data manager on mount
  useEffect(() => {
    const manager = new MarketDataManager({
      onTicksUpdate: (updatedTicks) => {
        setTicks({ ...updatedTicks });
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
    });
    managerRef.current = manager;
    manager.start();

    return () => {
      manager.stop();
      managerRef.current = null;
    };
  }, []);

  // Sync theme with document root & system media query
  useEffect(() => {
    const updateTheme = () => {
      const resolved = resolveEffectiveTheme(themePreference);
      setEffectiveTheme(resolved);
      const root = document.documentElement;
      root.setAttribute('data-theme', resolved);
      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    updateTheme();

    if (
      themePreference === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia
    ) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => updateTheme();
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
  }, [themePreference]);

  const handleChangeThemePreference = useCallback((nextTheme: ThemePreference) => {
    setThemePreference(nextTheme);
    saveTheme(nextTheme);
  }, []);

  const handleToggleThemeQuick = useCallback(() => {
    const next: ThemePreference = effectiveTheme === 'dark' ? 'light' : 'dark';
    handleChangeThemePreference(next);
  }, [effectiveTheme, handleChangeThemePreference]);

  const handleChangeTimeframe = useCallback((nextInterval: TimeframeInterval) => {
    setTimeframe(nextInterval);
    saveTimeframe(nextInterval);
  }, []);

  const handleSelectTab = useCallback(
    (tab: NavTab) => {
      setActiveTab(tab);
      if (typeof window !== 'undefined') {
        const nextHash = buildHashRoute(tab, selectedSymbol);
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash;
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [selectedSymbol]
  );

  const handleSelectAsset = useCallback((symbol: string) => {
    const found = getAssetBySymbol(symbol);
    if (found) {
      setSelectedSymbol(found.symbol);
      setActiveTab('detail');
      if (typeof window !== 'undefined') {
        const nextHash = buildHashRoute('detail', found.symbol);
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash;
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleChangeStartInTerminal = useCallback((enabled: boolean) => {
    setStartInTerminal(enabled);
    saveStartInTerminal(enabled);
  }, []);

  const handleRetrySymbol = useCallback((symbol: string) => {
    managerRef.current?.retrySymbol(symbol);
  }, []);

  const handleToggleWatchlist = useCallback((symbol: string) => {
    setWatchlist((prev) => {
      const exists = prev.includes(symbol);
      const next = exists
        ? prev.filter((item) => item !== symbol)
        : [...prev, symbol];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const currentAsset = getAssetBySymbol(selectedSymbol) ?? ASSETS[0];
  const isTerminal = activeTab === 'terminal';

  // Connection status indicator color & label (green = live, yellow = reconnecting, grey = delayed/offline)
  const connColor =
    connectionState === 'live'
      ? 'var(--color-up)'
      : connectionState === 'reconnecting'
        ? 'var(--color-gold)'
        : 'var(--text-secondary)';

  const connLabel =
    connectionState === 'live'
      ? 'Live · Connected'
      : connectionState === 'reconnecting'
        ? 'Reconnecting...'
        : connectionState === 'offline'
          ? 'Offline – last data'
          : 'Delayed';

  return (
    <div
      className={`min-h-screen flex flex-col md:pl-64 ${isTerminal ? 'terminal-root' : ''}`}
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Desktop Sidebar Navigation */}
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        watchlistCount={watchlist.length}
        effectiveTheme={effectiveTheme}
        themePreference={themePreference}
        onToggleThemeQuick={handleToggleThemeQuick}
      />

      {/* Sudden war / attack alert (every page, including Terminal) */}
      <GeoAlertBanner ticks={ticks} />

      {/* Top Header Bar (Terminal has its own status bar) */}
      {!isTerminal && (
      <header
        className="sticky top-0 z-10 h-14 md:h-16 px-4 md:px-8 border-b flex items-center justify-between gap-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Left: Mobile Logo or Desktop Context Breadcrumb */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="md:hidden shrink-0">
            <RadarLogo size={28} />
          </div>
          <div className="flex items-center gap-2 text-sm font-bold tracking-tight truncate">
            <span className="md:hidden">AssetRadar</span>
            <span className="hidden md:inline" style={{ color: 'var(--text-secondary)' }}>
              AssetRadar
            </span>
            <span
              className="hidden md:inline"
              aria-hidden="true"
              style={{ color: 'var(--text-secondary)' }}
            >
              /
            </span>
            <span className="truncate">
              {activeTab === 'radar' && 'Market Radar'}
              {activeTab === 'detail' && `Asset Detail · ${currentAsset.shortName}`}
              {activeTab === 'watchlist' && 'Favorite Watchlist'}
              {activeTab === 'risk' && 'Risk Profile Education'}
              {activeTab === 'settings' && 'Settings & About'}
              {activeTab === 'advisor' && 'AI Advisor'}
            </span>
          </div>
        </div>

        {/* Right: Connection Status Indicator & Theme Switch */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            data-testid="connection-indicator"
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: connColor }}
          >
            <Wifi className="w-3.5 h-3.5 shrink-0" />
            <span>{connLabel}</span>
          </div>

          <button
            type="button"
            onClick={handleToggleThemeQuick}
            aria-label={
              effectiveTheme === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            }
            className="p-2 rounded-lg border transition-colors"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {effectiveTheme === 'dark' ? (
              <Moon className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />
            ) : (
              <Sun className="w-4 h-4" style={{ color: 'var(--color-gold)' }} />
            )}
          </button>
        </div>
      </header>
      )}

      {/* Main Content Area */}
      <main
        className={
          isTerminal
            ? 'flex-1 w-full min-w-0 pb-14 md:pb-0'
            : 'flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 pb-20 md:pb-10'
        }
      >
        {isTerminal && (
          <TerminalView
            ticks={ticks}
            connectionState={connectionState}
            initialSymbol={selectedSymbol}
            timeframe={timeframe}
            onChangeTimeframe={handleChangeTimeframe}
            onRetrySymbol={handleRetrySymbol}
            onGoToRadar={() => handleSelectTab('radar')}
            onGoToAdvisor={() => handleSelectTab('advisor')}
          />
        )}

        {activeTab === 'radar' && (
          <RadarView
            ticks={ticks}
            onSelectAsset={handleSelectAsset}
            onRetrySymbol={handleRetrySymbol}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {activeTab === 'detail' && (
          <AssetDetailView
            asset={currentAsset}
            tick={ticks[currentAsset.symbol]}
            onSelectAsset={handleSelectAsset}
            onBackToRadar={() => handleSelectTab('radar')}
            timeframe={timeframe}
            onChangeTimeframe={handleChangeTimeframe}
            effectiveTheme={effectiveTheme}
            isWatchlisted={watchlist.includes(currentAsset.symbol)}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistView
            watchlist={watchlist}
            ticks={ticks}
            onSelectAsset={handleSelectAsset}
            onRemoveFromWatchlist={handleToggleWatchlist}
            onGoToRadar={() => handleSelectTab('radar')}
          />
        )}

        {activeTab === 'risk' && (
          <Suspense
            fallback={
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Loading…
              </p>
            }
          >
            <RiskProfileView
              onSelectAsset={handleSelectAsset}
              onGoToAdvisor={() => handleSelectTab('advisor')}
            />
          </Suspense>
        )}

        {activeTab === 'advisor' && (
          <AdvisorView ticks={ticks} onSelectAsset={handleSelectAsset} />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            themePreference={themePreference}
            onChangeThemePreference={handleChangeThemePreference}
            defaultTimeframe={timeframe}
            onChangeDefaultTimeframe={handleChangeTimeframe}
            startInTerminal={startInTerminal}
            onChangeStartInTerminal={handleChangeStartInTerminal}
          />
        )}
      </main>

      {/* Mandatory Footer on Every Page (Spec Section 9) */}
      <footer
        className="border-t px-4 sm:px-6 md:px-8 py-4 mb-14 md:mb-0 text-xs"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="font-medium">
            Data is for information only, not investment advice. Charts by TradingView.
          </p>
          <p className="text-[11px]">
            AssetRadar · Personal Use (Non-Commercial)
          </p>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        watchlistCount={watchlist.length}
      />
    </div>
  );
}
