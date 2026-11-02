/**
 * App.tsx — Root component: holds the global state (live prices, connection state, theme,
 * timeframe, watchlist, selected asset), syncs it with the URL hash, and lays out the page
 * (desktop sidebar / mobile bottom nav, header, the active view and the disclaimer footer).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sun, Moon, Wifi, CloudOff } from 'lucide-react';
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
  getSidebarCollapsed,
  saveSidebarCollapsed,
  getPortfolioTxs,
} from './utils/storage.ts';
import {
  MarketDataManager,
  ConnectionState,
  FeedMode,
} from './services/marketDataService.ts';
import { setUsdIdrRate } from './utils/format.ts';
import { parseHashRoute, buildHashRoute } from './utils/router.ts';
import { liveHistory } from './utils/movers.ts';
import { SidebarNav, BottomNav, NavTab } from './components/Navigation.tsx';
import { RadarLogo } from './components/RadarLogo.tsx';
import { RadarView } from './components/RadarView.tsx';
import { lazyPage, PageBoundary } from './components/PageBoundary.tsx';
import { AssetDetailView } from './components/AssetDetailView.tsx';
import { GeoAlertBanner } from './components/GeoAlertBanner.tsx';
import { HeaderSearch } from './components/HeaderSearch.tsx';
import { useTrackedSymbols } from './hooks/useTrackedSymbols.ts';
import { useT } from './i18n/index.ts';
import { LangToggle } from './components/LangToggle.tsx';
import { onSyncApplied, startSync, subscribeSync } from './services/syncService.ts';
import { checkLocalAlerts, initAlerts } from './services/alertService.ts';

// Radar and Asset detail are in the first download; every other page loads its code when opened
// (keeps recharts and the larger pages out of the first visit)
const RiskProfileView = lazyPage(() => import('./components/RiskProfileView.tsx').then((m) => ({ default: m.RiskProfileView })));
const PortfolioView = lazyPage(() => import('./components/PortfolioView.tsx').then((m) => ({ default: m.PortfolioView })));
const BacktestView = lazyPage(() => import('./components/BacktestView.tsx').then((m) => ({ default: m.BacktestView })));
const BriefView = lazyPage(() => import('./components/BriefView.tsx').then((m) => ({ default: m.BriefView })));
const FundArenaView = lazyPage(() => import('./components/FundArenaView.tsx').then((m) => ({ default: m.FundArenaView })));
const AnalystView = lazyPage(() => import('./components/AnalystView.tsx').then((m) => ({ default: m.AnalystView })));
const CompareView = lazyPage(() => import('./components/CompareView.tsx').then((m) => ({ default: m.CompareView })));
const ScreenerView = lazyPage(() => import('./components/ScreenerView.tsx').then((m) => ({ default: m.ScreenerView })));
const AlertsView = lazyPage(() => import('./components/AlertsView.tsx').then((m) => ({ default: m.AlertsView })));
const SectorRotationView = lazyPage(() => import('./components/SectorRotationView.tsx').then((m) => ({ default: m.SectorRotationView })));
const KitchenRadarView = lazyPage(() => import('./components/KitchenRadarView.tsx').then((m) => ({ default: m.KitchenRadarView })));
const IndonesiaMacroView = lazyPage(() => import('./components/IndonesiaMacroView.tsx').then((m) => ({ default: m.IndonesiaMacroView })));
const CryptoBinanceView = lazyPage(() => import('./components/CryptoBinanceView.tsx').then((m) => ({ default: m.CryptoBinanceView })));
const WatchlistView = lazyPage(() => import('./components/WatchlistView.tsx').then((m) => ({ default: m.WatchlistView })));
const SettingsView = lazyPage(() => import('./components/SettingsView.tsx').then((m) => ({ default: m.SettingsView })));
const TerminalView = lazyPage(() => import('./components/terminal/TerminalView.tsx').then((m) => ({ default: m.TerminalView })));
const AdvisorView = lazyPage(() => import('./components/AdvisorView.tsx').then((m) => ({ default: m.AdvisorView })));
const QuantSimView = lazyPage(() => import('./components/QuantSimView.tsx').then((m) => ({ default: m.QuantSimView })));
const PaperTradingView = lazyPage(() => import('./components/PaperTradingView.tsx').then((m) => ({ default: m.PaperTradingView })));
const StockStoryView = lazyPage(() => import('./components/StockStoryView.tsx').then((m) => ({ default: m.StockStoryView })));
const DividendsView = lazyPage(() => import('./components/DividendsView.tsx').then((m) => ({ default: m.DividendsView })));
const DcaView = lazyPage(() => import('./components/DcaView.tsx').then((m) => ({ default: m.DcaView })));
const HeatmapView = lazyPage(() => import('./components/HeatmapView.tsx').then((m) => ({ default: m.HeatmapView })));
const IndonesianStocksView = lazyPage(() => import('./components/IndonesianStocksView.tsx').then((m) => ({ default: m.IndonesianStocksView })));
const IdxCalendarView = lazyPage(() => import('./components/IdxCalendarView.tsx').then((m) => ({ default: m.IdxCalendarView })));

export default function App() {
  // Re-renders the whole app when the language changes
  const t = useT();
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window === 'undefined') return 'radar';
    // The "Open the app in Terminal mode" option only applies when the URL has no hash
    if (!window.location.hash && getStartInTerminal()) return 'terminal';
    return parseHashRoute(window.location.hash).tab;
  });
  const [startInTerminal, setStartInTerminal] = useState<boolean>(() => getStartInTerminal());
  // Binance pair shown on #/crypto/<PAIR> (undefined = the pair table)
  const [cryptoPair, setCryptoPair] = useState<string | undefined>(() =>
    typeof window === 'undefined' ? undefined : parseHashRoute(window.location.hash).pair
  );
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    if (typeof window === 'undefined') return 'BTC/IDR';
    return parseHashRoute(window.location.hash).assetSymbol ?? 'BTC/IDR';
  });
  const [compareSymbols, setCompareSymbols] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : parseHashRoute(window.location.hash).compare ?? []
  );
  const [ticks, setTicks] = useState<Record<string, PriceTick>>({});
  const [feedMode, setFeedMode] = useState<FeedMode>('polling');
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

  // Cross-device sync: start it, show a small warning in the header when it fails, and reload the
  // settings and watchlist when another device changed them
  const [syncFailed, setSyncFailed] = useState<string | null>(null);
  useEffect(() => {
    startSync();
    initAlerts();
    const unsub = subscribeSync((s) => setSyncFailed(s.loggedIn && s.lastError ? s.lastError : null));
    const off = onSyncApplied(['watchlist', 'settings'], () => {
      setWatchlist(getSavedWatchlist());
      setTimeframe(getSavedTimeframe());
      setThemePreference(getSavedTheme());
      setStartInTerminal(getStartInTerminal());
    });
    return () => {
      unsub();
      off();
    };
  }, []);

  // Sync URL hash with browser Back/Forward navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) {
      window.history.replaceState(
        null,
        '',
        buildHashRoute(activeTab, selectedSymbol, compareSymbols)
      );
    }

    const handleHashChange = () => {
      const parsed = parseHashRoute(window.location.hash);
      setActiveTab(parsed.tab);
      setCryptoPair(parsed.pair);
      if (parsed.compare) setCompareSymbols(parsed.compare);
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
        // Feed the live buffer behind the "moving fastest right now" tables
        liveHistory.recordTicks(updatedTicks);
        // Live USD/IDR rate for showing Rupiah crypto values in USD
        setUsdIdrRate(updatedTicks['USD/IDR']?.price);
        setTicks({ ...updatedTicks });
        // Alerts are checked in the browser unless the server pushes them
        checkLocalAlerts(updatedTicks);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onFeedModeChange: setFeedMode,
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
      // Phone browser bar (Android Chrome, Samsung Internet) follows the app theme
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#08101E' : '#F2F5F9');
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

  // Desktop sidebar can shrink to an icon rail for a wider view (remembered per browser)
  const [savedCollapsed, setSavedCollapsed] = useState<boolean>(() => getSidebarCollapsed());
  // Tablets and small laptops (768–1279 px) start with the icon rail so the page keeps its width;
  // opening it there lasts until the window is resized, not saved
  const [narrow, setNarrow] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1279px)').matches);
  const [openOnNarrow, setOpenOnNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 1279px)');
    if (!mq) return;
    const onChange = () => {
      setNarrow(mq.matches);
      setOpenOnNarrow(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const sidebarCollapsed = narrow ? !openOnNarrow : savedCollapsed;
  const handleToggleSidebar = useCallback(() => {
    if (narrow) {
      setOpenOnNarrow((prev) => !prev);
      return;
    }
    setSavedCollapsed((prev) => {
      saveSidebarCollapsed(!prev);
      return !prev;
    });
  }, [narrow]);

  const handleChangeTimeframe = useCallback((nextInterval: TimeframeInterval) => {
    setTimeframe(nextInterval);
    saveTimeframe(nextInterval);
  }, []);

  const handleSelectTab = useCallback(
    (tab: NavTab) => {
      setActiveTab(tab);
      if (typeof window !== 'undefined') {
        const nextHash = buildHashRoute(tab, tab === 'crypto' ? undefined : selectedSymbol, compareSymbols);
        if (tab === 'crypto') setCryptoPair(undefined);
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash;
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [selectedSymbol, compareSymbols]
  );

  const handleOpenPair = useCallback((pair?: string) => {
    setCryptoPair(pair);
    const nextHash = buildHashRoute('crypto', pair);
    if (typeof window !== 'undefined' && window.location.hash !== nextHash) window.location.hash = nextHash;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /** Opens the Compare page with these assets (2–4). */
  const handleCompare = useCallback((symbols: string[]) => {
    setCompareSymbols(symbols);
    setActiveTab('compare');
    window.location.hash = buildHashRoute('compare', undefined, symbols);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

  // Stock Story of one stock (#/story/<id>)
  const handleOpenStory = useCallback((symbol: string) => {
    const found = getAssetBySymbol(symbol);
    if (!found) return;
    setSelectedSymbol(found.symbol);
    setActiveTab('story');
    const nextHash = buildHashRoute('story', found.symbol);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
  // Watchlist, portfolio holdings and the asset on the detail page: priced even outside the core
  // loop, and refreshed first by the server's price stream
  // (re-read when the tab changes: holdings are edited on the portfolio page)
  const portfolioSymbols = useMemo(() => [...new Set(getPortfolioTxs().map((t) => t.symbol))], [activeTab]);
  useTrackedSymbols([...watchlist, ...portfolioSymbols, ...(activeTab === 'detail' ? [currentAsset.symbol] : [])]);
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
      ? feedMode === 'streaming'
        ? t('conn.streaming')
        : t('conn.polling')
      : connectionState === 'reconnecting'
        ? t('conn.reconnecting')
        : connectionState === 'offline'
          ? t('conn.offline')
          : t('conn.delayed');

  return (
    <div
      className={`min-h-screen flex flex-col ${sidebarCollapsed ? 'md:pl-16' : 'md:pl-64'} transition-[padding] duration-200 ${isTerminal ? 'terminal-root' : ''}`}
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
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleSidebar}
      />

      {/* Sudden war / attack alert (every page, including Terminal) */}
      <GeoAlertBanner />

      {/* Top Header Bar (Terminal has its own status bar) */}
      {!isTerminal && (
      <header
        className="app-header sticky top-0 z-10 px-4 md:px-8 border-b flex items-center justify-between gap-4"
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
              {activeTab === 'radar' && t('header.title.radar')}
              {activeTab === 'detail' && t('header.title.detail', { name: currentAsset.shortName })}
              {activeTab === 'watchlist' && t('header.title.watchlist')}
              {activeTab === 'risk' && t('header.title.risk')}
              {activeTab === 'settings' && t('header.title.settings')}
              {activeTab === 'advisor' && t('header.title.advisor')}
              {activeTab === 'quant' && t('header.title.quant')}
              {activeTab === 'idx' && t('header.title.idx')}
              {activeTab === 'portfolio' && t('header.title.portfolio')}
              {activeTab === 'calendar' && t('header.title.calendar')}
              {activeTab === 'macro' && t('header.title.macro')}
              {activeTab === 'kitchen' && t('header.title.kitchen')}
              {activeTab === 'sectors' && t('header.title.sectors')}
              {activeTab === 'crypto' && t('header.title.crypto')}
              {activeTab === 'alerts' && t('header.title.alerts')}
              {activeTab === 'screener' && t('header.title.screener')}
              {activeTab === 'compare' && t('header.title.compare')}
              {activeTab === 'brief' && t('header.title.brief')}
              {activeTab === 'analyst' && t('header.title.analyst')}
              {activeTab === 'fundArena' && t('header.title.fundArena')}
              {activeTab === 'backtest' && t('header.title.backtest')}
              {activeTab === 'paper' && t('header.title.paper')}
              {activeTab === 'story' && t('header.title.story')}
              {activeTab === 'dividends' && t('header.title.dividends')}
              {activeTab === 'dca' && t('header.title.dca')}
              {activeTab === 'heatmap' && t('header.title.heatmap')}
            </span>
          </div>
        </div>

        {/* Right: search, connection status and theme switch */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <HeaderSearch ticks={ticks} onSelectAsset={handleSelectAsset} />
          <LangToggle className="hidden md:inline-flex" />
          {syncFailed && (
            <button
              type="button"
              onClick={() => handleSelectTab('settings')}
              className="p-1.5 rounded-lg"
              title={t('sync.failedTitle', { reason: syncFailed })}
              aria-label={t('sync.failedAria', { reason: syncFailed })}
              style={{ color: 'var(--color-down)' }}
            >
              <CloudOff className="w-4 h-4" />
            </button>
          )}
          <div
            data-testid="connection-indicator"
            className="flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: connColor }}
            title={connLabel}
          >
            <Wifi className="w-3.5 h-3.5 shrink-0" aria-label={connLabel} />
            <span className="hidden sm:inline">{connLabel}</span>
          </div>

          <button
            type="button"
            onClick={handleToggleThemeQuick}
            aria-label={effectiveTheme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
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
            ? 'flex-1 w-full min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0'
            : 'flex-1 w-full min-w-0 max-w-7xl 2xl:max-w-[105rem] mx-auto px-4 sm:px-6 md:px-8 py-5 md:py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10'
        }
      >
        <PageBoundary key={activeTab}>
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
            onGoToQuant={() => handleSelectTab('quant')}
            onCompare={handleCompare}
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
            ticks={ticks}
            onCompare={(symbol) => handleCompare(compareSymbols.includes(symbol) ? compareSymbols : [...compareSymbols, symbol].slice(-4))}
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
          <RiskProfileView
              onSelectAsset={handleSelectAsset}
              onGoToAdvisor={() => handleSelectTab('advisor')}
            />
        )}

        {activeTab === 'quant' && <QuantSimView />}
        {activeTab === 'portfolio' && (
          <PortfolioView ticks={ticks} onSelectAsset={handleSelectAsset} />
        )}
        {activeTab === 'calendar' && <IdxCalendarView onSelectAsset={handleSelectAsset} watchlist={watchlist} />}
        {activeTab === 'macro' && (
          <IndonesiaMacroView />
        )}
        {activeTab === 'sectors' && (
          <SectorRotationView />
        )}
        {activeTab === 'kitchen' && (
          <KitchenRadarView />
        )}
        {activeTab === 'crypto' && (
          <CryptoBinanceView pair={cryptoPair} onOpenPair={handleOpenPair} onSelectAsset={handleSelectAsset} theme={effectiveTheme} />
        )}
        {activeTab === 'backtest' && (
          <BacktestView ticks={ticks} />
        )}
        {activeTab === 'paper' && <PaperTradingView ticks={ticks} onSelectAsset={handleSelectAsset} />}
        {activeTab === 'story' && <StockStoryView symbol={selectedSymbol} ticks={ticks} onPick={handleOpenStory} onSelectAsset={handleSelectAsset} />}
        {activeTab === 'dividends' && <DividendsView ticks={ticks} onOpenStory={handleOpenStory} />}
        {activeTab === 'dca' && <DcaView ticks={ticks} />}
        {activeTab === 'heatmap' && <HeatmapView ticks={ticks} watchlist={watchlist} onSelectAsset={handleSelectAsset} />}
        {activeTab === 'fundArena' && (
          <FundArenaView ticks={ticks} onSelectAsset={handleSelectAsset} />
        )}
        {activeTab === 'analyst' && (
          <AnalystView onSelectAsset={handleSelectAsset} />
        )}
        {activeTab === 'brief' && (
          <BriefView watchlist={[...watchlist, ...portfolioSymbols]} onSelectAsset={handleSelectAsset} />
        )}
        {activeTab === 'compare' && (
          <CompareView
              symbols={compareSymbols}
              ticks={ticks}
              onSelectAsset={handleSelectAsset}
              onChange={(symbols) => {
                setCompareSymbols(symbols);
                window.history.replaceState(null, '', buildHashRoute('compare', undefined, symbols));
              }}
            />
        )}
        {activeTab === 'screener' && (
          <ScreenerView onSelectAsset={handleSelectAsset} onCompare={handleCompare} />
        )}
        {activeTab === 'alerts' && (
          <AlertsView ticks={ticks} onSelectAsset={handleSelectAsset} />
        )}
        {activeTab === 'idx' && (
          <IndonesianStocksView
            ticks={ticks}
            onSelectAsset={handleSelectAsset}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
          />
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
        </PageBoundary>
      </main>

      {/* Mandatory Footer on Every Page (Spec Section 9) */}
      <footer
        className="border-t px-4 sm:px-6 md:px-8 py-4 mb-[calc(4rem+env(safe-area-inset-bottom))] md:mb-0 text-xs"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        <div className="max-w-7xl 2xl:max-w-[105rem] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="font-medium">
            {t('footer.disclaimer')}
          </p>
          <p className="text-[11px]">
            {t('footer.personal')}
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
