/**
 * textParts.ts — Sentences that pure modules and the server build from translation keys, so the
 * browser can show them in the chosen language: a list of {k: key, p: params} parts joined with
 * spaces. The English text is always sent alongside and used when a key is unknown. A string
 * param may name other keys as "@key" (e.g. "@driver.earnings (+)"); they are translated too.
 */
import { en } from './en.ts';
import { translate, type AppLang, type TranslationKey } from './core.ts';

export interface TextPart {
  k: string;
  p?: Record<string, string | number>;
}

/** Shorthand for one part. */
export function part(k: string, p?: Record<string, string | number>): TextPart {
  return p ? { k, p } : { k };
}

/** Renders parts in a language; falls back to the given text when any key is unknown. */
export function renderParts(lang: AppLang, parts: TextPart[] | undefined, fallback: string): string {
  if (!parts || parts.length === 0 || !parts.every((x) => x.k in en)) return fallback;
  const params = (p?: TextPart['p']) =>
    p &&
    Object.fromEntries(
      Object.entries(p).map(([k, v]) => [
        k,
        typeof v === 'string' ? v.replace(/@([a-z][\w.-]*[\w])/gi, (m, key: string) => (key in en ? translate(lang, key as TranslationKey) : m)) : v,
      ])
    );
  return parts.map((x) => translate(lang, x.k as TranslationKey, params(x.p))).join(' ');
}
