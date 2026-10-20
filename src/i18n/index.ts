/**
 * index.ts — The app's two-language system (English source, Indonesian translation) without a
 * library: the current language (saved via storage.ts; first visit follows the browser:
 * "id…" → Indonesian, otherwise English), `t(key, params)` with {param} placeholders and an
 * English fallback, React hooks `useT()` / `useLang()` that re-render on a switch, and the number
 * format (follow the language, or always en-US) applied to utils/format.ts.
 */
import { useSyncExternalStore } from 'react';
import { translate, translateOr, type AppLang, type TParams } from './core.ts';
import { setNumberLocale } from '../utils/format.ts';
import { setTimeLang } from '../utils/marketHours.ts';
import { getNumberFormatPref, getSavedLang, saveLang, saveNumberFormatPref, type NumberFormatPref } from '../utils/storage.ts';

export type { TranslationKey, AppLang, TParams } from './core.ts';
export { interpolate, translate, translateOr, parseLang } from './core.ts';
import type { TranslationKey } from './core.ts';

function detectLang(): AppLang {
  const saved = getSavedLang();
  if (saved) return saved;
  try {
    return typeof navigator !== 'undefined' && /^id\b/i.test(navigator.language || '') ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

let current: AppLang = detectLang();
let numberPref: NumberFormatPref = getNumberFormatPref();
const listeners = new Set<() => void>();

function applyNumberLocale(): void {
  setNumberLocale(numberPref === 'en-US' || current === 'en' ? 'en-US' : 'id-ID');
  setTimeLang(current);
}
applyNumberLocale();
try {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
} catch {
  // No document (tests)
}

function emit(): void {
  for (const l of listeners) l();
}

export function getLang(): AppLang {
  return current;
}

export function setLang(lang: AppLang): void {
  current = lang;
  saveLang(lang);
  applyNumberLocale();
  try {
    document.documentElement.lang = lang;
  } catch {
    // No document (tests)
  }
  emit();
}

export function getNumberFormat(): NumberFormatPref {
  return numberPref;
}

export function setNumberFormat(pref: NumberFormatPref): void {
  numberPref = pref;
  saveNumberFormatPref(pref);
  applyNumberLocale();
  emit();
}

/** Translation in the current language (for code outside React components). */
export function t(key: TranslationKey, params?: TParams): string {
  return translate(current, key, params);
}

/** Like `t`, for keys built from data (e.g. a server id): falls back to the given text when the key is unknown. */
export function tOr(key: string, fallback: string, params?: TParams): string {
  return translateOr(current, key, fallback, params);
}

let version = 0;
listeners.add(() => {
  version++;
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current language; the component re-renders when it changes. */
export function useLang(): AppLang {
  return useSyncExternalStore(subscribe, getLang, () => 'en' as AppLang);
}

/** `t` bound to the current language; the component re-renders on a language or number-format switch. */
export function useT(): (key: TranslationKey, params?: TParams) => string {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return t;
}

/** BCP-47 tag for dates and Intl APIs in the current language. */
export function dateLocale(lang: AppLang = current): string {
  return lang === 'id' ? 'id-ID' : 'en-US';
}

/** Language parameter for server endpoints that return text. */
export function langParam(): string {
  return `lang=${current}`;
}
