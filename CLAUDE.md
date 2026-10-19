# AssetRadar — Instruksi Proyek untuk Claude Code

Aplikasi web pribadi (non-komersial) untuk memantau harga emas, IHSG, crypto, dan kurs USD/IDR secara real-time, dengan grafik bergaya TradingView, analisis sentimen berita, dan materi edukasi profil risiko. Bisa dipakai di PC dan HP (target: PWA). Pemilik: Dilan (Indonesia). **Seluruh teks antarmuka dalam Bahasa Indonesia.** Balas pemilik dalam Bahasa Indonesia yang sederhana (bukan programmer profesional).

Awalnya dibangun di Google AI Studio (Build mode, Gemini), lalu dilanjutkan di sini. Spesifikasi asli: `docs/AssetRadar_SPEC.md`. Daftar prompt lanjutan asli: `docs/PROMPT_Lanjutan_AssetRadar.md` (Prompt 2–6 = sisa pekerjaan di bawah).

## Menjalankan

```bash
npm install          # .npmrc sudah set legacy-peer-deps (ada konflik peer vite 8 vs plugin-react)
npm run dev          # tsx server.ts → http://localhost:3000 (Express + Vite middleware)
npm run lint         # tsc --noEmit
npm test             # node --test src/**/*.test.ts (Node ≥ 22, impor .ts langsung)
npm run build        # vite build → dist/ ; produksi: NODE_ENV=production npm start
```

Env (`.env`, lihat `.env.example`): `GEMINI_API_KEY` (opsional; tanpa ini sentimen tetap jalan versi non-AI). `GOLD_API_KEY` opsional dan tidak wajib (emas default dari gold-api.com tanpa kunci). Jangan pernah menulis kunci API ke kode atau commit `.env`.

Setelah setiap perubahan: `npm run lint && npm test && npm run build` harus lulus.

## Arsitektur

- **Stack**: React 19 + Vite 8 + Tailwind 4 (via `@tailwindcss/vite`), TypeScript, Express (`server.ts`), `lightweight-charts` v5, `recharts` v3 (sudah terpasang, belum dipakai), `lucide-react`, `@google/genai`.
- **server.ts** (satu file): cache in-memory + endpoint:
  - `GET /api/market/snapshot` — semua harga (Indodax, Yahoo IHSG & kurs, emas)
  - `GET /api/market/indodax` — fallback REST crypto (cache 6 dtk; sparkline 24j cache 5 mnt)
  - `GET /api/market/yahoo` — IHSG `^JKSE` + kurs `IDR=X` (cache 60 dtk)
  - `GET /api/market/gold` — spot XAU dari gold-api.com (cache 5 mnt), perubahan/sparkline dari Yahoo `GC=F` (futures)
  - `GET /api/market/intelligence?symbol=` — sentimen (momentum harga + nada berita) + 6 berita Google News; diperkaya Gemini `gemini-3.8-flash` di latar belakang (race 1,8 dtk, cache 5 mnt)
  - `GET /api/market/history?symbol=<app symbol>&interval=<1|5|15|30|60|240|D|W>` — candle OHLC; crypto dari Indodax `tradingview/history_v2` (Yahoo tidak punya `BTC-IDR` dkk., 404), aset lain dari Yahoo (240 = agregasi 60m→4j); respons berisi `source`; hanya simbol di `ASSETS`
  - `GET /api/market/correlation` — **BARU**, matriks korelasi Pearson return harian 30 hari (BTC, ETH, SOL, IHSG, EMAS=GC=F, USD/IDR), cache 6 jam
  - `GET /api/market/news-feed` — **BARU**, gabungan berita semua aset (maks 20, terbaru dulu, ada `assetTags`), cache 10 mnt
- **Klien**:
  - `src/services/marketDataService.ts` — `MarketDataManager`: WebSocket Indodax (`market:summary-24h`, token publik resmi dari dokumentasi Indodax), backoff, putus saat tab tersembunyi, polling REST Indodax **hanya saat WS putus**, polling Yahoo 60 dtk, emas 5 mnt, status `live | reconnecting | delayed | offline`, snapshot harga terakhir di localStorage (tick bertanda `fromSnapshot`). Helper: `fetchAssetIntelligence`, `fetchHistory`, `fetchCorrelation`, `fetchNewsFeed`.
  - `src/config/assets.ts` — tipe (`PriceTick`, `OhlcCandle`, `CorrelationMatrix`, `MarketNewsItem`, dll.), daftar `ASSETS` (6 aset, simbol TradingView + cadangan + `yahooSymbol`), `TIMEFRAME_OPTIONS`.
  - `src/utils/` — `format.ts` (Rupiah/persen id-ID), `marketHours.ts` (jam BEI 09:00–16:00 WIB), `sentiment.ts` (kata kunci kata-utuh, parser RSS), `storage.ts` (semua localStorage via try/catch: tema, timeframe, watchlist, snapshot harga, start-in-terminal, hasil profil risiko), `router.ts` (hash routing `#/radar`, `#/aset/<id>`, `#/watchlist`, `#/risiko`, `#/pengaturan`), `correlation.ts`, `candles.ts`. Semua punya test `*.test.ts`.
  - `src/App.tsx` — state utama, tema, routing hash, layout (sidebar PC / bottom nav HP), footer disclaimer.
  - `src/components/` — `RadarView` (dashboard kartu + kedip harga), `AssetDetailView` (harga, timeframe, `TradingViewChart`, `AssetIntelligencePanel`), `WatchlistView`, `RiskProfileView` (**masih tabel sementara**), `SettingsView`, `Navigation`, `SparklineChart`, `RadarLogo`.
- **Gaya**: token warna CSS di `src/index.css` (`--bg-canvas`, `--bg-surface`, `--accent-radar`, `--color-up/down/gold`, dll., terang & gelap via `data-theme`). Font: Plus Jakarta Sans + JetBrains Mono (`.font-mono-num`). Komponen memakai inline `style={{...var(--...)}}` + kelas Tailwind — ikuti pola ini.

## Aturan wajib

- Jangan pernah menampilkan angka contoh/dummy sebagai harga. Sumber gagal → "Data tidak tersedia" + tombol "Coba lagi".
- Grafik TradingView hanya lewat **widget resmi**; atribusi TradingView harus terlihat. Dilarang scraping/endpoint tidak resmi TradingView.
- Sentimen = ringkasan suasana berita, **bukan** sinyal beli/jual. Profil risiko = **edukasi**, bukan rekomendasi personal; tanpa proyeksi keuntungan. Disclaimer wajib tetap ada (footer + Profil Risiko).
- localStorage selalu dibungkus try/catch (pakai helper di `storage.ts`).
- Responsif: HP 375px tanpa scroll horizontal; PC 1440px. Mode terang & gelap harus terbaca. Hormati `prefers-reduced-motion`.

## Status

**Selesai**: Tahap 1–2 spesifikasi (kerangka, grafik TradingView + 8 timeframe, harga live, dashboard, watchlist dasar, sentimen + berita), Prompt 1 lengkap (lihat docs), endpoint server untuk Prompt 2 & 6 (history, correlation, news-feed) beserta test.

**Sisa pekerjaan** (kerjakan berurutan, cek lint/test/build tiap langkah):

1. ~~Grafik cadangan (Prompt 2)~~ — **selesai**: `FallbackChart.tsx` (candle + volume, WIB via `toWibChartData` di `candles.ts`, refresh 60 dtk intraday, keterangan sumber), `PriceChart.tsx` (otomatis alternatif untuk `usesBackupChartFallback` + intraday, tombol manual, override per aset, prop `height`), `TradingViewChart` punya prop `height`. Di Terminal pakai `<PriceChart asset theme="dark" height={...} />`.
2. **Profil Risiko lengkap (Prompt 3)** — `src/config/riskProfiles.ts` (data alokasi, deskripsi profil, penjelasan & label risiko instrumen, 7 pertanyaan dari spesifikasi 6.1); kuesioner satu pertanyaan per layar + progress bar + Kembali/Lanjut (Lanjut nonaktif sebelum menjawab); skor 7–13/14–20/21–28; simpan via `saveRiskResult`; hasil: disclaimer kuning paling atas, donut `recharts`, daftar instrumen + "Lihat harga" (emas `XAU/USD`, IHSG `^JKSE`, crypto `BTC/IDR`), tab Bandingkan, simulator modal (format ribuan otomatis, tanpa proyeksi), slider "Sesuaikan sendiri" (total ≠ 100% → pesan merah + simpan nonaktif), "Ulangi kuesioner".
3. **PWA (Prompt 4)** — `public/manifest.webmanifest` (AssetRadar, standalone, `#0B1220`), ikon PNG 192/512 + maskable dari logo radar (`RadarLogo` / favicon SVG di `index.html`), `apple-touch-icon`, link manifest di `index.html`; `public/sw.js` sederhana (cache aset statis, `/api/*` network-first dengan cadangan cache), daftarkan **hanya** saat `import.meta.env.PROD`. Indikator koneksi `offline` = abu-abu "Offline – data terakhir" (status di `App.tsx` belum menangani `'offline'` — tambahkan label/warna). Perbarui bagian Tentang di `SettingsView` (sumber: Indodax, Yahoo Finance, gold-api.com, Google News, TradingView; IHSG tertunda).
4. ~~Mode Terminal (Prompt 5 & 6)~~ — **selesai** (`src/components/terminal/`, parser `src/utils/terminalCommands.ts` + test, `.terminal-root` di `index.css` mendefinisikan ulang token warna, opsi "Buka aplikasi di mode Terminal" di Pengaturan). Catatan: widget TradingView menolak `INDODAX:*IDR` → aset `tvWidgetUnsupported` otomatis memakai grafik alternatif Indodax; pilihan TradingView memakai `tvFallbackSymbol` (Binance USDT). Widget kalender butuh `color-scheme: light` di wadahnya (beda color-scheme → iframe transparan diberi latar putih). `html, body` memakai `overflow-x: clip` (bukan `hidden`, yang mematikan `sticky`). Spesifikasi asli di bawah untuk rujukan:
4a. **Mode Terminal ala Bloomberg (Prompt 5 & 6)** — rute baru `#/terminal` (tambah ke `router.ts` + test, `NavTab`, sidebar & bottom nav). Gaya khusus Terminal: latar `#05070A`, panel `#0B0F14`, garis `#1F2937`, teks `#E5E7EB`, aksen amber `#F59E0B`, naik `#22C55E`, turun `#EF4444`, monospace padat, radius 2px. Komponen di `src/components/terminal/`:
   - Ticker tape berjalan (berhenti saat hover; statis jika reduced-motion).
   - Baris perintah (fokus dengan `/`, Esc kosongkan, autocomplete, pesan galat): `<KODE>` (BTC, ETH, SOL, IHSG, EMAS/XAU, USD), `<KODE> GP` grafik, `<KODE> N` berita, `HM`, `ECO`, `CORR`, `TOP`, `HELP`, `RADAR`. Taruh parser di `src/utils/terminalCommands.ts` + test.
   - Panel: MONITOR (tabel semua aset, kedip saat berubah, klik = pilih), CHART (`PriceChart` tema gelap + timeframe), SENTIMEN, BERITA aset terpilih, HEATMAP (intensitas warna sesuai % 24j), KALENDER EKONOMI (widget resmi TradingView `embed-widget-events.js`, gelap, locale `id`, `countryFilter: "id,us"`, `importanceFilter: "0,1"`), KORELASI 30H (`fetchCorrelation`, matriks merah↔hijau, angka 2 desimal, "Korelasi bukan hubungan sebab-akibat."), UMPAN BERITA (`fetchNewsFeed`, label kode aset, jam WIB, sumber, nada).
   - Jam WIB berjalan + status BEI Buka/Tutup; pintasan angka 1–6 pilih aset.
   - Grid: PC 3 kolom, tablet 2, HP 1 kolom bertumpuk.
   - Pengaturan: opsi "Buka aplikasi di mode Terminal" (`getStartInTerminal`/`saveStartInTerminal`; berlaku saat URL tanpa hash).
5. **Penutup** — perbarui `README.md` (Bahasa Indonesia: fitur, sumber data, cara jalan, cara deploy), uji manual di 375px & 1440px, mode terang/gelap, matikan internet (tidak crash).

## Deploy / GitHub

- Repo GitHub (privat): https://github.com/Wafflesgh/AssetRadar , cabang `main`. Identitas commit (konfigurasi lokal repo): Dilan <alfianclassche@gmail.com>. Setelah perubahan lulus lint/test/build: commit lalu `git push`. Bisa diimpor kembali ke Google AI Studio (Build → ⊕ → Import from GitHub) yang menjalankan `server.ts` di Cloud Run.
- `bun.lock` lama sengaja dihapus karena `recharts` ditambahkan; `package-lock.json` adalah lockfile yang berlaku.
