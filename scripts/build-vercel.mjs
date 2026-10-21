/**
 * build-vercel.mjs — Turns the build into a Vercel deployment (Build Output API v3) after
 * `vite build`: dist/ → .vercel/output/static, the whole API (server.ts via server/vercelEntry.ts)
 * bundled with esbuild into one Node function (.vercel/output/functions/api/index.func, region
 * Singapore, up to 300 s) and the routes (/api/* → the function, everything else → the app).
 * Runs on Vercel (VERCEL=1) or locally with --force; elsewhere it does nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const force = process.argv.includes('--force');
if (!process.env.VERCEL && !force) {
  console.log('[build-vercel] skipped (not on Vercel; use --force to try it locally)');
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '.vercel', 'output');
const fnDir = path.join(out, 'functions', 'api', 'index.func');
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('[build-vercel] dist/index.html is missing: run vite build first');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(fnDir, { recursive: true });
fs.cpSync(dist, path.join(out, 'static'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'server', 'vercelEntry.ts')],
  outfile: path.join(fnDir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Vite is only used by the local dev server; the optional native helpers of ws are not needed
  external: ['vite', 'bufferutil', 'utf-8-validate'],
  // CommonJS packages inside an ES module bundle still call require()
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
});

fs.writeFileSync(
  path.join(fnDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 300,
      // Singapore: Binance blocks US servers, and the data sources are closest to Indonesia
      regions: ['sin1'],
    },
    null,
    2
  )
);
fs.writeFileSync(path.join(fnDir, 'package.json'), JSON.stringify({ type: 'module' }));

fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/sw\\.js$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
        { src: '^/manifest\\.webmanifest$', headers: { 'Cache-Control': 'no-cache' }, continue: true },
        { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        // The function reads the original path from __p if the platform hands it the rewritten one
        { src: '^/api/(.*)$', dest: '/api/index?__p=$1' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

const size = fs.statSync(path.join(fnDir, 'index.mjs')).size;
console.log(`[build-vercel] .vercel/output ready (function ${(size / 1024 / 1024).toFixed(1)} MB, region sin1)`);
