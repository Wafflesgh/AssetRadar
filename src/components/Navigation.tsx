/**
 * Navigation.tsx — App navigation: the fixed desktop sidebar (brand, menu, theme toggle),
 * which can collapse to a narrow icon rail for a wider view (e.g. in the Terminal), and the
 * mobile bottom navigation bar (main pages plus a "More" sheet). Also defines the NavTab type.
 */
import {
  Bitcoin,
  Radar,
  Star,
  ShieldAlert,
  Settings,
  Sun,
  Moon,
  LineChart,
  SquareTerminal,
  BrainCircuit,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
  Landmark,
  Wallet,
  CalendarDays,
  Building2,
  Bell,
  Filter,
  GitCompare,
  Newspaper,
  History,
  MoreHorizontal,
  X,
  ClipboardCheck,
  ShoppingBasket,
} from 'lucide-react';
import { useState } from 'react';
import { RadarLogo } from './RadarLogo.tsx';
import { ThemePreference } from '../utils/storage.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { LangToggle } from './LangToggle.tsx';

export type NavTab =
  | 'radar' | 'detail' | 'watchlist' | 'risk' | 'settings' | 'terminal' | 'advisor' | 'quant' | 'idx' | 'portfolio'
  | 'calendar' | 'macro' | 'crypto' | 'alerts' | 'screener' | 'compare' | 'brief' | 'backtest' | 'analyst' | 'kitchen';

interface NavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  watchlistCount: number;
  effectiveTheme: 'light' | 'dark';
  themePreference: ThemePreference;
  onToggleThemeQuick: () => void;
  /** Desktop only: narrow icon rail instead of the full sidebar. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

interface NavItem {
  id: NavTab;
  label: TranslationKey;
  icon: typeof Radar;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: TranslationKey;
  /** Shown directly in the mobile bottom bar (the others are in "More"). */
  mobile?: boolean;
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { id: 'radar', label: 'nav.radar', icon: Radar, mobile: true },
  { id: 'idx', label: 'nav.idx', shortLabel: 'nav.idxShort', icon: Landmark, mobile: true },
  { id: 'terminal', label: 'nav.terminal', icon: SquareTerminal, mobile: true },
  { id: 'advisor', label: 'nav.advisor', shortLabel: 'nav.advisorShort', icon: BrainCircuit, mobile: true },
  { id: 'brief', label: 'nav.brief', shortLabel: 'nav.briefShort', icon: Newspaper },
  { id: 'analyst', label: 'nav.analyst', shortLabel: 'nav.analystShort', icon: ClipboardCheck },
  { id: 'crypto', label: 'nav.crypto', shortLabel: 'nav.cryptoShort', icon: Bitcoin },
  { id: 'screener', label: 'nav.screener', shortLabel: 'nav.screenerShort', icon: Filter },
  { id: 'compare', label: 'nav.compare', icon: GitCompare },
  { id: 'portfolio', label: 'nav.portfolio', icon: Wallet },
  { id: 'alerts', label: 'nav.alerts', icon: Bell },
  { id: 'calendar', label: 'nav.calendar', shortLabel: 'nav.calendarShort', icon: CalendarDays },
  { id: 'macro', label: 'nav.macro', icon: Building2 },
  { id: 'kitchen', label: 'nav.kitchen', icon: ShoppingBasket },
  { id: 'quant', label: 'nav.quant', shortLabel: 'nav.quantShort', icon: FlaskConical },
  { id: 'backtest', label: 'nav.backtest', icon: History },
  { id: 'watchlist', label: 'nav.watchlist', shortLabel: 'nav.watchlistShort', icon: Star },
  { id: 'risk', label: 'nav.risk', shortLabel: 'nav.riskShort', icon: ShieldAlert },
  { id: 'settings', label: 'nav.settings', icon: Settings },
];

export function SidebarNav({
  activeTab,
  onSelectTab,
  watchlistCount,
  effectiveTheme,
  onToggleThemeQuick,
  collapsed = false,
  onToggleCollapsed,
}: NavigationProps) {
  const t = useT();
  return (
    <aside
      aria-label={t('nav.mainDesktop')}
      className={`hidden md:flex ${collapsed ? 'md:w-16' : 'md:w-64'} md:flex-col md:fixed md:inset-y-0 md:left-0 border-r select-none z-20 transition-[width] duration-200`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center justify-between ${collapsed ? 'px-3' : 'px-5'} h-16 border-b`}
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          type="button"
          onClick={() => onSelectTab('radar')}
          title="AssetRadar"
          className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 rounded-lg"
        >
          <RadarLogo size={34} />
          <div className={collapsed ? 'sr-only' : ''}>
            <span className="text-base font-bold tracking-tight block leading-none">
              AssetRadar
            </span>
            <span
              className="text-[11px] font-medium block mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('nav.tagline')}
            </span>
          </div>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className={`flex-1 ${collapsed ? 'px-2' : 'px-3'} py-5 space-y-1 overflow-y-auto`} aria-label={t('nav.sideMenu')}>
        {MAIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeTab === item.id || (item.id === 'radar' && activeTab === 'detail');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={collapsed ? t(item.label) : undefined}
              className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap`}
              style={{
                backgroundColor: isActive ? 'var(--accent-radar-soft)' : 'transparent',
                color: isActive ? 'var(--accent-radar)' : 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span className={collapsed ? 'sr-only' : ''}>{t(item.label)}</span>
              </span>
              {!collapsed && item.id === 'watchlist' && watchlistCount > 0 && (
                <span
                  className="text-xs font-mono-num font-semibold"
                  style={{ color: isActive ? 'var(--accent-radar)' : 'var(--text-secondary)' }}
                >
                  {watchlistCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Direct shortcut to Detail / Chart View */}
        <div className="pt-4 mt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => onSelectTab('detail')}
            aria-current={activeTab === 'detail' ? 'page' : undefined}
            title={collapsed ? t('nav.detail') : undefined}
            className={`w-full flex items-center gap-3 ${collapsed ? 'justify-center px-0' : 'px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap`}
            style={{
              backgroundColor: activeTab === 'detail' ? 'var(--accent-radar-soft)' : 'transparent',
              color: activeTab === 'detail' ? 'var(--accent-radar)' : 'var(--text-secondary)',
            }}
          >
            <LineChart className="w-4 h-4 shrink-0" />
            <span className={collapsed ? 'sr-only' : ''}>{t('nav.detail')}</span>
          </button>
        </div>
      </nav>

      {/* Bottom Theme Toggle & Status Info */}
      <div
        className={`${collapsed ? 'p-2' : 'p-4'} border-t space-y-3`}
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            aria-expanded={!collapsed}
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebarHint')}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'gap-2'} px-3 py-2 rounded-lg text-xs font-medium transition-colors`}
            style={{ color: 'var(--text-secondary)' }}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {!collapsed && <span>{t('nav.collapseSidebar')}</span>}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleThemeQuick}
          title={collapsed ? (effectiveTheme === 'dark' ? t('theme.darkMode') : t('theme.lightMode')) : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-lg text-xs font-medium border transition-colors`}
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          aria-label={effectiveTheme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
        >
          <span className="flex items-center gap-2">
            {effectiveTheme === 'dark' ? (
              <Moon className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
            ) : (
              <Sun className="w-3.5 h-3.5" style={{ color: 'var(--color-gold)' }} />
            )}
            <span className={collapsed ? 'sr-only' : ''}>{effectiveTheme === 'dark' ? t('theme.darkMode') : t('theme.lightMode')}</span>
          </span>
          {!collapsed && <span style={{ color: 'var(--text-secondary)' }}>{t('common.change')}</span>}
        </button>

        {!collapsed && (
          <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t('nav.footerTagline')}
          </p>
        )}
      </div>
    </aside>
  );
}

export function BottomNav({
  activeTab,
  onSelectTab,
  watchlistCount,
}: Pick<NavigationProps, 'activeTab' | 'onSelectTab' | 'watchlistCount'>) {
  const t = useT();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (id: NavTab) => activeTab === id || (id === 'radar' && activeTab === 'detail');
  const extra = MAIN_NAV_ITEMS.filter((i) => !i.mobile);
  const extraActive = extra.some((i) => isActive(i.id));
  const select = (id: NavTab) => {
    setMoreOpen(false);
    onSelectTab(id);
  };
  const tabButton = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.id);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => select(item.id)}
        aria-current={active ? 'page' : undefined}
        className="flex flex-col items-center justify-center flex-1 min-w-0 h-full py-1 text-[10px] font-medium transition-colors whitespace-nowrap"
        style={{ color: active ? 'var(--accent-radar)' : 'var(--text-secondary)' }}
      >
        <div className="relative">
          <Icon className="w-4 h-4 mb-0.5" />
          {item.id === 'watchlist' && watchlistCount > 0 && (
            <span className="absolute -top-1.5 -right-3 text-[10px] font-mono-num font-bold" style={{ color: 'var(--accent-radar)' }}>
              {watchlistCount}
            </span>
          )}
        </div>
        <span>{t(item.shortLabel ?? item.label)}</span>
      </button>
    );
  };

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={t('nav.morePages')}>
          <button type="button" aria-label={t('nav.closeMenu')} className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div
            className="absolute bottom-14 inset-x-0 border-t rounded-t-2xl p-3 grid grid-cols-3 gap-2"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            {extra.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => select(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium"
                  style={{
                    borderColor: active ? 'var(--accent-radar)' : 'var(--border-subtle)',
                    color: active ? 'var(--accent-radar)' : 'var(--text-primary)',
                    backgroundColor: active ? 'var(--accent-radar-soft)' : 'var(--bg-surface-subtle)',
                  }}
                >
                  <Icon className="w-5 h-5" />
                  <span>{t(item.label)}</span>
                  {item.id === 'watchlist' && watchlistCount > 0 && (
                    <span className="text-[10px] font-mono-num" style={{ color: 'var(--accent-radar)' }}>
                      {t('nav.savedCount', { count: watchlistCount })}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="col-span-3 flex justify-center pt-1">
              <LangToggle />
            </div>
          </div>
        </div>
      )}
      <nav
        aria-label={t('nav.mobile')}
        className="md:hidden fixed bottom-0 inset-x-0 h-14 border-t z-50 flex items-center justify-around px-1"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {MAIN_NAV_ITEMS.filter((i) => i.mobile).map(tabButton)}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          className="flex flex-col items-center justify-center flex-1 min-w-0 h-full py-1 text-[10px] font-medium whitespace-nowrap"
          style={{ color: moreOpen || extraActive ? 'var(--accent-radar)' : 'var(--text-secondary)' }}
        >
          {moreOpen ? <X className="w-4 h-4 mb-0.5" /> : <MoreHorizontal className="w-4 h-4 mb-0.5" />}
          <span>{t('nav.more')}</span>
        </button>
      </nav>
    </>
  );
}
