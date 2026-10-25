/**
 * Navigation.tsx — App navigation: the fixed desktop sidebar (brand, menu, theme toggle),
 * which can collapse to a narrow icon rail for a wider view (e.g. in the Terminal), and the
 * mobile bottom navigation bar (main pages plus a "More" sheet). Pages are grouped by category
 * (NAV_GROUPS): a single-page group opens directly, a larger group opens a popup to the right of
 * the sidebar listing its pages (closes on choice, outside click, Esc, scroll or resize); the
 * mobile "More" sheet shows the same groups as sections. Also defines the NavTab type.
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
  ChevronRight,
  PieChart,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { RadarLogo } from './RadarLogo.tsx';
import { ThemePreference } from '../utils/storage.ts';
import { useT, type TranslationKey } from '../i18n/index.ts';
import { LangToggle } from './LangToggle.tsx';

export type NavTab =
  | 'radar' | 'detail' | 'watchlist' | 'risk' | 'settings' | 'terminal' | 'advisor' | 'quant' | 'idx' | 'portfolio'
  | 'calendar' | 'macro' | 'crypto' | 'alerts' | 'screener' | 'compare' | 'brief' | 'backtest' | 'analyst' | 'kitchen' | 'sectors';

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
  { id: 'sectors', label: 'nav.sectors', icon: PieChart },
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

const byId = (id: NavTab) => MAIN_NAV_ITEMS.find((i) => i.id === id)!;

interface NavGroup {
  id: string;
  label: TranslationKey;
  icon: typeof Radar;
  items: NavItem[];
}

/** Pages by category; one-page groups open directly. */
export const NAV_GROUPS: NavGroup[] = [
  { id: 'radar', label: 'nav.radar', icon: Radar, items: [byId('radar')] },
  { id: 'terminal', label: 'nav.terminal', icon: SquareTerminal, items: [byId('terminal')] },
  { id: 'idx', label: 'nav.group.idx', icon: Landmark, items: [byId('idx'), byId('sectors'), byId('screener'), byId('calendar')] },
  {
    id: 'markets',
    label: 'nav.group.markets',
    icon: LineChart,
    items: [byId('crypto'), byId('compare'), { id: 'detail', label: 'nav.detail', icon: LineChart }],
  },
  { id: 'ai', label: 'nav.group.ai', icon: BrainCircuit, items: [byId('advisor'), byId('analyst'), byId('brief'), byId('quant'), byId('backtest')] },
  { id: 'economy', label: 'nav.group.economy', icon: Building2, items: [byId('macro'), byId('kitchen')] },
  { id: 'mine', label: 'nav.group.mine', icon: Wallet, items: [byId('portfolio'), byId('watchlist')] },
  { id: 'settings', label: 'nav.group.settings', icon: Settings, items: [byId('settings'), byId('alerts'), byId('risk')] },
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
  const asideRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ id: string; top: number; left: number } | null>(null);
  const isActive = (id: NavTab) => activeTab === id;
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (flyoutRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(`[data-nav-group="${open.id}"]`)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  // Focus the first page of a freshly opened popup (keyboard users land inside it)
  useEffect(() => {
    if (open) flyoutRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open?.id]);
  const toggleGroup = (group: NavGroup, button: HTMLElement) => {
    if (group.items.length === 1) {
      setOpen(null);
      onSelectTab(group.items[0].id);
      return;
    }
    if (open?.id === group.id) {
      setOpen(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const right = asideRef.current?.getBoundingClientRect().right ?? rect.right;
    // Keep the popup inside the window
    const height = 56 + group.items.length * 42;
    setOpen({ id: group.id, top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)), left: right + 8 });
  };
  const openGroup = NAV_GROUPS.find((g) => g.id === open?.id);
  return (
    <aside
      ref={asideRef}
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
        {NAV_GROUPS.map((group) => {
          const Icon = group.icon;
          const single = group.items.length === 1;
          const active = group.items.some((i) => isActive(i.id));
          const expanded = open?.id === group.id;
          return (
            <button
              key={group.id}
              type="button"
              data-nav-group={group.id}
              onClick={(e) => toggleGroup(group, e.currentTarget)}
              aria-current={single && active ? 'page' : undefined}
              aria-haspopup={single ? undefined : 'menu'}
              aria-expanded={single ? undefined : expanded}
              title={collapsed ? t(group.label) : undefined}
              className={`w-full flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-3.5'} py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap`}
              style={{
                backgroundColor: active || expanded ? 'var(--accent-radar-soft)' : 'transparent',
                color: active || expanded ? 'var(--accent-radar)' : 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className={collapsed ? 'sr-only' : 'truncate'}>{t(group.label)}</span>
              </span>
              {!collapsed && !single && <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? 'translate-x-0.5' : ''}`} />}
            </button>
          );
        })}
      </nav>

      {openGroup && open && (
        <div
          ref={flyoutRef}
          role="menu"
          aria-label={t(openGroup.label)}
          className="fixed z-50 w-60 rounded-xl border shadow-xl p-2"
          style={{ top: open.top, left: open.left, backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            {t(openGroup.label)}
          </p>
          {openGroup.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(null);
                  onSelectTab(item.id);
                }}
                aria-current={active ? 'page' : undefined}
                className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-sm font-medium text-left focus:outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: active ? 'var(--accent-radar-soft)' : 'transparent',
                  color: active ? 'var(--accent-radar)' : 'var(--text-primary)',
                }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: active ? 'var(--accent-radar)' : 'var(--text-secondary)' }} />
                  <span className="truncate">{t(item.label)}</span>
                </span>
                {item.id === 'watchlist' && watchlistCount > 0 && (
                  <span className="text-xs font-mono-num font-semibold" style={{ color: 'var(--accent-radar)' }}>
                    {watchlistCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

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
  const extra = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.mobile);
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
            className="absolute bottom-14 inset-x-0 border-t rounded-t-2xl p-3 grid grid-cols-3 gap-2 max-h-[75vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            {NAV_GROUPS.map((group) => ({ group, items: group.items.filter((i) => !i.mobile) }))
              .filter((g) => g.items.length > 0)
              .flatMap(({ group, items }) => [
                <p key={`h-${group.id}`} className="col-span-3 pt-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  {t(group.label)}
                </p>,
                ...items.map((item) => {
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
                }),
              ])}
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
