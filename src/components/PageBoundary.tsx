/**
 * PageBoundary.tsx — Loading and failure handling for every page: `lazyPage()` loads a page's code
 * on demand and retries once (a deploy can replace old code files; then the app reloads once to
 * fetch the new ones), and `<PageBoundary>` shows a skeleton while the code arrives and a
 * "could not load" card with a retry button instead of a blank screen when a page crashes.
 */
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n/index.ts';

const RELOAD_FLAG = 'assetradar_chunk_reload';

function looksLikeStaleCode(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i.test(msg);
}

/** React.lazy (same type constraint) with one retry; a second failure after a deploy reloads the app once per session. */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy<T>(async () => {
    try {
      const mod = await load();
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        // Storage blocked: nothing to clear
      }
      return mod;
    } catch (first) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        return await load();
      } catch (err) {
        if (looksLikeStaleCode(err)) {
          let reloaded = false;
          try {
            reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
            if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
          } catch {
            reloaded = true;
          }
          if (!reloaded) window.location.reload();
        }
        throw err ?? first;
      }
    }
  });
}

/** Grey placeholder blocks shaped like a page header and two cards. */
export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t('common.loading')}>
      <div className="skeleton h-7 w-56 rounded-md" />
      <div className="skeleton h-4 w-full max-w-xl rounded-md" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

class ErrorCatcher extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn('[Page] failed to render:', error.message);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="surface-card p-6 max-w-lg space-y-3" role="alert">
        <h2 className="text-base font-bold">{t('page.failedTitle')}</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('page.failedBody')}
        </p>
        <button
          type="button"
          onClick={() => (looksLikeStaleCode(this.state.error) ? window.location.reload() : this.setState({ error: null }))}
          className="btn-accent inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
        </button>
      </div>
    );
  }
}

/** Wraps a page: skeleton while its code loads, a retry card if it fails. Give it `key={page}`. */
export function PageBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorCatcher>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorCatcher>
  );
}
