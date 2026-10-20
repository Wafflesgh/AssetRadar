/**
 * core.ts — React-free part of the two-language system: the dictionaries, {param} interpolation and
 * `translate(lang, key)` with an English fallback. Pure modules (src/ai, the server) use this so they
 * can build explanations in either language without pulling in React or browser storage.
 */
import { en, type TranslationKey } from './en.ts';
import { id } from './id.ts';

export type { TranslationKey } from './en.ts';
export type AppLang = 'en' | 'id';
export type TParams = Record<string, string | number>;

const DICTS: Record<AppLang, Partial<Record<TranslationKey, string>>> = { en, id };

/** Replaces {name} placeholders. */
export function interpolate(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translation in a given language, falling back to English, then to the key itself. */
export function translate(lang: AppLang, key: TranslationKey, params?: TParams): string {
  const text = DICTS[lang][key] ?? en[key] ?? key;
  return interpolate(text, params);
}

/** Translation of a key that may not exist (e.g. built from a server id); otherwise the fallback text. */
export function translateOr(lang: AppLang, key: string, fallback: string, params?: TParams): string {
  return key in en ? translate(lang, key as TranslationKey, params) : fallback;
}

/** Reads a `lang` query value: "id" → Indonesian, anything else → English. */
export function parseLang(value: unknown): AppLang {
  return value === 'id' ? 'id' : 'en';
}
