# AssetRadar tahap 2 — catatan kemajuan

Diisi oleh sesi Claude yang mengerjakan `docs/PROMPT_Fitur_Lanjutan_2.md` (lokal) atau `docs/PROMPT_Cloud_Tahap2.md` (cloud). Sesi berikutnya melanjutkan dari fitur pertama yang belum dicentang.

Dijalankan lokal (Claude Code desktop), langsung di `main`. Mulai 19 Okt 2026.

## Cek lingkungan

| Sumber | Status HTTP | Catatan |
|---|---|---|
| Yahoo Finance | 200 | dipakai sejak tahap 1 |
| Indodax | 200 | dipakai sejak tahap 1 |
| CoinGecko | 200 | dipakai sejak tahap 1 |
| gold-api.com | 200 | dipakai sejak tahap 1 |
| Google News | 200 | dipakai sejak tahap 1 |
| FRED | 200 | dicek 19 Okt |
| World Bank | 200 | dicek 19 Okt |
| SEC EDGAR | belum dicek | untuk fitur 8 |
| Finnhub | 200 | kunci di `.env` lokal, quote AAPL berhasil |

Node 24 · `lint / test / build` awal: lulus (85 test)

## Fitur

- [x] 1. PWA (install di smartphone)
  - Dibuat: `public/manifest.webmanifest`, ikon PNG asli dari logo radar (`scripts/generate-icons.mjs` → `public/icons/`), `public/sw.js` (statis cache-first dengan versi per build, halaman network-first, `/api/*` network-first + cadangan cache bertanda `X-AssetRadar-Offline`, stream SSE tidak disentuh), langkah build di `vite.config.ts` yang mengisi BUILD_ID + daftar precache, `src/pwa.ts` (daftar SW hanya PROD, tombol install via `beforeinstallprompt`), `InstallApp.tsx` (kartu di Settings, banner di Radar yang bisa ditutup, petunjuk iPhone). Harga dari cache offline tidak pernah dianggap live (ditolak `fetchLivePrices`; snapshot lokal yang dipakai).
  - Verifikasi: build produksi lokal (port 3001) → SW `activated`, halaman dikontrol SW, manifest `application/manifest+json`; server dimatikan → aplikasi tetap terbuka dengan data tersimpan.
  - Keterbatasan: prompt install hanya muncul di browser yang mendukung (Chrome/Edge Android & desktop); iPhone lewat Share → Add to Home Screen. Belum dicoba di HP sungguhan.
- [ ] 2. IHSG di posisi utama + seluruh saham BEI
- [ ] 3. Search bar di semua halaman
- [ ] 4. Portofolio pribadi
- [ ] 5. Uji nyata (forward test) AI Advisor
- [ ] 6. Kalender emiten IDX
- [ ] 7. Data makro Indonesia
- [ ] 8. Laporan keuangan perusahaan + rasio
- [ ] 9. Harga ±5 detik lewat push dari server (SSE) + Finnhub opsional

Untuk setiap fitur tulis: rencana singkat, apa yang dibuat, sumber data, keterbatasan, status verifikasi live (sudah / belum + alasan), commit.

## Butuh keputusan pemilik

_(kosong)_

## Laporan akhir

_(diisi di akhir)_
