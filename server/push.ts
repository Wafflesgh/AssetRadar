/**
 * push.ts — Web push for alerts (and the morning brief): VAPID keys from VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY (+ VAPID_SUBJECT), push subscriptions of the owner's devices kept in the
 * database, sending with the `web-push` package (expired subscriptions are removed), and the
 * /api/push/* endpoints. Without VAPID keys or a database, alerts are checked in the browser
 * while the app is open instead.
 */
import express, { type Express } from 'express';
import webpush from 'web-push';
import { KeyedMutex, type KvStore } from './store.ts';
import type { OwnerAuth } from './sync.ts';

export const PUSH_SUBS_KEY = 'push:subs';

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: number;
  label?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Hash route to open on tap, e.g. "#/asset/btc". */
  url?: string;
  tag?: string;
}

const mutex = new KeyedMutex();

export function vapidConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim());
}

let vapidReady = false;
function ensureVapid(env: NodeJS.ProcessEnv = process.env): boolean {
  if (vapidReady) return true;
  if (!vapidConfigured(env)) return false;
  try {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT?.trim() || 'mailto:owner@assetradar.invalid',
      (env.VAPID_PUBLIC_KEY as string).trim(),
      (env.VAPID_PRIVATE_KEY as string).trim()
    );
    vapidReady = true;
  } catch (err) {
    console.warn('[Push] invalid VAPID keys:', err instanceof Error ? err.message : err);
  }
  return vapidReady;
}

export async function loadSubscriptions(store: KvStore): Promise<StoredSubscription[]> {
  const raw = await store.get<StoredSubscription[]>(PUSH_SUBS_KEY).catch(() => null);
  return Array.isArray(raw) ? raw.filter((s) => s && typeof s.endpoint === 'string' && s.keys?.p256dh && s.keys?.auth) : [];
}

/** Sends to every subscribed device; returns how many accepted it. Gone subscriptions are removed. */
export async function sendPushToAll(store: KvStore, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) return { sent: 0, failed: 0 };
  const subs = await loadSubscriptions(store);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        else console.warn(`[Push] send failed (HTTP ${status ?? 'network'})`);
      }
    })
  );
  if (gone.length) {
    await mutex.run(PUSH_SUBS_KEY, async () => {
      const current = await loadSubscriptions(store);
      await store.set(PUSH_SUBS_KEY, current.filter((s) => !gone.includes(s.endpoint)));
    });
  }
  return { sent, failed };
}

function parseSubscription(raw: unknown): StoredSubscription | null {
  const s = raw as Partial<StoredSubscription> | null;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) return null;
  if (typeof s.keys?.p256dh !== 'string' || typeof s.keys?.auth !== 'string') return null;
  return { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, createdAt: Date.now(), label: typeof s.label === 'string' ? s.label.slice(0, 80) : undefined };
}

export function registerPushRoutes(app: Express, store: KvStore, auth: OwnerAuth, serverAlertsReady: () => boolean): void {
  app.get('/api/push/config', async (req, res) => {
    const owner = auth.isOwner(req);
    res.json({
      vapidConfigured: vapidConfigured(),
      publicKey: vapidConfigured() ? process.env.VAPID_PUBLIC_KEY?.trim() : null,
      /** The server checks alerts and sends push (database + VAPID + login configured). */
      serverAlerts: serverAlertsReady(),
      subscriptions: owner ? (await loadSubscriptions(store)).length : null,
    });
  });

  app.post('/api/push/subscribe', auth.requireOwner, express.json({ limit: '8kb' }), async (req, res) => {
    if (!vapidConfigured()) {
      res.status(503).json({ error: 'Push is not configured on this server' });
      return;
    }
    const sub = parseSubscription(req.body?.subscription);
    if (!sub) {
      res.status(400).json({ error: 'Invalid subscription' });
      return;
    }
    await mutex.run(PUSH_SUBS_KEY, async () => {
      const list = (await loadSubscriptions(store)).filter((s) => s.endpoint !== sub.endpoint);
      await store.set(PUSH_SUBS_KEY, [...list, sub].slice(-20));
    });
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', auth.requireOwner, express.json({ limit: '8kb' }), async (req, res) => {
    const endpoint = String(req.body?.endpoint ?? '');
    await mutex.run(PUSH_SUBS_KEY, async () => {
      const list = await loadSubscriptions(store);
      await store.set(PUSH_SUBS_KEY, list.filter((s) => s.endpoint !== endpoint));
    });
    res.json({ ok: true });
  });

  app.post('/api/push/test', auth.requireOwner, async (_req, res) => {
    if (!vapidConfigured()) {
      res.status(503).json({ error: 'Push is not configured on this server' });
      return;
    }
    const result = await sendPushToAll(store, { title: 'AssetRadar test notification', body: 'Push notifications work on this device.', url: '#/alerts', tag: 'test' });
    res.json(result);
  });
}
