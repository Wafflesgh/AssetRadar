/**
 * HeaderSearch.tsx — Asset search in the top header of every page (except the Terminal, which
 * has its own command line). Desktop: an inline box. Phone: a magnifier button that opens a
 * full-screen search (rendered on <body> so it covers the bottom bar). "/" or Ctrl/⌘+K focuses
 * it from anywhere; picking a result opens the asset's detail page; the last 5 picks are
 * remembered on this device.
 */
import { useT } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { AssetConfig, PriceTick } from '../config/assets.ts';
import { AssetSearch } from './AssetSearch.tsx';

const DESKTOP_INPUT_ID = 'header-search-input';

interface HeaderSearchProps {
  ticks: Record<string, PriceTick>;
  onSelectAsset: (symbol: string) => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)));
}

export function HeaderSearch({ ticks, onSelectAsset }: HeaderSearchProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target);
      if (!ctrlK && !slash) return;
      e.preventDefault();
      const desktop = window.matchMedia('(min-width: 768px)').matches;
      if (desktop) document.getElementById(DESKTOP_INPUT_ID)?.focus();
      else setMobileOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (a: AssetConfig) => {
    setMobileOpen(false);
    onSelectAsset(a.symbol);
  };

  return (
    <>
      <AssetSearch
        className="hidden md:block w-72 lg:w-96"
        inputId={DESKTOP_INPUT_ID}
        ticks={ticks}
        onSelect={pick}
        recent
        label={t('search.label')}
        placeholder={t('search.placeholder')}
      />
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t('search.button')}
        className="md:hidden p-2 rounded-lg border"
        style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
      >
        <Search className="w-4 h-4" />
      </button>
      {mobileOpen &&
        createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('search.button')}
          className="md:hidden fixed inset-0 z-[60] flex flex-col p-4 gap-3"
          style={{ backgroundColor: 'var(--bg-canvas)' }}
        >
          <div className="flex items-center gap-2">
            <AssetSearch
              className="flex-1 min-w-0"
              ticks={ticks}
              onSelect={pick}
              recent
              autoFocus
              inline
              onEscape={() => setMobileOpen(false)}
              label={t('search.labelShort')}
              placeholder={t('search.mobilePlaceholder')}
              limit={30}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={t('search.close')}
              className="p-2 rounded-lg border self-start"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {t('search.hint')}
          </p>
        </div>,
          document.body
        )}
    </>
  );
}
