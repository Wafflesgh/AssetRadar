/**
 * Navigation.tsx — App navigation: the fixed desktop sidebar (brand, menu, theme toggle)
 * and the mobile bottom navigation bar. Also defines the NavTab type.
 */
import { Radar, Star, ShieldAlert, Settings, Sun, Moon, LineChart, SquareTerminal, BrainCircuit } from 'lucide-react';
import { RadarLogo } from './RadarLogo.tsx';
import { ThemePreference } from '../utils/storage.ts';

export type NavTab = 'radar' | 'detail' | 'watchlist' | 'risk' | 'settings' | 'terminal' | 'advisor';

interface NavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  watchlistCount: number;
  effectiveTheme: 'light' | 'dark';
  themePreference: ThemePreference;
  onToggleThemeQuick: () => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: typeof Radar;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
}

const MAIN_NAV_ITEMS: NavItem[] = [
  { id: 'radar', label: 'Radar', icon: Radar },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'advisor', label: 'AI Advisor', shortLabel: 'AI', icon: BrainCircuit },
  { id: 'watchlist', label: 'Watchlist', icon: Star },
  { id: 'risk', label: 'Risk Profile', shortLabel: 'Risk', icon: ShieldAlert },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function SidebarNav({
  activeTab,
  onSelectTab,
  watchlistCount,
  effectiveTheme,
  onToggleThemeQuick,
}: NavigationProps) {
  return (
    <aside
      aria-label="Main desktop navigation"
      className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:left-0 border-r select-none z-20"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Brand Header */}
      <div
        className="flex items-center justify-between px-5 h-16 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          type="button"
          onClick={() => onSelectTab('radar')}
          className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 rounded-lg"
        >
          <RadarLogo size={34} />
          <div>
            <span className="text-base font-bold tracking-tight block leading-none">
              AssetRadar
            </span>
            <span
              className="text-[11px] font-medium block mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Gold · Stocks · Crypto
            </span>
          </div>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Side menu">
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
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                backgroundColor: isActive ? 'var(--accent-radar-soft)' : 'transparent',
                color: isActive ? 'var(--accent-radar)' : 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.id === 'watchlist' && watchlistCount > 0 && (
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
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            style={{
              backgroundColor: activeTab === 'detail' ? 'var(--accent-radar-soft)' : 'transparent',
              color: activeTab === 'detail' ? 'var(--accent-radar)' : 'var(--text-secondary)',
            }}
          >
            <LineChart className="w-4 h-4 shrink-0" />
            <span>Detail & Chart</span>
          </button>
        </div>
      </nav>

      {/* Bottom Theme Toggle & Status Info */}
      <div
        className="p-4 border-t space-y-3"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          type="button"
          onClick={onToggleThemeQuick}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
          style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          aria-label={effectiveTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <span className="flex items-center gap-2">
            {effectiveTheme === 'dark' ? (
              <Moon className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
            ) : (
              <Sun className="w-3.5 h-3.5" style={{ color: 'var(--color-gold)' }} />
            )}
            <span>{effectiveTheme === 'dark' ? 'Dark' : 'Light'} Mode</span>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>Change</span>
        </button>

        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Track gold, stocks, and crypto on one radar.
        </p>
      </div>
    </aside>
  );
}

export function BottomNav({
  activeTab,
  onSelectTab,
  watchlistCount,
}: Pick<NavigationProps, 'activeTab' | 'onSelectTab' | 'watchlistCount'>) {
  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="md:hidden fixed bottom-0 inset-x-0 h-14 border-t z-30 flex items-center justify-around px-1"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
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
            className="flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
            style={{
              color: isActive ? 'var(--accent-radar)' : 'var(--text-secondary)',
            }}
          >
            <div className="relative">
              <Icon className="w-4 h-4 mb-0.5" />
              {item.id === 'watchlist' && watchlistCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-3 text-[10px] font-mono-num font-bold"
                  style={{ color: 'var(--accent-radar)' }}
                >
                  {watchlistCount}
                </span>
              )}
            </div>
            <span>{item.shortLabel ?? item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
