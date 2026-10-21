<!-- BLUEPRINT.md — One-page source of truth (Indonesian) for AssetRadar: hosting, database, secrets, data sources, jobs, endpoints, tools/MCP and working rules. Read this first in every new session. -->

# AssetRadar — Blueprint

Baca file ini dulu di setiap sesi baru. Detail kode ada di `CLAUDE.md`; jangan baca file besar (`server.ts` ±5.400 baris) utuh — pakai MCP codebase-memory (lihat §8).

## 1. Ringkasan

- Aplikasi web pribadi (non-komersial) pemantau 147 aset (saham IDX/AS/dunia, crypto, komoditas, indeks, kurs) + 962 saham IDX, dua bahasa (EN sumber, ID terjemahan), PWA.
- Pemilik: Dilan. Balasan ke pemilik: Bahasa Indonesia sederhana. Kode, komentar, nilai internal: Bahasa Inggris.
- Repo: https://github.com/Wafflesgh/AssetRadar (privat), cabang `main`. Commit terakhir sebelum migrasi: `7a22010`.
- **Keputusan pemilik (21 Okt 2026): hanya GitHub + Supabase + Vercel** (tanpa Railway, tanpa AI Studio). Batasannya diterima: harga saham/kurs/emas ±10–15 dtk (polling), crypto Indodax tetap real-time, tanpa Finnhub, alert HP saat aplikasi tertutup tiap ±10 menit.

## 2. Arsitektur (serverless)

```
Browser / HP (PWA) ── WebSocket langsung ke Indodax (crypto real-time)
   │  https://<app>.vercel.app
   ▼
Vercel — front end statis (CDN) + SATU fungsi Node untuk semua /api/* (region sin1, ≤300 dtk)
   │  dibuat oleh scripts/build-vercel.mjs (Build Output API: .vercel/output)
   ▼
Supabase — Postgres, satu tabel key/value `assetradar_kv` (region Singapore)
   └─ pg_cron + pg_net: tiap 10 menit POST /api/cron/tick (supabase/cron.sql)

GitHub — sumber kode; Vercel deploy otomatis setiap push ke main.
GitHub Actions — cadangan jadwal harian (POST /api/cron/daily 07:35 & 16:20 WIB).
```

**Mode serverless** (`server/runtime.ts`, aktif otomatis saat `VERCEL=1`; coba lokal dengan `SERVERLESS=1`):
- Tidak ada timer/WebSocket/SSE di server. `everyMs`/`afterMs` tidak jalan; pekerjaan yang dimulai saat request diserahkan ke `waitUntil` lewat `keepAlive()`.
- Klien (build Vercel, `VITE_SERVERLESS=1` → `src/services/serverMode.ts`) tidak membuka SSE: harga polling 10 dtk, berita 60 dtk. Endpoint SSE menjawab 204.
- **Tick** `POST /api/cron/tick` (Bearer `CRON_TOKEN`, menjawab 202 lalu bekerja ±240 dtk): alert server (web push) → tugas harian yang jatuh tempo → pemindaian bertahap (cross-section IDX & AS `scanStep`, screener, kalender IDX) → hitung ulang pilar/validasi/valuasi IDX tiap 6 jam (atau 1 jam setelah ada data baru). Ringkasan terakhir: `GET /api/cron/tick/last`.
- Hasil berat disimpan di Supabase (gzip `{gz}` lewat `getPacked/setPacked`): halaman membaca hasil jadi, bukan data mentah. Hari pertama data sentimen/screener/kalender terisi bertahap.
- Server selalu-menyala (`npm run dev` / `npm start`) tetap bekerja seperti dulu (timer, SSE, Finnhub) — kode yang sama.

**Kenapa harga saham tidak per detik?** Vercel tidak punya proses yang menyala terus untuk mendorong harga; polling per detik akan menghabiskan kuota gratis (±1 juta permintaan/bulan) dan berisiko diblokir Yahoo. Kalau suatu saat butuh per detik: tambah server selalu-menyala (mis. Railway) — kodenya sudah mendukung.

## 3. File konfigurasi hosting

| File | Isi |
|---|---|
| `vercel.json` | `framework: null`, `npm ci`, `npm run build`, region `sin1`. Rute & header ada di `.vercel/output/config.json` yang dibuat build. |
| `scripts/build-vercel.mjs` | Setelah `vite build` (hanya saat `VERCEL=1` atau `--force`): salin `dist/` → `.vercel/output/static`, bundel `server/vercelEntry.ts` (+ server.ts) dengan esbuild → `functions/api/index.func` (nodejs22.x, maxDuration 300, region sin1), rute `/api/*` → fungsi, sisanya → `index.html`. |
| `server/vercelEntry.ts` | Handler fungsi: `createApp()` dari server.ts; `originalApiUrl` memulihkan path asli dari `?__p=`. |
| `.vercelignore` | Hanya docs/backups/supabase/.env yang tidak diunggah (kode server ikut dibangun). |
| `supabase/schema.sql` | Tabel `assetradar_kv` (key text PK, value jsonb, updated_at), RLS aktif tanpa policy. |
| `supabase/cron.sql` | Jadwal tick tiap 10 menit (pg_cron + pg_net), alamat & token disimpan di Supabase Vault. |
| `.github/workflows/daily-jobs.yml` | Cadangan jadwal harian → `POST {APP_URL}/api/cron/daily`. |
| `src/utils/hosting.ts` | Deteksi host, `serverlessFrom`, `originalApiUrl`, pilihan kunci Supabase. |

## 4. Database (Supabase)

Satu tabel `assetradar_kv`. Kunci yang dipakai:

| Kunci | Isi |
|---|---|
| `sync:data` | Data tersinkron antar perangkat (watchlist, portofolio, dividen, alert, screen, strategi, harga emas, pengaturan, profil risiko, forward log lokal) |
| `jobs:state` | Tanggal terakhir tiap tugas harian (forward, analyst, brief) |
| `forward:YYYY-MM` | Verdict AI Advisor harian (20/60 hari × 3 profil) + hasil setelah jatuh tempo |
| `sentcalls:YYYY-MM` | Rekomendasi sentimen harian per horizon (pendek/menengah/panjang) + hasil |
| `snap:YYYY-MM-DD` | Foto harian 147 aset: harga, %24j, sentimen 3 horizon |
| `analysis:YYYY-MM-DD` | Analisis harian: fakta, pemeriksaan kualitas data, narasi Gemini EN/ID, catatan agen |
| `brief:YYYY-MM-DD` | Ringkasan pagi `{en, id}` |
| `sbn:series` | Semua seri SBN ritel yang pernah terlihat |
| `screener:fundamentals` | Rasio fundamental saham IDX untuk screener |
| `alerts:state`, push subscriptions | Status alert server & langganan web push |
| `xs:<idx/us>:meta`, `xs:<idx/us>:<monthly/statements/analyst>:<shard>` | Data mentah pemindaian cross-section (gzip, 8 shard IDX / 4 AS) |
| `xs:<idx/us/crypto>:derived`, `xs:<…>:status` | Hasil jadi: pilar sentimen, validasi, valuasi IDX; status pindaian |
| `calendar:idx`, `ai:outlook:20` / `:60`, `tick:last` | Kalender semua emiten, hasil AI Advisor terakhir, ringkasan tick terakhir |

Tanpa Supabase server memakai memori (hilang saat restart) — fitur tetap jalan, riwayat tidak.

## 5. Secrets / environment (nama saja — nilai tidak pernah ditulis di kode, chat, atau log)

| Nama | Wajib? | Dipasang di | Fungsi |
|---|---|---|---|
| `SUPABASE_URL` | ya (untuk riwayat) | Vercel | Alamat proyek Supabase |
| `SUPABASE_SECRET_KEY` | ya | Vercel | Kunci rahasia baru `sb_secret_…` (atau `SUPABASE_SERVICE_ROLE_KEY` lama) |
| `CRON_TOKEN` | ya | Vercel + Supabase Vault (cron.sql) + GitHub Actions | Melindungi `/api/cron/daily`, `/api/analyst/run`, `/api/analyst/notes` |
| `SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET` | untuk sinkron | Vercel | Login pemilik antar perangkat |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | untuk notifikasi HP | Vercel | Web push |
| `GEMINI_API_KEY` | disarankan | Vercel | Narasi AI (analisis harian, ringkasan, sentimen) — buat di aistudio.google.com → Get API key |
| `GEMINI_MODELS` | opsional | Vercel | Urutan model cadangan saat kuota habis |
| `BPS_API_KEY` | opsional | Vercel | Inflasi BPS (`FINNHUB_API_KEY` tidak dipakai di Vercel: butuh server selalu-menyala) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | opsional | Vercel | Ringkasan pagi ke Telegram |
| `APP_URL` | ya | GitHub Actions | Alamat aplikasi Vercel |

Nilai buatan sendiri ada di `.env` lokal (dibuat `node scripts/generate-secrets.mjs`, tidak di-commit). Semua secret dipasang di Vercel → Project → Settings → Environment Variables (Production).

## 6. Sumber data eksternal (semua tanpa kunci kecuali disebut)

Yahoo Finance (harga, chart, riwayat penuh `period1/period2`, fundamental, kalender) · Indodax (crypto IDR, WS + REST) · Binance data publik (top 100 USDT, futures; diblokir dari server AS → pilih region Singapore) · CoinGecko · gold-api.com · SEC EDGAR · Google News RSS + RSS penerbit · Bank Indonesia · FRED (UA aplikasi wajib) · World Bank + Pink Sheet · BPS (kunci) · DJPPR Kemenkeu (SBN ritel) · Wikipedia API (S&P 500) · Finnhub (kunci) · TradingView hanya widget resmi. Cek jangkauan dari server: Settings → Server diagnostics (`/api/diagnostics`).

## 7. Jadwal & endpoint penting

| Waktu (WIB) | Tugas |
|---|---|
| tiap 10 menit | Tick (pg_cron): alert, tugas jatuh tempo, pemindaian bertahap, hitung ulang hasil |
| ≥07:30 setiap hari | Ringkasan pagi (`brief`) |
| ≥16:15 hari kerja | Forward test AI Advisor (`forward`) |
| ≥16:15 setiap hari | Analisis AI harian (`analyst`): foto aset, penilaian rekomendasi, pemeriksaan data, narasi Gemini |

Endpoint operasi: `GET /api/health` (`serverless: true` di Vercel) · `POST /api/cron/tick` · `GET /api/cron/tick/last` · `GET /api/diagnostics[?refresh=1]` (sumber, host/region, Gemini, jobs) · `POST /api/cron/daily` · `GET /api/analyst[?date=]` · `POST /api/analyst/run` · `POST /api/analyst/notes` · `GET /api/analyst/export?from=&to=` · `GET /api/track/summary` · `GET /api/track/asset?symbol=` · `GET /api/sbn/retail`. (Bearer `CRON_TOKEN` untuk yang POST.)

Halaman: Radar, IDX, Terminal, AI Advisor (+ rekam jejak), Analisis AI Harian (`#/analyst`), Ringkasan Pagi, Binance Crypto, Screener, Compare, Portofolio, Alerts, Kalender, ID Macro (+ SBN ritel), Quant Lab, Backtest, Watchlist, Profil Risiko, Settings.

## 8. Tools, MCP, dan skill yang dipakai

**Dipakai di proyek ini:**

| Tool | Status | Untuk |
|---|---|---|
| **codebase-memory-mcp** | terpasang (global), proyek terindeks `D-Asset-Radar-assetradar` | Cari fungsi/alur kode (`search_graph`, `get_code_snippet`, `trace_path`) tanpa membaca file utuh — hemat token |
| **Supabase MCP** (`https://mcp.supabase.com/mcp`) | dikonfigurasi di `.mcp.json`; perlu login OAuth sekali | Cek tabel, jalankan migrasi, lihat log database |
| **Vercel MCP** (`https://mcp.vercel.com`) | dikonfigurasi di `.mcp.json`; perlu login OAuth sekali | Status deploy, log build, domain |
| Browser bawaan (Claude Browser) | bawaan aplikasi | Uji tampilan 375px/1440px, terang/gelap |
| Bash/PowerShell, git, `gh` | bawaan | Tes, build, commit, push |


**Tidak dipakai — sebaiknya dimatikan agar hemat token** (di aplikasi Claude: Customize / Settings → Plugins, Skills, Connectors → matikan): plugin `sentry-skills`, `last30days`, `write-a-skill`, `statistical-analyst`, `cowork-plugin-management`; skill dokumen `docx`/`pptx`/`xlsx`/`pdf`/`google-workspace`/`morning`; connector Gmail, Google Calendar, Google Drive/Docs, rapat (meeting notes). Yang tetap berguna: `codebase-memory` (skill), `run`, `code-review`, `security-review`, artifact (untuk laporan bila diminta).

## 9. Langkah migrasi (pemilik; Claude tidak boleh membuat akun atau menempel kunci)

1. **Supabase** (supabase.com, login GitHub): New project `assetradar`, region **Southeast Asia (Singapore)** → SQL Editor → jalankan isi `supabase/schema.sql` → Project Settings → Data API: salin **Project URL**; API Keys: salin **Secret key** (`sb_secret_…`).
2. **Vercel** (vercel.com, login GitHub, paket Hobby gratis): Add New → Project → import `Wafflesgh/AssetRadar` (beri akses repo privat) → **Environment Variables**: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_TOKEN`, `SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `GEMINI_API_KEY` (disarankan), opsional `BPS_API_KEY`, `TELEGRAM_*` → **Deploy**. Pengaturan build dibaca dari `vercel.json`. Pastikan Settings → Functions → **Fluid Compute aktif** (default proyek baru; perlu untuk 300 dtk).
3. Cek `https://<app>.vercel.app/api/health` → `{"ok":true,"host":"vercel","serverless":true,…}`.
4. **Jadwal Supabase**: buka `supabase/cron.sql`, ganti alamat Vercel dan `CRON_TOKEN`, jalankan di SQL Editor. Setelah ±10 menit: `/api/cron/tick/last` berisi hasil.
5. **GitHub** → Settings → Secrets → Actions: `APP_URL` = alamat Vercel, `CRON_TOKEN` = sama → Actions → Run workflow (cadangan).
6. Cek: Settings → Server diagnostics (host "Vercel", region sin1, database ✓). Data sentimen saham, screener dan kalender terisi bertahap dalam ±1 hari.
7. Opsional: login MCP — di terminal `claude` jalankan `/mcp` → supabase / vercel → Authenticate.
8. Setelah semuanya jalan, aplikasi lama di Google AI Studio boleh ditinggalkan. **Jangan** menekan Push/Sync GitHub dari AI Studio.

## 10. Aturan kerja (ringkas)

- Setelah setiap perubahan: `npm run lint && npm test && npm run build` + `node scripts/check-i18n.mjs` = 0 → commit → `git fetch` (cek tidak ada commit asing) → `git push`. Tidak pernah force-push; perbaikan lewat revert. Backup sebelum merge berisiko.
- Teks UI baru lewat `src/i18n/` (en.ts + id.ts). Setiap file baru diawali komentar Bahasa Inggris.
- Tidak ada angka dummy; sumber gagal → "Data tidak tersedia" + "Coba lagi". TradingView hanya widget resmi. Disclaimer wajib tetap ada. Kalkulator ukuran posisi sudah dihapus — jangan dibuat ulang.
- Kunci API hanya di `.env`/secret hosting, tidak pernah dicetak. Binance hanya data publik.
- Argon (Gemini di AI Studio) bila masih dipakai: hanya memeriksa & melapor (`docs/PROMPT_Argon.md`), tidak mengubah kode.

## 11. Dokumen terkait

`CLAUDE.md` (detail arsitektur kode) · `README.md` (Inggris, fitur & file) · `docs/PANDUAN_Fitur_Terbaru.md` (fitur terbaru untuk pemilik) · `docs/SETUP_Online.md` (setup versi AI Studio/Cloud Run) · `docs/PROMPT_Argon.md` · `docs/PROGRESS_Tahap2–4.md` (log).
