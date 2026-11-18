/** journal.ts — Validated decision notes and price changes after each saved snapshot. */
import { wibDate } from './sync.ts';

export const JOURNAL_LABELS = ['Strong Bearish', 'Bearish', 'Neutral', 'Bullish', 'Strong Bullish'] as const;
type Label = typeof JOURNAL_LABELS[number];
export interface JournalEntry {
  id: string;
  symbol: string;
  txId: string | null;
  createdAt: number;
  note: string;
  snapshot: {
    price: number | null;
    currency: string;
    sentiment: { short: Label | null; medium: Label | null; long: Label | null };
    evidenceScore: number | null;
  };
}

export function validateEntry(raw: unknown): raw is JournalEntry {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as JournalEntry;
  const s = e.snapshot;
  return typeof e.id === 'string' && e.id.trim().length > 0
    && typeof e.symbol === 'string' && e.symbol.trim().length > 0
    && (e.txId === null || (typeof e.txId === 'string' && e.txId.trim().length > 0))
    && Number.isSafeInteger(e.createdAt) && e.createdAt > 0 && e.createdAt <= 8.64e15
    && typeof e.note === 'string' && e.note.trim().length > 0 && e.note.length <= 1000
    && !!s && typeof s.currency === 'string' && s.currency.trim().length > 0
    && (s.price === null || (Number.isFinite(s.price) && s.price > 0))
    && (s.evidenceScore === null || (Number.isFinite(s.evidenceScore) && s.evidenceScore >= 0 && s.evidenceScore <= 100))
    && !!s.sentiment && (['short', 'medium', 'long'] as const).every(h =>
      s.sentiment[h] === null || JOURNAL_LABELS.includes(s.sentiment[h]!));
}

export function parseJournal(raw: unknown): JournalEntry[] {
  return Array.isArray(raw) ? raw.filter(validateEntry) : [];
}

/** Reviews due on the current WIB date or up to three calendar days earlier. */
export function dueReviews(entries: JournalEntry[], now: number): { entryId: string; symbol: string; period: 'w1' | 'm1' | 'm3' }[] {
  const today = Date.parse(wibDate(now));
  return entries.flatMap(entry => (['w1', 'm1', 'm3'] as const).flatMap((period, i) => {
    const date = Date.parse(wibDate(entry.createdAt + [7, 30, 91][i] * 86400_000));
    return date <= today && today - date <= 3 * 86400_000 ? [{ entryId: entry.id, symbol: entry.symbol, period }] : [];
  }));
}

export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

/** Daily bars use calendar dates; use the app's WIB date and never a future bar. */
export function reviewChanges(entry: JournalEntry, bars: { date: string; close: number }[], now = Date.now()): Record<'w1' | 'm1' | 'm3', number | null> {
  const price = entry.snapshot.price;
  const today = wibDate(now);
  const sorted = bars.filter(b => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date <= today
    && Number.isFinite(b.close) && b.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const change = (days: number): number | null => {
    const due = entry.createdAt + days * 86_400_000;
    if (price === null || !Number.isFinite(price) || price <= 0 || due > now) return null;
    const bar = sorted.find(b => b.date >= wibDate(due));
    if (!bar) return null;
    const result = (bar.close / price - 1) * 100;
    return Number.isFinite(result) ? result : null;
  };
  return { w1: change(7), m1: change(30), m3: change(91) };
}
