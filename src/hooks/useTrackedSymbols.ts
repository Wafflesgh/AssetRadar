/**
 * useTrackedSymbols.ts — Registers the symbols a component shows so that stocks outside the
 * core price loop (the IDX universe) get priced on demand while the component is mounted.
 */
import { useEffect, useId } from 'react';
import { trackSymbols } from '../services/marketDataService.ts';

export function useTrackedSymbols(symbols: string[]): void {
  const owner = useId();
  const key = symbols.join(',');
  useEffect(() => {
    trackSymbols(owner, key ? key.split(',') : []);
  }, [owner, key]);
  useEffect(() => () => trackSymbols(owner, []), [owner]);
}
