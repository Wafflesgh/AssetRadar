/**
 * core.ts — React-free part of the two-language system: the registered dictionaries, {param} interpolation
 * and `translate(lang, key)` with an English fallback. Pure modules (src/ai, the server) use this so
 * they can build explanations in either language without pulling in React or browser storage.
 * Dictionaries are registered, not imported: Node registers both (dicts.ts), the browser downloads
 * only the language in use (index.ts).
 */
import type { TranslationKey } from './en.ts';

export type { TranslationKey } from './en.ts';
export type AppLang = 'en' | 'id';
export type TParams = Record<string, string | number>;

export type Dict = Partial<Record<TranslationKey, string>>;
const DICTS: Partial<Record<AppLang, Dict>> = {};

export function registerDict(lang: AppLang, dict: Dict): void {
  DICTS[lang] = dict;
}

export function hasDict(lang: AppLang): boolean {
  return Boolean(DICTS[lang]);
}

/** True when the key exists in a registered dictionary (every language has the same keys). */
export function isKey(key: string): key is TranslationKey {
  return Object.values(DICTS).some((d) => d !== undefined && key in d);
}

/** Replaces {name} placeholders. */
export function interpolate(text: string, params?: TParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translation in a given language, falling back to English, then to the key itself. */
export function translate(lang: AppLang, key: TranslationKey, params?: TParams): string {
  const text = DICTS[lang]?.[key] ?? DICTS.en?.[key] ?? key;
  return interpolate(text, params);
}

/** Translation of a key that may not exist (e.g. built from a server id); otherwise the fallback text. */
export function translateOr(lang: AppLang, key: string, fallback: string, params?: TParams): string {
  return isKey(key) ? translate(lang, key, params) : fallback;
}

/** Reads a `lang` query value: "id" → Indonesian, anything else → English. */
export function parseLang(value: unknown): AppLang {
  return value === 'id' ? 'id' : 'en';
}
