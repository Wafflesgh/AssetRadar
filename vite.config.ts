// vite.config.ts — Vite build config: React + Tailwind plugins, the "@" path alias, and the PWA
// step that stamps the build id and the list of built files into dist/sw.js.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/** After the build, fill BUILD_ID and PRECACHE in dist/sw.js (public/sw.js is copied as-is). */
function serviceWorkerManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'assetradar-sw-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else files.push('/' + path.relative(outDir, full).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const precache = ['/', ...files.filter((f) => f !== '/sw.js')];
      const sw = fs
        .readFileSync(swPath, 'utf8')
        .replace("'__BUILD_ID__'", JSON.stringify(Date.now().toString(36)))
        .replace("['__PRECACHE__']", JSON.stringify(precache));
      fs.writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serviceWorkerManifest()],
    // Serverless build (Vercel, or SERVERLESS=1): the client polls instead of opening SSE streams
    define: {
      'import.meta.env.VITE_SERVERLESS': JSON.stringify(
        process.env.SERVERLESS === '1' || (process.env.VERCEL && process.env.SERVERLESS !== '0') ? '1' : ''
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
