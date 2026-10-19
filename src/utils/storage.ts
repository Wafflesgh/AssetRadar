/**
 * storage.ts — Every localStorage read/write in the app, always wrapped in try/catch:
 * theme, default timeframe, watchlist, last price snapshot (offline mode),
 * start-in-Terminal option, the saved risk-profile result, dismissed geopolitical alerts and
 * the AI Advisor preferences (risk profile, horizon).
 */
import { DEFAULT_TIMEFRAME, isValidTimeframe, TimeframeInterval, PriceTick } from '../config/assets.ts';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEYS = {
  TIMEFRAME: 'assetradar_timeframe',
  THEME: 'assetradar_theme',
  WATCHLIST: 'assetradar_watchlist',
  // v3: asset groups were reorganized (commodity, idStock, usStock…)
  TICK_SNAPSHOT: 'assetradar_last_ticks_v3',
  START_IN_TERMINAL: 'assetradar_start_terminal',
  RISK_RESULT: 'assetradar_risk_result',
  DISMISSED_ALERTS: 'assetradar_dismissed_alerts',
  AI_PREFS: 'assetradar_ai_prefs',
  SIDEBAR_COLLAPSED: 'assetradar_sidebar_collapsed',
  INSTALL_BANNER_DISMISSED: 'assetradar_install_banner_dismissed',
  RECENT_SEARCHES: 'assetradar_recent_searches',
  PORTFOLIO: 'assetradar_portfolio_v1',
  FORWARD_LOG: 'assetradar_ai_forward_log_v1',
} as const;

function safeGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage failures (private mode, quota exceeded, etc.)
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

/** Last known prices, shown while offline. */
export function saveTickSnapshot(ticks: Record<string, PriceTick>): void {
  const valid: Record<string, PriceTick> = {};
  for (const [sym, tick] of Object.entries(ticks)) {
    if (tick && tick.status !== 'error' && Number.isFinite(tick.price)) valid[sym] = tick;
  }
  safeSet(STORAGE_KEYS.TICK_SNAPSHOT, JSON.stringify({ savedAt: Date.now(), ticks: valid }));
}

export function loadTickSnapshot(): Record<string, PriceTick> | null {
  const raw = safeGet(STORAGE_KEYS.TICK_SNAPSHOT);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ticks === 'object' && parsed.ticks) {
      const out: Record<string, PriceTick> = {};
      for (const [sym, tick] of Object.entries(parsed.ticks as Record<string, PriceTick>)) {
        if (tick && typeof tick.price === 'number') out[sym] = { ...tick, fromSnapshot: true };
      }
      return out;
    }
  } catch {
    // Ignore a corrupted snapshot
  }
  return null;
}

export function getStartInTerminal(): boolean {
  return safeGet(STORAGE_KEYS.START_IN_TERMINAL) === '1';
}

export function saveStartInTerminal(enabled: boolean): void {
  if (enabled) safeSet(STORAGE_KEYS.START_IN_TERMINAL, '1');
  else safeRemove(STORAGE_KEYS.START_IN_TERMINAL);
}

/** Desktop sidebar collapsed to icons (wider view, e.g. in the Terminal). */
export function getSidebarCollapsed(): boolean {
  return safeGet(STORAGE_KEYS.SIDEBAR_COLLAPSED) === '1';
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (collapsed) safeSet(STORAGE_KEYS.SIDEBAR_COLLAPSED, '1');
  else safeRemove(STORAGE_KEYS.SIDEBAR_COLLAPSED);
}

/** The "Install AssetRadar" banner on the Radar was closed. */
export function getInstallBannerDismissed(): boolean {
  return safeGet(STORAGE_KEYS.INSTALL_BANNER_DISMISSED) === '1';
}

export function saveInstallBannerDismissed(): void {
  safeSet(STORAGE_KEYS.INSTALL_BANNER_DISMISSED, '1');
}

/** Last 5 assets picked from the search box (symbols, newest first). */
export function getRecentSearches(): string[] {
  try {
    const parsed = JSON.parse(safeGet(STORAGE_KEYS.RECENT_SEARCHES) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(symbol: string): void {
  const next = [symbol, ...getRecentSearches().filter((s) => s !== symbol)].slice(0, 5);
  safeSet(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(next));
}

/** Portfolio transactions (only on this device; see utils/portfolio.ts for the shape). */
export function getPortfolioTxs<T extends { id: string; symbol: string }>(): T[] {
  try {
    const parsed = JSON.parse(safeGet(STORAGE_KEYS.PORTFOLIO) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.id === 'string' && typeof t.symbol === 'string') : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser refused to store the data (private mode, storage full). */
export function savePortfolioTxs(txs: unknown[]): boolean {
  safeSet(STORAGE_KEYS.PORTFOLIO, JSON.stringify(txs));
  return safeGet(STORAGE_KEYS.PORTFOLIO) !== null;
}

/** AI Advisor forward-test log (raw JSON; validated by parseForwardLog in ai/forwardTest.ts). */
export function getForwardLogRaw(): unknown {
  try {
    return JSON.parse(safeGet(STORAGE_KEYS.FORWARD_LOG) ?? 'null');
  } catch {
    return null;
  }
}

export function saveForwardLogRaw(log: unknown): boolean {
  safeSet(STORAGE_KEYS.FORWARD_LOG, JSON.stringify(log));
  return safeGet(STORAGE_KEYS.FORWARD_LOG) !== null;
}

export interface SavedRiskResult {
  answers: number[];
  customAllocation?: Record<string, number>;
  savedAt: number;
}

export function getSavedRiskResult(): SavedRiskResult | null {
  const raw = safeGet(STORAGE_KEYS.RISK_RESULT);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.answers) && parsed.answers.every((n: unknown) => typeof n === 'number')) {
      return parsed as SavedRiskResult;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function saveRiskResult(result: SavedRiskResult | null): void {
  if (result) safeSet(STORAGE_KEYS.RISK_RESULT, JSON.stringify(result));
  else safeRemove(STORAGE_KEYS.RISK_RESULT);
}

export function getSavedTimeframe(): TimeframeInterval {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_TIMEFRAME;
    }
    const raw = window.localStorage.getItem(STORAGE_KEYS.TIMEFRAME);
    if (raw && isValidTimeframe(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage read errors (e.g., private browsing restrictions)
  }
  return DEFAULT_TIMEFRAME;
}

export function saveTimeframe(interval: TimeframeInterval): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEYS.TIMEFRAME, interval);
    }
  } catch {
    // Ignore storage write errors
  }
}

export function getSavedTheme(): ThemePreference {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return 'dark';
    }
    const raw = window.localStorage.getItem(STORAGE_KEYS.THEME);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'dark';
}

export function saveTheme(theme: ThemePreference): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEYS.THEME, theme);
    }
  } catch {
    // Ignore storage write errors
  }
}

export function resolveEffectiveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
    return 'light';
  } catch {
    return 'dark';
  }
}

export function getSavedWatchlist(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }
    const raw = window.localStorage.getItem(STORAGE_KEYS.WATCHLIST);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

export function saveWatchlist(symbols: string[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(symbols));
    }
  } catch {
    // Ignore storage write errors
  }
}

/** Ids of geopolitical alerts the viewer dismissed (newest last, capped). */
export function getDismissedAlerts(): string[] {
  const raw = safeGet(STORAGE_KEYS.DISMISSED_ALERTS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveDismissedAlerts(ids: string[]): void {
  safeSet(STORAGE_KEYS.DISMISSED_ALERTS, JSON.stringify(ids.slice(-100)));
}

export interface AiPrefs {
  profile: 'conservative' | 'moderate' | 'aggressive';
  horizon: 20 | 60;
}

/** AI Advisor personalization (risk profile and horizon). */
export function getAiPrefs(): AiPrefs {
  const raw = safeGet(STORAGE_KEYS.AI_PREFS);
  try {
    const p = raw ? JSON.parse(raw) : null;
    const profile = ['conservative', 'moderate', 'aggressive'].includes(p?.profile) ? p.profile : 'moderate';
    const horizon = p?.horizon === 60 ? 60 : 20;
    return { profile, horizon };
  } catch {
    return { profile: 'moderate', horizon: 20 };
  }
}

export function saveAiPrefs(prefs: AiPrefs): void {
  safeSet(STORAGE_KEYS.AI_PREFS, JSON.stringify(prefs));
}
