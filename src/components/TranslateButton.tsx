/**
 * TranslateButton.tsx — Small "Translate" button next to a news headline (headlines stay in the
 * article's own language). Asks the server (Gemini, when the server has a key; cached 24 h); without
 * a key it opens Google Translate in a new tab. The original headline always stays visible.
 */
import { useState } from 'react';
import { Languages } from 'lucide-react';
import { getLang, useT } from '../i18n/index.ts';

export function TranslateButton({ text, className = '' }: { text: string; className?: string }) {
  const t = useT();
  const [translated, setTranslated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const to = getLang();

  const run = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (translated) {
      setTranslated(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/translate?to=${to}&text=${encodeURIComponent(text.slice(0, 300))}`);
      if (res.ok && !res.headers.get('X-AssetRadar-Offline')) {
        const data = await res.json();
        if (data?.translated) {
          setTranslated(data.translated);
          return;
        }
      }
      window.open(`https://translate.google.com/?sl=auto&tl=${to}&text=${encodeURIComponent(text)}&op=translate`, '_blank', 'noopener,noreferrer');
    } catch {
      window.open(`https://translate.google.com/?sl=auto&tl=${to}&text=${encodeURIComponent(text)}&op=translate`, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        title={t('news.translateTitle')}
        className={`inline-flex items-center gap-1 text-[10px] font-semibold underline-offset-2 hover:underline disabled:opacity-50 ${className}`}
        style={{ color: 'var(--text-secondary)' }}
      >
        <Languages className="w-3 h-3" aria-hidden="true" />
        {t('news.translate')}
      </button>
      {translated && (
        <span className="block text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>
          {t('news.translated')} {translated}
        </span>
      )}
    </>
  );
}
