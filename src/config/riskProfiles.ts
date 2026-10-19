/**
 * riskProfiles.ts — Risk Profile education data and logic: the 7-question questionnaire
 * (spec 6.1, scores 1–4), score → profile mapping (7–13 / 14–20 / 21–28), sample
 * allocations (spec 6.3), profile descriptions, instrument explanations and risk labels,
 * plus helpers for the capital simulator (split only, never a return projection).
 */

/** Same ids as the AI Advisor risk profiles (src/ai/outlook.ts). */
export type RiskProfileId = 'conservative' | 'moderate' | 'aggressive';

export type InstrumentId = 'moneyMarket' | 'bonds' | 'gold' | 'stocks' | 'crypto';

export type Allocation = Record<InstrumentId, number>;

export interface InstrumentInfo {
  id: InstrumentId;
  name: string;
  riskLabel: string;
  /** 1 = lowest, 5 = highest; used for the risk meter. */
  riskLevel: 1 | 2 | 3 | 4 | 5;
  explanation: string;
  /** Donut / bar color, readable on light and dark backgrounds. */
  color: string;
  /** App symbol of the detail page behind "View price" (none for bank/government products). */
  priceSymbol?: string;
  priceLabel?: string;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  {
    id: 'moneyMarket',
    name: 'Money market / time deposits',
    riskLabel: 'Low',
    riskLevel: 1,
    explanation:
      'Bank deposits and money-market mutual funds. Very stable value and easy to withdraw, but returns usually only just beat inflation.',
    color: '#38BDF8',
  },
  {
    id: 'bonds',
    name: 'Retail government bonds (SBN) / bonds',
    riskLabel: 'Low–medium',
    riskLevel: 2,
    explanation:
      'Loans to the government (ORI, SBR, ST) or companies that pay a fixed coupon. Prices can move with interest rates, but income is predictable.',
    color: '#818CF8',
  },
  {
    id: 'gold',
    name: 'Gold',
    riskLabel: 'Medium',
    riskLevel: 3,
    explanation:
      'A classic store of value that often holds up in crises and when the Rupiah weakens. It pays no interest and can swing for months.',
    color: '#EAB308',
    priceSymbol: 'XAU/USD',
    priceLabel: 'View gold price',
  },
  {
    id: 'stocks',
    name: 'Stocks / index funds',
    riskLabel: 'High',
    riskLevel: 4,
    explanation:
      'Ownership in companies, e.g. through an index fund tracking the JCI. Highest long-term growth potential among traditional assets, with sharp drops along the way.',
    color: '#10B981',
    priceSymbol: '^JKSE',
    priceLabel: 'View JCI chart',
  },
  {
    id: 'crypto',
    name: 'Crypto',
    riskLabel: 'Very high',
    riskLevel: 5,
    explanation:
      'Digital assets such as Bitcoin. Can rise or fall more than 50% within months; only use money you can afford to lose and a Bappebti-registered exchange.',
    color: '#F97316',
    priceSymbol: 'BTC/IDR',
    priceLabel: 'View BTC price',
  },
];

export const INSTRUMENT_IDS: InstrumentId[] = INSTRUMENTS.map((i) => i.id);

/** Sample allocations in percent (spec 6.3). Each column sums to 100. */
export const PROFILE_ALLOCATIONS: Record<RiskProfileId, Allocation> = {
  conservative: { moneyMarket: 45, bonds: 30, gold: 15, stocks: 10, crypto: 0 },
  moderate: { moneyMarket: 20, bonds: 25, gold: 15, stocks: 35, crypto: 5 },
  aggressive: { moneyMarket: 5, bonds: 10, gold: 10, stocks: 55, crypto: 20 },
};

export interface ProfileInfo {
  id: RiskProfileId;
  label: string;
  scoreRange: [number, number];
  horizon: string;
  description: string;
}

export const PROFILE_INFO: Record<RiskProfileId, ProfileInfo> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    scoreRange: [7, 13],
    horizon: 'Short term (under 3 years)',
    description:
      'You put keeping your money safe ahead of growing it fast. Big drops would worry you, so most of the sample portfolio sits in stable instruments. Suits money you may need within the next few years.',
  },
  moderate: {
    id: 'moderate',
    label: 'Moderate',
    scoreRange: [14, 20],
    horizon: 'Medium term (3–5 years)',
    description:
      'You accept some ups and downs in exchange for better growth. The sample portfolio balances stable income with a meaningful share of stocks. Suits goals roughly 3–5 years away.',
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    scoreRange: [21, 28],
    horizon: 'Long term (over 5 years)',
    description:
      'You aim for maximum long-term growth and can stay calm through large, sometimes long, drops. Most of the sample portfolio is in stocks and crypto. Suits money you will not need for more than 5 years.',
  },
};

export const PROFILE_IDS: RiskProfileId[] = ['conservative', 'moderate', 'aggressive'];

export interface RiskQuestion {
  id: string;
  question: string;
  /** Four options in order of score 1, 2, 3, 4. */
  options: [string, string, string, string];
}

/** The 7 questions of spec 6.1; option index + 1 = score. */
export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: 'age', question: 'How old are you?', options: ['Over 55', '41–55', '26–40', '25 or younger'] },
  {
    id: 'horizon',
    question: 'How long will the money stay invested?',
    options: ['Less than 1 year', '1–3 years', '3–5 years', 'More than 5 years'],
  },
  {
    id: 'goal',
    question: 'What is your main goal?',
    options: ['Preserve value', 'Regular income', 'Growth', 'Maximum growth'],
  },
  {
    id: 'experience',
    question: 'How experienced are you with investing?',
    options: ['Never invested', 'Beginner', 'Fairly experienced', 'Very experienced'],
  },
  {
    id: 'emergency',
    question: 'Do you already have an emergency fund?',
    options: ['Not yet', 'Less than 3 months of expenses', '3–6 months of expenses', 'More than 6 months of expenses'],
  },
  {
    id: 'drawdown',
    question: 'If your portfolio fell 20% in one month, you would…',
    options: ['Sell everything', 'Sell some', 'Do nothing', 'Buy more'],
  },
  {
    id: 'income',
    question: 'What share of your income can you invest regularly?',
    options: ['Less than 5%', '5–10%', '10–20%', 'More than 20%'],
  },
];

export const QUESTION_COUNT = RISK_QUESTIONS.length;

/** True when every question has a valid score of 1–4. */
export function isCompleteAnswers(answers: readonly (number | null | undefined)[]): answers is number[] {
  return (
    answers.length === QUESTION_COUNT &&
    answers.every((a) => typeof a === 'number' && Number.isInteger(a) && a >= 1 && a <= 4)
  );
}

/** Total score 7–28, or null when the answers are incomplete or invalid. */
export function scoreAnswers(answers: readonly (number | null | undefined)[]): number | null {
  if (!isCompleteAnswers(answers)) return null;
  return answers.reduce((sum, a) => sum + a, 0);
}

/** 7–13 Conservative, 14–20 Moderate, 21–28 Aggressive (scores outside 7–28 are clamped). */
export function profileForScore(score: number): RiskProfileId {
  if (score <= 13) return 'conservative';
  if (score <= 20) return 'moderate';
  return 'aggressive';
}

/** Profile for a full set of answers, or null when incomplete. */
export function profileForAnswers(answers: readonly (number | null | undefined)[]): RiskProfileId | null {
  const score = scoreAnswers(answers);
  return score === null ? null : profileForScore(score);
}

export function allocationTotal(allocation: Allocation): number {
  return INSTRUMENT_IDS.reduce((sum, id) => sum + (allocation[id] ?? 0), 0);
}

/** Validates a stored custom allocation: every instrument 0–100 (integers) and a total of 100. */
export function parseCustomAllocation(raw: unknown): Allocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const out = {} as Allocation;
  for (const id of INSTRUMENT_IDS) {
    const v = (raw as Record<string, unknown>)[id];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) return null;
    out[id] = v;
  }
  return allocationTotal(out) === 100 ? out : null;
}

/**
 * Splits starting capital by percentage, in whole Rupiah. Uses the largest-remainder method
 * so the amounts always add up to exactly the capital. This is a split only — no returns.
 */
export function splitCapital(capital: number, allocation: Allocation): Allocation {
  const out = {} as Allocation;
  const total = allocationTotal(allocation);
  if (!Number.isFinite(capital) || capital <= 0 || total <= 0) {
    for (const id of INSTRUMENT_IDS) out[id] = 0;
    return out;
  }
  const whole = Math.floor(capital);
  const exact = INSTRUMENT_IDS.map((id) => ({ id, value: (whole * (allocation[id] ?? 0)) / total }));
  let assigned = 0;
  for (const e of exact) {
    out[e.id] = Math.floor(e.value);
    assigned += out[e.id];
  }
  const byRemainder = [...exact]
    .filter((e) => (allocation[e.id] ?? 0) > 0)
    .sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)));
  for (let i = 0; assigned < whole && byRemainder.length > 0; i++) {
    out[byRemainder[i % byRemainder.length].id] += 1;
    assigned += 1;
  }
  return out;
}

/** Reads a typed amount: keeps digits only ("1,500,000" → 1500000); empty → 0. */
export function parseAmountInput(text: string): number {
  const digits = text.replace(/\D/g, '').slice(0, 15);
  return digits ? Number(digits) : 0;
}

/** Thousand separators while typing: 1500000 → "1,500,000"; 0 → "". */
export function formatAmountInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
