/**
 * storage.ts — Every localStorage read/write in the app, always wrapped in try/catch:
 * theme, default timeframe, watchlist, last price snapshot (offline mode),
 * start-in-Terminal option, the saved risk-profile result, dismissed geopolitical alerts,
 * the AI Advisor preferences (risk profile, horizon) and the sync bookkeeping: every saver of a
 * synced collection records which items changed (edit time, deletions) so the sync service
 * (services/syncService.ts) only sends what is new.
 */
import { DEFAULT_TIMEFRAME, isValidTimeframe, type TimeframeInterval, type PriceTick } from '../config/assets.ts';
import { diffCollection, type SyncCollection, type SyncItems } from './sync.ts';

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
  SENTIMENT_REFRESH: 'assetradar_sentiment_refresh_v1',
  INSTALL_BANNER_DISMISSED: 'assetradar_install_banner_dismissed',
  RECENT_SEARCHES: 'assetradar_recent_searches',
  PORTFOLIO: 'assetradar_portfolio_v1',
  FORWARD_LOG: 'assetradar_ai_forward_log_v1',
  LANG: 'assetradar_lang_v1',
  NUMBER_FORMAT: 'assetradar_number_format_v1',
  SYNC_SESSION: 'assetradar_sync_session',
  SYNC_META: 'assetradar_sync_meta_v1',
  ALERTS: 'assetradar_alerts_v1',
  ALERT_STATE: 'assetradar_alert_state_v1',
  ALERT_HISTORY: 'assetradar_alert_history_v1',
  ALERT_SETTINGS: 'assetradar_alert_settings_v1',
  SCREENS: 'assetradar_screens_v1',
  DIVIDENDS: 'assetradar_dividends_v1',
  DIVIDENDS_DISMISSED: 'assetradar_dividend_dismissed_v1',
  GOLD_PRICES: 'assetradar_gold_prices_v1',
  STRATEGIES: 'assetradar_strategies_v1',
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
  tracked('settings', () => {
    if (enabled) safeSet(STORAGE_KEYS.START_IN_TERMINAL, '1');
    else safeRemove(STORAGE_KEYS.START_IN_TERMINAL);
  });
}

/** Desktop sidebar collapsed to icons (wider view, e.g. in the Terminal). */
export function getSidebarCollapsed(): boolean {
  return safeGet(STORAGE_KEYS.SIDEBAR_COLLAPSED) === '1';
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (collapsed) safeSet(STORAGE_KEYS.SIDEBAR_COLLAPSED, '1');
  else safeRemove(STORAGE_KEYS.SIDEBAR_COLLAPSED);
}

export type SentimentRefresh = '2m' | '1h' | 'manual';

/** How often the sentiment card reloads by itself (default every 2 minutes). */
export function getSentimentRefresh(): SentimentRefresh {
  const v = safeGet(STORAGE_KEYS.SENTIMENT_REFRESH);
  return v === '1h' || v === 'manual' ? v : '2m';
}

export function saveSentimentRefresh(mode: SentimentRefresh): void {
  if (mode === '2m') safeRemove(STORAGE_KEYS.SENTIMENT_REFRESH);
  else safeSet(STORAGE_KEYS.SENTIMENT_REFRESH, mode);
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
  tracked('portfolio', () => safeSet(STORAGE_KEYS.PORTFOLIO, JSON.stringify(txs)));
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
  tracked('forwardLog', () => safeSet(STORAGE_KEYS.FORWARD_LOG, JSON.stringify(log)));
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
  tracked('riskResult', () => {
    if (result) safeSet(STORAGE_KEYS.RISK_RESULT, JSON.stringify(result));
    else safeRemove(STORAGE_KEYS.RISK_RESULT);
  });
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
  tracked('settings', () => safeSet(STORAGE_KEYS.TIMEFRAME, interval));
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
  tracked('settings', () => safeSet(STORAGE_KEYS.THEME, theme));
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
  tracked('watchlist', () => safeSet(STORAGE_KEYS.WATCHLIST, JSON.stringify(symbols)));
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
  tracked('settings', () => safeSet(STORAGE_KEYS.AI_PREFS, JSON.stringify(prefs)));
}

// ---- Sync bookkeeping ---------------------------------------------------------------------------

export interface SyncSession {
  token: string;
  expiresAt: number;
}

export function getSyncSession(): SyncSession | null {
  try {
    const p = JSON.parse(safeGet(STORAGE_KEYS.SYNC_SESSION) ?? 'null');
    return p && typeof p.token === 'string' && typeof p.expiresAt === 'number' && p.expiresAt > Date.now() ? p : null;
  } catch {
    return null;
  }
}

export function saveSyncSession(session: SyncSession | null): void {
  if (session) safeSet(STORAGE_KEYS.SYNC_SESSION, JSON.stringify(session));
  else safeRemove(STORAGE_KEYS.SYNC_SESSION);
}

export interface SyncMeta {
  /** Server time of the last successful sync (0 = never: the next sync sends everything). */
  since: number;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Edit time per item id. */
  times: Partial<Record<SyncCollection, Record<string, number>>>;
  /** Deleted item ids with the deletion time. */
  deleted: Partial<Record<SyncCollection, Record<string, number>>>;
  /** Item ids changed since the last sync. */
  dirty: Partial<Record<SyncCollection, string[]>>;
}

function emptySyncMeta(): SyncMeta {
  return { since: 0, lastSyncAt: null, lastError: null, times: {}, deleted: {}, dirty: {} };
}

export function getSyncMeta(): SyncMeta {
  try {
    const p = JSON.parse(safeGet(STORAGE_KEYS.SYNC_META) ?? 'null');
    if (p && typeof p === 'object' && typeof p.since === 'number') return { ...emptySyncMeta(), ...p };
  } catch {
    // Corrupted meta: start over (the next sync sends everything)
  }
  return emptySyncMeta();
}

export function saveSyncMeta(meta: SyncMeta): void {
  safeSet(STORAGE_KEYS.SYNC_META, JSON.stringify(meta));
}

export interface SyncAdapter {
  /** The collection as id → value. */
  read(): Record<string, unknown>;
  /** Replaces the collection (used when applying changes from the server). */
  write(items: Record<string, unknown>): void;
}

const syncAdapters: Partial<Record<SyncCollection, SyncAdapter>> = {};

/** Registers how a collection is read and written (collections outside this file register themselves). */
export function registerSyncAdapter(col: SyncCollection, adapter: SyncAdapter): void {
  syncAdapters[col] = adapter;
}

/** Records edits: changed items get the current time, removed ones become deletions. */
export function markSyncChanged(col: SyncCollection, changed: string[], removed: string[], now = Date.now()): void {
  if (changed.length === 0 && removed.length === 0) return;
  const meta = getSyncMeta();
  const times = { ...(meta.times[col] ?? {}) };
  const deleted = { ...(meta.deleted[col] ?? {}) };
  for (const id of changed) {
    times[id] = now;
    delete deleted[id];
  }
  for (const id of removed) {
    delete times[id];
    deleted[id] = now;
  }
  meta.times[col] = times;
  meta.deleted[col] = deleted;
  meta.dirty[col] = [...new Set([...(meta.dirty[col] ?? []), ...changed, ...removed])];
  saveSyncMeta(meta);
  try {
    window.dispatchEvent(new Event('assetradar:local-change'));
  } catch {
    // No window (tests)
  }
}

/** Runs a write and records which items of the collection it changed. */
export function tracked(col: SyncCollection, write: () => void): void {
  const adapter = syncAdapters[col];
  const before = adapter ? adapter.read() : null;
  write();
  if (!adapter || !before) return;
  const { changed, removed } = diffCollection(before, adapter.read());
  markSyncChanged(col, changed, removed);
}

/** Items to send: every item (full) or only the dirty ones, with edit times and deletions. */
export function readSyncItems(col: SyncCollection, full: boolean, meta = getSyncMeta()): SyncItems {
  const adapter = syncAdapters[col];
  if (!adapter) return {};
  const values = adapter.read();
  const times = meta.times[col] ?? {};
  const deleted = meta.deleted[col] ?? {};
  const ids = full ? [...Object.keys(values), ...Object.keys(deleted)] : (meta.dirty[col] ?? []);
  const out: SyncItems = {};
  for (const id of ids) {
    if (id in values) out[id] = { v: values[id], t: times[id] ?? 0 };
    else if (deleted[id] !== undefined) out[id] = { v: null, t: deleted[id] };
  }
  return out;
}

/** Applies items from the server without marking them as local edits. Returns true if anything changed. */
export function applySyncItems(col: SyncCollection, items: SyncItems): boolean {
  const adapter = syncAdapters[col];
  if (!adapter) return false;
  const meta = getSyncMeta();
  const values = adapter.read();
  const times = { ...(meta.times[col] ?? {}) };
  const deleted = { ...(meta.deleted[col] ?? {}) };
  const dirty = new Set(meta.dirty[col] ?? []);
  let changed = false;
  for (const [id, it] of Object.entries(items)) {
    // A newer local edit made while the request was in flight wins; it is sent next time
    const localT = times[id] ?? deleted[id] ?? 0;
    if (dirty.has(id) && localT > it.t) continue;
    if (it.v === null) {
      if (id in values) {
        delete values[id];
        changed = true;
      }
      delete times[id];
      deleted[id] = it.t;
    } else {
      if (!(id in values) || JSON.stringify(values[id]) !== JSON.stringify(it.v)) changed = true;
      values[id] = it.v;
      times[id] = it.t;
      delete deleted[id];
    }
  }
  if (changed) adapter.write(values);
  meta.times[col] = times;
  meta.deleted[col] = deleted;
  saveSyncMeta(meta);
  return changed;
}

export function syncAdapterCollections(): SyncCollection[] {
  return Object.keys(syncAdapters) as SyncCollection[];
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(safeGet(key) ?? 'null');
  } catch {
    return null;
  }
}

/** A list of objects with an `id`, stored as one JSON array. */
export function listAdapter(key: string): SyncAdapter {
  return {
    read() {
      const list = readJson(key);
      const out: Record<string, unknown> = {};
      if (Array.isArray(list)) for (const it of list) if (it && typeof it.id === 'string') out[it.id] = it;
      return out;
    },
    write(items) {
      safeSet(key, JSON.stringify(Object.values(items)));
    },
  };
}

registerSyncAdapter('watchlist', {
  read: () => Object.fromEntries(getSavedWatchlist().map((s) => [s, true])),
  write(items) {
    // Keep the local order, then add new symbols at the end
    const current = getSavedWatchlist().filter((s) => s in items);
    const added = Object.keys(items).filter((s) => !current.includes(s));
    safeSet(STORAGE_KEYS.WATCHLIST, JSON.stringify([...current, ...added]));
  },
});

registerSyncAdapter('portfolio', listAdapter(STORAGE_KEYS.PORTFOLIO));

interface RawSnapshot {
  date: string;
  horizonDays: number;
  profile: string;
  symbol: string;
}
const snapshotId = (s: RawSnapshot) => `${s.date}|${s.horizonDays}|${s.profile}|${s.symbol}`;

registerSyncAdapter('forwardLog', {
  read() {
    const log = readJson(STORAGE_KEYS.FORWARD_LOG) as { snapshots?: RawSnapshot[] } | null;
    const out: Record<string, unknown> = {};
    for (const s of Array.isArray(log?.snapshots) ? log.snapshots : []) if (s && typeof s.date === 'string') out[snapshotId(s)] = s;
    return out;
  },
  write(items) {
    const snapshots = (Object.values(items) as RawSnapshot[]).sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
    safeSet(STORAGE_KEYS.FORWARD_LOG, JSON.stringify({ version: 1, startedAt: snapshots[0]?.date ?? null, snapshots }));
  },
});

registerSyncAdapter('riskResult', {
  read() {
    const r = getSavedRiskResult();
    return r ? { result: r } : {};
  },
  write(items) {
    if (items.result) safeSet(STORAGE_KEYS.RISK_RESULT, JSON.stringify(items.result));
    else safeRemove(STORAGE_KEYS.RISK_RESULT);
  },
});

registerSyncAdapter('settings', {
  read() {
    const out: Record<string, unknown> = {};
    const theme = safeGet(STORAGE_KEYS.THEME);
    if (theme) out.theme = theme;
    const tf = safeGet(STORAGE_KEYS.TIMEFRAME);
    if (tf) out.timeframe = tf;
    const ai = readJson(STORAGE_KEYS.AI_PREFS);
    if (ai) out.aiPrefs = ai;
    out.startInTerminal = getStartInTerminal();
    const alertSettings = readJson(STORAGE_KEYS.ALERT_SETTINGS);
    if (alertSettings) out.alertSettings = alertSettings;
    return out;
  },
  write(items) {
    if (typeof items.theme === 'string') safeSet(STORAGE_KEYS.THEME, items.theme);
    if (typeof items.timeframe === 'string' && isValidTimeframe(items.timeframe)) safeSet(STORAGE_KEYS.TIMEFRAME, items.timeframe);
    if (items.aiPrefs && typeof items.aiPrefs === 'object') safeSet(STORAGE_KEYS.AI_PREFS, JSON.stringify(items.aiPrefs));
    if (items.startInTerminal === true) safeSet(STORAGE_KEYS.START_IN_TERMINAL, '1');
    else if (items.startInTerminal === false) safeRemove(STORAGE_KEYS.START_IN_TERMINAL);
    if (items.alertSettings && typeof items.alertSettings === 'object') safeSet(STORAGE_KEYS.ALERT_SETTINGS, JSON.stringify(items.alertSettings));
  },
});

// ---- Alerts (definitions and settings are synced; state and history stay on the device) --------

registerSyncAdapter('alerts', listAdapter(STORAGE_KEYS.ALERTS));

export function getAlertsRaw(): unknown {
  return readJson(STORAGE_KEYS.ALERTS);
}

export function saveAlerts(alerts: unknown[]): void {
  tracked('alerts', () => safeSet(STORAGE_KEYS.ALERTS, JSON.stringify(alerts)));
}

export function getAlertStates<T>(): Record<string, T> {
  const raw = readJson(STORAGE_KEYS.ALERT_STATE);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, T>) : {};
}

export function saveAlertStates(states: Record<string, unknown>): void {
  safeSet(STORAGE_KEYS.ALERT_STATE, JSON.stringify(states));
}

export function getAlertHistoryRaw(): unknown[] {
  const raw = readJson(STORAGE_KEYS.ALERT_HISTORY);
  return Array.isArray(raw) ? raw : [];
}

export function saveAlertHistory(history: unknown[]): void {
  safeSet(STORAGE_KEYS.ALERT_HISTORY, JSON.stringify(history.slice(0, 200)));
}

export function getAlertSettingsRaw(): unknown {
  return readJson(STORAGE_KEYS.ALERT_SETTINGS);
}

export function saveAlertSettings(settings: unknown): void {
  tracked('settings', () => safeSet(STORAGE_KEYS.ALERT_SETTINGS, JSON.stringify(settings)));
}

// ---- Saved screener screens (synced) ----------------------------------------------------------------

registerSyncAdapter('screens', listAdapter(STORAGE_KEYS.SCREENS));

export function getScreensRaw(): unknown {
  return readJson(STORAGE_KEYS.SCREENS);
}

export function saveScreens(screens: unknown[]): void {
  tracked('screens', () => safeSet(STORAGE_KEYS.SCREENS, JSON.stringify(screens)));
}

// ---- Dividends received (synced) and dismissed dividend suggestions (this device) ---------------------

registerSyncAdapter('dividends', listAdapter(STORAGE_KEYS.DIVIDENDS));

export function getDividendsRaw(): unknown {
  return readJson(STORAGE_KEYS.DIVIDENDS);
}

export function saveDividends(list: unknown[]): void {
  tracked('dividends', () => safeSet(STORAGE_KEYS.DIVIDENDS, JSON.stringify(list)));
}

export function getDismissedDividends(): string[] {
  const raw = readJson(STORAGE_KEYS.DIVIDENDS_DISMISSED);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export function saveDismissedDividends(keys: string[]): void {
  safeSet(STORAGE_KEYS.DIVIDENDS_DISMISSED, JSON.stringify(keys.slice(-500)));
}

// ---- Physical gold buyback prices typed in by the owner (synced) ------------------------------------

registerSyncAdapter('goldPrices', listAdapter(STORAGE_KEYS.GOLD_PRICES));

export function getGoldPricesRaw(): unknown {
  return readJson(STORAGE_KEYS.GOLD_PRICES);
}

export function saveGoldPrices(list: unknown[]): void {
  tracked('goldPrices', () => safeSet(STORAGE_KEYS.GOLD_PRICES, JSON.stringify(list)));
  try {
    window.dispatchEvent(new Event('assetradar:gold-prices-changed'));
  } catch {
    // No window (tests)
  }
}

// ---- Saved backtest strategies (synced) ----------------------------------------------------------------

registerSyncAdapter('strategies', listAdapter(STORAGE_KEYS.STRATEGIES));

export function getStrategiesRaw(): unknown {
  return readJson(STORAGE_KEYS.STRATEGIES);
}

export function saveStrategies(list: unknown[]): void {
  tracked('strategies', () => safeSet(STORAGE_KEYS.STRATEGIES, JSON.stringify(list)));
}

// ---- Language and number format ---------------------------------------------------------------

export type AppLang = 'en' | 'id';
export type NumberFormatPref = 'language' | 'en-US';

/** Saved language, or null when the user never chose one. */
export function getSavedLang(): AppLang | null {
  const v = safeGet(STORAGE_KEYS.LANG);
  return v === 'en' || v === 'id' ? v : null;
}

export function saveLang(lang: AppLang): void {
  safeSet(STORAGE_KEYS.LANG, lang);
}

export function getNumberFormatPref(): NumberFormatPref {
  return safeGet(STORAGE_KEYS.NUMBER_FORMAT) === 'en-US' ? 'en-US' : 'language';
}

export function saveNumberFormatPref(pref: NumberFormatPref): void {
  safeSet(STORAGE_KEYS.NUMBER_FORMAT, pref);
}

