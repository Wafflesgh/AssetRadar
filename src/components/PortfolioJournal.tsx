/** PortfolioJournal.tsx — Private decision notes, frozen quote snapshots and later price reviews. */
import { useEffect, useRef, useState } from 'react';
import { getAssetBySymbol, type PriceTick } from '../config/assets.ts';
import { useT, useLang } from '../i18n/index.ts';
import { assetName } from '../i18n/assetNames.ts';
import { useTrackedSymbols } from '../hooks/useTrackedSymbols.ts';
import { fetchDailyHistory, type DailyHistory } from '../services/marketDataService.ts';
import { fetchSentimentV2, type SentimentV2 } from '../services/sentimentService.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { formatNumber, formatPercent, formatPrice } from '../utils/format.ts';
import { JOURNAL_LABELS, reviewChanges, sortEntries, validateEntry, type JournalEntry } from '../utils/journal.ts';
import { getJournal, saveJournal } from '../utils/storage.ts';
import { AssetSearch } from './AssetSearch.tsx';

interface Draft { id?: string; symbol: string; txId: string | null; note: string }
interface Props {
  ticks: Record<string, PriceTick>;
  evidence: Record<string, { score: number }>;
  request: { symbol: string; txId: string } | null;
}
const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const button = 'min-h-11 px-3 py-2 rounded-lg border text-sm';

export function PortfolioJournal({ ticks, evidence, request }: Props) {
  const t = useT();
  const lang = useLang();
  const [entries, setEntries] = useState(getJournal);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [sentiment, setSentiment] = useState<SentimentV2 | null>(null);
  const [histories, setHistories] = useState<Record<string, DailyHistory | null>>({});
  const [retry, setRetry] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);
  useTrackedSymbols(draft ? [draft.symbol].filter(Boolean) : []);
  useEffect(() => onSyncApplied(['journal'], () => setEntries(getJournal())), []);
  useEffect(() => {
    if (request) {
      setDraft({ symbol: request.symbol, txId: request.txId, note: '' });
      setError('');
    }
  }, [request]);
  useEffect(() => {
    if (draft) {
      editor.current?.focus({ preventScroll: true });
      editor.current?.scrollIntoView({ block: 'center' });
    }
  }, [request, draft?.id, draft?.symbol]);
  useEffect(() => {
    let alive = true;
    setSentiment(null);
    if (draft?.symbol && !draft.id) {
      fetchSentimentV2(draft.symbol).then(data => { if (alive) setSentiment(data); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [draft?.symbol, draft?.id]);

  const symbols = [...new Set(entries.map(e => e.symbol))].sort().join(',');
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const symbol of symbols ? symbols.split(',') : []) {
        let history: DailyHistory | null = null;
        try { history = await fetchDailyHistory(symbol); } catch { /* Missing history stays unavailable. */ }
        if (!alive) return;
        setHistories(prev => ({ ...prev, [symbol]: history }));
      }
    })();
    return () => { alive = false; };
  }, [symbols, retry]);

  const persist = (next: JournalEntry[]) => {
    if (!saveJournal(next)) { setError(t('journal.saveFailed')); return false; }
    setEntries(next);
    setError('');
    return true;
  };
  const save = () => {
    if (!draft) return;
    const current = getJournal();
    const original = draft.id ? current.find(e => e.id === draft.id) : undefined;
    if (draft.id && !original) { setError(t('journal.removed')); return; }
    const asset = getAssetBySymbol(draft.symbol);
    const tick = ticks[draft.symbol];
    const score = evidence[draft.symbol]?.score;
    const labels = sentiment?.symbol === draft.symbol ? sentiment.horizons : null;
    const label = (h: 'short' | 'medium' | 'long') => {
      const value = labels?.[h]?.label;
      return value && JOURNAL_LABELS.includes(value) ? value : null;
    };
    const entry: JournalEntry = original ? { ...original, note: draft.note.trim() } : {
      id: crypto.randomUUID(), symbol: draft.symbol, txId: draft.txId, createdAt: Date.now(), note: draft.note.trim(),
      snapshot: {
        // Keep the native quote units used by daily history (gold: USD/oz; USX: cents).
        price: tick && !tick.fromSnapshot && tick.status !== 'error' && tick.currency === asset?.currency
          && Number.isFinite(tick.price) && tick.price > 0 ? tick.price : null,
        currency: asset?.currency ?? '',
        sentiment: { short: label('short'), medium: label('medium'), long: label('long') },
        evidenceScore: Number.isFinite(score) && score >= 0 && score <= 100 ? score : null,
      },
    };
    if (!validateEntry(entry)) { setError(t('journal.invalid')); return; }
    if (original && !window.confirm(t('journal.confirmEdit'))) return;
    if (persist([...current.filter(e => e.id !== entry.id), entry])) setDraft(null);
  };

  return (
    <section className="p-4 rounded-xl border space-y-4 min-w-0" style={card} aria-labelledby="journal-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="journal-heading" className="text-base font-bold">{t('journal.title')}</h2>
        <button type="button" className={button} style={card} onClick={() => { setDraft({ symbol: '', txId: null, note: '' }); setError(''); }}>{t('journal.add')}</button>
      </div>
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('journal.intro')}</p>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('journal.reviewNote')}</p>
      {draft && (
        <form className="space-y-3 p-3 rounded-lg border" style={card} onSubmit={e => { e.preventDefault(); save(); }}>
          <h3 className="font-semibold">{t(draft.id ? 'journal.edit' : 'journal.add')}</h3>
          {draft.id || draft.txId ? (
            <p className="text-sm break-words">{draft.symbol}{draft.txId ? ` · ${t('journal.linked')}` : ''}</p>
          ) : (
            <AssetSearch ticks={ticks} selected={getAssetBySymbol(draft.symbol)} label={t('journal.asset')} placeholder={t('journal.search')}
              onSelect={asset => setDraft({ ...draft, symbol: asset.symbol })} />
          )}
          <label className="block space-y-1">
            <span className="text-sm">{t('journal.note')}</span>
            <textarea ref={editor} value={draft.note} required maxLength={1000} rows={4}
              onChange={e => setDraft({ ...draft, note: e.target.value })}
              className="w-full min-w-0 p-3 rounded-lg border text-base" style={card} />
          </label>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t(draft.id ? 'journal.keepSnapshot' : 'journal.capture')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={button} style={card}>{t('journal.save')}</button>
            <button type="button" className={button} style={card} onClick={() => { setDraft(null); setError(''); }}>{t('journal.cancel')}</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-down)' }}>{error}</p>}
      <label className="block text-sm space-y-1">
        <span>{t('journal.filter')}</span>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="block w-full min-h-11 p-2 rounded-lg border text-base" style={card}>
          <option value="">{t('journal.all')}</option>
          {[...new Set(entries.map(e => e.symbol))].sort().map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}
        </select>
      </label>
      {entries.length === 0 && <p className="text-sm">{t('journal.empty')}</p>}
      <ul className="space-y-3">
        {sortEntries(entries).filter(e => !filter || e.symbol === filter).map(entry => {
          const asset = getAssetBySymbol(entry.symbol);
          const history = histories[entry.symbol];
          const changes = reviewChanges(entry, history?.currency === entry.snapshot.currency && Array.isArray(history.bars) ? history.bars : []);
          return (
            <li key={entry.id} className="p-3 border rounded-lg space-y-2 min-w-0" style={card}>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong className="break-words">{entry.symbol}{asset ? ` · ${assetName(asset)}` : ''}</strong>
                <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', { timeZone: 'Asia/Jakarta' })}</time>
              </div>
              {entry.txId && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('journal.linked')}</p>}
              <p className="whitespace-pre-wrap break-words text-sm">{entry.note}</p>
              <Snapshot snapshot={entry.snapshot} />
              <div className="flex flex-wrap gap-2 text-xs">
                {(['w1', 'm1', 'm3'] as const).map(h => (
                  <span key={h} className="rounded-md px-2 py-1" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
                    {t(`journal.${h}`)} · {changes[h] === null ? t('journal.pending') : t('journal.since', { change: formatPercent(changes[h]!) })}
                  </span>
                ))}
              </div>
              {history === null && <button type="button" className={button} style={card} onClick={() => setRetry(n => n + 1)}>{t('journal.retry')}</button>}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} style={card} onClick={() => { setDraft({ id: entry.id, symbol: entry.symbol, txId: entry.txId, note: entry.note }); setError(''); }}>{t('journal.edit')}</button>
                <button type="button" className={button} style={{ ...card, color: 'var(--color-down)' }} onClick={() => {
                  if (window.confirm(t('journal.confirmDelete')) && persist(getJournal().filter(e => e.id !== entry.id)) && draft?.id === entry.id) setDraft(null);
                }}>{t('journal.delete')}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Snapshot({ snapshot: s }: { snapshot: JournalEntry['snapshot'] }) {
  const t = useT();
  return <div className="flex flex-wrap gap-2 text-xs [&>span]:rounded-md [&>span]:px-2 [&>span]:py-1 [&>span]:bg-[var(--bg-surface-subtle)]" style={{ color: 'var(--text-secondary)' }}>
    <span>{t('journal.price', { value: s.price === null ? '—' : formatPrice(s.price, s.currency), currency: s.currency })}</span>
    <span>{t('journal.evidence', { value: s.evidenceScore === null ? '—' : formatNumber(s.evidenceScore, 0) })}</span>
    {(['short', 'medium', 'long'] as const).map(h => <span key={h}>{t(`journal.${h}`)}: {s.sentiment[h] === null ? '—' : t(`journal.label.${s.sentiment[h]}`)}</span>)}
  </div>;
}
