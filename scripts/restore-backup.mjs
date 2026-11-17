/** restore-backup.mjs — Verify a local gzip backup and restore only into an isolated memory store. */
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { BACKUP_KEYS, BACKUP_PREFIXES, verifyBackup } from '../src/utils/backup.ts';
import { createStore } from '../server/store.ts';

try {
  if (process.argv.length !== 3) throw new Error();
  const file = JSON.parse(gunzipSync(await readFile(process.argv[2])).toString('utf8'));
  const result = verifyBackup(file);
  if (!result.ok) {
    console.log(`mismatch: ${result.mismatches}`);
    process.exitCode = 1;
  } else {
    const memory = createStore({});
    for (const [key, value] of Object.entries(file.data)) await memory.set(key, value);
    const data = Object.fromEntries(await Promise.all((await memory.keys('')).map(async (key) => [key, await memory.get(key)])));
    const restored = verifyBackup({ ...file, data });
    for (const prefix of BACKUP_PREFIXES) console.log(`${prefix} ${Object.keys(data).filter((key) => key.startsWith(prefix)).length}`);
    for (const key of BACKUP_KEYS) console.log(`${key} ${Object.hasOwn(data, key) ? 1 : 0}`);
    console.log(restored.ok ? `OK: ${restored.keys} keys` : `mismatch: ${restored.mismatches}`);
    if (!restored.ok) process.exitCode = 1;
  }
} catch {
  console.log('mismatch: unreadable or invalid backup');
  process.exitCode = 1;
}
