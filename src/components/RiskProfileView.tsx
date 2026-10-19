/**
 * RiskProfileView.tsx — Risk Profile education page: a 7-question questionnaire (one question
 * per screen with a progress bar), the resulting profile with a donut of the sample
 * allocation, instrument explanations with "View price" links, a Compare tab, a capital
 * simulator (split only, no return projection) and custom allocation sliders. Saving a result
 * also sets the AI Advisor profile. Educational material, not personal investment advice.
 */
import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie } from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  INSTRUMENTS,
  PROFILE_ALLOCATIONS,
  PROFILE_IDS,
  PROFILE_INFO,
  QUESTION_COUNT,
  RISK_QUESTIONS,
  allocationTotal,
  formatAmountInput,
  parseAmountInput,
  parseCustomAllocation,
  profileForAnswers,
  scoreAnswers,
  splitCapital,
  type Allocation,
  type InstrumentInfo,
  type RiskProfileId,
} from '../config/riskProfiles.ts';
import { formatRupiah } from '../utils/format.ts';
import {
  getAiPrefs,
  getSavedRiskResult,
  saveAiPrefs,
  saveRiskResult,
  type SavedRiskResult,
} from '../utils/storage.ts';

interface RiskProfileViewProps {
  onSelectAsset: (symbol: string) => void;
  onGoToAdvisor: () => void;
}

type ResultTab = 'allocation' | 'compare' | 'simulator' | 'customize';

const RESULT_TABS: { id: ResultTab; label: string }[] = [
  { id: 'allocation', label: 'Allocation' },
  { id: 'compare', label: 'Compare' },
  { id: 'simulator', label: 'Simulator' },
  { id: 'customize', label: 'Customize' },
];

interface ValidResult {
  answers: number[];
  score: number;
  profile: RiskProfileId;
  customAllocation: Allocation | null;
  savedAt: number;
}

function toValidResult(saved: SavedRiskResult | null): ValidResult | null {
  if (!saved) return null;
  const score = scoreAnswers(saved.answers);
  const profile = profileForAnswers(saved.answers);
  if (score === null || profile === null) return null;
  return {
    answers: saved.answers,
    score,
    profile,
    customAllocation: parseCustomAllocation(saved.customAllocation),
    savedAt: saved.savedAt,
  };
}

function persist(result: ValidResult): void {
  saveRiskResult({
    answers: result.answers,
    customAllocation: result.customAllocation ?? undefined,
    savedAt: result.savedAt,
  });
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function RiskProfileView({ onSelectAsset, onGoToAdvisor }: RiskProfileViewProps) {
  const [result, setResult] = useState<ValidResult | null>(() => toValidResult(getSavedRiskResult()));
  const [mode, setMode] = useState<'intro' | 'quiz' | 'result'>(() => (result ? 'result' : 'intro'));

  const finishQuiz = (answers: number[]) => {
    const score = scoreAnswers(answers);
    const profile = profileForAnswers(answers);
    if (score === null || profile === null) return;
    const next: ValidResult = { answers, score, profile, customAllocation: null, savedAt: Date.now() };
    persist(next);
    // Personalize the AI Advisor with the questionnaire result
    saveAiPrefs({ ...getAiPrefs(), profile });
    setResult(next);
    setMode('result');
  };

  return (
    <div className="space-y-6">
      <Disclaimer />

      {mode === 'intro' && <Intro onStart={() => setMode('quiz')} />}

      {mode === 'quiz' && (
        <Questionnaire
          onFinish={finishQuiz}
          onCancel={result ? () => setMode('result') : () => setMode('intro')}
        />
      )}

      {mode === 'result' && result && (
        <ResultView
          result={result}
          onChange={(next) => {
            persist(next);
            setResult(next);
          }}
          onRetake={() => setMode('quiz')}
          onSelectAsset={onSelectAsset}
          onGoToAdvisor={onGoToAdvisor}
        />
      )}
    </div>
  );
}

/** Mandatory yellow educational disclaimer (spec 6.4), always at the very top. */
function Disclaimer() {
  return (
    <div
      role="note"
      aria-label="Investment education disclaimer"
      className="p-4 rounded-xl border flex items-start gap-3 text-xs md:text-sm leading-relaxed"
      style={{
        backgroundColor: 'var(--color-gold-soft)',
        borderColor: 'var(--color-gold)',
        color: 'var(--text-primary)',
      }}
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--color-gold)' }} />
      <p>
        These sample allocations are general and educational, not personal investment
        recommendations. Past performance does not guarantee future results. Make sure investment
        products are registered with/supervised by OJK or Bappebti.
      </p>
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <section
      className="p-5 md:p-8 rounded-xl border space-y-5"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} />
          <span>Asset allocation education · 7 questions · about 1 minute</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Find your investment risk profile</h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Answer 7 short questions about your age, goals, experience and how you react to losses.
          You will see which profile fits you best, a sample allocation, and how it compares with
          the other profiles. Your answers stay on this device.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PROFILE_IDS.map((id) => (
          <div
            key={id}
            className="p-3 rounded-lg border"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}
          >
            <div className="text-sm font-bold">{PROFILE_INFO[id].label}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Score {PROFILE_INFO[id].scoreRange[0]}–{PROFILE_INFO[id].scoreRange[1]} ·{' '}
              {PROFILE_INFO[id].horizon}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
        style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}
      >
        Start questionnaire
        <ArrowRight className="w-4 h-4" />
      </button>
    </section>
  );
}

function Questionnaire({ onFinish, onCancel }: { onFinish: (answers: number[]) => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(QUESTION_COUNT).fill(null));
  const question = RISK_QUESTIONS[step];
  const selected = answers[step];
  const isLast = step === QUESTION_COUNT - 1;
  const progress = ((step + 1) / QUESTION_COUNT) * 100;

  const choose = (score: number) => {
    setAnswers((prev) => prev.map((a, i) => (i === step ? score : a)));
  };

  const next = () => {
    if (selected === null) return;
    if (isLast) onFinish(answers as number[]);
    else setStep(step + 1);
  };

  const back = () => {
    if (step === 0) onCancel();
    else setStep(step - 1);
  };

  return (
    <section
      aria-label="Risk profile questionnaire"
      className="p-5 md:p-8 rounded-xl border space-y-6 max-w-2xl"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          <span>
            Question {step + 1} of {QUESTION_COUNT}
          </span>
          <span className="font-mono-num">{Math.round(progress)}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={QUESTION_COUNT}
          aria-valuenow={step + 1}
          aria-label="Questionnaire progress"
          className="h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface-subtle)' }}
        >
          <div
            className="h-full rounded-full motion-safe:transition-all motion-safe:duration-300"
            style={{ width: `${progress}%`, backgroundColor: 'var(--accent-radar)' }}
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-lg md:text-xl font-bold mb-4">{question.question}</legend>
        {question.options.map((label, i) => {
          const score = i + 1;
          const checked = selected === score;
          return (
            <label
              key={label}
              className="flex items-center gap-3 p-3.5 rounded-lg border cursor-pointer text-sm font-medium"
              style={{
                borderColor: checked ? 'var(--accent-radar)' : 'var(--border-subtle)',
                backgroundColor: checked ? 'var(--accent-radar-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name={`risk-q-${question.id}`}
                value={score}
                checked={checked}
                onChange={() => choose(score)}
                className="w-4 h-4 shrink-0"
                style={{ accentColor: 'var(--accent-radar)' }}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={next}
          disabled={selected === null}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}
        >
          {isLast ? 'See my result' : 'Next'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

interface ResultViewProps {
  result: ValidResult;
  onChange: (next: ValidResult) => void;
  onRetake: () => void;
  onSelectAsset: (symbol: string) => void;
  onGoToAdvisor: () => void;
}

function ResultView({ result, onChange, onRetake, onSelectAsset, onGoToAdvisor }: ResultViewProps) {
  const [tab, setTab] = useState<ResultTab>('allocation');
  const info = PROFILE_INFO[result.profile];
  const sample = PROFILE_ALLOCATIONS[result.profile];
  const current = result.customAllocation ?? sample;
  const isCustom = result.customAllocation !== null;

  return (
    <div className="space-y-6">
      <section
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Your risk profile · score <span className="font-mono-num">{result.score}</span> of 28
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: 'var(--accent-radar)' }}>
            {info.label}
          </h1>
          <p className="text-sm max-w-3xl leading-relaxed">{info.description}</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Suitable horizon: {info.horizon}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onGoToAdvisor}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}
          >
            <BrainCircuit className="w-4 h-4" />
            See AI Advisor suggestions for this profile
          </button>
          <button
            type="button"
            onClick={onRetake}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <RotateCcw className="w-4 h-4" />
            Retake questionnaire
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          The AI Advisor now uses the {info.label} profile. You can still change it there.
        </p>
      </section>

      <div
        role="tablist"
        aria-label="Risk profile result"
        className="grid grid-cols-4 rounded-lg border overflow-hidden"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {RESULT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="px-1 py-2.5 text-xs sm:text-sm font-semibold"
            style={{
              backgroundColor: tab === t.id ? 'var(--accent-radar)' : 'var(--bg-surface)',
              color: tab === t.id ? '#0B1220' : 'var(--text-primary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'allocation' && (
        <AllocationTab
          allocation={current}
          title={isCustom ? 'Your custom allocation' : `Sample ${info.label} allocation`}
          centerLabel={isCustom ? 'Custom' : info.label}
          onSelectAsset={onSelectAsset}
          onResetCustom={isCustom ? () => onChange({ ...result, customAllocation: null }) : undefined}
        />
      )}
      {tab === 'compare' && <CompareTab current={result.profile} />}
      {tab === 'simulator' && <SimulatorTab allocation={current} isCustom={isCustom} profileLabel={info.label} />}
      {tab === 'customize' && (
        <CustomizeTab
          sample={sample}
          current={current}
          profileLabel={info.label}
          onSave={(alloc) => onChange({ ...result, customAllocation: alloc })}
          onReset={() => onChange({ ...result, customAllocation: null })}
        />
      )}
    </div>
  );
}

function AllocationDonut({ allocation, size, centerLabel }: { allocation: Allocation; size: number; centerLabel: string }) {
  const data = useMemo(
    () =>
      INSTRUMENTS.filter((i) => allocation[i.id] > 0).map((i) => ({
        name: i.name,
        value: allocation[i.id],
        fill: i.color,
      })),
    [allocation]
  );
  const [animate] = useState(() => !prefersReducedMotion());
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={size * 0.31}
          outerRadius={size * 0.47}
          paddingAngle={data.length > 1 ? 2 : 0}
          stroke="none"
          startAngle={90}
          endAngle={-270}
          isAnimationActive={animate}
          animationBegin={0}
          animationDuration={700}
        />
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
        <span className="text-xs sm:text-sm font-bold text-center leading-tight">{centerLabel}</span>
      </div>
    </div>
  );
}

function RiskBadge({ instrument }: { instrument: InstrumentInfo }) {
  const tone =
    instrument.riskLevel <= 2
      ? { bg: 'var(--accent-radar-soft)', fg: 'var(--accent-radar)' }
      : instrument.riskLevel === 3
        ? { bg: 'var(--color-gold-soft)', fg: 'var(--text-primary)' }
        : { bg: 'var(--color-down-soft)', fg: 'var(--color-down)' };
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      Risk: {instrument.riskLabel}
    </span>
  );
}

function ColorDot({ color }: { color: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />;
}

interface AllocationTabProps {
  allocation: Allocation;
  title: string;
  centerLabel: string;
  onSelectAsset: (symbol: string) => void;
  onResetCustom?: () => void;
}

function AllocationTab({ allocation, title, centerLabel, onSelectAsset, onResetCustom }: AllocationTabProps) {
  return (
    <div className="space-y-6">
      <section
        className="p-5 md:p-6 rounded-xl border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-bold">{title}</h2>
          {onResetCustom && (
            <button
              type="button"
              onClick={onResetCustom}
              className="text-xs font-semibold hover:underline"
              style={{ color: 'var(--accent-radar)' }}
            >
              Back to sample allocation
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <AllocationDonut allocation={allocation} size={200} centerLabel={centerLabel} />
          <ul className="w-full sm:max-w-md space-y-2" aria-label="Allocation">
            {INSTRUMENTS.map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-sm">
                <ColorDot color={i.color} />
                <span className="flex-1 min-w-0">{i.name}</span>
                <span className="font-mono-num font-semibold">{allocation[i.id]}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Instruments" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INSTRUMENTS.map((i) => (
          <article
            key={i.id}
            className="p-4 rounded-xl border space-y-2"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <ColorDot color={i.color} />
                <h3 className="text-sm font-bold">{i.name}</h3>
              </div>
              <span className="font-mono-num text-sm font-bold">{allocation[i.id]}%</span>
            </div>
            <RiskBadge instrument={i} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {i.explanation}
            </p>
            {i.priceSymbol ? (
              <button
                type="button"
                onClick={() => onSelectAsset(i.priceSymbol!)}
                className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                style={{ color: 'var(--accent-radar)' }}
              >
                {i.priceLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <p className="text-xs italic" style={{ color: 'var(--text-secondary)' }}>
                {i.id === 'moneyMarket' ? 'Bank product' : 'Government / corporate securities'} — no live price
                in AssetRadar.
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function CompareTab({ current }: { current: RiskProfileId }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PROFILE_IDS.map((id) => {
          const info = PROFILE_INFO[id];
          const alloc = PROFILE_ALLOCATIONS[id];
          const mine = id === current;
          return (
            <section
              key={id}
              aria-label={`${info.label} profile`}
              className="p-4 rounded-xl border space-y-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: mine ? 'var(--accent-radar)' : 'var(--border-subtle)',
                borderWidth: mine ? 2 : 1,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">{info.label}</h2>
                {mine && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ backgroundColor: 'var(--accent-radar-soft)', color: 'var(--accent-radar)' }}
                  >
                    Your profile
                  </span>
                )}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Score {info.scoreRange[0]}–{info.scoreRange[1]} · {info.horizon}
              </div>
              <div className="flex justify-center">
                <AllocationDonut allocation={alloc} size={160} centerLabel={info.label} />
              </div>
              <ul className="space-y-1.5">
                {INSTRUMENTS.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-xs">
                    <ColorDot color={i.color} />
                    <span className="flex-1 min-w-0">{i.name}</span>
                    <span className="font-mono-num font-semibold">{alloc[i.id]}%</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <section
        aria-label="Allocation comparison table"
        className="p-4 md:p-5 rounded-xl border"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <table className="w-full text-left text-xs md:text-sm border-collapse">
          <thead>
            <tr style={{ color: 'var(--text-secondary)' }}>
              <th className="py-2 pr-2 font-semibold">Instrument</th>
              {PROFILE_IDS.map((id) => (
                <th key={id} className="py-2 px-1 font-semibold text-right">
                  <span className="sm:hidden">{PROFILE_INFO[id].label.slice(0, 4)}.</span>
                  <span className="hidden sm:inline">{PROFILE_INFO[id].label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INSTRUMENTS.map((i) => (
              <tr key={i.id} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="py-2 pr-2">
                  <div className="font-medium">{i.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    Risk: {i.riskLabel}
                  </div>
                </td>
                {PROFILE_IDS.map((id) => (
                  <td
                    key={id}
                    className="py-2 px-1 text-right font-mono-num"
                    style={{ fontWeight: id === current ? 700 : 400 }}
                  >
                    {PROFILE_ALLOCATIONS[id][i.id]}%
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function SimulatorTab({ allocation, isCustom, profileLabel }: { allocation: Allocation; isCustom: boolean; profileLabel: string }) {
  const [capital, setCapital] = useState(10_000_000);
  const split = useMemo(() => splitCapital(capital, allocation), [capital, allocation]);

  return (
    <section
      aria-label="Capital simulator"
      className="p-5 md:p-6 rounded-xl border space-y-5"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="space-y-1">
        <h2 className="text-base font-bold">Capital simulator</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          See how a starting amount would be divided using{' '}
          {isCustom ? 'your custom' : `the sample ${profileLabel}`} allocation. This only splits the
          amount; it does not forecast any returns.
        </p>
      </div>
      <label className="block space-y-1.5 max-w-sm">
        <span className="text-xs font-semibold">Starting capital</span>
        <div
          className="flex items-center rounded-lg border px-3"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Rp
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={formatAmountInput(capital)}
            onChange={(e) => setCapital(parseAmountInput(e.target.value))}
            placeholder="0"
            className="w-full min-w-0 bg-transparent px-2 py-2.5 text-sm font-mono-num outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </label>

      <ul className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {INSTRUMENTS.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm" style={{ borderColor: 'var(--border-subtle)' }}>
            <ColorDot color={i.color} />
            <span className="flex-1 min-w-0">
              {i.name}
              <span className="ml-1 font-mono-num text-xs" style={{ color: 'var(--text-secondary)' }}>
                ({allocation[i.id]}%)
              </span>
            </span>
            <span className="font-mono-num font-semibold text-right">{formatRupiah(split[i.id], 0)}</span>
          </li>
        ))}
        <li className="flex items-center gap-3 py-2.5 text-sm font-bold" style={{ borderColor: 'var(--border-subtle)' }}>
          <span className="flex-1">Total</span>
          <span className="font-mono-num">{formatRupiah(capital, 0)}</span>
        </li>
      </ul>
    </section>
  );
}

interface CustomizeTabProps {
  sample: Allocation;
  current: Allocation;
  profileLabel: string;
  onSave: (allocation: Allocation) => void;
  onReset: () => void;
}

function CustomizeTab({ sample, current, profileLabel, onSave, onReset }: CustomizeTabProps) {
  const [draft, setDraft] = useState<Allocation>(current);
  const [savedFlash, setSavedFlash] = useState(false);
  const total = allocationTotal(draft);
  const valid = total === 100;
  const unchanged = Object.keys(draft).every((k) => draft[k as keyof Allocation] === current[k as keyof Allocation]);

  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2500);
    return () => clearTimeout(t);
  }, [savedFlash]);

  return (
    <section
      aria-label="Customize allocation"
      className="p-5 md:p-6 rounded-xl border space-y-5"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="space-y-1">
        <h2 className="text-base font-bold">Customize your allocation</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Start from the sample {profileLabel} allocation and adjust each instrument. The total must
          be exactly 100%.
        </p>
      </div>

      <div className="space-y-4">
        {INSTRUMENTS.map((i) => (
          <div key={i.id} className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <ColorDot color={i.color} />
              <label htmlFor={`alloc-${i.id}`} className="flex-1 min-w-0 font-medium">
                {i.name}
              </label>
              <span className="font-mono-num font-semibold w-12 text-right">{draft[i.id]}%</span>
            </div>
            <input
              id={`alloc-${i.id}`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={draft[i.id]}
              onChange={(e) => setDraft({ ...draft, [i.id]: Number(e.target.value) })}
              className="w-full"
              style={{ accentColor: i.color }}
            />
          </div>
        ))}
      </div>

      <div
        className="flex items-center justify-between gap-3 pt-3 border-t text-sm font-semibold"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <span>Total</span>
        <span className="font-mono-num" style={{ color: valid ? 'var(--color-up)' : 'var(--color-down)' }}>
          {total}%
        </span>
      </div>
      {!valid && (
        <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--color-down)' }}>
          Total is {total}% — it must be exactly 100% before you can save (
          {total > 100 ? `remove ${total - 100}%` : `add ${100 - total}%`}).
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={() => {
            onSave(draft);
            setSavedFlash(true);
          }}
          disabled={!valid || unchanged}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}
        >
          <Check className="w-4 h-4" />
          Save allocation
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(sample);
            onReset();
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <RotateCcw className="w-4 h-4" />
          Reset to sample
        </button>
      </div>
      {savedFlash && (
        <p role="status" className="text-xs font-semibold" style={{ color: 'var(--color-up)' }}>
          Saved. The Allocation and Simulator tabs now use your custom allocation.
        </p>
      )}
    </section>
  );
}
