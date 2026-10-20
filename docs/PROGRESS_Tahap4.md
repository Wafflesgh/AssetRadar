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
- [ ] 3. Pilar & horizon sentimen
- [ ] 4. Proyeksi teknikal & kalkulator posisi
- [ ] 5. Validasi & cadence
- [ ] 6. Tampilan
- [ ] 7. Makro Indonesia diperluas
- [ ] 8. Penutup

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

## Butuh keputusan pemilik

- **Peer group saham AS**: untuk desil/percentile yang bermakna perlu daftar konstituen S&P 500 (mis. file holdings ETF IVV/SPY yang diunduh di laptop lalu disimpan statis seperti `idxStocks.json`). Sampai ada, peringkat AS memakai 29 saham inti + label "small peer group".
- **Binance dari server produksi**: Cloud Run AI Studio kemungkinan di AS; bila Binance membalas 451, halaman crypto Binance akan menampilkan pesan wilayah. Pilihan (keputusan pemilik): biarkan, atau jalankan server di region lain.

## Laporan akhir

(diisi di akhir)
