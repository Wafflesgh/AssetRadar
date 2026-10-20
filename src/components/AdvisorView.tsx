/**
 * AdvisorView.tsx — The AI Advisor page (#/advisor): a personalized, backtested outlook for
 * every instrument. Shows the summary of what currently looks statistically attractive, the
 * ranking per risk profile and horizon, each asset's chosen strategy with its holdout hit
 * rate vs base rate, risk stats, Fed-decision reactions and the methodology. A "How verdicts
 * are decided" box and a pass/fail checklist on every card show exactly why an asset is
 * favorable, on the watch list, unfavorable or has no proven edge. Refreshes every 10 minutes
 * with the latest prices and news, and keeps a live (forward-test) track record of its own
 * verdicts on this device. A statistical screen, not personal advice.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  ChevronDown,
  ExternalLink,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ASSETS, PriceTick } from '../config/assets.ts';
import { AiOutlookResponse, fetchAiOutlook } from '../services/marketDataService.ts';
import {
  RISK_PROFILES,
  rankOutlooks,
  type RankedOutlook,
  type RiskProfile,
  type Verdict,
} from '../ai/outlook.ts';
import { formatPercent } from '../utils/format.ts';
import { formatRelativeTime } from '../utils/marketHours.ts';
import { getAiPrefs, getSavedRiskResult, saveAiPrefs, type AiPrefs } from '../utils/storage.ts';
import { profileForAnswers } from '../config/riskProfiles.ts';
import { LiveTrackRecord } from './LiveTrackRecord.tsx';
import { useLang, useT, type TranslationKey } from '../i18n/index.ts';
import { Rich } from '../i18n/Rich.tsx';
import { assetName, groupTitle } from '../i18n/assetNames.ts';
import type { AssetGroup } from '../config/assets.ts';

const REFRESH_MS = 10 * 60_000;

const VERDICT_META: Record<Verdict, { title: TranslationKey; color: string; soft: string; hint: TranslationKey }> = {
  favorable: { title: 'verdict.favorable', color: 'var(--color-up)', soft: 'var(--color-up-soft)', hint: 'verdict.favorable.hint' },
  watch: { title: 'verdict.watch', color: 'var(--color-gold)', soft: 'var(--color-gold-soft)', hint: 'verdict.watch.hint' },
  unfavorable: { title: 'verdict.unfavorable', color: 'var(--color-down)', soft: 'var(--color-down-soft)', hint: 'verdict.unfavorable.hint' },
  'no-signal': { title: 'verdict.no-signal', color: 'var(--text-secondary)', soft: 'var(--bg-surface-subtle)', hint: 'verdict.no-signal.hint' },
  'not-suitable': {
    title: 'verdict.not-suitable.long',
    color: 'var(--text-secondary)',
    soft: 'var(--bg-surface-subtle)',
    hint: 'verdict.not-suitable.hint',
  },
};

const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;

interface AdvisorViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
}

export function AdvisorView({ ticks, onSelectAsset }: AdvisorViewProps) {
  const t = useT();
  const lang = useLang();
  const [prefs, setPrefs] = useState<AiPrefs>(() => getAiPrefs());
  // Profile from the Risk Profile questionnaire, if the viewer took it
  const [quizProfile] = useState(() => {
    const saved = getSavedRiskResult();
    return saved ? profileForAnswers(saved.answers) : null;
  });
  const [data, setData] = useState<AiOutlookResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [showMethod, setShowMethod] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setState('loading');
      try {
        setData(await fetchAiOutlook(prefs.horizon, prefs.profile));
        setState('ready');
      } catch {
        if (!silent) setState('error');
      } finally {
        setRefreshing(false);
      }
    },
    [prefs.horizon, prefs.profile]
  );

  useEffect(() => {
    load(data !== null);
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
    // data is only read to decide whether to show the full loading state
  }, [load]);

  const updatePrefs = (patch: Partial<AiPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveAiPrefs(next);
  };

  const ranked = useMemo(
    () =>
      data ? rankOutlooks(data.assets, prefs.profile, { geoAlertActive: data.geoAlertActive, lang }) : [],
    [data, prefs.profile, lang]
  );
  const groups = useMemo(() => {
    const out: Record<Verdict, RankedOutlook[]> = {
      favorable: [],
      watch: [],
      unfavorable: [],
      'no-signal': [],
      'not-suitable': [],
    };
    for (const o of ranked) out[o.verdict].push(o);
    return out;
  }, [ranked]);

  return (
    <div className="space-y-6">
      {/* Mandatory disclaimer */}
      <div
        role="note"
        className="p-4 rounded-xl border flex items-start gap-3 text-xs md:text-sm leading-relaxed"
        style={{ backgroundColor: 'var(--color-gold-soft)', borderColor: 'var(--color-gold)' }}
      >
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--color-gold)' }} />
        <p>
          <Rich text={t('adv.disclaimer')} />
        </p>
      </div>

      {/* Header & personalization */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <BrainCircuit className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />
            <span>{t('adv.kicker')}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">{t('adv.title')}</h1>
          <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {t('adv.intro')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div role="group" aria-label={t('adv.riskProfile')} className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            {(Object.keys(RISK_PROFILES) as RiskProfile[]).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={prefs.profile === p}
                onClick={() => updatePrefs({ profile: p })}
                title={t(`risk.profile.${p}.desc` as TranslationKey)}
                className="px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: prefs.profile === p ? 'var(--accent-radar)' : 'var(--bg-surface)',
                  color: prefs.profile === p ? '#0B1220' : 'var(--text-primary)',
                }}
              >
                {t(`risk.profile.${p}` as TranslationKey)}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t('adv.horizon')} className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            {([20, 60] as const).map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={prefs.horizon === h}
                onClick={() => updatePrefs({ horizon: h })}
                className="px-3 py-2 text-xs font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: prefs.horizon === h ? 'var(--accent-radar)' : 'var(--bg-surface)',
                  color: prefs.horizon === h ? '#0B1220' : 'var(--text-primary)',
                }}
              >
                {h === 20 ? t('adv.h20') : t('adv.h60')}
              </button>
            ))}
          </div>
        </div>
      </header>
      <p className="text-xs -mt-3" style={{ color: 'var(--text-secondary)' }}>
        {t(`risk.profile.${prefs.profile}.desc` as TranslationKey)}{' '}
        {t('adv.maxVol', { vol: pct(RISK_PROFILES[prefs.profile].maxVolatility) })}{' '}
        {quizProfile === prefs.profile ? (
          <span>{t('adv.quizMatch')}</span>
        ) : (
          <a href="#/risk" className="font-semibold hover:underline" style={{ color: 'var(--accent-radar)' }}>
            {quizProfile
              ? t('adv.quizWas', { profile: t(`risk.profile.${quizProfile}` as TranslationKey) })
              : t('adv.quizTake')}
          </a>
        )}
      </p>

      {state === 'loading' && !data ? (
        <div
          className="p-8 rounded-xl border text-center text-sm space-y-2"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
          role="status"
        >
          <RefreshCw className="w-5 h-5 mx-auto animate-spin" style={{ color: 'var(--accent-radar)' }} />
          <p>{t('adv.loading')}</p>
          <p className="text-xs">{t('adv.loadingNote')}</p>
        </div>
      ) : state === 'error' && !data ? (
        <div
          className="p-8 rounded-xl border text-center text-sm space-y-3"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          role="alert"
        >
          <p>{t('common.dataUnavailable')}</p>
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {t('common.tryAgain')}
          </button>
        </div>
      ) : data ? (
        <>
          <SummaryCard data={data} refreshing={refreshing} onRefresh={() => load(true)} />
          <VerdictRules />
          {(['favorable', 'watch', 'unfavorable', 'no-signal', 'not-suitable'] as Verdict[]).map((v) =>
            groups[v].length === 0 ? null : (
              <section key={v} aria-labelledby={`verdict-${v}`} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <h2 id={`verdict-${v}`} className="text-base md:text-lg font-bold" style={{ color: VERDICT_META[v].color }}>
                    {t(VERDICT_META[v].title)} <span className="font-mono-num text-sm">({groups[v].length})</span>
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t(VERDICT_META[v].hint)}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {groups[v].map((o) => (
                    <OutlookCard
                      key={o.symbol}
                      outlook={o}
                      tick={ticks[o.symbol]}
                      horizonDays={data.horizonDays}
                      onOpen={() => onSelectAsset(o.symbol)}
                    />
                  ))}
                </div>
              </section>
            )
          )}
          <LiveTrackRecord ranked={ranked} horizonDays={data.horizonDays} profile={prefs.profile} ticks={ticks} />
          <Methodology open={showMethod} onToggle={() => setShowMethod((s) => !s)} />
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({
  data,
  refreshing,
  onRefresh,
}: {
  data: AiOutlookResponse;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useT();
  return (
    <section
      aria-label={t('adv.summaryLabel')}
      className="p-5 md:p-6 rounded-xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-radar)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent-radar)' }}>
          <Sparkles className="w-4 h-4" />
          <span>{t('adv.summaryTitle')}{data.summary.aiPowered ? ` ${t('adv.aiWritten')}` : ''}</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t('adv.refresh')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {formatRelativeTime(data.generatedAt)}
        </button>
      </div>
      <p className="text-sm md:text-base leading-relaxed">{data.summary.text}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {data.nextFomc && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <Landmark className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
            <Rich text={t('adv.nextFed', { date: data.nextFomc.date, days: data.nextFomc.daysUntil })} />
          </span>
        )}
        {data.recentFedDecisions.map((d) => (
          <span
            key={d.date}
            className="px-2.5 py-1 rounded-md font-mono-num"
            style={{
              backgroundColor:
                d.decision === 'cut' ? 'var(--color-up-soft)' : d.decision === 'hike' ? 'var(--color-down-soft)' : 'var(--bg-surface-subtle)',
            }}
            title={d.inferred ? t('adv.fedInferred') : t('adv.fedRecorded')}
          >
            Fed {d.date}: {t(`adv.fed.${d.decision}` as TranslationKey)}
            {d.inferred ? ` ${t('adv.inferred')}` : ''}
          </span>
        ))}
        {data.geoAlertActive && (
          <span className="px-2.5 py-1 rounded-md font-semibold" style={{ backgroundColor: 'var(--color-down-soft)', color: 'var(--color-down)' }}>
            {t('adv.geo')}
          </span>
        )}
      </div>
    </section>
  );
}

function OutlookCard({
  outlook: o,
  tick,
  horizonDays,
  onOpen,
}: {
  outlook: RankedOutlook;
  tick?: PriceTick;
  horizonDays: number;
  onOpen: () => void;
}) {
  const t = useT();
  const meta = VERDICT_META[o.verdict];
  const bt = o.backtest;
  const cuts = o.fedReactions.find((r) => r.decision === 'cut');
  const hikes = o.fedReactions.find((r) => r.decision === 'hike');
  const asset = ASSETS.find((a) => a.symbol === o.symbol);
  const change = tick?.changePct24h;
  return (
    <article
      className="rounded-xl border p-4 space-y-3 flex flex-col"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
            {o.code} · {groupTitle((asset?.group ?? o.group) as AssetGroup)}
          </div>
          <h3 className="text-sm font-bold truncate">{asset ? assetName(asset) : o.name}</h3>
        </div>
        <span
          className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap"
          style={{ backgroundColor: meta.soft, color: meta.color }}
        >
          {t(meta.title)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {o.signal === 'none' && o.strategy !== 'model' ? (
          // A rule without an active setup has no probability of its own
          <Metric
            label={t('adv.chance', { h: horizonDays === 20 ? t('adv.h1M') : t('adv.h3M') })}
            value={t('adv.noSetup')}
            sub={o.strategy === 'meanReversion' ? t('adv.onlyOversold') : t('adv.waiting')}
            color={meta.color}
          />
        ) : (
          <Metric
            label={t('adv.chance', { h: horizonDays === 20 ? t('adv.h1M') : t('adv.h3M') })}
            value={pct(o.adjustedProbability)}
            sub={o.probabilityUp !== null ? t('adv.rawTrust', { raw: pct(o.probabilityUp), trust: pct(o.reliability) }) : undefined}
            color={meta.color}
          />
        )}
        <Metric
          label={t('adv.move24')}
          value={formatPercent(change)}
          color={change === undefined ? undefined : change >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
        />
        <Metric
          label={t('adv.holdoutHit')}
          value={bt?.signalHitRate !== null && bt?.signalHitRate !== undefined ? pct(bt.signalHitRate) : '—'}
          sub={bt ? t('adv.vsBase', { base: pct(bt.baseRate), n: bt.signalCount }) : undefined}
        />
        <Metric
          label={t('adv.avgAfter')}
          value={pct(bt?.avgReturnSignal, 1)}
          sub={bt ? t('adv.vsAll', { all: pct(bt.avgReturnAll, 1) }) : undefined}
        />
        <Metric label={t('adv.volYr')} value={pct(o.stats.volatility)} sub={t('adv.maxDd', { dd: pct(o.stats.maxDrawdown) })} />
        <Metric
          label={t('adv.evidence')}
          value={o.evidence ? `${o.evidence.score}/100` : '—'}
          sub={o.evidence ? `${t(`sentiment.${o.evidence.label}` as TranslationKey)} · ${t('adv.ret1y', { r: pct(o.stats.return1y) })}` : t('adv.ret1y', { r: pct(o.stats.return1y) })}
          color={
            o.evidence?.label === 'Bullish' ? 'var(--color-up)' : o.evidence?.label === 'Bearish' ? 'var(--color-down)' : undefined
          }
        />
      </div>

      {o.strategyLabel && (
        <p className="text-[11px] flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: 'var(--accent-radar)' }} />
          <span>
            <Rich
              text={t('adv.method', { label: o.strategy ? t(`strategy.${o.strategy}` as TranslationKey) : o.strategyLabel })}
              strongStyle={{ color: 'var(--text-primary)' }}
            />
          </span>
        </p>
      )}

      {o.drivers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.drivers.map((d) => (
            <span
              key={d.feature}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{
                backgroundColor: d.impact >= 0 ? 'var(--color-up-soft)' : 'var(--color-down-soft)',
                color: d.impact >= 0 ? 'var(--color-up)' : 'var(--color-down)',
              }}
              title={t('adv.driverTitle')}
            >
              {d.impact >= 0 ? '▲' : '▼'} {t(`feature.${d.feature}` as TranslationKey)}
            </span>
          ))}
        </div>
      )}

      {(cuts?.count ?? 0) > 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('adv.afterCuts', { avg: pct(cuts?.avg20, 1), n: cuts?.count ?? 0, up: pct(cuts?.positive20) })}
          {(hikes?.count ?? 0) > 0 && ` ${t('adv.afterHikes', { avg: pct(hikes?.avg20, 1), n: hikes?.count ?? 0 })}`}
        </p>
      )}

      {o.idMacroTest && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }} title={t('adv.idMacroTitle')}>
          {t('adv.idMacro', {
            used: o.idMacroTest.used ? t('adv.used') : t('adv.notUsed'),
            with: pct(o.idMacroTest.holdoutAccuracyWith),
            without: pct(o.idMacroTest.holdoutAccuracyWithout),
          })}
        </p>
      )}

      {o.reasons.length > 0 && (
        <ul className="text-[11px] space-y-0.5 font-semibold" style={{ color: meta.color }}>
          {o.reasons.map((r) => (
            <li key={r}>› {r}</li>
          ))}
        </ul>
      )}

      <details className="text-[11px]">
        <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {t('adv.why', { passed: o.checks.filter((c) => c.pass).length, total: o.checks.filter((c) => c.pass !== null).length })}
        </summary>
        <ul className="mt-1.5 space-y-1">
          {o.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-1.5">
              <span
                aria-label={c.pass === null ? t('adv.na') : c.pass ? t('adv.passed') : t('adv.failed')}
                className="font-bold w-3 shrink-0"
                style={{ color: c.pass === null ? 'var(--text-secondary)' : c.pass ? 'var(--color-up)' : 'var(--color-down)' }}
              >
                {c.pass === null ? '–' : c.pass ? '✓' : '✗'}
              </span>
              <span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{c.label}</span>
                <span className="block" style={{ color: 'var(--text-secondary)' }}>{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={onOpen}
        className="mt-auto inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold border"
        style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)' }}
      >
        {t('adv.viewChart')} <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
      </button>
    </article>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-surface-subtle)' }}>
      <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div className="text-sm font-mono-num font-bold" style={{ color: color ?? 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono-num" style={{ color: 'var(--text-secondary)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** The decision rules, always visible above the cards. */
function VerdictRules() {
  const t = useT();
  const rows: Verdict[] = ['not-suitable', 'no-signal', 'unfavorable', 'favorable', 'watch'];
  return (
    <section
      aria-labelledby="verdict-rules-heading"
      className="rounded-xl border p-4 md:p-5 space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div>
        <h2 id="verdict-rules-heading" className="text-sm md:text-base font-bold">
          {t('adv.rulesTitle')}
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t('adv.rulesNote')}
        </p>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {rows.map((v) => (
          <div key={v} className="flex gap-2">
            <dt
              className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap h-fit"
              style={{ backgroundColor: VERDICT_META[v].soft, color: VERDICT_META[v].color }}
            >
              {t(VERDICT_META[v].title)}
            </dt>
            <dd style={{ color: 'var(--text-secondary)' }}>{t(`verdict.${v}.rule` as TranslationKey)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Methodology({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <section
      className="rounded-xl border"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 p-4 text-sm font-bold"
      >
        {t('adv.methodTitle')}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs leading-relaxed space-y-2" style={{ color: 'var(--text-secondary)' }}>
          {(['adv.m1', 'adv.m2', 'adv.m3', 'adv.m4', 'adv.m5', 'adv.m6', 'adv.mLimits', 'adv.m7'] as const).map((k) => (
            <p key={k}>
              <Rich text={t(k)} strongStyle={{ color: 'var(--text-primary)' }} />
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
