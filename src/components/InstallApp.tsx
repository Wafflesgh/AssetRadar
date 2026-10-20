/**
 * InstallApp.tsx — "Install AssetRadar" UI: a card for Settings and a small dismissible banner
 * for the Radar. Uses the browser install prompt when offered (Android/desktop Chrome, Edge);
 * on iPhone/iPad it explains Share → Add to Home Screen. Hidden once the app is installed.
 */
import { useT } from '../i18n/index.ts';
import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { promptInstall, useInstallState } from '../pwa.ts';
import { getInstallBannerDismissed, saveInstallBannerDismissed } from '../utils/storage.ts';

function InstallButton({ compact = false }: { compact?: boolean }) {
  const install = useInstallState();
  const t = useT();
  if (!install.canPrompt) return null;
  return (
    <button
      type="button"
      onClick={() => {
        promptInstall().catch(() => {});
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold border ${compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'}`}
      style={{ backgroundColor: 'var(--accent-radar)', borderColor: 'var(--accent-radar)', color: '#0B1220' }}
    >
      <Download className="w-4 h-4" /> {t('install.button')}
    </button>
  );
}

function IosSteps() {
  const t = useT();
  const [before, after] = t('install.iosSteps').split('{icon}');
  return (
    <span>
      {before}
      <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label={t('install.share')} />
      {after}{' '}
      <strong>{t('install.addToHomeScreen')}</strong>.
    </span>
  );
}

/** Settings card: always explains how to install, with the button when the browser allows it. */
export function InstallAppCard() {
  const install = useInstallState();
  const t = useT();
  return (
    <section
      aria-labelledby="install-heading"
      className="p-5 rounded-xl border space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <h2 id="install-heading" className="text-base font-bold flex items-center gap-2">
        <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> {t('install.title')}
      </h2>
      {install.installed ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('install.installed')}
        </p>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('install.intro')}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <InstallButton />
            {install.ios ? (
              <IosSteps />
            ) : (
              !install.canPrompt && (
                <span>
                  {t('install.noButton')} <strong>{t('install.menuInstall')}</strong> {t('install.or')}{' '}
                  <strong>{t('install.menuAddHome')}</strong>.
                </span>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Radar banner: only when installation is possible, until dismissed. */
export function InstallAppBanner() {
  const install = useInstallState();
  const [dismissed, setDismissed] = useState(() => getInstallBannerDismissed());
  const t = useT();
  if (dismissed || install.installed || (!install.canPrompt && !install.ios)) return null;
  return (
    <div
      role="region"
      aria-label={t('install.bannerLabel')}
      className="flex items-center gap-3 p-3 rounded-xl border text-xs"
      style={{ backgroundColor: 'var(--accent-radar-soft)', borderColor: 'var(--accent-radar)' }}
    >
      <Smartphone className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-radar)' }} />
      <span className="flex-1 min-w-0">
        <strong>{t('install.bannerLabel')}</strong> {t('install.bannerText')}{' '}
        {install.ios && !install.canPrompt && <IosSteps />}
      </span>
      <InstallButton compact />
      <button
        type="button"
        aria-label={t('install.closeBanner')}
        onClick={() => {
          saveInstallBannerDismissed();
          setDismissed(true);
        }}
        className="p-1 rounded"
        style={{ color: 'var(--text-secondary)' }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
