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

const REFRESH_MS = 10 * 60_000;

const VERDICT_META: Record<Verdict, { title: string; color: string; soft: string; hint: string }> = {
  favorable: {
    title: 'Favorable now',
    color: 'var(--color-up)',
    soft: 'var(--color-up-soft)',
    hint: 'A proven test signals bullish, none bearish, the evidence score is not bearish and the chance of a gain is at least 55%.',
  },
  watch: {
    title: 'Watch list',
    color: 'var(--color-gold)',
    soft: 'var(--color-gold-soft)',
    hint: 'A proven test exists, but there is no active setup, the tests disagree, or the evidence score contradicts.',
  },
  unfavorable: {
    title: 'Unfavorable now',
    color: 'var(--color-down)',
    soft: 'var(--color-down-soft)',
    hint: 'A proven test signals bearish and none signals bullish — better avoided for now.',
  },
  'no-signal': {
    title: 'No proven edge',
    color: 'var(--text-secondary)',
    soft: 'var(--bg-surface-subtle)',
    hint: "Neither the backtested strategy nor the scorecard beat the base rate on this asset's history, so the AI makes no call.",
  },
  'not-suitable': {
    title: 'Not suitable for your profile',
    color: 'var(--text-secondary)',
    soft: 'var(--bg-surface-subtle)',
    hint: 'Too volatile (or crypto) for the selected risk profile.',
  },
};

const pct = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`;

interface AdvisorViewProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
}

export function AdvisorView({ ticks, onSelectAsset }: AdvisorViewProps) {
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
      data ? rankOutlooks(data.assets, prefs.profile, { geoAlertActive: data.geoAlertActive }) : [],
    [data, prefs.profile]
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
          <strong>Statistical screen, not personal financial advice.</strong> Suggestions come from
          models tested on ~5 years of past data; past patterns can break, and no outcome is
          guaranteed. Only invest money you can afford to lose, and use products registered with
          OJK or Bappebti.
        </p>
      </div>

      {/* Header & personalization */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            <BrainCircuit className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />
            <span>Walk-forward backtested · updates every 10 minutes with live prices & news</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">AI Advisor</h1>
          <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Which instruments look statistically attractive right now for your risk profile — and
            how often the method was right on data it had never seen.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div role="group" aria-label="Risk profile" className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
            {(Object.keys(RISK_PROFILES) as RiskProfile[]).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={prefs.profile === p}
                onClick={() => updatePrefs({ profile: p })}
                title={RISK_PROFILES[p].description}
                className="px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor: prefs.profile === p ? 'var(--accent-radar)' : 'var(--bg-surface)',
                  color: prefs.profile === p ? '#0B1220' : 'var(--text-primary)',
                }}
              >
                {RISK_PROFILES[p].label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Horizon" className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
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
                {h === 20 ? '~1 month' : '~3 months'}
              </button>
            ))}
          </div>
        </div>
      </header>
      <p className="text-xs -mt-3" style={{ color: 'var(--text-secondary)' }}>
        {RISK_PROFILES[prefs.profile].description} Max volatility:{' '}
        {pct(RISK_PROFILES[prefs.profile].maxVolatility)} per year.{' '}
        {quizProfile === prefs.profile ? (
          <span>Matches your Risk Profile questionnaire result.</span>
        ) : (
          <a href="#/risk" className="font-semibold hover:underline" style={{ color: 'var(--accent-radar)' }}>
            {quizProfile
              ? `Your questionnaire result was ${RISK_PROFILES[quizProfile].label}.`
              : 'Not sure? Take the Risk Profile questionnaire.'}
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
          <p>Analyzing ~5 years of data for every instrument and running the backtests…</p>
          <p className="text-xs">The first run can take up to 30 seconds.</p>
        </div>
      ) : state === 'error' && !data ? (
        <div
          className="p-8 rounded-xl border text-center text-sm space-y-3"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          role="alert"
        >
          <p>Data unavailable</p>
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            Try again
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
                    {VERDICT_META[v].title} <span className="font-mono-num text-sm">({groups[v].length})</span>
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {VERDICT_META[v].hint}
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
  return (
    <section
      aria-label="AI summary"
      className="p-5 md:p-6 rounded-xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-radar)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent-radar)' }}>
          <Sparkles className="w-4 h-4" />
          <span>What looks attractive now{data.summary.aiPowered ? ' · AI-written' : ''}</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh the outlook"
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
            Next Fed decision: <strong>{data.nextFomc.date}</strong> ({data.nextFomc.daysUntil} days)
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
            title={d.inferred ? 'Outcome inferred from the move in US 3-month T-bill yields' : 'Recorded outcome'}
          >
            Fed {d.date}: {d.decision.toUpperCase()}
            {d.inferred ? ' (inferred)' : ''}
          </span>
        ))}
        {data.geoAlertActive && (
          <span className="px-2.5 py-1 rounded-md font-semibold" style={{ backgroundColor: 'var(--color-down-soft)', color: 'var(--color-down)' }}>
            Geopolitical alert active
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
            {o.code} · {asset?.group ?? o.group}
          </div>
          <h3 className="text-sm font-bold truncate">{o.name}</h3>
        </div>
        <span
          className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap"
          style={{ backgroundColor: meta.soft, color: meta.color }}
        >
          {meta.title}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {o.signal === 'none' && o.strategy !== 'model' ? (
          // A rule without an active setup has no probability of its own
          <Metric
            label={`Chance of a gain (~${horizonDays === 20 ? '1M' : '3M'})`}
            value="No setup"
            sub={o.strategy === 'meanReversion' ? 'signals only when oversold' : 'waiting for a signal'}
            color={meta.color}
          />
        ) : (
          <Metric
            label={`Chance of a gain (~${horizonDays === 20 ? '1M' : '3M'})`}
            value={pct(o.adjustedProbability)}
            sub={o.probabilityUp !== null ? `raw ${pct(o.probabilityUp)} · trust ${pct(o.reliability)}` : undefined}
            color={meta.color}
          />
        )}
        <Metric
          label="24h move"
          value={formatPercent(change)}
          color={change === undefined ? undefined : change >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
        />
        <Metric
          label="Holdout hit rate"
          value={bt?.signalHitRate !== null && bt?.signalHitRate !== undefined ? pct(bt.signalHitRate) : '—'}
          sub={bt ? `vs ${pct(bt.baseRate)} base · ${bt.signalCount} signals` : undefined}
        />
        <Metric
          label="Avg return after signal"
          value={pct(bt?.avgReturnSignal, 1)}
          sub={bt ? `vs ${pct(bt.avgReturnAll, 1)} on all days` : undefined}
        />
        <Metric label="Volatility / yr" value={pct(o.stats.volatility)} sub={`max drawdown ${pct(o.stats.maxDrawdown)}`} />
        <Metric
          label="Evidence score"
          value={o.evidence ? `${o.evidence.score}/100` : '—'}
          sub={o.evidence ? `${o.evidence.label} · 1y return ${pct(o.stats.return1y)}` : `1y return ${pct(o.stats.return1y)}`}
          color={
            o.evidence?.label === 'Bullish' ? 'var(--color-up)' : o.evidence?.label === 'Bearish' ? 'var(--color-down)' : undefined
          }
        />
      </div>

      {o.strategyLabel && (
        <p className="text-[11px] flex items-start gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: 'var(--accent-radar)' }} />
          <span>
            Method chosen on validation: <strong style={{ color: 'var(--text-primary)' }}>{o.strategyLabel}</strong>
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
              title="Main driver in the logistic model right now (explanatory)"
            >
              {d.impact >= 0 ? '▲' : '▼'} {d.label}
            </span>
          ))}
        </div>
      )}

      {(cuts?.count ?? 0) > 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          After Fed cuts: {pct(cuts?.avg20, 1)} avg over 20 days ({cuts?.count}×, up {pct(cuts?.positive20)})
          {(hikes?.count ?? 0) > 0 && ` · after hikes: ${pct(hikes?.avg20, 1)} (${hikes?.count}×)`}
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
          Why this verdict — {o.checks.filter((c) => c.pass).length} of {o.checks.filter((c) => c.pass !== null).length} checks passed
        </summary>
        <ul className="mt-1.5 space-y-1">
          {o.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-1.5">
              <span
                aria-label={c.pass === null ? 'Not applicable' : c.pass ? 'Passed' : 'Failed'}
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
        View chart & news <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--accent-radar)' }} />
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
  const rows: Array<{ v: Verdict; rule: string }> = [
    { v: 'not-suitable', rule: "Checked first: the asset's volatility is above your profile's limit (or crypto for Conservative)." },
    {
      v: 'no-signal',
      rule: 'Neither proven test exists: the backtested strategy did not beat the base rate on the holdout (≥ 30 signals, higher hit rate and higher return), and the technical scorecard\'s current lean did not beat the base rate by ≥ 3 points on the asset\'s own history.',
    },
    { v: 'unfavorable', rule: 'At least one proven test points down (active bearish setup) and none points up.' },
    {
      v: 'favorable',
      rule: 'At least one proven test points up and none points down, the evidence score (technicals, momentum, value, quality, news) is not bearish, and the adjusted chance of a gain is ≥ 55%.',
    },
    { v: 'watch', rule: 'Everything else: a proven test exists but has no active setup, the tests disagree, or the evidence score contradicts a bullish setup.' },
  ];
  return (
    <section
      aria-labelledby="verdict-rules-heading"
      className="rounded-xl border p-4 md:p-5 space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div>
        <h2 id="verdict-rules-heading" className="text-sm md:text-base font-bold">
          How verdicts are decided
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Two independent tests can prove an edge; the evidence-weighted analysis can only veto or slightly tilt (±3 points),
          because it is not backtested. Open "Why this verdict" on any card for its pass/fail checklist.
        </p>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {rows.map((r) => (
          <div key={r.v} className="flex gap-2">
            <dt
              className="px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap h-fit"
              style={{ backgroundColor: VERDICT_META[r.v].soft, color: VERDICT_META[r.v].color }}
            >
              {VERDICT_META[r.v].title}
            </dt>
            <dd style={{ color: 'var(--text-secondary)' }}>{r.rule}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Methodology({ open, onToggle }: { open: boolean; onToggle: () => void }) {
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
        How the AI works (scientific approach)
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-xs leading-relaxed space-y-2" style={{ color: 'var(--text-secondary)' }}>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>1. Data.</strong> About 5 years of daily
            closes for every instrument (Yahoo Finance; crypto from Indodax in Rupiah), plus the US
            3-month T-bill yield, the 10-year Treasury yield and the US dollar index. Today's live
            price is used as the latest data point, so the outlook moves with the market.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>2. Hypotheses.</strong> Three competing
            methods predict whether the price will be higher after the horizon: a logistic-regression
            model using 13 features (momentum over 1W–6M, volatility, trend vs 50/200-day averages,
            RSI, distance from the 1-year high, changes in US rates and the dollar, and the Fed
            stance), a trend-following rule, and a mean-reversion rule.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>3. Interest-rate events.</strong> Every
            FOMC decision since 2021 is used: recorded outcomes through 2025, and later outcomes
            inferred automatically from the move in T-bill yields. The model knows the Fed stance on
            each day, and each card shows how the asset moved after past cuts and hikes.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>4. Walk-forward testing.</strong> The
            model is retrained every ~2 months using only data that was known at the time, then
            predicts the next period. The best method per asset is chosen on the first 60% of these
            out-of-sample predictions; the hit rate you see comes only from the last 40% (holdout).
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>5. Second test: the technical scorecard.</strong>{' '}
            Nine fixed rules (200/50-day trend, MACD, RSI, Bollinger Bands, 12-1 month momentum,
            52-week range, 55-day breakout) give today's lean. The same rules are replayed on every
            past day of the asset's history; the lean only counts if, after past days with the same
            lean, the price rose at least 3 points more (or less, for bearish) often than on all days.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>6. Evidence & personalization.</strong> A
            strategy only counts if its holdout signals beat the base rate (how often the asset rose
            anyway) and earned more than average, with at least 30 signals. The probability is
            shrunk toward 50% by that trust, then tilted by the evidence-weighted analysis
            (technicals, value and momentum per Asness, Moskowitz &amp; Pedersen 2013, Piotroski
            F-score for stocks, classified news drivers; at most ±3 points) and geopolitical alerts,
            and filtered by your profile's volatility limit. Fundamental and technical evidence are
            combined because they are complements (Bettman, Sault &amp; Schultz 2009).
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Limits.</strong> Markets change; a
            pattern that worked can stop working. Fees, taxes and exchange rates are not included.
            Bank Indonesia decisions are not modeled yet (no free historical data source).
          </p>
        </div>
      )}
    </section>
  );
}
