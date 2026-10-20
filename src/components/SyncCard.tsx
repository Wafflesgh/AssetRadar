/**
 * SyncCard.tsx — Settings card for cross-device sync: status, last sync time, owner login with
 * the passphrase, logout, "Sync now", and the summary of what the first merge combined. When the
 * server has no database or passphrase it explains that everything stays on this device and how
 * to turn sync on.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { getSyncState, login, logout, refreshSyncStatus, subscribeSync, syncNow, type SyncState } from '../services/syncService.ts';

const TIME = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

export function SyncCard() {
  const [state, setState] = useState<SyncState>(() => getSyncState());
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeSync(setState), []);
  useEffect(() => {
    refreshSyncStatus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError(null);
    try {
      await login(passphrase);
      setPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const server = state.server;
  const enabled = Boolean(server?.enabled);
  const muted = { color: 'var(--text-secondary)' };

  return (
    <section
      aria-labelledby="settings-sync-heading"
      className="p-5 md:p-6 rounded-xl border space-y-4"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-start gap-2.5">
        {state.loggedIn && !state.lastError ? (
          <Cloud className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--accent-radar)' }} />
        ) : (
          <CloudOff className="w-5 h-5 shrink-0 mt-0.5" style={{ color: state.lastError ? 'var(--color-down)' : 'var(--text-secondary)' }} />
        )}
        <div className="min-w-0">
          <h2 id="settings-sync-heading" className="text-base font-bold">
            Sync between devices
          </h2>
          <p className="text-xs mt-0.5" style={muted}>
            Keeps your watchlist, portfolio, AI forward-test log, risk profile, alerts, saved screens and strategies, and settings the same
            on your phone and PC. Data on this device is always kept as a backup and the app works without logging in.
          </p>
        </div>
      </div>

      {state.serverUnreachable && !server && (
        <p className="text-xs" style={muted}>
          The server cannot be reached right now (offline?). Your data stays on this device.
        </p>
      )}

      {server && !enabled && (
        <div className="text-xs space-y-1.5 p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <p className="font-semibold">Sync is off on this server — everything stays on this device.</p>
          <p style={muted}>
            To turn it on, the owner adds these secrets to the server (see README, “Sync between devices”):{' '}
            {!server.database && <code>SUPABASE_URL</code>}
            {!server.database && ', '}
            {!server.database && <code>SUPABASE_SERVICE_ROLE_KEY</code>}
            {!server.database && !server.passphraseConfigured && ' and '}
            {!server.passphraseConfigured && <code>SYNC_PASSPHRASE</code>}
            {!server.passphraseConfigured && ' (at least 8 characters)'}.
          </p>
        </div>
      )}

      {enabled && !state.loggedIn && (
        <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="sync-passphrase">
            Owner passphrase
          </label>
          <input
            id="sync-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Owner passphrase"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm"
            style={{ backgroundColor: 'var(--bg-surface-subtle)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={busy || !passphrase}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent-radar)', color: '#0B1220' }}
          >
            <LogIn className="w-4 h-4" /> {busy ? 'Logging in…' : 'Log in & sync'}
          </button>
        </form>
      )}

      {enabled && state.loggedIn && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => syncNow()}
            disabled={state.syncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border disabled:opacity-60"
            style={{ borderColor: 'var(--accent-radar)', color: 'var(--accent-radar)' }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${state.syncing ? 'motion-safe:animate-spin' : ''}`} /> {state.syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <LogOut className="w-3.5 h-3.5" /> Log out on this device
          </button>
          <span className="text-xs" style={muted}>
            Database: {server?.database}
          </span>
        </div>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div>
          <dt style={muted}>Status</dt>
          <dd className="font-semibold">
            {!enabled ? 'Local only' : !state.loggedIn ? 'Not logged in (local only)' : state.lastError ? 'Last sync failed' : state.syncing ? 'Syncing…' : 'Synced'}
          </dd>
        </div>
        <div>
          <dt style={muted}>Last sync</dt>
          <dd className="font-semibold font-mono-num">{state.lastSyncAt ? `${TIME.format(state.lastSyncAt)} WIB` : '—'}</dd>
        </div>
      </dl>

      {(error || state.lastError) && (
        <p className="text-xs font-semibold" role="alert" style={{ color: 'var(--color-down)' }}>
          {error || state.lastError}
        </p>
      )}

      {state.firstMerge && (
        <div className="text-xs space-y-1 p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
          <p className="font-semibold">Merged this device with the server:</p>
          {state.firstMerge.toDevice.length === 0 && state.firstMerge.toServer.length === 0 && <p style={muted}>Both sides were already the same.</p>}
          {state.firstMerge.toDevice.length > 0 && (
            <p>
              <span style={muted}>From the server to this device: </span>
              {state.firstMerge.toDevice.join(' · ')}
            </p>
          )}
          {state.firstMerge.toServer.length > 0 && (
            <p>
              <span style={muted}>From this device to the server: </span>
              {state.firstMerge.toServer.join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
