import { DEFAULT_TIMEFRAME, isValidTimeframe, TimeframeInterval, PriceTick } from '../config/assets.ts';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEYS = {
  TIMEFRAME: 'assetradar_timeframe',
  THEME: 'assetradar_theme',
  WATCHLIST: 'assetradar_watchlist',
  TICK_SNAPSHOT: 'assetradar_last_ticks',
  START_IN_TERMINAL: 'assetradar_start_terminal',
  RISK_RESULT: 'assetradar_risk_result',
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
    // Abaikan kegagalan penyimpanan (mode privat, kuota penuh, dll.)
  }
}

function safeRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Abaikan
  }
}

/** Snapshot harga terakhir untuk ditampilkan saat offline. */
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
    // Abaikan snapshot rusak
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
    // Abaikan
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
