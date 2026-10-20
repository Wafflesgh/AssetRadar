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
- [x] 7. Data makro Indonesia
  - Sumber: Bank Indonesia (bi.go.id, halaman resmi BI-Rate & data inflasi — hanya 10 baris terbaru tanpa postback), FRED tanpa kunci (suku bunga antarbank overnight IRSTCI01IDM156N sebagai proksi jalur BI-Rate, CPI y/y CPALTT01IDM659N & indeks CPI s.d. Apr 2025, PDB y/y kuartalan, cadangan devisa, neraca perdagangan, USD/IDR rata-rata bulanan), World Bank (inflasi & PDB tahunan). BPS API (butuh kunci) tidak dipasang.
  - Dibuat: `src/utils/macro.ts` (+ test: parser FRED/BI/World Bank, merge, m/m, pergeseran tanggal rilis), `GET /api/macro/indonesia` (cache 6 jam), halaman `#/macro` (BI-Rate resmi + tabel keputusan, kartu & grafik tiap indikator dengan tanggal data terakhir, frekuensi, sumber), panel Terminal IDMACRO (+ QuickBar).
  - AI Advisor: fitur baru (perubahan 3 bulan suku bunga antarbank — dianggap terbit 2 bulan setelah periode — dan inflasi y/y — terbit 1 bulan + 5 hari) untuk IHSG, saham IDX, dan pasangan kurs X/IDR. Dipakai hanya jika memperbaiki Brier score periode validasi; hasil holdout dilaporkan di tiap kartu & Methodology. Hasil 20 Okt 2026 (horizon 20 hari): dipakai di 3 dari 15 aset (ASII, EUR/IDR, MYR/IDR); akurasi holdout rata-rata 54,0% tanpa vs 57,2% dengan — membantu kurs, tidak untuk sebagian besar saham bank.
  - Tidak tersedia: imbal hasil SBN 10 tahun (tidak ada sumber gratis yang terkini), PMI manufaktur (data berlisensi). Inflasi m/m gratis berhenti di Apr 2025; inflasi y/y punya celah Mei–Okt 2025 (FRED berhenti, BI hanya 10 bulan terakhir).
- [x] 8. Laporan keuangan perusahaan + rasio
  - Sumber: Yahoo Finance `ws/fundamentals-timeseries` tanpa kunci (semua saham: tahunan ±4 tahun, kuartalan ±5 kuartal terakhir), SEC EDGAR `data.sec.gov/api/xbrl/companyfacts` tanpa kunci (28 saham AS dengan CIK terverifikasi di `src/config/secCik.ts`: 10-K/10-Q 10+ tahun, sumber utama untuk AS; Yahoo mengisi celah). Harga akhir periode dari grafik bulanan Yahoo, harga live untuk periode terbaru.
  - Dibuat: `src/utils/statements.ts` (+ 9 test: parser Yahoo/SEC, YTD → kuartal, Q4 = tahun − 3 kuartal, kuartal yang dilewati sumber diturunkan dari laporan tahunan, semester hanya bila kedua kuartal ada, TTM vs disetahunkan, periode kosong "Not reported", penanggalan kuartal fiskal 52/53 minggu, CSV), `GET /api/fundamentals/statements?symbol=&period=annual|semester|quarterly` (cache 12 jam), `FinancialStatementsPanel` (lazy) di detail setiap saham: pilihan Annual/Semester/Quarterly + 1–5 tahun, tab Income / Balance sheet / Cash flow / Ratios, grafik batang pendapatan & laba bersih, unduh CSV, sumber per angka (tooltip; tanda "c" = dihitung), F-score Piotroski yang sudah ada sebagai lencana.
  - Rasio: gross/operating/net margin, ROE, ROA, DER, current ratio, asset turnover, pertumbuhan YoY & vs periode sebelumnya, EPS, P/E, P/B, dividend yield. Kuartal/semester memakai TTM bila lengkap, jika tidak disetahunkan (dijelaskan di UI). P/E/P/B/yield tidak ditampilkan bila mata uang laporan ≠ mata uang saham (mis. TSMC TWD vs USD).
  - Verifikasi live: AAPL kuartalan 20 kuartal (SEC + Yahoo, Q4 diturunkan), BBCA tahunan FY2022–FY2025 + semester H1 2025/H2 2025/H1 2026 (Q3 2025 diturunkan dari laporan tahunan), TSM (catatan mata uang), 375px tanpa scroll horizontal.
  - Keterbatasan: saham IDX dan non-AS hanya dari Yahoo → tahunan ±4 tahun (bukan 5) dan kuartalan ±5 kuartal; data kuartal lebih lama belum tersedia gratis (idx.co.id memblokir server). Item yang tidak dilaporkan sumber tampil "—".
- [x] 9. Harga ±5 detik lewat push dari server (SSE) + Finnhub opsional
  - Dibuat: `src/utils/priceStream.ts` (+ 7 test: jadwal & prioritas, backoff 5→10→20→40 dtk dan pulih bertahap, diff tick, throttle trade 1/dtk/simbol, watchdog & jeda sambung ulang klien). Server: satu loop harga (cek tiap 1 dtk, hanya saat ada klien stream) — aset prioritas (Quick Chart + yang sedang dilihat, watchlist, portofolio, baris IDX di layar, dikirim klien lewat `POST /api/market/price-focus`) tiap ±5 dtk saat bursanya buka, aset lain 15 dtk, bursa tutup 5 mnt; Yahoo 429/5xx/gagal jaringan → interval otomatis diperlambat dan dicatat di log. `GET /api/market/price-stream` (SSE: `snapshot`, `prices` = hanya tick yang berubah, `ping` 20 dtk; emas ikut stream). Klien: `MarketDataManager` berlangganan stream; polling Yahoo/emas/quotes berhenti selama stream sehat; stream putus/macet >30 dtk → polling REST 10 dtk + sambung ulang dengan backoff; putus saat tab tersembunyi. Label: "Live (streaming)" / "Live · Polling". Saham BEI/IHSG tetap "delayed".
  - Finnhub (opsional, `FINNHUB_API_KEY` di `.env`/Secrets, ditambahkan kosong ke `.env.example`): paket gratis = penggunaan pribadi, 60 panggilan/menit, WebSocket 1 koneksi per kunci, maks 50 simbol (dicek di finnhub.io/pricing & docs 20 Okt 2026). Dipakai untuk 29 saham AS saja (crypto aplikasi dalam IDR dari Indodax, kurs Rupiah tidak tersedia di Finnhub). Trade diteruskan maks 1×/dtk/simbol hanya saat sesi reguler; kunci hanya di server, tidak dicetak di log.
  - Verifikasi live (19 Okt 2026, bursa AS buka): `curl -N` → snapshot 97 harga lalu event `prices` tiap 1–5 dtk berisi hanya yang berubah, Finnhub "live"; di browser label "Live (streaming)", harga AAPL bergerak dalam 6 dtk, tidak ada polling `/api/market/yahoo`; server dimatikan → "Live · Polling", dinyalakan lagi → kembali "Live (streaming)" tanpa memuat ulang halaman.

Untuk setiap fitur tulis: rencana singkat, apa yang dibuat, sumber data, keterbatasan, status verifikasi live (sudah / belum + alasan), commit.

## Butuh keputusan pemilik

- Forward test AI Advisor: simpan juga di server (database gratis + kunci di Secrets) supaya tercatat setiap hari walau aplikasi tidak dibuka dan tidak hilang saat ganti perangkat? Saat ini hanya di perangkat.

## Laporan akhir

- Semua 9 fitur selesai, masing-masing di-commit & push ke `main` (3b27af1, 8829436, 7a5f215, f3f7a86, 6bac9a9, e55ef06, 63e8b9a, ee711ab, c41897e) + commit dokumen penutup.
- Uji penutup (20 Okt 2026): 13 halaman tanpa scroll horizontal di 375px dan 1440px, mode gelap & terang; build produksi: service worker aktif, server dimatikan → aplikasi tetap terbuka dari cache dengan harga terakhir, tanpa crash. `npm run lint && npm test && npm run build` lulus (123 test).
- CLAUDE.md dan README.md diperbarui (fitur, endpoint, sumber data & keterbatasan, cara memperbarui daftar emiten, kunci opsional `FINNHUB_API_KEY`).
