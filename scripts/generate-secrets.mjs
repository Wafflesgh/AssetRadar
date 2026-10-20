/**
 * generate-secrets.mjs — Fills the self-made secrets in the local .env (never committed): a
 * CRON_TOKEN for the daily scheduler, a SYNC_SESSION_SECRET, a SYNC_PASSPHRASE for logging in to
 * sync, and a VAPID key pair for web push (with VAPID_SUBJECT). Only keys that are missing or
 * empty are written; existing values are kept. Values are never printed — open .env to copy them
 * into Google AI Studio → Secrets. Keys from other services (Supabase, Telegram, Gemini…) cannot be
 * generated here; see docs/SETUP_Online.md.
 *
 * Usage: node scripts/generate-secrets.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import webpush from 'web-push';

const ENV = new URL('../.env', import.meta.url);
const text = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';

/** Current value of a key in .env text ('' when missing or empty). */
function valueOf(key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

const token = (bytes) => randomBytes(bytes).toString('base64url');
// Passphrase you type on each device: 3 groups of 4 letters/digits without look-alikes (0/O, 1/l)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const group = () => Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('');
const vapid = webpush.generateVAPIDKeys();

const wanted = {
  CRON_TOKEN: token(32),
  SYNC_SESSION_SECRET: token(32),
  SYNC_PASSPHRASE: `${group()}-${group()}-${group()}`,
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: 'mailto:owner@assetradar.invalid',
};

let out = text;
const added = [];
const kept = [];
for (const [key, value] of Object.entries(wanted)) {
  if (valueOf(key)) {
    kept.push(key);
    continue;
  }
  // VAPID keys only make sense as a pair
  if ((key === 'VAPID_PUBLIC_KEY' && valueOf('VAPID_PRIVATE_KEY')) || (key === 'VAPID_PRIVATE_KEY' && valueOf('VAPID_PUBLIC_KEY'))) {
    kept.push(key);
    continue;
  }
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=.*$`, 'm').test(out)) out = out.replace(new RegExp(`^${key}=.*$`, 'm'), line);
  else out = `${out.replace(/\s*$/, '')}\n${line}\n`;
  added.push(key);
}
if (added.length) writeFileSync(ENV, out.startsWith('\n') ? out.slice(1) : out);
console.log(added.length ? `Added to .env: ${added.join(', ')}` : 'Nothing to add.');
if (kept.length) console.log(`Kept (already set): ${kept.join(', ')}`);
console.log('Values are not shown here. Open .env to copy them into Google AI Studio → Secrets.');
