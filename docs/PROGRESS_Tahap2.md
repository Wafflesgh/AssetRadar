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
- [x] 2. IHSG di posisi utama + seluruh saham BEI
  - Dibuat: strip "Key Indices" (IHSG (JCI) paling depan, status buka/tutup) di atas Movers & Top 20; IHSG tombol pertama Quick Chart; nama tampil "IHSG". Daftar 962 emiten resmi dari idx.co.id (kode, nama, jumlah saham, papan, sektor & industri IDX-IC) → `src/config/idxStocks.json` lewat `scripts/update-idx-stocks.mjs` (cara memperbarui ada di kepala skrip). `IDX_UNIVERSE`/`ALL_ASSETS` di `assets.ts` (kode yang bentrok dengan aset inti, mis. GOLD/LINK/META, jadi `KODE.JK`); saham inti IDX diperkaya sektor & jumlah saham resmi. Server: `GET /api/market/quotes?symbols=` (on-demand, cache 15 dtk) dan `GET /api/market/idx` (sapuan seluruh emiten: 5 mnt saat bursa buka, 30 mnt tutup, hanya bila ada penonton ≤10 mnt; 60 simbol/langkah, 2 paralel). Klien: `trackSymbols`/`useTrackedSymbols` → baris di layar, watchlist, dan halaman detail dipolling tiap 10 dtk. Halaman `#/idx` "Indonesian Stocks" (filter teks/sektor/papan, urut market cap/% hari/% minggu/nilai transaksi, 50 per halaman, top gainers/losers/most active). Detail, analisis, chart, watchlist berfungsi untuk semua emiten. Bottom nav HP: Radar · IDX · Terminal · AI · More.
  - Verifikasi: 921 dari 962 emiten punya harga dari Yahoo; 41 sisanya (umumnya saham pemantauan khusus/suspensi) tampil "Data unavailable". Halaman BUMI (universe) menampilkan harga, chart, sentimen, analisis.
  - Keterbatasan: daftar emiten statis (perlu dijalankan ulang skripnya saat ada IPO/delisting). "Value traded" = harga × volume (perkiraan, bukan nilai transaksi resmi BEI). Data IDX dari Yahoo tertunda.
- [x] 3. Search bar di semua halaman
  - Dibuat: `HeaderSearch.tsx` di header semua halaman (kecuali Terminal yang punya baris perintah sendiri): kotak inline di PC, tombol kaca pembesar → pencarian layar penuh di HP (portal ke <body>). Pintasan `/` dan Ctrl/⌘+K. Mencari semua aset + 962 emiten BEI berdasarkan kode, nama, kata kunci, sektor & industri (contoh "nikel" → INCO, ANTM, MBMA, NCKL). Hasil menampilkan grup/sektor, harga live & % 24 jam (saham universe langsung dipolling saat tampil). Enter/klik → detail. 5 pencarian terakhir disimpan (`getRecentSearches`/`saveRecentSearch` di storage.ts). Label koneksi di header HP jadi ikon saja agar muat.
  - Verifikasi: PC — `/` memfokuskan kotak, "nikel" → 4 hasil dengan harga, Enter membuka INCO dan tersimpan di Recent; HP 375px — overlay layar penuh, tanpa scroll horizontal.
- [x] 4. Portofolio pribadi
  - Dibuat: `src/utils/portfolio.ts` (metode rata-rata tertimbang seperti broker Indonesia, realized/unrealized, konversi ke Rupiah dengan kurs live, kelas aset, validasi: angka positif, tanggal tidak di masa depan, tidak bisa jual melebihi kepemilikan pada tanggal itu, format export/import) + test. Halaman `#/portfolio` (lazy-load): tambah/edit/hapus transaksi (saham BEI dalam lot = 100 lembar, crypto desimal, emas dalam gram dengan harga Rp/gram, saham AS/dunia & kurs), tombol "Use live", ringkasan nilai/modal/P&L, tabel posisi (rata-rata vs live, nilai Rp, P/L, skor bukti & F-score sebagai informasi), donut alokasi, perbandingan dengan alokasi Profil Risiko tersimpan, riwayat transaksi, Export/Import JSON. Data hanya di perangkat (`getPortfolioTxs`/`savePortfolioTxs`).
  - Verifikasi: uji di browser — 10 lot BBCA @Rp5.000 → nilai Rp4.820.000, P/L −Rp180.000 (−3,6%) dengan skor bukti; data uji dihapus lagi.
  - Keterbatasan: posisi dalam KRW/HKD (Samsung, Tencent) tidak masuk total Rupiah karena tidak ada kurs IDR untuk mata uang itu (diberi catatan). Tidak memperhitungkan dividen/aksi korporasi otomatis.
- [x] 5. Uji nyata (forward test) AI Advisor
  - Dibuat: `src/ai/forwardTest.ts` (+ test): snapshot verdict sekali per hari per horizon & profil (tanggal WIB, verdict, chance, harga live), tidak pernah diisi mundur; penilaian setelah N hari bursa memakai close harian sungguhan (close hari snapshot vs close N bar kemudian, hasil disimpan permanen di log); track record per verdict vs base rate; ambang 30 hasil. Komponen `LiveTrackRecord.tsx` di AI Advisor (rekam otomatis saat ≥60% harga live tersedia, cek hasil hanya untuk snapshot yang cukup tua, Export/Import JSON). Disimpan di perangkat (`getForwardLogRaw`/`saveForwardLogRaw`, maks 15.000 entri).
  - Verifikasi: membuka AI Advisor menyimpan 55 verdict untuk 2026-10-20 (horizon 20, moderate); hasil pertama baru muncul ±20 hari bursa kemudian.
  - Butuh keputusan pemilik: penyimpanan di server (database gratis, mis. Firestore/Supabase dengan kunci di Secrets) agar riwayat tidak hilang saat ganti HP/browser dan tetap terekam walau aplikasi tidak dibuka. Belum dipasang — perlu persetujuan.
- [x] 6. Kalender emiten IDX
  - Sumber: Yahoo Finance — `quoteSummary?modules=calendarEvents` (perlu cookie + crumb sesi, dikelola server, diperbarui tiap 6 jam): tanggal laporan keuangan berikutnya (ditandai "estimated" bila perkiraan sumber), ex-dividend, tanggal pembayaran dividen; `chart?events=div,split` 5 tahun: riwayat dividen (ex-date + nilai per saham) dan stock split. idx.co.id menolak server (Cloudflare 403); KSEI tidak punya API publik.
  - Dibuat: `src/utils/corporateCalendar.ts` (+ test), server `GET /api/idx/calendar?symbol=` (per saham, cache 12 jam) dan `GET /api/idx/calendar` (semua emiten −30…+90 hari; dipindai pelan 2 paralel + jeda, sekali per 12 jam, hanya bila ada penonton ≤1 jam). Halaman `#/calendar` (minggu ini / bulan ini / 90 hari / 30 hari lalu, filter semua/watchlist/portofolio, filter jenis), bagian "Corporate Calendar" di detail saham, panel Terminal CAL (`CAL`, `<KODE> CAL`, tombol QuickBar).
  - Verifikasi: TLKM → earnings 29 Okt 2026 + 5 dividen terakhir; halaman kalender terisi bertahap (±8 menit untuk 962 emiten).
  - Tidak tersedia dari sumber gratis (ditulis di UI): RUPS, cum date, recording date, rights issue. Nilai dividen mendatang hanya muncul jika sumber sudah mencatatnya.
- [ ] 7. Data makro Indonesia
- [ ] 8. Laporan keuangan perusahaan + rasio
- [ ] 9. Harga ±5 detik lewat push dari server (SSE) + Finnhub opsional

Untuk setiap fitur tulis: rencana singkat, apa yang dibuat, sumber data, keterbatasan, status verifikasi live (sudah / belum + alasan), commit.

## Butuh keputusan pemilik

- Forward test AI Advisor: simpan juga di server (database gratis + kunci di Secrets) supaya tercatat setiap hari walau aplikasi tidak dibuka dan tidak hilang saat ganti perangkat? Saat ini hanya di perangkat.

## Laporan akhir

_(diisi di akhir)_
