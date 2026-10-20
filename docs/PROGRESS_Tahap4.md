# AssetRadar tahap 4 — catatan kemajuan

Diisi oleh sesi Claude yang mengerjakan `docs/PROMPT_Cloud_Tahap4.md` (cloud). Sesi berikutnya melanjutkan dari fase pertama yang belum dicentang, di branch `claude/tahap4-sentiment`.

Dijalankan di Claude Code cloud, 20 Okt 2026. Branch: **`claude/tahap4-sentiment`**, dibuat dari `main` terbaru (55ea0de). PR tahap 3 (https://github.com/Wafflesgh/AssetRadar/pull/1, branch `claude/ecstatic-fermat-nyv2f9`) **belum di-merge** dan tidak diubah; karena dua bahasa (Fase 1) menyentuh hampir semua komponen, **kemungkinan ada konflik** saat PR kedua di-merge setelah yang pertama — perlu dibereskan saat itu (merge `main` ke branch PR yang tersisa).

## Fase 0 — Cek sumber

Node v22.22.0 · `npm install` lulus · kondisi awal `npm run lint && npm test && npm run build`: **lulus (123 test)**.

Kebijakan jaringan lingkungan cloud ini **menolak semua host di bawah** (proxy menjawab `403` pada CONNECT; hanya registry npm yang diizinkan). Status HTTP `000` = koneksi ditolak sebelum sampai ke server tujuan, jadi tidak ada contoh data, tanggal data terbaru, `exchangeInfo.rateLimits` maupun header `X-MBX-USED-WEIGHT-1M` yang bisa dibaca.

| Sumber | URL dicek | Hasil dari cloud |
|---|---|---|
| Yahoo spark | `query1.finance.yahoo.com/v7/finance/spark?symbols=BBCA.JK` | diblokir (403 proxy) |
| Yahoo quoteSummary (cookie + crumb) | `query2.finance.yahoo.com/v10/finance/quoteSummary/BBCA.JK?modules=earningsTrend`, `fc.yahoo.com` | diblokir |
| SEC submissions | `data.sec.gov/submissions/CIK0000320193.json` | diblokir |
| Binance spot data | `data-api.binance.vision/api/v3/ping` | diblokir |
| Binance spot cadangan | `api.binance.com`, `api-gcp.binance.com`, `api1.binance.com` | diblokir |
| Binance WebSocket | `data-stream.binance.vision` | diblokir |
| Binance futures | `fapi.binance.com/fapi/v1/ping` | diblokir |
| Fear & Greed | `api.alternative.me/fng/` | diblokir |
| FRED | `fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU` | diblokir |
| World Bank | `api.worldbank.org/v2/...` | diblokir |
| Bank Indonesia | `www.bi.go.id/...bi-rate.aspx` | diblokir |
| BPS API | `webapi.bps.go.id` | diblokir |
| Badan Pangan | `panelharga.badanpangan.go.id` | diblokir |
| DJPPR | `www.djppr.kemenkeu.go.id` | diblokir |
| CoinGecko | `api.coingecko.com` | diblokir |
| registry.npmjs.org | — | 200 |

Akibatnya semua fitur tahap 4 ditulis lengkap dengan deteksi kegagalan/blokir dan pesan jujur di UI, diuji dengan fixture kecil (hanya di test), dan ditandai **"belum diverifikasi live — perlu dicek pemilik di laptop"**. Fakta yang sudah dicek pemilik di rencana (batas Binance, alamat cadangan, ketersediaan `earningsTrend` dll.) dipakai apa adanya.

## Fase

- [x] 0. Cek sumber (di atas)
- [x] 1. Dua bahasa (English / Bahasa Indonesia)
- [x] 2. Lapisan data (cross-section, fundamental tambahan, estimasi analis, Binance, 50 crypto)
- [x] 3. Pilar & horizon sentimen
- [x] 4. Proyeksi teknikal & kalkulator posisi
- [x] 5. Validasi & cadence
- [x] 6. Tampilan
- [x] 7. Makro Indonesia diperluas
- [x] 8. Penutup

## Fase 1 — Dua bahasa

- `src/i18n/`: `en.ts` (sumber, ±1.280 kunci), `id.ts` (terjemahan, paritas dicek test), `core.ts` (`translate`, `translateOr`, `parseLang`, tanpa React — dipakai server & modul murni), `index.ts` (`t`, `tOr`, `useT`, `useLang`, `setLang`, format angka), `Rich.tsx` (`**tebal**`/`` `kode` ``), `assetNames.ts` (nama umum aset & grup, mis. Gold ↔ Emas), `textParts.ts` (kalimat dari kunci + parameter; parameter boleh menyebut kunci lain sebagai `@kunci`), `analysisText.ts` (teks analisis server → bahasa terpilih).
- Bahasa: tersimpan (`assetradar_lang_v1`) → `navigator.language` `id…` → Indonesia, selain itu Inggris. Tombol **EN | ID** di header PC & menu More HP, plus kartu di Settings (bahasa + "Number format: follow language / always en-US", `assetradar_number_format_v1`).
- Seluruh halaman diterjemahkan: shell, Radar, detail aset (analisis, sentimen, laporan keuangan, kalender), IDX, kalender, makro, portofolio, AI Advisor (+ rekam jejak), Quant Lab, Profil Risiko (kuesioner, profil, instrumen), Watchlist, Settings, Terminal (panel, HELP, saran, pesan galat; kode perintah tetap Inggris). `scripts/check-i18n.mjs` → **0** teks tersisa.
- Teks dari server: alasan & cek verdict AI Advisor (`rankOutlooks(..., { lang })`), ringkasan rule-based AI Advisor (`?lang=`), bacaan scorecard teknikal, pola grafik, komponen bukti, ringkasan & faktor kunci analisis (dikirim sebagai kunci, dirender klien). Gemini (bila ada kunci) diminta menulis dalam bahasa terpilih; cache intelligence & ringkasan AI per bahasa.
- Berita: judul tetap bahasa asli + tombol **Translate** (`/api/translate`, Gemini, cache 24 jam; tanpa kunci → Google Translate di tab baru).
- Format angka `id-ID` (`Rp1.234.567`, `1,25%`, singkatan T / M / Jt) di `format.ts`; waktu relatif Indonesia di `marketHours.ts`.
- Belum diterjemahkan (sengaja/sisa kecil): referensi jurnal (nama penulis), sumber data, judul berita, label 2 indikator makro "tidak tersedia" dari server (akan dirombak di Fase 7), kode perintah Terminal.
- Test: paritas kunci, placeholder sama, tidak ada string kosong, fallback ke Inggris, format id-ID, waktu relatif Indonesia, verdict AI Advisor dalam bahasa Indonesia, teks analisis berkunci (Inggris identik dengan teks asli, Indonesia tidak jatuh ke fallback). 129 test lulus.

## Fase 2 — Lapisan data

- **Binance (hanya data pasar publik, tanpa kunci API, tanpa endpoint akun/order)** — `src/crypto/binance.ts`: urutan alamat `data-api.binance.vision` → `api.binance.com` → `api-gcp` → `api1…api4` (gagal jaringan → alamat berikutnya); parser `exchangeInfo` (termasuk `rateLimits` → batas weight dibaca, bukan di-hardcode), `ticker/24hr` (FULL & MINI), `klines` (unik per open time, candle terakhir ditandai **belum selesai** dan dibuang untuk indikator), `!miniTicker@arr`, `premiumIndex`, statistik futures (`openInterestHist`, `globalLongShortAccountRatio`, `takerlongshortRatio`, `basis`); filter universe USDT (stablecoin & token leverage UP/DOWN/BULL/BEAR dibuang, simbol non-ASCII seperti `币安人生USDT` tetap, selalu `encodeURIComponent`); **WeightGovernor**: maksimal 20% batas per IP, membaca `X-MBX-USED-WEIGHT-1M`, 429 → berhenti sesuai `Retry-After`, 418 → semua permintaan berhenti (default 10 menit), 451 → "Binance data is not available from this server's region"; timeout 12 dtk; `planRounds` membagi antrean candle per anggaran.
- `server/binanceFeed.ts`: top 100 pasangan USDT menurut volume 24 jam (peringkat ulang tiap jam, exchangeInfo sehari sekali), **satu** WebSocket `!miniTicker@arr` (tutup sebelum 24 jam, sambung ulang dengan backoff) dengan cadangan polling `ticker/24hr` tiap 15 dtk, futures `premiumIndex` + `ticker/24hr` tiap 1 menit, antrean candle 1h (200) & 1d (500) untuk top 100 dalam batas weight, statistik derivatif per kontrak (cache 5 mnt, anggaran 20% dari 1000/5 mnt). Polling hanya bila ada permintaan ≤ 10 menit terakhir.
- Endpoint: `GET /api/crypto/binance` (tabel 100 pasangan: harga USDT, % 1h/4h/24h/7d, volume, funding, tautan ke aset aplikasi + status/weight/progres pemindaian), `GET /api/crypto/binance/klines?symbol=&interval=1h|4h|1d|1w` (hanya pasangan yang ada di exchangeInfo), `GET /api/crypto/binance/derivatives?contract=`.
- **50 crypto** (`src/config/cryptoUniverse.json`): 30 koin baru ditambahkan setelah 20 koin lama (id/kode lama tidak berubah; TON tetap `ton`, tampil "Toncoin (GRAM)", perintah `GRAM` juga dikenali). Total aset inti **147**. Satu sumber harga per aset (`priceSource`): Indodax (IDR) → Binance spot → Binance futures (dibagi `futuresMultiplier`, mis. `1000PEPEUSDT`) → CoinGecko; harga USDT/USD dikonversi ke Rupiah dengan USD/IDR live dan ditandai `converted` (+ `priceUsdt`). Grafik: Indodax bila ada, selain itu candle Binance dikonversi ke Rupiah (kurs hari ini); koin yang hanya ada di CoinGecko (WBT, RAIN, HTX) hanya grafik harian. Koin baru **tidak** ikut AI Advisor (syarat riwayat ≥ 2 tahun belum bisa dicek dari cloud).
- **Laporan keuangan diperluas** (`statements.ts`): beban pokok, SG&A, laba sebelum pajak, pajak, persediaan, piutang (Yahoo + SEC) untuk audit operasional Abarbanell & Bushee dan tarif pajak efektif; tiap periode SEC menyimpan tanggal **pertama kali diajukan** (`filed`) untuk uji point-in-time.
- **Estimasi analis** (`src/utils/analyst.ts`, `GET /api/fundamentals/analyst?symbol=`): EPS konsensus tahun depan (FEPS) + jumlah analis, tahun berjalan, 4 kejutan EPS terakhir (proksi SUE, di-winsorize ±100%), sektor/industri, book value per share. Hanya konsensus hari ini (tidak ada riwayat) → FEPS tidak bisa ikut uji historis.
- **Cross-section** (`server/crossSection.ts`): antrean pelan per pasar (BEI ±960 saham, AS 29 saham): harga bulanan 10 tahun (spark 20 simbol/permintaan, jeda 1,5 dtk), laporan keuangan (1,2 dtk), estimasi analis (2 dtk); cache 24/12/12 jam; berjalan selama ada permintaan ≤ 30 menit; progres & umur data di `GET /api/sentiment/scan-status`. Industri: IDX-IC dari `idxStocks.json`; AS dari profil Yahoo.
- Keterbatasan: daftar konstituen S&P 500 untuk peringkat saham AS tidak bisa diunduh dari cloud → peringkat AS memakai 29 saham inti dengan peringatan "small peer group" (lihat Butuh keputusan pemilik).
- Test baru: parser & universe Binance (fixture), governor (20%, header, 429/418/451, Retry-After), klien (pindah alamat, berhenti saat 429, deteksi wilayah), jadwal weight, perubahan 1h/4h/7d, snapshot derivatif, pemilihan sumber harga crypto & konversi USDT→IDR, parser analis, antrean cross-section.

## Fase 3 — Pilar & horizon sentimen

Modul murni di `src/sentiment/` (semua dengan test, data sintetis):
- `crossSection.ts`: peringkat rata-rata (ties), percentile `rank/(n−1)`, skor AMP `rank − rata-rata(rank)` → 0–100, desil dari subset likuid (ambang `LIQUIDITY_THRESHOLD`: BEI Rp500 jt/hari, AS US$10 jt/hari) lalu semua saham ditempatkan pada batas desil itu, penyesuaian industri (nilai − median industri; industri < 3 anggota → median pasar, ditandai).
- `factors.ts` (termasuk **SUE** dan **audit operasional**): nilai faktor **point-in-time** per akhir bulan — harga hanya s.d. bulan itu, laporan hanya yang sudah terbit (BEI tahunan +4 bln, kuartalan +2 bln; SEC memakai tanggal pengajuan pertama, cadangan +3/+2 bln). Momentum 12-2 (`P(t−2)/P(t−13)`), jendela Bettman **t−12…t−7** sesuai koreksi jurnal (varian 6 bulan terakhir disiapkan untuk validasi), reversal 1 bulan, SUE Novy-Marx (selisih musiman, sd 8 kuartal, butuh 12 kuartal; jika kurang → proksi kejutan analis, hanya untuk skor hari ini), F-score Piotroski (total utang sebagai pengganti utang jangka panjang), sinyal Abarbanell & Bushee (INV, AR, CAPX vs industri, GM, S&A, ETR; arah sudah dibalik sehingga lebih tinggi = lebih baik; LF/EQ/AQ "Not reported"), GPA (bank/asuransi → ROA), B/M, BVPS, EPS, FEPS (hanya hari ini), P(t−5).
- `hybridValue.ts`: model hibrida Bettman **diestimasi ulang** per pasar per bulan dengan OLS (eliminasi Gauss), 1% residu ekstrem dibuang lalu refit, Model 4 bila cakupan analis < 50%, kolom konstan (mis. tidak ada saham D_Down) dibuang otomatis, varian per-saham ÷ P(t−5) diuji; yang dipilih = galat median lebih kecil pada separuh data yang tidak dipakai untuk estimasi. Koefisien, n, R² dikirim bersama peringatan bahwa R² tinggi berasal dari P(t−5).
- `pillars.ts`: 3 pilar 0–100 (bobot sesuai rencana 2.2), sub-faktor kosong → bobot dibagi ulang + ditandai; peringatan F-score 0–1 ("financial distress warning"); konteks "prior bad earnings news".
- `newsHorizon.ts`: berita per horizon dengan half-life 2 hari / 3 minggu / 6 bulan, Medium tanpa berita yang hanya melaporkan harga, Long hanya kategori struktural; ditarik ke nol bila beritanya sedikit; batas ±15/±10/±5 poin; judul penyumbang + poin + umur + sumber. Berita baru menghapus cache sentimen aset itu (Short dihitung ulang).
- `horizons.ts`: bobot per horizon sesuai tabel 2.3; komponen tidak berlaku (makro di luar IHSG/saham BEI/pasangan Rupiah, derivatif di luar crypto Binance) → "Not applicable"; aset tanpa laporan keuangan → pilar 2–3 diganti momentum time-series (12-1, diskalakan volatilitas) dan tren 200 hari. Tiap komponen melaporkan kontribusi (poin), sehingga skor = 50 + Σ kontribusi. Label 5 tingkat, confidence Low/Medium/High dari cakupan data, kesepakatan antarkomponen dan hasil validasi. Teknikal pendek: scorecard 9 aturan, jarak ke MA20/50, breakout 20 hari, volume relatif, reversal 1 bulan (negatif). Derivatif: funding & rasio long/short dibaca kontrarian (heuristik, ditulis di UI).
- `macroSignal.ts`: perubahan 3 bulan BI-Rate & inflasi (data > 120 hari diabaikan); saham/IHSG: turun = mendukung; pasangan X/IDR: arah dibalik.
- `cadence.ts`: cadence default + katalis berikutnya (laporan laba, ex-date, FOMC) + rumus cadence dari half-life IC (dipakai di Fase 5).
- Endpoint: `GET /api/sentiment/v2?symbol=` (3 horizon, komponen, pilar & sub-faktor, model hibrida pasar, kesegaran data & progres pemindaian, disclaimer), `GET /api/sentiment/rankings?market=idx|us&horizon=` (pemimpin & terlemah dari cross-section; teknikal pendek hanya di halaman saham), skor Short/Medium/Long untuk 100 pasangan Binance di `GET /api/crypto/binance`.

## Fase 4 — Proyeksi teknikal & kalkulator posisi

- `src/sentiment/projections.ts` (+ test): **kisaran statistik** 68% & 90% dari kuantil empiris return h-hari aset itu sendiri (saham ≥ 2 tahun harian; crypto ≥ 1 tahun; 4 jam crypto ≥ 500 candle karena riwayat 4 jam gratis hanya beberapa bulan — ditulis), diskalakan volatilitas EWMA (λ 0,94) ÷ volatilitas historis (dibatasi 0,5–2,5×); **kalibrasi** point-in-time setiap 5 bar (tiap kisaran masa lalu hanya memakai data sebelumnya; test membuktikan crash setelah tanggal itu tidak mengubah hasil) + peringatan bila meleset > 5 poin dari 68/90. ATR(14) Wilder dan level ±1/±2/±3 ATR. **Support/resistance**: pivot swing, MA20/50/200, high/low 52 minggu, pivot klasik harian & mingguan (P, R1–R3, S1–S3), high-volume node dari profil volume; level berjarak ≤ 0,5 ATR digabung, kekuatan = jumlah sumber + sentuhan. Fibonacci hanya opsi (`?fib=1`, label "low evidence"). **Target pola** (measured move double top/bottom, H&S, segitiga/wedge/kanal) dengan hit rate historis di aset itu bila ≥ 20 kasus, selain itu "too few past cases". Upside/downside ke level terdekat + reward/risk. **Kalkulator posisi** (edukasi): volatility targeting AMP (bobot maks = target vol ÷ vol aset; default target 10%/tahun; vol 3 tahun, crypto EWMA) dan risiko per transaksi (modal × risiko% ÷ (entry − stop), dibulatkan ke lot 100 untuk BEI, tidak melebihi modal). Tidak ada angka entry yang disarankan.
- `GET /api/projections?symbol=[&fib=1]` (cache 10 mnt): kisaran per horizon (saham 1D/1W/1M/3M; crypto 4h/1D/1W/1M), ATR, level, terdekat, pola, volatilitas & metodenya, ukuran lot, disclaimer. Candle harian terakhir yang belum selesai tidak dipakai untuk level.

## Fase 5 — Validasi & cadence

- `src/sentiment/validation.ts` (+ test): back-test **point-in-time** per pasar — setiap akhir bulan pilar & skor horizon dihitung ulang hanya dari data yang sudah terbit saat itu (jeda laporan, tanpa konsensus analis), lalu dibandingkan dengan return sesudahnya (Short 1 bulan, Medium 3 bulan, Long 12 bulan; harga bulanan). Ukuran per horizon & per pilar: **IC** (Spearman, rata-rata per bulan, t-stat dikoreksi untuk jendela return yang tumpang-tindih), hit rate kuintil teratas vs base rate, persentase bulan kuintil teratas mengalahkan base rate, spread kuintil atas − bawah (juga per tahun), jumlah sampel & periode; **60% awal = validasi, 40% akhir = holdout**. Varian jendela D_Up/D_Down (jurnal t−12…t−7 vs 6 bulan terakhir) hanya dipakai bila IC validasinya lebih baik; holdout dilaporkan.
- **Cadence otomatis**: IC skor Medium diukur pada jeda 1/2/3/6/12 bulan → half-life (bulan × 21 hari bursa) → Daily (< 5 hari), Weekly (< 30), selain itu Monthly, beserta alasannya ("score information halves in about N trading days"); Short tetap harian (data harian tidak ada di back-test bulanan).
- Crypto: `validatePanel` untuk 100 pasangan Binance (candle harian tertutup ±500 hari, skor Short/Medium tiap 7 hari vs return 7/30 hari).
- `GET /api/sentiment/validation?market=idx|us|crypto` (dihitung di latar belakang saat data pemindaian cukup, cache 24 jam; status `computing` / `waiting-for-data` / `ready`). Hasil IC dipakai untuk **confidence** di `/api/sentiment/v2` (High hanya bila IC positif & signifikan) dan cadence horizon.
- Keterbatasan jujur: berita & teknikal harian tidak punya riwayat tersimpan → tidak ikut back-test (ditulis di `scope`); fundamental BEI dari Yahoo hanya ±4 tahun tahunan / ±5 kuartal → validasi fundamental BEI pendek (`fundamentalYears`); FEPS tidak divalidasi (tidak ada riwayat konsensus).

## Fase 6 — Tampilan

- **Detail aset**: kartu **Investment sentiment** (`src/components/sentiment/InvestmentSentimentPanel.tsx`, lazy) — tab Pendek/Menengah/Panjang dengan rentang waktu per kelas aset, skor 0–100 + label 5 tingkat, keyakinan + alasannya, cadence tinjau (+ alasan dari half-life IC bila sudah divalidasi), katalis berikutnya, tabel komponen (skor, bobot efektif, kontribusi poin, tanggal data, referensi jurnal, alasan "Not applicable"/"Not reported", catatan bobot dibagi ulang), berita penyumbang skor berita, 3 pilar + sub-faktor (saham), peringatan distress, D_Up/D_Down, nilai wajar hibrida + peringatan R², bukti uji historis, kesegaran data & progres pemindaian, disclaimer. Kartu **Technical ranges & levels** (`TechnicalLevelsPanel.tsx`, lazy) — kisaran 68%/90% + kalibrasi, ATR, level S/R + sumber & kekuatan, terdekat + reward/risk, target pola + hit rate, opsi Fibonacci, "tampilkan level di grafik" (garis harga di grafik alternatif; widget TradingView tidak bisa), **kalkulator posisi** (`PositionCalculator.tsx`). Harga koin hasil konversi menampilkan "≈ … USDT · dikonversi".
- **Radar**: kartu **Sentiment leaders** (IDX/AS × Pendek/Menengah/Panjang, terkuat & terlemah, progres pemindaian).
- **`#/crypto`** (`CryptoBinanceView.tsx`, lazy, menu "Crypto Binance"): tabel 100 pasangan (harga USDT, %1h/4h/24h/7d, volume, funding, skor 3 horizon), cari (termasuk simbol non-Latin), filter "hanya koin di AssetRadar", status Binance (wilayah diblokir / 429 / 418 / tidak terjangkau) + pemakaian weight; halaman pasangan `#/crypto/<PAIR>`: candle 1h/4h/1D (candle berjalan ditandai), kisaran & level dari candle tertutup, kalkulator, posisi futures (funding, OI 24 jam, long/short, taker, basis; "hanya 30 hari"), tautan dua arah ke aset Rupiah.
- **Terminal**: `<KODE> SENT` / `SENT <KODE>`, `<KODE> LVL` / `LVL <KODE>`, `RANK`, `RANK IDX|US SHORT|MEDIUM|LONG`, `BINANCE`, `BNB` (memilih koin BNB + panel Binance), `BNB <PAIR>` (buka halaman pasangan); panel SENT, LVL, RANK, BINANCE di grid + tombol QuickBar; HELP & saran diperbarui.
- **Settings**: kartu target volatilitas (default 10%/tahun, `assetradar_vol_target_v1`).
- Endpoint tambahan sesuai nama di rencana: `/api/crypto/binance/overview` (alias), `/api/crypto/binance/pair?symbol=&tf=`, `/api/sentiment/rankings?market=idx|idStock|us|usStock|crypto&sector=` (+ desil per baris).
- Cek tampilan headless (Chromium, satu tab per halaman): 8 halaman (Radar, detail BBCA/ZEC/BTC, `#/crypto`, `#/crypto/BTCUSDT`, Terminal, Settings) × EN/ID × terang/gelap × 375/1440 → **tanpa scroll horizontal**.

## Fase 7 — Makro Indonesia diperluas

- **Server** (`computeIndonesiaMacro` di `server.ts`, cache 6 jam): indikator dikelompokkan dalam 8 kategori (Moneter & suku bunga, Inflasi & harga, Pertumbuhan & aktivitas, Eksternal, Fiskal, Keuangan, Komoditas, Global). Tambahan: selisih BI-Rate − Fed funds (`DFEDTARU`), keyakinan konsumen OECD, ekspor & impor terpisah, transaksi berjalan % PDB, REER, Rupiah vs THB/PHP/INR/MYR/CNY/SGD, EIDO (proksi arus asing), utang pemerintah % PDB, kredit swasta & harga properti (BIS), LQ45, batu bara API2 (proksi), tembaga, aluminium, Brent, emas, Fed funds, UST 10Y, DXY, VIX, SSE, Hang Seng. Inflasi inti / administered / volatile food lewat **BPS API** bila `BPS_API_KEY` diisi (opsional, gratis; kunci tidak pernah dicatat ke log atau dikirim ke browser) — tanpa kunci kartunya menampilkan "Requires free BPS API key (see README)".
- Setiap indikator: nilai terakhir, perubahan, tanggal data, frekuensi, sumber + tautan, grafik 10 tahun, **z-score vs 10 tahun** dengan arah per indikator (mis. inflasi tinggi = lebih buruk), label **"Stale — last data …"** bila datanya sudah lewat batas frekuensinya (tidak ikut dinilai). Logika di `src/utils/macro.ts` (`zScore10y`, `isStale`, `toIndicator`, `macroPulse`, `spreadSeries`, `parseBpsDynData`, `findBpsVar`) + test.
- **Indonesia Macro Pulse**: satu lampu per kategori (rata-rata z-score yang sudah disesuaikan arah dari indikator yang masih segar: > +0,5 hijau, < −0,5 merah, selain itu kuning; tanpa data segar = abu-abu) + penjelasan edukatif "biasanya berarti apa untuk IHSG / Rupiah / bank" — menggambarkan kondisi, bukan ramalan. Klik lampu = buka tab kategorinya.
- **Valuasi & breadth IDX** dari saham yang sudah dipindai (median P/E, median P/B, earnings yield − BI-Rate; imbal hasil SBN tidak tersedia, jadi pembandingnya BI-Rate) dan jumlah naik/turun/tetap hari ini. **Kalender**: tanggal FOMC berikutnya.
- **Halaman `#/macro`**: Macro Pulse → blok BI-Rate (tetap) → valuasi & kalender → tab kategori → kartu indikator → daftar "tidak tersedia dari sumber gratis" (diterjemahkan).
- Komponen Makro di sentimen tetap memakai jalur BI-Rate & inflasi (yang sudah diuji `compareIdMacro`); indikator baru hanya ditampilkan, belum dinilai di sentimen sampai lolos validasi.
- **Tidak tersedia / belum**: imbal hasil SBN 10 tahun, PMI (berlisensi), IndONIA/JIBOR/JISDOR (halaman bi.go.id belum bisa dibaca andal dari server), harga pangan harian Badan Pangan (endpoint data resmi belum terkonfirmasi), Pink Sheet Bank Dunia (CPO, nikel, timah, karet — file xlsx; butuh paket pembaca spreadsheet, lihat "Butuh keputusan pemilik") sehingga indeks terms-of-trade juga belum, utang luar negeri / defisit APBN / M2 (hanya PDF/xls atau seri berhenti), penjualan mobil/motor/semen (tanpa API), jadwal RDG BI & rilis BPS (dokumen, bukan data).
- Semua sumber terblokir dari cloud ini → **belum diverifikasi live**. Cek tampilan headless `#/macro` dengan data contoh (fixture, hanya untuk uji) dan dengan keadaan semua sumber gagal: EN/ID × terang/gelap × 375/1440 → **tanpa scroll horizontal**.

## Fase 8 — Penutup

- `CLAUDE.md` (arsitektur tahap 4, endpoint, aturan dua bahasa, `BPS_API_KEY`, status 4d) dan `README.md` (fitur baru, cara kerja sentimen, catatan & koreksi jurnal, sumber & keterbatasan, kunci opsional, daftar file) diperbarui.
- `npm run lint && npm test && npm run build` lulus (169 test), `node scripts/check-i18n.mjs` = 0.
- Uji server produksi (`NODE_ENV=production`): `/`, `manifest.webmanifest`, `sw.js` = 200; stream SSE dilewati service worker; simbol salah → 400/404 dengan pesan; sumber gagal → status jujur (`unreachable`, `waiting-for-data`), bukan angka contoh.
- Cek tampilan headless akhir: 16 halaman (Radar, detail BBCA/BTC/ZEC, `#/crypto`, `#/crypto/BTCUSDT`, Makro, Terminal, Settings, AI Advisor, Quant Lab, Profil Risiko, Portofolio, Saham BEI, Kalender, Watchlist) × EN/ID × terang/gelap × 375/1440 = **128/128 tanpa scroll horizontal**. Uji offline (internet browser dimatikan setelah halaman terbuka): Radar, Makro, Crypto, detail BBCA, Terminal tetap tampil, label "Offline – data terakhir", tanpa error JavaScript.

## Butuh keputusan pemilik

- **Peer group saham AS**: untuk desil/percentile yang bermakna perlu daftar konstituen S&P 500 (mis. file holdings ETF IVV/SPY yang diunduh di laptop lalu disimpan statis seperti `idxStocks.json`). Sampai ada, peringkat AS memakai 29 saham inti + label "small peer group".
- **Pink Sheet Bank Dunia (CPO, nikel, timah, karet)**: datanya hanya berupa file xlsx bulanan. Membacanya butuh paket tambahan (mis. `read-excel-file` yang kecil, atau `xlsx`/SheetJS yang lebih besar). Belum dipasang karena tidak bisa diuji dari cloud (situsnya terblokir) — pilihan pemilik: pasang paket kecil itu, atau lewati.
- **Binance dari server produksi**: Cloud Run AI Studio kemungkinan di AS; bila Binance membalas 451, halaman crypto Binance akan menampilkan pesan wilayah. Pilihan (keputusan pemilik): biarkan, atau jalankan server di region lain.

## Laporan akhir

**Singkatnya:** semua fase 0–8 sudah dikerjakan di branch `claude/tahap4-sentiment` dan ada di pull request https://github.com/Wafflesgh/AssetRadar/pull/2. Kodenya lengkap dan lulus semua pengecekan. **Tetapi** jaringan cloud ini memblokir semua sumber data (Yahoo, Binance, BPS, FRED, bi.go.id, dll.), jadi belum ada satu pun angka asli yang bisa saya lihat. Semua fitur perlu dicoba sekali di laptop/HP Anda.

### Yang selesai dan cara mencobanya

1. **Dua bahasa (English / Bahasa Indonesia)** — tombol **EN | ID** di kanan atas (di HP: menu "More"), juga di Settings. Di Settings ada pilihan format angka "ikuti bahasa" atau "selalu en-US". Judul berita tetap dalam bahasa aslinya.
2. **Sentimen investasi 3 jangka waktu** — buka halaman aset mana pun (mis. BBCA): kartu **Investment sentiment** dengan tab Short / Medium / Long, skor 0–100, label (Strong Bearish … Strong Bullish), seberapa yakin, kapan sebaiknya ditinjau lagi, dan rincian komponen beserta jurnalnya. Di Radar ada kartu **Sentiment leaders** (saham BEI/AS terkuat & terlemah). Terminal: `BBCA SENT`, `RANK IDX SHORT`.
3. **Kisaran harga & level teknikal + kalkulator posisi** — di halaman aset, di bawah sentimen: kisaran 68%/90% per jangka waktu, support/resistance, target pola, tombol "tampilkan level di grafik", dan kalkulator ukuran posisi (Anda mengisi sendiri modal, risiko, entry, stop). Target volatilitas diatur di Settings. Terminal: `BTC LVL`.
4. **Crypto Binance** — menu **Crypto Binance** (`#/crypto`): 100 pasangan USDT terbesar, klik salah satu untuk halaman pasangan (grafik, kisaran, level, data futures). Terminal: `BINANCE`, `BNB SOLUSDT`. 30 koin baru (dari 50 crypto terbesar) juga muncul di Radar, harganya dalam Rupiah hasil konversi USDT.
5. **Makro Indonesia diperluas** — menu **Makro RI** (`#/macro`): "Denyut Makro Indonesia" (lampu hijau/kuning/merah per kategori + artinya untuk IHSG/Rupiah/bank), tab kategori, kartu indikator dengan perbandingan terhadap 10 tahun terakhir, valuasi BEI, dan tanggal rapat Fed berikutnya.

### Contoh nyata & hasil validasi

- **Belum bisa diberikan.** Skor Short/Medium/Long dan kisaran 1 minggu untuk BBCA, BTCUSDT, dan IHSG butuh data asli, yang terblokir dari cloud. Setelah aplikasi jalan di tempat Anda, angka-angka itu langsung muncul di halaman masing-masing.
- **Validasi** (apakah skor terbukti di data historis) berjalan otomatis di server setelah data pasar terkumpul (±beberapa jam pemindaian pertama), lalu hasilnya terlihat di kartu sentimen ("historical evidence") dan di `/api/sentiment/validation?market=idx|us|crypto`. Sampai saat itu semua skor berlabel keyakinan **Low – not validated yet** — ini disengaja, bukan error.

### Sumber data

- **Dipakai** (semua gratis, tanpa kunci kecuali BPS): Yahoo Finance (harga, laporan, estimasi analis), SEC EDGAR, Binance data publik (spot, WebSocket, futures), CoinGecko (cadangan), Indodax, FRED, World Bank, Bank Indonesia, BPS (opsional), Google News.
- **Terverifikasi live dari cloud:** tidak ada — semuanya terblokir (lihat tabel Fase 0). Logikanya diuji dengan data contoh kecil yang hanya dipakai di test, **tidak pernah** ditampilkan di aplikasi.

### Yang tidak bisa dipenuhi dan alasannya

- Contoh angka nyata & hasil validasi nyata — sumber terblokir dari cloud.
- Imbal hasil SBN 10 tahun, PMI, IndONIA/JIBOR/JISDOR, harga pangan harian, utang luar negeri, defisit APBN, M2, penjualan mobil/motor/semen, jadwal RDG BI & rilis BPS — tidak ada sumber data gratis yang bisa dibaca mesin (atau berlisensi). Halaman Makro menulis alasannya.
- CPO, nikel, timah, karet (Pink Sheet Bank Dunia) dan indeks terms-of-trade — butuh paket pembaca Excel (lihat keputusan di bawah).
- Berita & teknikal harian tidak punya riwayat tersimpan, jadi tidak ikut uji historis; validasi fundamental BEI pendek (Yahoo hanya ±4 tahun laporan tahunan).
- Peringkat saham AS hanya dari 29 saham inti (belum ada daftar S&P 500).

### Kunci yang bisa diisi (semua opsional)

| Nama | Untuk apa | Cara mendapatkan | Diisi di mana |
|---|---|---|---|
| `BPS_API_KEY` | Inflasi inti, administered, volatile food di halaman Makro | Daftar gratis di https://webapi.bps.go.id/developer/ | `.env` di laptop, atau panel Secrets di AI Studio |
| `GEMINI_API_KEY` | Ringkasan AI & tombol Translate berita | (sudah ada sebelumnya) | sama |
| `FINNHUB_API_KEY` | Harga real-time saham AS | (sudah ada sebelumnya) | sama |

Binance **tidak** butuh kunci dan jangan pernah memasukkan kunci Binance.

### Yang perlu Anda cek di HP/PC

- Tampilan di HP (lebar ±375px) dan PC, mode terang & gelap, bahasa EN & ID — terutama halaman aset (kartu sentimen & level), `#/crypto`, dan `#/macro`.
- Halaman Crypto Binance: kalau muncul pesan "wilayah diblokir (451)", berarti server Anda di wilayah yang ditolak Binance (lihat keputusan di bawah).
- Setelah beberapa jam berjalan: apakah "Sentiment leaders" terisi dan keyakinan berubah dari "not validated yet".

### Catatan konflik dengan PR tahap 3

Pull request tahap 3 (https://github.com/Wafflesgh/AssetRadar/pull/1) **belum di-merge**. Branch tahap 4 dibuat dari `main` terbaru dan mengubah hampir semua komponen (dua bahasa), jadi PR yang di-merge **kedua** kemungkinan besar akan konflik. Saran: merge salah satu dulu, lalu minta Claude menggabungkan `main` ke branch PR yang lain dan membereskan konfliknya (teks baru dari tahap 3 juga perlu diterjemahkan).

### Langkah berikutnya

1. Buka https://github.com/Wafflesgh/AssetRadar/pull/2, review, lalu klik **"Merge pull request"** (dengan memperhatikan catatan konflik di atas).
2. Perbarui aplikasi online dengan cara Anda biasanya (yang mengambil versi terbaru dari `main`). **Jangan** klik Push/Sync dari AI Studio.
3. Opsional: isi `BPS_API_KEY`, lalu putuskan hal-hal di "Butuh keputusan pemilik".


## Penggabungan & verifikasi live (laptop, 20 Okt 2026)

- Tahap 4 (`claude/tahap4-sentiment`) di-fast-forward ke `main`, lalu tahap 3 (`claude/ecstatic-fermat-nyv2f9`) digabung di atasnya; 15 file bentrok dibereskan (rute, menu, perintah Terminal BRIEF/CMP, Settings, portofolio, catatan uji nyata server, dokumen, `.env.example`).
- Semua halaman & teks tahap 3 diterjemahkan ke dua bahasa (Alerts, Screener, Compare, Ringkasan Pagi, Backtest, emas Antam, Sync, analitik portofolio), termasuk pesan validasi dan isi notifikasi (push dari server memakai bahasa perangkat yang terakhir mendaftar push). Ringkasan pagi kini dibuat server dalam EN + ID sekaligus, dengan angka mengikuti format masing-masing bahasa.
- Backup sebelum merge: tag GitHub `backup-20261020-main`, `backup-20261020-tahap3`, `backup-20261020-tahap4`, plus file bundle/zip di `D:\Asset Radar\backups`.
- Verifikasi live (sumber yang terblokir dari cloud bisa diakses dari laptop): 20 halaman tanpa crash dan tanpa scroll horizontal di 1440px (EN) dan 375px (ID); mode terang dicek di halaman tahap 3/4. Sentimen 3 horizon BBCA (Short 46 / Medium 58 / Long 63, keyakinan rendah karena belum tervalidasi), halaman Binance 100 pair dengan stream live, Compare BBCA vs BBRI, Screener memindai laporan (411/962 saat dicek), Ringkasan Pagi 20 Okt dibuat otomatis, Finnhub tersambung. lint, 237 test, dan build lulus.

## Infrastruktur fitur online (laptop, 20 Okt 2026)

- **Diagnostik server**: Settings → "Server diagnostics" / `GET /api/diagnostics` — 18 sumber dicek dari server (OK / diblokir di wilayah ini / dibatasi / butuh kunci / tidak terjangkau), region Cloud Run, dan fitur opsional yang aktif (hanya nama secret). Dari laptop: 17/18 OK (bi.go.id sedang timeout saat dicek).
- **Kunci buatan sendiri**: `scripts/generate-secrets.mjs` mengisi `CRON_TOKEN`, `SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET`, dan pasangan kunci VAPID di `.env` lokal (tidak di-commit, nilai tidak dicetak). Panduan klik untuk Supabase, Secrets AI Studio, notifikasi HP, dan Telegram: `docs/SETUP_Online.md`; tabel database: `supabase/schema.sql`.
- **Jadwal harian**: `.github/workflows/daily-jobs.yml` (GitHub Actions gratis) memanggil `POST /api/cron/daily` 07:35 WIB tiap hari & 16:20 WIB hari kerja. Diuji lokal: token benar → 200, token salah → 401.
- **Pembanding saham AS**: 502 konstituen S&P 500 (11 sektor GICS) dari Wikipedia API → kelompok pembanding 503 saham (29 aset aplikasi + 474 pembanding) untuk percentile/desil sentimen; dipindai pelan di latar belakang.
- **Komoditas Bank Dunia**: Pink Sheet dibaca tanpa paket tambahan → CPO, batu bara Newcastle, nikel, timah, karet TSR20, kakao, kopi robusta, beras Thailand (bulanan, data s.d. Sep 2026) di ID Macro → Komoditas.
- **Harga emas Antam/Pegadaian**: logammulia.com menolak akses skrip (HTTP 403, bahkan robots.txt), pegadaian.co.id di balik Cloudflare → tetap input manual.
- **Masih butuh pemilik**: membuat proyek Supabase, mengisi Secrets di AI Studio dan 2 repo secret di GitHub, bot Telegram (opsional).
