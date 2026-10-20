/**
 * LiveTrackRecord.tsx — AI Advisor "Live track record": saves today's verdicts once per day for
 * the selected horizon and profile (on this device), checks saved verdicts against real daily
 * closes once their horizon has passed, and shows how often prices rose after each verdict
 * versus the base rate of all saved verdicts. Under 30 results it says so instead of judging.
 * Export/import moves the log between devices.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, History, Upload } from 'lucide-react';
import type { RankedOutlook } from '../ai/outlook.ts';
import {
  MIN_RESULTS,
  emptyLog,
  evaluateSnapshots,
  parseForwardLog,
  pendingSymbols,
  recordSnapshots,
  trackRecord,
  type DailyClose,
  type ForwardLog,
} from '../ai/forwardTest.ts';
import type { PriceTick } from '../config/assets.ts';
import { fetchHistory } from '../services/marketDataService.ts';
import { getForwardLogRaw, saveForwardLogRaw } from '../utils/storage.ts';
import { t as tr, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';

const verdictLabel = (v: string) => tr(`verdict.${v}` as TranslationKey);

const WIB_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' });
const pct = (v: number | null, d = 0) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);

function loadLog(): ForwardLog {
  return parseForwardLog(getForwardLogRaw()) ?? emptyLog();
}

interface LiveTrackRecordProps {
  ranked: RankedOutlook[];
  horizonDays: number;
  profile: string;
  ticks: Record<string, PriceTick>;
}

export function LiveTrackRecord({ ranked, horizonDays, profile, ticks }: LiveTrackRecordProps) {
  const t = useT();
  const [log, setLog] = useState<ForwardLog>(() => loadLog());
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = (next: ForwardLog) => {
    setLog(next);
    if (!saveForwardLogRaw(next)) setNotice(tr('ltr.saveBlocked'));
  };

  // 1. Save today's verdicts (once per day, horizon and profile; never back-filled)
  const today = WIB_DATE.format(new Date());
  // Wait until most live prices are in, so the saved reference prices are real
  const pricesReady =
    ranked.length > 0 &&
    ranked.filter((o) => ticks[o.symbol]?.status !== 'error' && Number.isFinite(ticks[o.symbol]?.price)).length >= ranked.length * 0.6;
  useEffect(() => {
    if (!pricesReady) return;
    const current = loadLog();
    const next = recordSnapshots(
      current,
      today,
      horizonDays,
      profile,
      ranked.map((o) => ({ symbol: o.symbol, verdict: o.verdict, chance: o.adjustedProbability, price: ticks[o.symbol]?.price }))
    );
    if (next !== current) save(next);
  }, [ranked, horizonDays, profile, today, pricesReady]);

  // 2. Score saved verdicts whose horizon has passed, from daily closes
  const pending = pendingSymbols(log, today).join(',');
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    (async () => {
      setChecking(true);
      const history = new Map<string, DailyClose[]>();
      const symbols = pending.split(',');
      for (let i = 0; i < symbols.length; i += 4) {
        await Promise.all(
          symbols.slice(i, i + 4).map(async (sym) => {
            try {
              const candles = await fetchHistory(sym, 'D');
              history.set(
                sym,
                candles.map((c) => ({ date: WIB_DATE.format(new Date(c.time * 1000)), close: c.close }))
              );
            } catch {
              // Try again next time
            }
          })
        );
      }
      if (!alive) return;
      setChecking(false);
      const current = loadLog();
      const next = evaluateSnapshots(current, history);
      if (next !== current) save(next);
    })();
    return () => {
      alive = false;
    };
  }, [pending]);

  const record = useMemo(() => trackRecord(log, horizonDays, profile), [log, horizonDays, profile]);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assetradar-ai-track-record-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const doImport = async (file: File) => {
    try {
      const parsed = parseForwardLog(JSON.parse(await file.text()));
      if (!parsed) throw new Error(tr('ltr.notFile'));
      if (log.snapshots.length && !window.confirm(tr('ltr.replaceConfirm', { old: log.snapshots.length, new: parsed.snapshots.length }))) return;
      save(parsed);
      setNotice(tr('ltr.imported', { n: parsed.snapshots.length }));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : tr('ltr.importFailed'));
    }
  };

  return (
    <section
      aria-labelledby="track-record-heading"
      className="rounded-xl border p-4 md:p-5 space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 id="track-record-heading" className="text-sm md:text-base font-bold flex items-center gap-2">
            <History className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('ltr.title')}
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('ltr.intro', { days: horizonDays })}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={doExport} disabled={!log.snapshots.length} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40" style={{ borderColor: 'var(--border-subtle)' }}>
            <Download className="w-3.5 h-3.5" /> {t('ltr.export')}
          </button>
          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer" style={{ borderColor: 'var(--border-subtle)' }}>
            <Upload className="w-3.5 h-3.5" /> {t('ltr.import')}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <p className="text-xs">
        <Rich text={t('ltr.status', { start: record.startedAt ?? today, saved: record.saved, evaluated: record.evaluated })} />
        {checking ? ` ${t('ltr.checking')}` : ''}
      </p>

      {record.evaluated < MIN_RESULTS ? (
        <p className="text-sm p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
          {t('ltr.tooFew', { n: record.evaluated, min: MIN_RESULTS, days: horizonDays })}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">{t('ltr.caption')}</caption>
            <thead>
              <tr className="text-left" style={{ color: 'var(--text-secondary)' }}>
                <th className="py-1.5 pr-2 font-semibold">{t('ltr.verdict')}</th>
                <th className="py-1.5 pr-2 font-semibold text-right">{t('ltr.results')}</th>
                <th className="py-1.5 pr-2 font-semibold text-right">{t('ltr.rose')}</th>
                <th className="py-1.5 font-semibold text-right">{t('ltr.avgMove')}</th>
              </tr>
            </thead>
            <tbody>
              {record.rows
                .filter((r) => r.samples > 0)
                .map((r) => (
                  <tr key={r.verdict} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="py-1.5 pr-2 font-semibold">{verdictLabel(r.verdict)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono-num">{r.samples}</td>
                    <td className="py-1.5 pr-2 text-right font-mono-num">
                      {pct(r.upRate)} {r.samples < MIN_RESULTS && <span style={{ color: 'var(--text-secondary)' }}>{t('ltr.few')}</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono-num">{pct(r.avgReturn, 1)}</td>
                  </tr>
                ))}
              <tr className="border-t font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="py-1.5 pr-2">{t('ltr.baseRate')}</td>
                <td className="py-1.5 pr-2 text-right font-mono-num">{record.evaluated}</td>
                <td className="py-1.5 pr-2 text-right font-mono-num">{pct(record.baseUpRate)}</td>
                <td className="py-1.5 text-right" />
              </tr>
            </tbody>
          </table>
          <p className="text-[11px] mt-2" style={{ color: 'var(--text-secondary)' }}>
            {t('ltr.note')}
          </p>
        </div>
      )}
      {notice && (
        <p role="status" className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {notice}
        </p>
      )}
    </section>
  );
}
