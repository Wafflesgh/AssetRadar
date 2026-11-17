/** backup.ts — Opt-in daily private GCS export within the tick's remaining budget. */
import { gzipSync } from 'node:zlib';
import { BACKUP_KEYS, BACKUP_PREFIXES, buildBackup, isBackupKey } from '../src/utils/backup.ts';
import type { KvStore } from './store.ts';

export async function backupStep(store: KvStore, until: number): Promise<string> {
  const bucket = process.env.GCS_BACKUP_BUCKET?.trim();
  if (!bucket) return 'off';
  const now = Date.now();
  const wib = new Date(now + 7 * 3600_000);
  const date = wib.toISOString().slice(0, 10);
  const checkTime = () => { if (Date.now() >= until) throw new Error('deadline'); };
  let phase = 'read';
  try {
    checkTime();
    if ((await store.get<{ date: string }>('backup:last'))?.date === date) return 'done today';
    if (wib.getUTCHours() < 2) return 'waiting';
    const keys = new Set(BACKUP_KEYS);
    for (const prefix of BACKUP_PREFIXES) {
      checkTime();
      for (const key of await store.keys(prefix)) if (isBackupKey(key)) keys.add(key);
    }
    const entries: Record<string, unknown> = {};
    // ~1,000+ keys and backup is the last tick step: read 10 at a time, not one by one
    const list = [...keys];
    for (let i = 0; i < list.length; i += 10) {
      checkTime();
      const batch = list.slice(i, i + 10);
      const values = await Promise.all(batch.map((key) => store.get(key)));
      for (let j = 0; j < batch.length; j++) {
        if (values[j] === null && !BACKUP_KEYS.includes(batch[j])) return 'failed: listed key disappeared';
        if (values[j] !== null) entries[batch[j]] = values[j];
      }
    }
    checkTime();
    const backup = buildBackup(entries, now);
    const body = gzipSync(JSON.stringify(backup));
    phase = 'metadata';
    checkTime();
    const tokenResponse = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
      headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(Math.min(10_000, until - Date.now())),
    });
    if (!tokenResponse.ok) return `failed: metadata HTTP ${tokenResponse.status}`;
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token || typeof token.access_token !== 'string') return 'failed: metadata token unavailable';
    phase = 'upload';
    for (const kind of wib.getUTCDay() === 0 ? ['daily', 'weekly'] : ['daily']) {
      checkTime();
      const name = `backups/${kind}/${date}.json.gz`;
      // Create only: a retry must never replace a previously uploaded recovery point.
      const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(name)}`;
      const response = await fetch(url, {
        method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/gzip' },
        body, signal: AbortSignal.timeout(Math.min(60_000, until - Date.now())),
      });
      if (!response.ok) return `failed: upload HTTP ${response.status}`;
    }
    checkTime();
    phase = 'save marker';
    await store.set('backup:last', { date, keys: backup.manifest.length, bytes: body.length });
    return `saved ${backup.manifest.length} keys, ${body.length} bytes`;
  } catch {
    return Date.now() >= until ? 'no time left' : `failed: ${phase}`;
  }
}
