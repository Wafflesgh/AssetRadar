<!-- BLUEPRINT.md — One-page source of truth (Indonesian) for AssetRadar: hosting, database, secrets, data sources, jobs, endpoints, tools/MCP and working rules. Read this first in every new session. -->

# AssetRadar — Blueprint

Baca file ini dulu di setiap sesi baru. Detail kode ada di `CLAUDE.md`; jangan baca file besar (`server.ts` ±5.400 baris) utuh — pakai MCP codebase-memory (lihat §8).

## 1. Ringkasan

- Aplikasi web pribadi (non-komersial) pemantau 147 aset (saham IDX/AS/dunia, crypto, komoditas, indeks, kurs) + 962 saham IDX, dua bahasa (EN sumber, ID terjemahan), PWA.
- Pemilik: Dilan. Balasan ke pemilik: Bahasa Indonesia sederhana. Kode, komentar, nilai internal: Bahasa Inggris.
- Repo: https://github.com/Wafflesgh/AssetRadar (privat), cabang `main`. Commit terakhir sebelum migrasi: `7a22010`.

## 2. Arsitektur target (sama dengan aplikasi Taktik FPL)

```
Browser / HP (PWA)
   │  https://<app>.vercel.app
   ▼
Vercel — front end statis (vite build → dist/), CDN
   │  rewrite /api/*  ──►  Railway
   ▼
Railway — server Node selalu menyala (server.ts: Express API, SSE harga & berita,
          WebSocket Indodax/Binance/Finnhub, pemindaian pasar, jadwal harian)
   │  REST (kunci rahasia hanya di server)
   ▼
Supabase — Postgres, satu tabel key/value `assetradar_kv` (region Singapore)

GitHub — sumber kode; Vercel & Railway deploy otomatis setiap push ke main.
GitHub Actions — cadangan jadwal harian (POST /api/cron/daily).
```

**Kenapa tidak Vercel saja?** Fungsi Vercel berhenti setelah satu permintaan selesai (batas waktu, tanpa proses latar). AssetRadar butuh proses yang terus jalan: aliran harga (SSE), WebSocket bursa, hub berita tiap 60 dtk, pemindaian ±500 saham AS (20–30 mnt), cache memori, dan tugas harian 1–3 menit. Karena itu Taktik FPL juga memakai Railway untuk worker-nya. Railway Hobby ±US$5/bulan.

**Status:** kode sudah disiapkan (21 Okt 2026); akun Vercel/Railway/Supabase belum dibuat → langkah §9.
Hosting lama (Google AI Studio → Cloud Run) masih bisa dipakai sementara sampai Railway jalan.

## 3. File konfigurasi hosting

| File | Isi |
|---|---|
| `vercel.json` | Framework Vite, `npm ci`, `npm run build`, output `dist`, rewrite `/api/:path*` → `https://ASSETRADAR-RAILWAY-DOMAIN/api/:path*` (**ganti placeholder** dengan domain Railway), header no-cache untuk `sw.js` & manifest. |
| `.vercelignore` | Vercel hanya membangun front end; `server.ts`, `server/`, `supabase/`, `docs/` tidak diunggah. |
| `railway.toml` | Builder Railpack, `npm run build`, start `NODE_ENV=production npm start` (tsx server.ts; `tsx` kini dependency biasa), health check `/api/health`, restart otomatis. |
| `supabase/schema.sql`, `supabase/migrations/20261021000100_kv.sql` | Tabel `assetradar_kv` (key text PK, value jsonb, updated_at), RLS aktif tanpa policy (kunci publik tidak bisa baca/tulis). |
| `.github/workflows/daily-jobs.yml` | Cadangan jadwal: 07:35 & 16:20 WIB setiap hari → `POST {APP_URL}/api/cron/daily`. |
| `.mcp.json` | MCP proyek: Supabase & Vercel (lihat §8). |
| `src/utils/hosting.ts` | Deteksi host (railway / cloudRun / vercel / local), timer jadwal internal, pilihan kunci Supabase. |

Perilaku server per host: di **Railway** jadwal harian berjalan dari timer internal tiap 5 menit (`INTERNAL_SCHEDULER`, default aktif di Railway); di Cloud Run/lokal tugas berjalan pada permintaan pertama setelah jamnya atau lewat cron.

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

Tanpa Supabase server memakai memori (hilang saat restart) — fitur tetap jalan, riwayat tidak.

## 5. Secrets / environment (nama saja — nilai tidak pernah ditulis di kode, chat, atau log)

| Nama | Wajib? | Dipasang di | Fungsi |
|---|---|---|---|
| `SUPABASE_URL` | ya (untuk riwayat) | Railway | Alamat proyek Supabase |
| `SUPABASE_SECRET_KEY` | ya | Railway | Kunci rahasia baru `sb_secret_…` (atau `SUPABASE_SERVICE_ROLE_KEY` lama) |
| `CRON_TOKEN` | ya | Railway + GitHub Actions | Melindungi `/api/cron/daily`, `/api/analyst/run`, `/api/analyst/notes` |
| `SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET` | untuk sinkron | Railway | Login pemilik antar perangkat |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | untuk notifikasi HP | Railway | Web push |
| `GEMINI_API_KEY` | disarankan | Railway | Narasi AI (analisis harian, ringkasan, sentimen) — buat di aistudio.google.com → Get API key |
| `GEMINI_MODELS` | opsional | Railway | Urutan model cadangan saat kuota habis |
| `FINNHUB_API_KEY`, `BPS_API_KEY` | opsional | Railway | Trade real-time saham AS; inflasi BPS |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | opsional | Railway | Ringkasan pagi ke Telegram |
| `INTERNAL_SCHEDULER` | opsional | Railway | `0` mematikan timer jadwal internal |
| `APP_URL` | ya | GitHub Actions | Alamat aplikasi (Vercel atau Railway) |

Nilai buatan sendiri ada di `.env` lokal (dibuat `node scripts/generate-secrets.mjs`, tidak di-commit). Vercel **tidak** butuh secret apa pun.

## 6. Sumber data eksternal (semua tanpa kunci kecuali disebut)

Yahoo Finance (harga, chart, riwayat penuh `period1/period2`, fundamental, kalender) · Indodax (crypto IDR, WS + REST) · Binance data publik (top 100 USDT, futures; diblokir dari server AS → pilih region Singapore) · CoinGecko · gold-api.com · SEC EDGAR · Google News RSS + RSS penerbit · Bank Indonesia · FRED (UA aplikasi wajib) · World Bank + Pink Sheet · BPS (kunci) · DJPPR Kemenkeu (SBN ritel) · Wikipedia API (S&P 500) · Finnhub (kunci) · TradingView hanya widget resmi. Cek jangkauan dari server: Settings → Server diagnostics (`/api/diagnostics`).

## 7. Jadwal & endpoint penting

| Waktu (WIB) | Tugas |
|---|---|
| ≥07:30 setiap hari | Ringkasan pagi (`brief`) |
| ≥16:15 hari kerja | Forward test AI Advisor (`forward`) |
| ≥16:15 setiap hari | Analisis AI harian (`analyst`): foto aset, penilaian rekomendasi, pemeriksaan data, narasi Gemini |

Endpoint operasi: `GET /api/health` · `GET /api/diagnostics[?refresh=1]` (sumber, host/region, Gemini, jobs) · `POST /api/cron/daily` · `GET /api/analyst[?date=]` · `POST /api/analyst/run` · `POST /api/analyst/notes` · `GET /api/analyst/export?from=&to=` · `GET /api/track/summary` · `GET /api/track/asset?symbol=` · `GET /api/sbn/retail`. (Bearer `CRON_TOKEN` untuk yang POST.)

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

Railway belum punya MCP resmi yang dipakai di sini → status Railway dibaca lewat `/api/health` dan `/api/diagnostics`.

**Tidak dipakai — sebaiknya dimatikan agar hemat token** (di aplikasi Claude: Customize / Settings → Plugins, Skills, Connectors → matikan): plugin `sentry-skills`, `last30days`, `write-a-skill`, `statistical-analyst`, `cowork-plugin-management`; skill dokumen `docx`/`pptx`/`xlsx`/`pdf`/`google-workspace`/`morning`; connector Gmail, Google Calendar, Google Drive/Docs, rapat (meeting notes). Yang tetap berguna: `codebase-memory` (skill), `run`, `code-review`, `security-review`, artifact (untuk laporan bila diminta).

## 9. Langkah migrasi (pemilik; Claude tidak boleh membuat akun atau menempel kunci)

1. **Supabase** (supabase.com): New project `assetradar`, region **Southeast Asia (Singapore)** → SQL Editor → jalankan isi `supabase/schema.sql` → Project Settings → API Keys: salin **Project URL** dan **Secret key** (`sb_secret_…`).
2. **Railway** (railway.app, login GitHub): New Project → Deploy from GitHub repo → `Wafflesgh/AssetRadar` → Settings: Region **Singapore**, Networking → **Generate Domain** → Variables: isi secrets §5 (nilai dari `.env` + Supabase). Tunggu deploy hijau → buka `https://<domain>/api/health` → harus `{"ok":true,"host":"railway"}`.
3. **Vercel** (vercel.com, login GitHub): beri tahu Claude domain Railway → Claude mengganti placeholder di `vercel.json` dan push. Lalu Add New Project → import repo → Deploy (pengaturan dibaca dari `vercel.json`, tanpa secret).
4. **GitHub** → Settings → Secrets → Actions: `APP_URL` = alamat Vercel (atau Railway), `CRON_TOKEN` = sama dengan Railway → Actions → Run workflow.
5. Cek: aplikasi → Settings → Server diagnostics (host "Railway", database ✓, scheduler ✓) dan menu Analisis AI Harian.
6. Opsional: login MCP — di terminal `claude` jalankan `/mcp` → supabase / vercel → Authenticate.
7. Setelah semuanya jalan, aplikasi lama di Google AI Studio boleh dihapus/ditinggalkan. **Jangan** menekan Push/Sync GitHub dari AI Studio.

## 10. Aturan kerja (ringkas)

- Setelah setiap perubahan: `npm run lint && npm test && npm run build` + `node scripts/check-i18n.mjs` = 0 → commit → `git fetch` (cek tidak ada commit asing) → `git push`. Tidak pernah force-push; perbaikan lewat revert. Backup sebelum merge berisiko.
- Teks UI baru lewat `src/i18n/` (en.ts + id.ts). Setiap file baru diawali komentar Bahasa Inggris.
- Tidak ada angka dummy; sumber gagal → "Data tidak tersedia" + "Coba lagi". TradingView hanya widget resmi. Disclaimer wajib tetap ada. Kalkulator ukuran posisi sudah dihapus — jangan dibuat ulang.
- Kunci API hanya di `.env`/secret hosting, tidak pernah dicetak. Binance hanya data publik.
- Argon (Gemini di AI Studio) bila masih dipakai: hanya memeriksa & melapor (`docs/PROMPT_Argon.md`), tidak mengubah kode.

## 11. Dokumen terkait

`CLAUDE.md` (detail arsitektur kode) · `README.md` (Inggris, fitur & file) · `docs/PANDUAN_Fitur_Terbaru.md` (fitur terbaru untuk pemilik) · `docs/SETUP_Online.md` (setup versi AI Studio/Cloud Run) · `docs/PROMPT_Argon.md` · `docs/PROGRESS_Tahap2–4.md` (log).
