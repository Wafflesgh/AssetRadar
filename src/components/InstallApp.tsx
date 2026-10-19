/**
 * InstallApp.tsx — "Install AssetRadar" UI: a card for Settings and a small dismissible banner
 * for the Radar. Uses the browser install prompt when offered (Android/desktop Chrome, Edge);
 * on iPhone/iPad it explains Share → Add to Home Screen. Hidden once the app is installed.
 */
import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { promptInstall, useInstallState } from '../pwa.ts';
import { getInstallBannerDismissed, saveInstallBannerDismissed } from '../utils/storage.ts';

function InstallButton({ compact = false }: { compact?: boolean }) {
  const install = useInstallState();
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
      <Download className="w-4 h-4" /> Install app
    </button>
  );
}

function IosSteps() {
  return (
    <span>
      On iPhone/iPad (Safari): tap <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Share" /> Share, then{' '}
      <strong>Add to Home Screen</strong>.
    </span>
  );
}

/** Settings card: always explains how to install, with the button when the browser allows it. */
export function InstallAppCard() {
  const install = useInstallState();
  return (
    <section
      aria-labelledby="install-heading"
      className="p-5 rounded-xl border space-y-3"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <h2 id="install-heading" className="text-base font-bold flex items-center gap-2">
        <Smartphone className="w-4 h-4" style={{ color: 'var(--accent-radar)' }} /> Install on your phone
      </h2>
      {install.installed ? (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          AssetRadar is installed and running as an app on this device.
        </p>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Add AssetRadar to your home screen: it opens full screen like an app and still shows your last saved prices when
            you are offline.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <InstallButton />
            {install.ios ? (
              <IosSteps />
            ) : (
              !install.canPrompt && (
                <span>
                  If no button appears, open the browser menu (⋮) and choose <strong>Install app</strong> or{' '}
                  <strong>Add to Home screen</strong>.
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
  if (dismissed || install.installed || (!install.canPrompt && !install.ios)) return null;
  return (
    <div
      role="region"
      aria-label="Install AssetRadar"
      className="flex items-center gap-3 p-3 rounded-xl border text-xs"
      style={{ backgroundColor: 'var(--accent-radar-soft)', borderColor: 'var(--accent-radar)' }}
    >
      <Smartphone className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-radar)' }} />
      <span className="flex-1 min-w-0">
        <strong>Install AssetRadar</strong> on this device for a full-screen app.{' '}
        {install.ios && !install.canPrompt && <IosSteps />}
      </span>
      <InstallButton compact />
      <button
        type="button"
        aria-label="Close install banner"
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
