/**
 * LangToggle.tsx — Small "EN | ID" switch for the app language (desktop header and the mobile
 * "More" sheet). The full language and number-format settings are in Settings.
 */
import { setLang, useLang, useT } from '../i18n/index.ts';

export function LangToggle({ className = '' }: { className?: string }) {
  const lang = useLang();
  const t = useT();
  return (
    <div role="group" aria-label={t('lang.switchTo', { lang: lang === 'en' ? t('lang.en') : t('lang.id') })} className={`inline-flex rounded-lg border overflow-hidden text-[11px] font-bold ${className}`} style={{ borderColor: 'var(--border-subtle)' }}>
      {(['en', 'id'] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          title={l === 'en' ? t('lang.en') : t('lang.id')}
          className="px-2 py-1.5"
          style={{ backgroundColor: lang === l ? 'var(--accent-radar-soft)' : 'var(--bg-surface-subtle)', color: lang === l ? 'var(--accent-radar)' : 'var(--text-secondary)' }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
