/**
 * useLiveNews.ts — React hooks for the shared live news store: the full live state, a
 * clock that re-renders every few seconds (for "3m" ages and NEW badges), and a key that
 * changes whenever a new headline about a given asset arrives (used to refresh sentiment).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { NewsState, filterNewsByCode, newsStore } from '../services/newsStream.ts';

export function useLiveNews(): NewsState {
  return useSyncExternalStore(newsStore.subscribe, newsStore.getState, newsStore.getState);
}

/** Current time, refreshed every `intervalMs` (default 5 s). */
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Id of the newest headline for an asset code; changes when breaking news for it arrives. */
export function latestNewsKey(state: NewsState, code: string): string {
  return filterNewsByCode(state.items, code)[0]?.id ?? '';
}

/** How long a headline keeps its NEW badge after arriving. */
export const NEW_BADGE_MS = 3 * 60_000;

export function isBreaking(state: NewsState, id: string, now: number): boolean {
  const at = state.arrivedAt[id];
  return at !== undefined && now - at < NEW_BADGE_MS;
}
