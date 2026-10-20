# Prompt — AssetRadar tahap 4: Sentimen multi-horizon, proyeksi teknikal, Binance, dua bahasa, makro Indonesia diperluas

> Cara pakai:
> - **Di Claude Cloud**: pakai `docs/PROMPT_Cloud_Tahap4.md` (aturan branch + pull request, tanpa kunci, uji tanpa browser).
> - **Di laptop** (Claude Code desktop, folder `D:\Asset Radar\assetradar`): kirim **"Jalankan semua instruksi di docs/PROMPT_Fitur_Lanjutan_4.md dari awal sampai akhir."**

---

Lanjutkan pengembangan AssetRadar. Baca dulu `CLAUDE.md`, `README.md`, `docs/PROGRESS_Tahap2.md` (dan `docs/PROGRESS_Tahap3.md` bila ada). Dokumen ini berisi **rencana data dan infrastruktur** untuk 4 pekerjaan besar:

- **A.** Sentimen investasi multi-horizon (pendek / menengah / panjang) dengan 3 pilar skor berbasis jurnal, berita ikut dihitung, frekuensi pemantauan (harian / mingguan / bulanan), dan bukti historis.
- **B.** Proyeksi teknikal: kisaran naik/turun yang terukur, level support/resistance, target pola, dan kalkulator ukuran posisi — untuk saham **dan** trading aktif crypto di **Binance**.
- **C.** Pilihan bahasa **English / Bahasa Indonesia** untuk seluruh aplikasi.
- **D.** Perluasan **ID Macro**.

Kerjakan berurutan per **fase** (bagian 8). Untuk setiap fase: rencana singkat, kerjakan, test, `npm run lint && npm test && npm run build` lulus, uji server/tampilan, commit + push, catat di `docs/PROGRESS_Tahap4.md` (buat bila belum ada; format seperti `PROGRESS_Tahap2.md`). Kalau sesi terputus, lanjutkan dari fase pertama yang belum dicentang.

## 0. Aturan yang wajib diikuti

- Kode, komentar, nama file, nilai internal: **Bahasa Inggris**. Teks UI: lewat sistem terjemahan (bagian C) — Inggris sebagai bahasa sumber, Indonesia sebagai terjemahan. Setiap file baru diawali komentar keterangan singkat berbahasa Inggris. Judul berita tetap bahasa asli (boleh ada tombol terjemahkan, lihat C). Balas pemilik dalam Bahasa Indonesia sederhana.
- **Jangan pernah menampilkan angka contoh/dummy.** Sumber gagal → "Data unavailable" + "Try again"; satu angka tidak ada → "Not reported"; faktor tidak berlaku (mis. fundamental untuk crypto) → "Not applicable" dengan alasannya.
- **Tanpa look-ahead**: setiap faktor hanya memakai data yang sudah terbit pada tanggal itu (jeda publikasi di bagian 4). Ini wajib untuk skor hari ini **dan** untuk uji historis.
- Sentimen = ringkasan bukti, **bukan sinyal beli/jual**. Label skor: `Strong Bearish | Bearish | Neutral | Bullish | Strong Bullish` (bukan "Buy/Sell"). Angka imbal hasil dari jurnal hanya boleh ditulis sebagai "in the paper's sample (US, 19xx–19xx)", tidak pernah sebagai perkiraan untuk aset ini. Proyeksi harga = **kisaran statistik**, bukan ramalan; selalu tampilkan seberapa sering kisaran itu benar di masa lalu (kalibrasi). Disclaimer "Information and education only, not investment advice" wajib di setiap tampilan sentimen, proyeksi dan kalkulator posisi.
- Pengecualian AI Advisor di `CLAUDE.md` tetap berlaku seperti sekarang, tidak diperluas ke sentimen.
- localStorage hanya lewat `src/utils/storage.ts`. HP 375px tanpa scroll horizontal; PC 1440px; terang & gelap terbaca; hormati `prefers-reduced-motion`. **Pertahankan gaya tampilan sekarang** (pemilik sudah puas) — tambah informasi, jangan mendesain ulang.
- Kunci baru opsional (mis. `BPS_API_KEY`) hanya lewat `.env` / Secrets, dicatat di `.env.example` tanpa nilai; semua fitur tetap jalan tanpa kunci. Jangan pernah mencetak, menyalin, atau mengirim nilai kunci ke browser.
- Logika murni di `src/sentiment/`, `src/ai/` atau `src/utils/` dengan test (`node --test`, strip-only: tanpa parameter properties, `import type` untuk tipe). Komponen besar di-lazy-load.
- Server berjalan di Cloud Run tanpa disk permanen dan bisa tidur: data hasil olahan disimpan di memori dengan pemindaian bertahap; tampilkan progres pemindaian dan tanggal data, jangan pernah memblokir halaman menunggu pemindaian penuh.
- Git: `git fetch` + cek `origin/main` sebelum push; jangan force-push; perbaikan lewat `git revert`; pesan commit diakhiri baris Co-Authored-By yang berlaku.

## 1. Catatan jurnal (sudah dicek pada PDF milik pemilik, 20 Okt 2026)

Pemilik menyimpan jurnalnya di laptop (bukan di repo). Isi yang dibutuhkan sudah dirangkum di sini — **pakai rangkuman ini, termasuk koreksinya**:

1. **Bettman, Sault & Welch — "Fundamental and Technical Analysis: Substitutes or Complements?"** (versi terbit: Bettman, Sault & Schultz 2009, *Journal of Banking & Finance*). Model harga hibrida (Model 5):
   `P(t+1) = a + b1·BVPS(t) + b2·EPS(t) + b3·FEPS(t+1) + b4·P(t−5) + b5·D_Up + b6·D_Down`.
   Koefisien di jurnal (US, 33.952 firm-year, dalam USD per saham): a 1,6260; BVPS 0,0509; EPS 0,1594; FEPS 1,4341; P(t−5) 0,7978; D_Up 1,4168; D_Down −0,4712. Adjusted R²: fundamental saja (Model 2) 35,26%, teknikal saja (Model 3) 75,46%, hibrida (Model 5) 76,86%.
   **Koreksi penting:**
   - R² tinggi itu sebagian besar karena harga 5 bulan lalu (`P(t−5)`) menjelaskan level harga hari ini — **bukan** kemampuan memprediksi return. Jangan menampilkan "R² 76%" sebagai akurasi prediksi.
   - Koefisien dalam USD per saham **tidak boleh dipakai langsung** untuk saham Rupiah atau crypto. Estimasi ulang model secara cross-section per pasar setiap bulan (bagian 2.2, pilar 3).
   - `D_Up`/`D_Down` di jurnal dihitung dari return **6 bulan yang dimulai tepat 1 tahun sebelum** harga yang dimodelkan (bulan t−12 s.d. t−6, mengikuti Jegadeesh & Titman), lalu dibagi ke 10 desil: desil teratas → `D_Up = 1`, terbawah → `D_Down = 1`. Bukan "6 bulan terakhir". Implementasikan sesuai jurnal; varian "6 bulan terakhir" boleh diuji sebagai alternatif dan hanya dipakai bila lebih baik di uji validasi (bagian 4).
   - `FEPS` = konsensus perkiraan EPS analis tahun fiskal berikutnya. Sumber: Yahoo `quoteSummary` modul `earningsTrend` (sudah dicek: BBCA.JK 21–23 analis, TLKM.JK 19–20, AAPL 39–40). Saham tanpa liputan analis → pakai Model 4 (tanpa FEPS) dan beri tanda.
2. **Asness, Moskowitz & Pedersen — "Value and Momentum Everywhere"** (slide). Momentum = return bulan **t−12 s.d. t−2** (bulan terakhir dilewati). Bobot sinyal `w = c·(rank(signal) − average(rank))`. Volatilitas ex-ante konstan **10% per tahun**, matriks kovarians dari jendela **3 tahun** bergulir. Sudah dipakai di Quant Lab (`src/ai/factorPortfolio.ts`: `rankWeights`).
3. **Piotroski (2000) — "Value Investing: The Use of Historical Financial Statement Information…"** F-score 9 sinyal biner (ROA>0, CFO>0, ΔROA>0, ACCRUAL: CFO>ROA, ΔLEVER<0, ΔLIQUID>0, EQ_OFFER=0, ΔMARGIN>0, ΔTURN>0) — sudah ada di `src/ai/fundamentals.ts`. Catatan: diuji **di dalam saham high book-to-market** (≈57% saham value murah ternyata memberi return negatif); skor rendah ±5× lebih mungkin delisting; ±1/6 selisih return tahunan terjadi di sekitar 4 pengumuman laba kuartalan (jendela 3 hari). Manfaat terbesar di saham kecil-menengah, turnover rendah, tanpa liputan analis.
4. **Novy-Marx (2010, NBER w15940) — "The Other Side of Value: Good Growth and the Gross Profitability Premium".** `GPA = (Revenue − COGS) / Total Assets`; **di-demean per industri** memperkuat daya prediksi. Return 1 bulan terakhir (`r(1,0)`) berkoefisien negatif kuat (≈ −6,1) → reversal jangka pendek. **SUE** = (laba kuartal ini − laba kuartal yang sama tahun lalu) ÷ standar deviasi perubahan itu selama **8 kuartal** terakhir.
5. **Abarbanell & Bushee (1997) — "Abnormal Returns to a Fundamental Analysis Strategy".** Sinyal (diranking per tahun ke desil): INV (Δpersediaan − Δpenjualan; naik = negatif), AR (Δpiutang − Δpenjualan), CAPX (Δcapex perusahaan vs industri), GM (Δpenjualan − Δgross margin), S&A (ΔSG&A − Δpenjualan; naik = negatif), ETR (perubahan tarif pajak efektif), LF (Δpenjualan per karyawan), EQ (LIFO), AQ (opini audit). Strategi hedge: rata-rata **13,2%** abnormal return 12 bulan; lebih kuat untuk kondisi tertentu (mis. perusahaan dengan berita laba buruk sebelumnya). EQ, AQ, LF umumnya tidak tersedia gratis → "Not reported".
6. `ssrn-2209042.pdf` milik pemilik ternyata tentang menu reksa dana di program pensiun 401(k) AS — **tidak dipakai**.

## 2. A — Mesin sentimen multi-horizon

### 2.1 Horizon dan keluaran

| Horizon | Saham | Crypto (Binance) | Indeks / kurs / komoditas | Frekuensi pantau yang disarankan (default) |
|---|---|---|---|---|
| **Short** | 1–10 hari bursa | 4 jam – 7 hari | 1–10 hari | **Daily** (crypto: setiap 4 jam/harian) |
| **Medium** | 1–6 bulan | 2–8 minggu | 1–6 bulan | **Weekly** |
| **Long** | 1–5 tahun | 6–24 bulan (hanya tren/momentum) | 1–3 tahun | **Monthly** + setiap laporan keuangan baru |

Untuk setiap aset dan setiap horizon, keluarkan:
- **Skor 0–100** dan label (0–20 Strong Bearish, 20–40 Bearish, 40–60 Neutral, 60–80 Bullish, 80–100 Strong Bullish).
- **Confidence** (Low/Medium/High) dari: cakupan data (berapa % faktor tersedia), kesepakatan antar-faktor, dan hasil validasi historis (bagian 4).
- **Driver**: daftar faktor dengan nilai mentah, peringkat/percentile, bobot, kontribusi (+/− poin), tanggal data, sumber, dan referensi jurnal. Urut dari kontribusi terbesar.
- **Review cadence** (Daily / Weekly / Monthly) + "Next catalyst" (mis. laporan keuangan 9 hari lagi, ex-date, rapat BI, FOMC).
- **Data freshness**: kapan tiap kelompok data terakhir diperbarui.

### 2.2 Tiga pilar skor (dari gambar pemilik, skala 0–100)

Semua sub-faktor diubah menjadi **percentile cross-section** di dalam pasarnya (lihat 2.4), arahnya disesuaikan (lebih tinggi = lebih bullish), lalu dijumlah berbobot. Sub-faktor yang tidak tersedia dikeluarkan dan bobotnya dibagi ulang secara proporsional; tampilkan bahwa bobot dibagi ulang.

**Pilar 1 — Fast-Track Trading & Momentum Score** (Swing / momentum trader, harian–6 bulan)
- 40% Momentum 12-2: peringkat return t−12 s.d. t−2 (AMP).
- 30% Extreme decile `D_Up`/`D_Down` (Bettman; jendela t−12…t−6, lihat koreksi 1.1): desil teratas = 100, terbawah = 0, lainnya 50.
- 30% Kejutan laba: SUE (Novy-Marx, 8 kuartal) bila riwayat kuartal cukup (saham AS lewat SEC); jika tidak, persen kejutan EPS terhadap estimasi analis dari Yahoo `earningsHistory` (4 kuartal terakhir; sudah dicek tersedia untuk BBCA/TLKM/AAPL), ditandai "analyst surprise (proxy for SUE)".
- Penanda **jendela pengumuman laba** (H−1 s.d. H+1 dari kalender emiten): tampilkan sebagai katalis, bukan menambah skor.

**Pilar 2 — Financial Health & Turnaround Score** (Value investor & contrarian, 6–24 bulan)
- 60% Piotroski F-score (0–9 → 0–100; yang sudah ada di `fundamentals.ts`, pakai skor yang **sudah terbit** sesuai jeda).
- 40% Operational audit Abarbanell & Bushee: INV, AR, CAPX (vs median industri), GM, S&A, ETR — masing-masing dijadikan desil per pasar per tahun, rata-rata. Tandai konteks "prior bad earnings news" (laba tahunan turun) karena di jurnal strategi lebih kuat di kelompok ini.
- Peringatan terpisah (bukan skor): F-score 0–1 → "Financial distress warning (paper: ~5× more likely to delist)".

**Pilar 3 — Core Quality & Valuation Score** (Long-term investor & blue-chip accumulator, 1–10 tahun)
- 50% GPA industry-adjusted (Novy-Marx): GPA dikurangi median GPA industrinya.
- 30% Book-to-market industry-adjusted (AMP & Novy-Marx).
- 20% Diskon terhadap **nilai wajar hibrida** (Bettman, diestimasi ulang): setiap bulan, per pasar, regresi cross-section (OLS robust, buang 1% ekstrem) `P = a + b1·BVPS + b2·EPS + b3·FEPS + b4·P(t−5) + b5·D_Up + b6·D_Down` pada saham yang datanya lengkap (Model 4 tanpa FEPS bila liputan analis < 50%). Nilai wajar = harga hasil model; diskon = (nilai wajar − harga) ÷ harga. Tampilkan koefisien terbaru, jumlah saham, R², dan peringatan bahwa R² tinggi karena `P(t−5)`. Untuk mengurangi efek skala harga, uji juga versi per-saham dibagi `P(t−5)`; pilih yang lebih stabil di validasi.
- Bank dan asuransi: gross profit tidak bermakna → pakai ROA/ROE industry-adjusted sebagai pengganti GPA, dan tandai.

### 2.3 Dari pilar ke horizon (bobot default, bisa diubah hanya lewat validasi di bagian 4)

| Komponen | Short | Medium | Long |
|---|---|---|---|
| Teknikal jangka pendek (scorecard `technical.ts`, RSI, MACD, jarak ke MA20/50, breakout 20 hari, volume relatif, **reversal 1 bulan** Novy-Marx sebagai faktor negatif) | 45% | 15% | — |
| Pilar 1 Momentum | 20% | 35% | 10% |
| Berita (bagian 2.5) | 25% | 15% | 5% |
| Pilar 2 Financial health | — | 20% | 25% |
| Pilar 3 Quality & valuation | — | 10% | 45% |
| Makro (hanya aset yang terkait: IHSG, saham IDX, kurs X/IDR; dari Fitur makro tahap 2 + D) | 5% | 5% | 15% |
| Derivatif crypto (funding, open interest, long/short; hanya crypto Binance) | 5% | — | — |

Aset tanpa fundamental (crypto, indeks, kurs, komoditas): bobot pilar 2–3 dibagi ulang ke momentum time-series (12-2 dan 200 hari), tren, dan makro; tampilkan "Not applicable — no financial statements".

### 2.4 Cross-section (peringkat dan desil)

- **Saham IDX**: ±960 emiten dari `src/config/idxStocks.json`; industri = IDX-IC (sektor/industri yang sudah ada). Desil/percentile hanya dari saham dengan data cukup; buang saham dengan nilai transaksi sangat kecil dari *pembentukan* desil (tetap diberi skor relatif terhadap desil itu) dan tulis ambangnya.
- **Saham AS**: 29 saham inti terlalu sedikit untuk desil. Tambahkan universe pembanding hanya untuk peringkat: daftar konstituen S&P 500 (cari sumber gratis resmi/terpercaya, simpan statis di repo dengan tanggal, seperti `idxStocks.json`); industri dari kode SIC SEC (`data.sec.gov/submissions`) atau sektor Yahoo `assetProfile`. Bila tidak memungkinkan: percentile terhadap 29 saham dengan peringatan "small peer group".
- **Crypto**: 100 pasangan USDT teratas Binance menurut volume 24 jam (buang stablecoin, token leverage UP/DOWN/BULL/BEAR); momentum dalam USDT.
- **Saham global, indeks, kurs, komoditas**: momentum **time-series** (return sendiri, bukan cross-section) karena kelompoknya kecil; tulis metodenya.
- Rumus percentile: `rank / (n − 1)`; skor AMP `rank − average(rank)` diskalakan ke 0–100.

### 2.5 Berita per horizon

- Pakai `src/ai/newsDrivers.ts` (kategori, arah per aset, bobot sumber) + hub berita yang ada.
- Bobot per kategori dan horizon, dengan peluruhan waktu (half-life): **Short** half-life 2 hari, semua kategori; **Medium** half-life 3 minggu, kecuali judul yang hanya melaporkan pergerakan harga; **Long** half-life 6 bulan, hanya kategori struktural (laba & panduan, regulasi, M&A, manajemen/tata kelola, hukum, kebijakan bank sentral/makro).
- Batas pengaruh berita: maksimal ±15 poin (Short), ±10 (Medium), ±5 (Long) kecuali validasi membuktikan bobot lebih besar lebih baik.
- Tampilkan judul yang berkontribusi, kontribusinya per horizon, umur berita, dan sumbernya. Berita baru → skor Short dihitung ulang segera (hapus cache seperti `analysisCache` sekarang).

### 2.6 Crypto untuk trading aktif di Binance

- Sumber (sudah dicek bisa diakses dari Indonesia, 20 Okt 2026): `https://data-api.binance.vision/api/v3/klines` (spot, 1h/4h/1d, tanpa kunci), `/api/v3/ticker/24hr`; futures `https://fapi.binance.com/fapi/v1/fundingRate`, `/futures/data/openInterestHist`, `/futures/data/globalLongShortAccountRatio`; Fear & Greed `https://api.alternative.me/fng/`.
- **Risiko**: server produksi (Cloud Run AI Studio) mungkin berada di wilayah AS, dan Binance memblokir IP AS (HTTP 451), terutama `fapi`. Deteksi otomatis: bila diblokir, sembunyikan data futures dengan keterangan "Binance futures data not available from this server's region", dan coba `data-api.binance.vision` untuk spot. Jangan memakai proxy pihak ketiga.
- Halaman baru `#/crypto` (Binance): tabel 100 pair (harga USDT, % 4h/24h/7d, volume, skor Short/Medium/Long, funding, perubahan OI 24 jam, long/short ratio), filter, klik → detail pair dengan timeframe 1h/4h/1D, level teknikal (bagian 3), dan kalkulator posisi.
- Pair yang sama dengan aset IDR di Indodax (BTC, ETH, …) ditautkan dua arah.
- Batas permintaan: hormati bobot rate limit Binance (header `X-MBX-USED-WEIGHT-1M`), cache klines 1 menit (1h/4h) dan 5 menit (1d), funding/OI 5 menit; hanya saat ada penonton.

## 3. B — Proyeksi teknikal (naik sampai berapa, turun sampai berapa)

Untuk setiap aset dan timeframe (saham: 1D/1W/1M/3M ke depan; crypto: 4h/1D/1W/1M):

1. **Kisaran statistik (utama)**: kuantil empiris return h-hari dari riwayat aset sendiri (minimal 2 tahun; crypto 1 tahun di 4h), diskalakan dengan volatilitas EWMA terbaru (λ 0,94) dibanding volatilitas historis. Tampilkan kisaran **68%** dan **90%**: "Likely range in 1 week: Rp4,550 – Rp5,120 (68%)". **Kalibrasi**: uji di masa lalu seberapa sering harga akhir benar-benar jatuh di dalam kisaran (target ≈68%/90%), tampilkan angkanya, dan beri peringatan bila meleset > 5 poin.
2. **ATR**: ATR(14) dan level ±1/±2/±3 ATR dari harga sekarang (untuk penempatan stop/target yang dihitung pengguna sendiri).
3. **Support & resistance**: pivot swing (`findPivots` di `technical.ts`), MA 20/50/200, high/low 52 minggu, pivot klasik harian & mingguan (P, R1–R3, S1–S3), dan high-volume nodes dari profil volume harian. Gabungkan level yang berdekatan (±0,5 ATR) dan beri "kekuatan" = berapa kali level itu diuji.
4. **Target pola**: measured move dari pola yang terdeteksi (`detectPatterns`), dengan hit rate historis pola itu di aset/pasar yang sama bila sampel ≥ 20; jika kurang, tulis "too few past cases".
5. **Upside/downside**: jarak ke resistance terdekat vs support terdekat, rasio reward/risk.
6. **Kalkulator ukuran posisi (edukasi)**: (a) **volatility targeting** AMP — bobot maksimal = target volatilitas tahunan (default 10%, bisa diubah) ÷ volatilitas aset (3 tahun bergulir; crypto EWMA); (b) **risiko per transaksi** — modal × risiko % ÷ (entry − stop) → jumlah unit (lot 100 untuk saham BEI). Input dari pengguna, tidak ada saran angka entry.
7. Tampilan: garis level dan pita kisaran di grafik alternatif (`FallbackChart`, lightweight-charts price lines / area), plus tabel level. Fibonacci boleh ditambahkan sebagai opsi dengan label "low evidence in research".

## 4. Validasi historis (bukti, seperti AI Advisor)

- Bangun ulang skor setiap hari/bulan di masa lalu **point-in-time**, lalu ukur untuk tiap pasar × horizon × pilar: **Information Coefficient** (Spearman antara skor dan return h ke depan), hit rate kuintil teratas vs base rate, spread kuintil atas − bawah, jumlah sampel, periode.
- Jeda publikasi: laporan tahunan IDX +4 bulan (batas OJK 3 bulan + cadangan), kuartalan IDX +2 bulan; SEC: tanggal `filed` di companyfacts; estimasi analis: hanya nilai yang ada pada tanggal itu (bila riwayat estimasi tidak tersedia, faktor FEPS **tidak** ikut divalidasi dan ditandai).
- Keterbatasan data harus jujur: saham IDX hanya ±4 tahun tahunan/±5 kuartal dari Yahoo → validasi fundamental IDX pendek; tulis "limited history (n years)". Momentum/teknikal bisa divalidasi 5+ tahun.
- Bobot di 2.3 adalah default dari jurnal. Bobot "tervalidasi" hanya dipakai bila lebih baik di periode validasi (60% awal) **dan** dilaporkan di holdout (40% akhir) — pola yang sama dengan `compareIdMacro`.
- **Review cadence otomatis**: hitung peluruhan IC (half-life skor) per horizon; cadence = Daily bila IC turun setengah dalam < 5 hari bursa, Weekly < 30 hari, selain itu Monthly. Tampilkan alasannya ("score changes meaningfully every ~4 days").
- Halaman/panel "Evidence" per pasar: tabel IC, hit rate vs base rate, grafik spread per tahun, dengan kalimat sederhana ("On IDX since 2021, the top 20% by Medium score beat the base rate in 58% of months").

## 5. C — Dua bahasa (English / Bahasa Indonesia)

- Modul `src/i18n/`: `en.ts` (sumber kunci, tipe `TranslationKey`), `id.ts`, `index.ts` (`t(key, params)`, hook `useT()`, `useLang()`), bahasa disimpan lewat `storage.ts` (`assetradar_lang_v1`). Tanpa library tambahan.
- Default: bahasa yang tersimpan; bila belum ada → `navigator.language` diawali `id` → Indonesia, selain itu Inggris. Pemilik memilih English sekali di Settings. Tombol cepat **EN | ID** di header (PC) dan di menu More (HP).
- Cakupan: semua teks UI, aria-label, pesan error, tooltip, disclaimer, penjelasan sentimen/proyeksi/AI, nama grup aset dan nama umum aset (mis. "Gold" ↔ "Emas"; ticker/kode tidak diterjemahkan), PWA (manifest tetap Inggris), Terminal (perintah tetap kode Inggris; deskripsi HELP diterjemahkan).
- Teks dari server: endpoint menerima `?lang=en|id`; penjelasan rule-based dibuat dari template berkunci; ringkasan Gemini diminta dalam bahasa terpilih dan di-cache per bahasa.
- Format angka: opsi di Settings "Number format: follow language / always en-US". Default follow language: Indonesia → `id-ID` (`Rp1.234.567`, `1,25%`), Inggris → `en-US`. Pusatkan di `format.ts` (setter locale modul) dan perbarui testnya.
- "Translator" berita: tombol kecil "Translate" per judul → bila `GEMINI_API_KEY` ada, server menerjemahkan (cache 24 jam, batasi panjang); tanpa kunci → buka Google Translate di tab baru (`https://translate.google.com/?sl=auto&tl=<lang>&text=…`). Judul asli tetap ditampilkan.
- Test: paritas kunci en/id (tidak ada kunci hilang/berlebih), placeholder `{param}` sama di kedua bahasa, `t()` fallback ke Inggris; skrip `scripts/check-i18n.mjs` yang mendaftar teks JSX yang belum memakai `t()`.
- Ubah aturan di `CLAUDE.md`: UI dua bahasa, Inggris sebagai sumber.

## 6. D — Perluasan ID Macro

Tambahkan ke `GET /api/macro/indonesia` (atau endpoint baru per kategori) dan halaman `#/macro`, dikelompokkan per tab. Status sumber per 20 Okt 2026: ✓ = sudah dicek terbaru, ⚠ = ada tapi basi, ? = perlu dicek, ✗ = tidak ada sumber gratis.

| Kategori | Indikator | Sumber | Status |
|---|---|---|---|
| Moneter & suku bunga | BI-Rate (sudah), Deposit & Lending Facility | bi.go.id halaman BI-Rate | ? |
| | IndONIA / JIBOR | bi.go.id | ? |
| | Imbal hasil SBN 10 tahun | DJPPR / PHEI / BI SEKI | ? (sebelumnya ✗; djppr.kemenkeu.go.id timeout dari sini) |
| | Selisih BI-Rate − Fed Funds | dihitung (FRED `DFEDTARU`) | ✓ |
| Inflasi & harga | Inflasi y/y (sudah), inti, administered, volatile food | BPS API (`BPS_API_KEY`, gratis daftar) / bi.go.id | ? |
| | Harga pangan harian (beras, cabai, bawang, telur, ayam, gula, minyak goreng) | Panel Harga Badan Pangan `panelharga.badanpangan.go.id` (cari endpoint data resmi) | ? (situs 200) |
| Pertumbuhan & aktivitas | PDB y/y (sudah), q/q, menurut pengeluaran | BPS API | ? |
| | Keyakinan konsumen, penjualan eceran | Survei BI (bi.go.id); FRED `CSCICP03IDM665S` berhenti Des 2023 | ⚠ / ? |
| | Penjualan mobil & motor, semen, listrik | Gaikindo/AISI/ASI | ✗ (tanpa API) |
| Eksternal | Ekspor & impor terpisah | FRED `XTEXVA01IDM667S`, `XTIMVA01IDM667S` (s.d. Agu 2026) | ✓ |
| | Neraca transaksi berjalan % PDB | FRED `IDNB6BLTT02STSAQ` (s.d. Q4 2024) / rilis NPI BI | ⚠ / ? |
| | Real effective exchange rate | FRED `CCRETT01IDM661N` (s.d. Sep 2026) | ✓ |
| | Utang luar negeri | BI SULNI / World Bank IDS | ? |
| | JISDOR | bi.go.id (timeout dari sini) | ? |
| | Rupiah vs mata uang regional (MYR, THB, PHP, INR, CNY, SGD) | Yahoo (sudah ada sebagian) | ✓ |
| | Proksi arus dana asing: ETF EIDO | Yahoo `EIDO` | ✓ |
| | Kepemilikan asing SBN | DJPPR (xls) | ? |
| Fiskal | Utang pemerintah % PDB | FRED `GGGDTAIDA188N` (tahunan s.d. 2024) | ✓ (tahunan) |
| | Defisit APBN | Kemenkeu APBN KiTa (PDF) / IMF WEO | ? |
| Keuangan | Kredit sektor swasta | FRED `CRDQIDAPABIS` (BIS, s.d. Q4 2025) | ✓ |
| | Harga properti residensial | FRED `QIDN628BIS` (BIS, s.d. Q1 2026) | ✓ |
| | Uang beredar M2 | BI SEKI; FRED berhenti 2018 | ⚠ / ? |
| | Valuasi pasar IDX (P/E, P/B agregat, earnings yield vs SBN), breadth (naik/turun), LQ45 | dihitung dari universe IDX; Yahoo `^JKLQ45` | ✓ |
| Komoditas penting RI | Batu bara API2 (proksi; Newcastle tidak gratis) | Yahoo `MTF=F` | ✓ |
| | CPO, nikel, timah, karet (bulanan) | World Bank Pink Sheet (CMO Historical Data Monthly, xlsx) | ? |
| | Tembaga, aluminium, Brent, emas | Yahoo `HG=F`, `ALI=F`, `BZ=F`, sudah ada | ✓ |
| | Indeks terms-of-trade komoditas RI | dihitung, bobot porsi ekspor | ✓ setelah data di atas |
| Global | Fed funds, UST 10Y, DXY, VIX, China (SSE Composite), Hang Seng | FRED + Yahoo `^VIX`, `000001.SS`, `^HSI` | ✓ |
| Kalender | Jadwal RDG BI, rilis BPS (inflasi, neraca dagang, PDB), FOMC | bi.go.id (jadwal tahunan), BPS ARC, `events.ts` | ? |

Ketentuan:
- Setiap indikator: nilai terakhir, perubahan, tanggal data, frekuensi, sumber + tautan, grafik 10 tahun (bila ada), dan **z-score vs 10 tahun** dengan warna (lebih baik/lebih buruk dari biasanya, arah ditentukan per indikator, mis. inflasi tinggi = merah).
- Indikator ⚠ (basi) tetap boleh ditampilkan dengan label "Stale — last data <bulan tahun>", tidak dipakai di skor.
- Ringkasan **"Indonesia Macro Pulse"** (lampu lalu lintas per kategori) + penjelasan edukatif "what it usually means for IHSG / Rupiah / banks", bukan ramalan.
- Makro yang lolos validasi (cara `compareIdMacro`) dipakai sebagai komponen Makro di sentimen (2.3).
- BPS API: buat lengkap dengan `BPS_API_KEY` opsional; tanpa kunci indikator BPS tampil "Requires free BPS API key (see README)".
- Parser xlsx (Pink Sheet): kalau butuh paket baru, pilih yang kecil dan terawat, dan jelaskan alasannya di PR.

## 7. Infrastruktur data

### 7.1 Modul baru (usulan)

- `src/sentiment/` — `types.ts`, `crossSection.ts` (percentile, desil, demean industri, rank AMP), `pillars.ts` (3 pilar), `horizons.ts` (bobot & komposisi horizon, label, confidence), `newsHorizon.ts`, `cadence.ts`, `validation.ts` (IC, hit rate, point-in-time), `hybridValue.ts` (regresi Bettman), `operational.ts` (Abarbanell & Bushee), `sue.ts`.
- `src/sentiment/projections.ts` — kisaran empiris + kalibrasi, ATR, level S/R, pivot klasik, profil volume, target pola, kalkulator posisi.
- `src/crypto/binance.ts` — parser klines/ticker/funding/OI/long-short, deteksi blokir wilayah, filter universe.
- `src/i18n/` — bagian C. `src/utils/macro.ts` diperluas (parser baru + test).
- Semua dengan test berbasis fixture kecil.

### 7.2 Pengambilan & penyimpanan (server, in-memory, hanya saat ada penonton)

| Data | Cara ambil | Jadwal / cache | Catatan |
|---|---|---|---|
| Harga bulanan universe IDX (momentum, desil) | Yahoo spark batch `range=2y&interval=1mo` (20 simbol/permintaan, ±50 permintaan) | 1×/hari setelah BEI tutup; cache 24 jam | pakai antrean + `Backoff` yang ada |
| Harga harian universe IDX (teknikal, kisaran) | spark `1y/1d` hanya untuk saham yang dibuka/watchlist/portofolio/top ranking | on demand, cache 6 jam | |
| Fundamental universe IDX (F-score, GPA, B/M, AB) | `statements.ts` (Yahoo timeseries) — perluas tipe: Inventory, AccountsReceivable, SellingGeneralAndAdministration, CostOfRevenue, TaxRateForCalcs, CapitalExpenditure, StockholdersEquity, OrdinarySharesNumber | pindai pelan 2 paralel + jeda; cache 24 jam; progres ditampilkan | ±960 permintaan ≈ 15–20 menit; prioritaskan saham yang dilihat |
| Estimasi analis & BVPS & sektor | Yahoo `quoteSummary` (`earningsTrend`, `earningsHistory`, `defaultKeyStatistics`, `assetProfile`) dengan sesi crumb yang sudah ada | pindai bersama fundamental; cache 24 jam | |
| Saham AS (SEC) | companyfacts yang sudah ada + `submissions` (SIC) | cache 12–24 jam | UA `AssetRadar personal research app (non-commercial)` |
| Binance | bagian 2.6 | 1–5 menit | |
| Berita | hub yang ada | real-time | |
| Makro | bagian 6 | 6–24 jam per sumber | |
| Skor sentimen | dihitung dari snapshot di atas | Short: setiap 5 menit + saat berita/harga berubah signifikan; Medium: harian; Long: harian + saat laporan baru | |
| Validasi | dihitung latar belakang | 1×/hari, cache 24 jam | berat → jalankan bertahap, jangan blok permintaan |

- Saat server baru menyala (cold start), skor yang datanya belum lengkap tetap tampil dengan confidence rendah dan keterangan "building data (340/962 stocks)".
- Batasi memori: simpan array angka ringkas, bukan respons JSON mentah.
- (Opsional, hanya bila database Tahap 3 sudah ada) simpan snapshot harian skor & fundamental di database supaya cold start cepat dan riwayat skor bisa ditampilkan.

### 7.3 Endpoint baru

- `GET /api/sentiment/v2?symbol=&lang=` — horizon (skor, label, confidence, cadence, katalis), pilar + sub-faktor, driver, berita per horizon, freshness, evidence ringkas.
- `GET /api/sentiment/rankings?market=idStock|usStock|crypto&horizon=short|medium|long&lang=` — papan peringkat, desil, filter sektor.
- `GET /api/sentiment/validation?market=&horizon=` — hasil uji historis.
- `GET /api/projections?symbol=&tf=` — kisaran + kalibrasi, level, target pola.
- `GET /api/crypto/binance/overview` dan `GET /api/crypto/binance/pair?symbol=BTCUSDT&tf=4h`.
- Perluasan `GET /api/macro/indonesia` (atau `/api/macro/indonesia/<category>`).
- Endpoint lama (`/api/market/analysis`, `/api/market/intelligence`) tetap jalan; sentimen lama di UI digantikan v2 setelah v2 lulus test, tanpa memutus Terminal.

### 7.4 Tampilan (tambah, jangan desain ulang)

- **Detail aset**: bagian "Investment Sentiment" — 3 kartu horizon (gauge 0–100, label, confidence, badge Daily/Weekly/Monthly, 3 driver teratas) → tab: *Pillars* (3 pilar + sub-faktor + referensi jurnal), *Technical levels* (grafik dengan pita kisaran & level + tabel), *News impact*, *Evidence*, *Position size*.
- **Radar**: tabel "Sentiment leaders" dengan pilihan horizon & pasar.
- **`#/crypto`**: halaman Binance (2.6).
- **Terminal**: `SENT <KODE>`, `LVL <KODE>`, `RANK IDX SHORT|MEDIUM|LONG`, `BNB <PAIR>`; panel baru di grid.
- **`#/macro`**: tab per kategori + Macro Pulse.
- **Settings**: bahasa, format angka, target volatilitas default, sumber data & catatan jurnal.

## 8. Fase pengerjaan

1. **Fase 0 — Cek sumber**: verifikasi semua sumber di 2.6 dan 6 (status HTTP, contoh data, tanggal data terbaru, syarat penggunaan). Catat di `PROGRESS_Tahap4.md`. Yang ✗/terblokir → tampil jujur di UI.
2. **Fase 1 — Dua bahasa (C)** dulu, supaya semua teks baru langsung memakai `t()`. Terjemahkan seluruh UI yang ada.
3. **Fase 2 — Lapisan data**: snapshot cross-section IDX/AS, fundamental tambahan, estimasi analis, industri, Binance; antrean pemindaian + progres.
4. **Fase 3 — Pilar & horizon (A)**: `crossSection`, `pillars`, `hybridValue`, `operational`, `sue`, `newsHorizon`, `horizons` + test.
5. **Fase 4 — Proyeksi & kalkulator posisi (B)** + kalibrasi + test.
6. **Fase 5 — Validasi & cadence** (bagian 4).
7. **Fase 6 — Tampilan**: detail aset, Radar, `#/crypto`, Terminal, Settings.
8. **Fase 7 — Makro diperluas (D)**.
9. **Fase 8 — Penutup**: perbarui `CLAUDE.md` (arsitektur, endpoint, aturan dua bahasa), `README.md` (fitur, sumber & keterbatasan, kunci opsional `BPS_API_KEY`, catatan jurnal), uji menyeluruh (375/1440, terang/gelap, EN/ID, offline), laporan akhir ke pemilik dalam Bahasa Indonesia sederhana: apa yang selesai, sumber yang dipakai/terblokir, apa yang tidak bisa dipenuhi dan kenapa, "Butuh keputusan pemilik", kunci yang perlu diisi, dan cara mencoba fitur baru.
