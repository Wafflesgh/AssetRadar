/**
 * syncAuth.ts — Server-only owner login for sync: compares the typed passphrase with
 * SYNC_PASSPHRASE through SHA-256 hashes in constant time, issues signed session tokens
 * (HMAC-SHA256, 90-day expiry; changing the passphrase invalidates every token) and limits
 * login attempts per client and overall. Never logs or returns the passphrase or the secret.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOKEN_TTL_MS = 90 * 86_400_000;

function sha256(text: string): Buffer {
  return createHash('sha256').update(text, 'utf8').digest();
}

/** Constant-time passphrase check (both sides hashed, so lengths always match). */
export function passphraseMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return timingSafeEqual(sha256(input), sha256(expected));
}

/** Signing key: an explicit secret, or one derived from the passphrase. */
export function sessionSecret(passphrase: string, explicitSecret?: string): Buffer {
  return explicitSecret ? sha256(`assetradar-session|${explicitSecret}`) : sha256(`assetradar-session|${passphrase}`);
}

function sign(payload: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Token format: v1.<expiresAtMs>.<nonce>.<signature>. */
export function issueToken(secret: Buffer, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + TOKEN_TTL_MS;
  const payload = `v1.${expiresAt}.${randomBytes(9).toString('base64url')}`;
  return { token: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function verifyToken(token: string | undefined | null, secret: Buffer, now = Date.now()): boolean {
  if (!token || typeof token !== 'string' || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = Buffer.from(sign(parts.slice(0, 3).join('.'), secret));
  const given = Buffer.from(parts[3]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Bearer token from an Authorization header value. */
export function bearerToken(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1] : null;
}

/**
 * Login attempt limiter: at most `perClient` failures per client within `windowMs`, and at most
 * `global` failures overall in the same window (stops guessing from many addresses).
 */
export class LoginLimiter {
  private failures = new Map<string, number[]>();
  private all: number[] = [];
  private perClient: number;
  private global: number;
  private windowMs: number;

  constructor(perClient = 5, global = 30, windowMs = 15 * 60_000) {
    this.perClient = perClient;
    this.global = global;
    this.windowMs = windowMs;
  }

  private prune(list: number[], now: number): number[] {
    return list.filter((t) => now - t < this.windowMs);
  }

  /** Milliseconds until another attempt is allowed (0 = allowed now). */
  retryAfter(client: string, now = Date.now()): number {
    const mine = this.prune(this.failures.get(client) ?? [], now);
    this.all = this.prune(this.all, now);
    const wait = (list: number[], limit: number) => (list.length >= limit ? list[list.length - limit] + this.windowMs - now : 0);
    return Math.max(wait(mine, this.perClient), wait(this.all, this.global), 0);
  }

  recordFailure(client: string, now = Date.now()): void {
    const mine = this.prune(this.failures.get(client) ?? [], now);
    mine.push(now);
    this.failures.set(client, mine);
    this.all.push(now);
    if (this.failures.size > 5000) this.failures.clear();
  }

  recordSuccess(client: string): void {
    this.failures.delete(client);
  }
}
