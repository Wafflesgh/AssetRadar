/**
 * useSymbolSource.ts — Loads one data source for a symbol (history, trace, calendar…) and reports
 * loading / ready / error, reloading when the symbol or the retry counter changes. Pass a
 * module-level loader function so it stays the same between renders.
 */
import { useEffect, useState } from 'react';

export type SourceState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error' };

export function useSymbolSource<T>(symbol: string | undefined, load: (symbol: string) => Promise<T>, retry: number): SourceState<T> {
  const [state, setState] = useState<SourceState<T>>({ status: 'loading' });
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    setState({ status: 'loading' });
    load(symbol)
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch(() => alive && setState({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, [symbol, retry, load]);
  return state;
}
