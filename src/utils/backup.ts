/** backup.ts — Backup allowlist, JSON checksums and strict manifest verification. */
import { createHash } from 'node:crypto';

export const BACKUP_KEYS = ['sync:data', 'push:subs', 'alerts:history', 'alerts:state', 'jobs:state', 'fundarena:state', 'staples:data'];
export const BACKUP_PREFIXES = ['analysis:', 'arena:', 'brief:', 'forward:', 'idxtrace:', 'sentcalls:', 'snap:', 'staples:detail:'];
export const isBackupKey = (key: string): boolean => BACKUP_KEYS.includes(key) || BACKUP_PREFIXES.some((prefix) => key.startsWith(prefix));
export interface BackupFile {
  version: 1;
  createdAt: number;
  manifest: Array<{ key: string; sha256: string; bytes: number }>;
  data: Record<string, unknown>;
}

function digest(value: unknown) {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Invalid backup value');
  return { sha256: createHash('sha256').update(json).digest('hex'), bytes: Buffer.byteLength(json) };
}

export function buildBackup(entries: Record<string, unknown>, createdAt: number): BackupFile {
  if (!Number.isFinite(createdAt)) throw new Error('Invalid backup date');
  const data = Object.fromEntries(Object.entries(entries).filter(([key]) => isBackupKey(key)).sort(([a], [b]) => a.localeCompare(b)));
  return { version: 1, createdAt, manifest: Object.entries(data).map(([key, value]) => ({ key, ...digest(value) })), data };
}

export function verifyBackup(file: unknown): { ok: boolean; keys: number; mismatches: number } {
  const invalid = { ok: false, keys: 0, mismatches: 1 };
  if (!file || typeof file !== 'object') return invalid;
  const b = file as BackupFile;
  if (b.version !== 1 || !Number.isFinite(b.createdAt) || !Array.isArray(b.manifest) || !b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return invalid;
  const seen = new Set<string>();
  let mismatches = 0;
  for (const entry of b.manifest) {
    if (!entry || typeof entry.key !== 'string' || !isBackupKey(entry.key) || seen.has(entry.key)) { mismatches++; continue; }
    seen.add(entry.key);
    if (!Object.hasOwn(b.data, entry.key)) { mismatches++; continue; }
    try {
      const d = digest(b.data[entry.key]);
      if (d.sha256 !== entry.sha256 || d.bytes !== entry.bytes) mismatches++;
    } catch { mismatches++; }
  }
  for (const key of Object.keys(b.data)) if (!seen.has(key)) mismatches++;
  return { ok: mismatches === 0, keys: Object.keys(b.data).length, mismatches };
}
