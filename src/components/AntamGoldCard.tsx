/**
 * AntamGoldCard.tsx — "Antam gold bar" card on the gold page (and used by the portfolio): links
 * to the official Logam Mulia and Pegadaian price pages, a form to record the buyback price per
 * gram you read there (no automatic scraping — no official feed is available to the server), the
 * recorded history (only prices actually entered), the gap to spot, and bar values per standard
 * size. Recorded prices are synced and value physical gold in the portfolio.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import type { PriceTick } from '../config/assets.ts';
import { ANTAM_SIZES, buybackVsSpot, latestEntry, OFFICIAL_SOURCES, parseGoldEntries, perBar, validateGoldEntry, type GoldPriceEntry, type GoldSource } from '../utils/goldBar.ts';
import { formatRupiah } from '../utils/format.ts';
import { getGoldPricesRaw, saveGoldPrices } from '../utils/storage.ts';
import { onSyncApplied } from '../services/syncService.ts';
import { useLang, useT, type TranslationKey } from '../i18n/index.ts';

const card = { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' };
const muted = { color: 'var(--text-secondary)' };
const inputStyle = { backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
const todayWib = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const parseNum = (s: string) => Number(s.replace(/[^\d.]/g, ''));

export function useGoldPrices(): GoldPriceEntry[] {
  const [list, setList] = useState<GoldPriceEntry[]>(() => parseGoldEntries(getGoldPricesRaw()));
  useEffect(() => {
    const reload = () => setList(parseGoldEntries(getGoldPricesRaw()));
    window.addEventListener('assetradar:gold-prices-changed', reload);
    const off = onSyncApplied(['goldPrices'], reload);
    return () => {
      window.removeEventListener('assetradar:gold-prices-changed', reload);
      off();
    };
  }, []);
  return list;
}

export function AntamGoldCard({ tick }: { tick?: PriceTick }) {
  const t = useT();
  const lang = useLang();
  const entries = useGoldPrices();
  const srcName = (s: GoldSource) => (s === 'antam' ? 'Antam' : s === 'pegadaian' ? 'Pegadaian' : t('gold.other'));
  const [date, setDate] = useState(todayWib());
  const [source, setSource] = useState<GoldSource>('antam');
  const [buyback, setBuyback] = useState('');
  const [sell, setSell] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const spot = tick && tick.status !== 'error' && Number.isFinite(tick.priceIdrPerGram) ? tick.priceIdrPerGram : undefined;
  const latest = latestEntry(entries);
  const gap = latest ? buybackVsSpot(latest.buybackPerGram, spot) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const draft: Partial<GoldPriceEntry> = { date, source, buybackPerGram: parseNum(buyback), sellPerGram: sell.trim() ? parseNum(sell) : undefined };
    const errs = validateGoldEntry(draft, todayWib(), lang);
    if (errs.length) return setErrors(errs);
    setErrors([]);
    const item: GoldPriceEntry = { id: `gp-${Date.now().toString(36)}`, date, source, buybackPerGram: draft.buybackPerGram as number };
    if (draft.sellPerGram) item.sellPerGram = draft.sellPerGram;
    saveGoldPrices([...entries, item]);
    setBuyback('');
    setSell('');
  };

  return (
    <section className="p-4 md:p-5 rounded-xl border space-y-3" style={card} aria-labelledby="antam-heading">
      <div>
        <h2 id="antam-heading" className="text-base font-bold">
          {t('gold.title')}
        </h2>
        <p className="text-xs" style={muted}>
          {t('gold.intro')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {OFFICIAL_SOURCES.map((s) => (
          <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
            {t(`gold.src.${s.id}` as TranslationKey)} <ExternalLink className="w-3 h-3" />
          </a>
        ))}
      </div>

      {latest ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
            <div style={muted}>{t('gold.latest', { source: srcName(latest.source), date: latest.date })}</div>
            <div className="text-base font-bold font-mono-num">{formatRupiah(latest.buybackPerGram)}/g</div>
          </div>
          <div className="p-2.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
            <div style={muted}>{t('gold.spot')}</div>
            <div className="text-base font-bold font-mono-num">{spot ? `${formatRupiah(spot)}/g` : t('common.dataUnavailable')}</div>
          </div>
          <div className="p-2.5 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
            <div style={muted}>{t('gold.vsSpot')}</div>
            <div className="text-base font-bold font-mono-num">{gap === null ? '—' : `${gap > 0 ? '+' : ''}${(gap * 100).toFixed(1)}%`}</div>
          </div>
        </div>
      ) : (
        <p className="text-xs" style={muted}>
          {t('gold.none')}
        </p>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs items-end">
        <label className="space-y-1">
          <span style={muted}>{t('gold.date')}</span>
          <input type="date" value={date} max={todayWib()} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 rounded border" style={inputStyle} />
        </label>
        <label className="space-y-1">
          <span style={muted}>{t('common.source')}</span>
          <select value={source} onChange={(e) => setSource(e.target.value as GoldSource)} className="w-full px-2 py-1.5 rounded border" style={inputStyle}>
            <option value="antam">Antam</option>
            <option value="pegadaian">Pegadaian</option>
            <option value="other">{t('gold.other')}</option>
          </select>
        </label>
        <label className="space-y-1">
          <span style={muted}>{t('gold.buyback')}</span>
          <input inputMode="numeric" value={buyback} onChange={(e) => setBuyback(e.target.value)} placeholder={t('gold.buybackPh')} className="w-full px-2 py-1.5 rounded border font-mono-num" style={inputStyle} />
        </label>
        <label className="space-y-1">
          <span style={muted}>{t('gold.sell')}</span>
          <input inputMode="numeric" value={sell} onChange={(e) => setSell(e.target.value)} className="w-full px-2 py-1.5 rounded border font-mono-num" style={inputStyle} />
        </label>
        <button type="submit" className="px-3 py-2 rounded-lg font-semibold" style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}>
          {t('gold.save')}
        </button>
      </form>
      {errors.length > 0 && (
        <ul className="text-xs font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {latest && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold">{t('gold.perBar')}</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full whitespace-nowrap">
              <tbody>
                {ANTAM_SIZES.map((g) => (
                  <tr key={g} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-1 pr-2">{g} g</td>
                    <td className="py-1 text-right font-mono-num">{formatRupiah(perBar(latest.buybackPerGram, g))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1" style={muted}>
              {t('gold.perBarNote')}
            </p>
          </div>
        </details>
      )}

      {entries.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold">{t('gold.recorded', { n: entries.length })}</summary>
          <ul className="mt-2 space-y-1">
            {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <li key={e.id} className="flex justify-between gap-2 border-t pt-1" style={{ borderColor: 'var(--border-subtle)' }}>
                <span>
                  {e.date} · {srcName(e.source)} · {t('gold.buybackShort')} <span className="font-mono-num">{formatRupiah(e.buybackPerGram)}</span>/g
                  {e.sellPerGram ? (
                    <>
                      {' '}
                      · {t('gold.sellShort')} <span className="font-mono-num">{formatRupiah(e.sellPerGram)}</span>/g
                    </>
                  ) : null}
                </span>
                <button type="button" aria-label={t('gold.delete')} onClick={() => saveGoldPrices(entries.filter((x) => x.id !== e.id))} style={{ color: 'var(--color-down)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1" style={muted}>
            {t('gold.onlyEntered')}
          </p>
        </details>
      )}
    </section>
  );
}
