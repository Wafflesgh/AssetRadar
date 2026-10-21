/**
 * vercelEntry.ts — The Vercel function: every /api/* request goes to the Express app from
 * server.ts createApp() (built once per function instance). Bundled into one file by
 * scripts/build-vercel.mjs; serverless mode (no timers or streams) comes from VERCEL=1.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server.ts';
import { originalApiUrl } from '../src/utils/hosting.ts';

const appReady = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await appReady;
  req.url = originalApiUrl(req.url ?? '/');
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
