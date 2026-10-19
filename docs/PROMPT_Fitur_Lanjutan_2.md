# Prompt — AssetRadar fitur lanjutan (tahap 2)

> Cara pakai (di laptop, Claude Code desktop, folder `D:\Asset Radar\assetradar`): kirim pesan **"Jalankan semua instruksi di docs/PROMPT_Fitur_Lanjutan_2.md dari awal sampai akhir."** Untuk Claude Cloud pakai `docs/PROMPT_Cloud_Tahap2.md`.

---

Lanjutkan pengembangan AssetRadar. Baca dulu `CLAUDE.md` (aturan wajib, arsitektur, status) dan `README.md`. Kerjakan 9 fitur di bawah **berurutan**, satu per satu. Untuk setiap fitur: buat rencana singkat, kerjakan, tulis/ubah test, jalankan `npm run lint && npm test && npm run build` sampai lulus, cek di browser (375px dan 1440px, mode terang dan gelap), lalu commit dan push sebelum lanjut ke fitur berikutnya.

Catat kemajuan di `docs/PROGRESS_Tahap2.md` setiap selesai satu fitur (centang, ringkasan, sumber data, keterbatasan, status verifikasi live). Kalau sesi terputus atau konteks habis, lanjutkan dari fitur pertama yang belum dicentang — jangan mulai ulang. Kerjakan mandiri sampai selesai; keputusan yang biasanya ditanyakan ke saya (mis. memakai layanan luar) dicatat di bagian "Butuh keputusan pemilik" dengan pilihan paling aman sebagai default, lalu lanjut.

Kunci `FINNHUB_API_KEY` sudah ada di file `.env` lokal (diabaikan git). Pakai lewat `process.env` di server saja; **jangan pernah menampilkan, mencetak ke log, menyalin ke file lain, atau meng-commit nilainya**.

## Aturan yang wajib diikuti (ringkasan dari CLAUDE.md)

- Semua teks UI, nama aset, komentar kode dan keterangan di awal setiap file dalam **Bahasa Inggris**. Setiap file baru diawali komentar keterangan singkat. Judul berita tidak diterjemahkan. Balas saya dalam Bahasa Indonesia yang sederhana.
- **Jangan pernah menampilkan angka contoh/dummy** (harga, laporan keuangan, rasio, data makro, jadwal). Kalau sumber gagal atau data tidak ada → "Data unavailable" + tombol "Try again", atau "Not reported" untuk satu angka yang tidak ada.
- Grafik TradingView hanya lewat widget resmi. Tidak boleh scraping atau endpoint tidak resmi TradingView.
- Semua localStorage lewat helper `src/utils/storage.ts` (try/catch).
- HP 375px tanpa scroll horizontal; PC 1440px; terang dan gelap terbaca; hormati `prefers-reduced-motion`.
- Kunci API tidak boleh ditulis di kode atau di-commit. Kunci baru (kalau perlu) hanya lewat `.env` / Secrets AI Studio dan dicatat di `.env.example` tanpa nilai. Fitur harus tetap jalan (versi terbatas) tanpa kunci.
- Analisis, portofolio, uji AI = **edukasi/informasi, bukan saran investasi personal**. Disclaimer tetap ada. Tidak ada janji atau proyeksi keuntungan.
- Git: sebelum push, `git fetch` lalu cek apakah ada commit di `origin/main` yang bukan dari sini (AI Studio pernah menimpa main). Jangan pernah force-push; perbaikan lewat `git revert`. Akhiri pesan commit dengan baris Co-Authored-By yang berlaku.
- Node test berjalan "strip-only": jangan pakai parameter properties di constructor TypeScript; impor tipe pakai `import type`.
- Server di-cache in-memory dan berjalan di Cloud Run (AI Studio) yang **tidak punya penyimpanan permanen** — jangan mengandalkan file di disk server untuk data pengguna.

## Fakta sumber data yang sudah dicek (19 Okt 2026)

- Yahoo `ws/fundamentals-timeseries` (tanpa kunci): data **tahunan ±4–5 tahun**, tetapi **kuartalan hanya ±5 kuartal terakhir** dan kadang ada kuartal yang bolong (contoh BBCA: 2025-09 tidak ada). Jadi "5 tahun ke belakang per kuartal" tidak bisa dipenuhi dari Yahoo saja.
- Situs IDX (`idx.co.id/primary/...`) menolak akses server (HTTP 403).
- FRED CSV `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>` bisa diakses tanpa kunci (contoh `IRSTCI01IDM156N`).
- World Bank API `https://api.worldbank.org/v2/country/IDN/indicator/<ID>?format=json` bisa diakses tanpa kunci (data tahunan).
- Yahoo screener predefined (`v1/finance/screener/predefined/saved`) merespons tanpa kunci.

Verifikasi ulang sumber-sumber ini sebelum dipakai; kalau ada yang berubah, cari alternatif gratis yang resmi dan jelaskan pilihanmu ke saya.

---

## Fitur 1 — Bisa di-install di smartphone (PWA)

- `public/manifest.webmanifest`: name "AssetRadar", short_name "AssetRadar", `display: standalone`, `start_url: "/#/radar"`, `theme_color` dan `background_color` `#0B1220`, ikon 192, 512 dan maskable 512 dari logo radar (`RadarLogo` / favicon SVG di `index.html`), dibuat sebagai PNG sungguhan di `public/icons/`.
- `index.html`: link manifest, `apple-touch-icon` 180px, `meta theme-color`, `apple-mobile-web-app-capable`.
- `public/sw.js` sederhana: cache aset statis hasil build (cache-first, ganti versi cache tiap build), `/api/*` network-first dengan cadangan cache terakhir. **Jangan** cache `/api/market/news-stream` (SSE). Daftarkan service worker **hanya** saat `import.meta.env.PROD`.
- Tombol "Install app" di Settings (dan banner kecil yang bisa ditutup di Radar) memakai event `beforeinstallprompt`; untuk iPhone tampilkan petunjuk "Share → Add to Home Screen".
- Saat offline: aplikasi tetap terbuka, status "Offline – last data", harga dari snapshot, tidak crash.
- Uji: build produksi (`NODE_ENV=production npm start`), cek manifest dan service worker di DevTools, lalu matikan jaringan dan reload.

## Fitur 2 — IHSG di posisi utama + seluruh saham Indonesia

- IHSG tampil di bagian atas Radar: strip **"Key indices"** (IHSG paling depan, lalu S&P 500, Nasdaq 100, Nikkei 225, dll.) dengan harga, % 24 jam, dan status buka/tutup. Di UI tulis "IHSG (JCI)" karena orang Indonesia mengenalnya sebagai IHSG. IHSG juga jadi tombol **pertama** di Quick Chart.
- Indeks tidak punya market cap, jadi tidak masuk "Top 20 by market cap" — tetap begitu, tapi strip Key indices ditaruh **di atas** Top 20.
- Masukkan **seluruh saham yang tercatat di BEI** (±950 emiten):
  - Cari sumber daftar emiten gratis yang resmi/terpercaya (kode, nama, sektor, papan pencatatan, jumlah saham). Karena idx.co.id menolak server, buat skrip satu kali (`scripts/`) yang menghasilkan file data statis yang di-commit (mis. `src/config/idxStocks.json`) beserta tanggal pembaruannya, dan jelaskan cara memperbaruinya di README.
  - Saham-saham ini **tidak** dimasukkan ke `ASSETS` utama (supaya Terminal, ticker tape, AI Advisor tidak berat). Buat universe terpisah, mis. `IDX_UNIVERSE`, yang tetap bisa dibuka di halaman detail (`#/asset/<kode>`), dicari, dimasukkan ke watchlist dan portofolio.
  - Harga: jangan polling ±950 saham tiap 10 detik. Pakai tingkatan:
    1. saham yang sedang tampil di layar, di watchlist atau di portofolio → ikut polling cepat (batch spark 20 simbol/permintaan, cache 15 dtk saat bursa buka);
    2. seluruh universe → disapu bertahap di server (mis. tiap 5 menit saat bursa buka, 30 menit saat tutup) untuk tabel movers saham Indonesia, dengan pembatas permintaan supaya tidak kena rate limit Yahoo.
  - Halaman baru **"Indonesian Stocks"** (atau tab di Radar): tabel semua emiten dengan filter sektor dan papan, urut berdasarkan market cap / % harian / % mingguan / nilai transaksi (kalau tersedia), paginasi atau virtual scroll, plus "Top gainers / losers / most active IDX today".
  - Saham yang datanya gagal → "Data unavailable", jangan disembunyikan diam-diam dan jangan diisi angka palsu.

## Fitur 3 — Search bar di semua halaman

- Kotak pencarian di **header atas** setiap halaman (bukan hanya di Radar). Di HP: ikon kaca pembesar yang membuka pencarian layar penuh.
- Mencari di `ASSETS` + `IDX_UNIVERSE` berdasarkan kode, nama, alias, kata kunci dan sektor (mis. "bank", "BBRI", "nikel", "telkom").
- Pintasan keyboard: `/` atau `Ctrl+K` membuka pencarian (kecuali di Terminal, yang `/`-nya untuk baris perintah).
- Hasil menampilkan kode, nama, grup/sektor, harga live dan % 24 jam (harga diambil saat hasil tampil). Enter/klik → halaman detail aset. Simpan 5 pencarian terakhir (lewat `storage.ts`).
- Gunakan ulang `AssetSearch.tsx` kalau cocok; pencarian di dalam Radar dan Sentiment tetap ada.

## Fitur 4 — Portofolio pribadi

- Halaman baru `#/portfolio` (tambah ke `router.ts` + test, sidebar dan bottom nav).
- Input transaksi: aset (lewat pencarian, termasuk semua saham BEI), beli/jual, tanggal, jumlah (saham IDX dalam **lot**, 1 lot = 100 lembar; crypto boleh desimal; emas dalam gram), harga per unit, biaya/fee opsional, catatan. Bisa edit dan hapus transaksi.
- Hitungan: posisi per aset, harga rata-rata, modal, nilai live, untung/rugi (Rp dan %), realized vs unrealized, total portofolio dalam **Rupiah** (aset USD dikonversi dengan USD/IDR live; emas pakai Rupiah/gram), pembagian per kelas aset (donut `recharts`), dan perbandingan dengan alokasi profil risiko yang tersimpan.
- Per posisi tampilkan ringkas skor bukti (dari `/api/market/analysis`) dan F-score untuk saham — sebagai informasi, bukan sinyal.
- Penyimpanan: hanya di perangkat (localStorage lewat `storage.ts`) + tombol **Export / Import JSON** untuk cadangan/pindah HP. Tulis jelas di UI bahwa data hanya ada di perangkat ini.
- Validasi input (angka positif, tanggal tidak di masa depan, jual tidak melebihi posisi). Pure functions perhitungan di `src/utils/portfolio.ts` dengan test lengkap (rata-rata, jual sebagian, fee, konversi kurs).

## Fitur 5 — Uji nyata (forward test) AI Advisor

- Tujuan: membuktikan apakah verdict AI Advisor benar **setelah** diberikan, bukan hanya di backtest.
- Setiap hari (sekali per hari per horizon dan profil) simpan "snapshot" verdict: tanggal, aset, verdict, chance of a gain, harga saat itu, horizon. Karena server tidak punya penyimpanan permanen, simpan di **perangkat** (localStorage, dibatasi ukurannya, dengan export/import JSON). Kalau menurutmu ada cara gratis dan aman untuk penyimpanan server (mis. layanan database dengan free tier yang kuncinya lewat Secrets), jelaskan dulu ke saya sebelum dipakai — jangan dipasang tanpa persetujuan.
- Setelah horizon lewat, hitung hasil dari riwayat harga sungguhan: apakah naik, return sebenarnya. Tampilkan di AI Advisor bagian **"Live track record"**: hit rate per verdict (Favorable / Unfavorable / Watch) vs base rate pada periode yang sama, rata-rata return, jumlah sampel, dan tanggal mulai pencatatan.
- Jujur soal ukuran sampel: di bawah 30 hasil tampilkan "Too few results to judge yet". Snapshot yang terlewat (aplikasi tidak dibuka) tidak boleh diisi mundur dengan data masa kini.
- Logika di `src/ai/forwardTest.ts` + test.

## Fitur 6 — Kalender emiten IDX

- Tampilkan jadwal per emiten dan secara keseluruhan: pengumuman laporan keuangan/earnings, RUPS, dividen (cum date, ex date, recording date, payment date, nilai per saham), stock split/rights issue jika ada.
- Cari sumber gratis yang resmi atau terpercaya dan bisa diakses server (idx.co.id menolak 403; cek alternatif seperti data kalender/aksi korporasi dari Yahoo, KSEI, atau feed resmi lain). Jelaskan sumber yang dipakai dan keterbatasannya. Kalau tidak ada sumber yang layak untuk jenis data tertentu, tampilkan "Not available from free sources" — **jangan** membuat jadwal perkiraan.
- Tampilan: halaman/tab "IDX Calendar" (minggu ini, bulan ini, filter watchlist/portofolio), bagian kalender di halaman detail saham, panel Terminal baru (perintah `CAL` dan `<KODE> CAL`, tambahkan ke `terminalCommands.ts` + test).
- Cache server sesuai frekuensi data (mis. 6 jam).

## Fitur 7 — Data makro Indonesia

- Data: BI rate (suku bunga acuan), inflasi (CPI y/y dan m/m), pertumbuhan PDB, cadangan devisa, neraca perdagangan, USD/IDR, imbal hasil SBN 10 tahun (jika ada sumber), PMI (jika ada sumber gratis).
- Sumber yang bisa diakses tanpa kunci: FRED CSV (seri Indonesia dari OECD/IMF), World Bank API (tahunan). Opsional: BPS Web API (butuh kunci gratis → `BPS_API_KEY` di `.env`, fitur tetap jalan tanpa kunci). Selalu tampilkan sumber, tanggal data terakhir, dan frekuensinya (bulanan/kuartalan/tahunan) — data makro sering tertinggal, tulis apa adanya.
- Tampilan: halaman/tab "Indonesia Macro" dengan grafik riwayat 5–10 tahun per indikator, kartu ringkas (nilai terakhir, perubahan), panel Terminal `IDMACRO` (+ test parser).
- Integrasi AI Advisor: masukkan **perubahan BI rate** dan inflasi sebagai fitur/konteks untuk aset Indonesia (IHSG, saham IDX, USD/IDR) **tanpa look-ahead** (pakai tanggal rilis atau jeda rilis yang wajar), lalu buktikan lewat walk-forward + holdout yang sudah ada apakah fitur itu menambah akurasi. Kalau tidak menambah, laporkan apa adanya. Perbarui bagian Methodology dan hapus catatan "BI rate belum dimodelkan" bila sudah.

## Fitur 8 — Laporan keuangan perusahaan + rasio

- Di halaman detail setiap saham (US, dunia, dan seluruh BEI): bagian **"Financial Statements"** dengan pilihan periode **Annual / Semester / Quarterly** dan pilihan tahun sampai **5 tahun ke belakang**.
- Isi: laba rugi (pendapatan, laba kotor, laba usaha, laba bersih, EPS), neraca (total aset, liabilitas, ekuitas, kas, utang), arus kas (operasi, investasi, pendanaan, free cash flow). Untuk bank tampilkan pos yang relevan (pendapatan bunga bersih, dll.) bila tersedia.
- Rasio mengikuti periode yang dipilih: ROE, ROA, gross/operating/net margin, DER, current ratio, asset turnover, pertumbuhan YoY (dan QoQ untuk kuartalan), EPS, P/E, P/B, dividend yield (valuasi pakai harga live untuk periode terbaru dan harga akhir periode untuk periode lama — tulis mana yang dipakai). Untuk kuartalan/semester gunakan TTM atau anualisasi yang dijelaskan jelas di UI.
- **Semester** (H1/H2) diturunkan dari kuartal: pos arus (laba rugi, arus kas) = jumlah dua kuartal; pos neraca = nilai akhir periode. Hanya hitung jika kedua kuartal ada.
- Keterbatasan data (lihat fakta di atas): Yahoo hanya punya ±5 kuartal terakhir. Cari sumber gratis tambahan yang sah untuk kuartalan lebih lama (mis. laporan resmi emiten / XBRL BEI, SEC EDGAR "company facts" API untuk saham AS tanpa kunci). Periode yang tidak tersedia ditandai "Not reported / not available" — **tidak boleh** diisi perkiraan.
- Tambahkan tabel + grafik batang (pendapatan & laba bersih per periode), tombol unduh CSV untuk periode yang tampil, dan sumber data per angka.
- Endpoint server baru (mis. `GET /api/fundamentals/statements?symbol=&period=annual|semester|quarterly`), cache 12 jam, logika parsing dan rasio di `src/ai/` atau `src/utils/` dengan test (termasuk turunan semester, TTM, kuartal bolong).
- Hubungkan dengan F-score yang sudah ada (pakai data tahunan yang sama).

## Fitur 9 — Harga lebih cepat (±5 detik) dengan push dari server

Saat ini browser bertanya ke server tiap 10 detik dan server menyimpan harga Yahoo 15 detik, jadi saham/indeks/komoditas/kurs bergerak kira-kira tiap 10–15 detik. Ubah skemanya menjadi **server menarik data sekali untuk semua pengguna, lalu mendorong (push) harga baru ke browser**:

- **Server:** satu loop harga untuk semua pengguna. Selama ada penonton, aset Yahoo yang bursanya **buka** diambil tiap **±5 detik** (cache 5 dtk), yang **tutup** tiap 5 menit. Pakai batch spark (maks 20 simbol/permintaan) dan pembatas jumlah permintaan bersamaan. Prioritaskan aset yang sedang dilihat pengguna, watchlist, portofolio dan `quick`. Sisanya boleh lebih jarang, ikuti tingkatan di Fitur 2.
- **Push ke browser:** endpoint SSE baru, mis. `GET /api/market/price-stream` (pola sama dengan `news-stream`). Kirim `snapshot` saat tersambung, lalu event `prices` berisi **hanya tick yang berubah**, plus `ping` tiap 20 dtk. Server hanya polling Yahoo saat ada klien tersambung atau ada permintaan dalam ≤5 menit terakhir.
- **Browser:** `MarketDataManager` berlangganan ke stream ini menggantikan polling Yahoo 10 dtk. Kalau stream putus atau macet (>30 dtk tanpa data/ping), kembali otomatis ke polling REST 10 dtk dan coba sambung ulang dengan backoff. Putuskan saat tab tersembunyi, sambung lagi saat terlihat (seperti WebSocket Indodax). Crypto tetap lewat WebSocket Indodax. Emas bisa ikut stream ini (30 dtk).
- **Jaga dari rate limit Yahoo:** kalau Yahoo membalas 429/5xx atau gagal berulang, perlambat otomatis (mis. 5 → 10 → 20 dtk) dan pulihkan pelan-pelan. Simpan harga terakhir, jangan pernah mengosongkan atau mengisi angka palsu. Catat di log server.
- **Tampilan:** indikator kecil "updated Xs ago" tetap jujur. Status koneksi menunjukkan "Live (streaming)" saat SSE aktif dan "Polling" saat cadangan dipakai. Saham BEI/IHSG tetap diberi label **delayed** karena sumber gratisnya memang tertunda.
- **Opsional — Finnhub real-time:** kalau `FINNHUB_API_KEY` ada di `.env`/Secrets, server membuka WebSocket Finnhub (`wss://ws.finnhub.io?token=…`, kunci hanya di server, **tidak pernah dikirim ke browser**) untuk saham AS, forex dan crypto global yang didukung, lalu meneruskan trade terbaru lewat `price-stream` (dibatasi, mis. maks 1 update per simbol per detik). Periksa dulu dokumentasi resmi dan syarat paket gratis Finnhub (batas simbol, simbol yang didukung, real-time atau tidak) dan patuhi batasnya. Tanpa kunci, semuanya tetap jalan dengan skema ±5 detik di atas. Tambahkan `FINNHUB_API_KEY=` (tanpa nilai) ke `.env.example`, dan jelaskan di README dan Settings → Data sources.
- **Test:** logika penjadwalan dan prioritas, backoff rate limit, diff tick (hanya yang berubah dikirim), fallback stream → polling di klien (pure functions di `src/utils/` atau `src/services/` dengan test). Uji server dengan `curl -N` ke endpoint SSE.

---

## Penutup

1. Perbarui `CLAUDE.md` (arsitektur, endpoint baru, aturan baru, status) dan `README.md` (fitur, sumber data dan keterbatasannya, cara memperbarui daftar emiten, kunci opsional baru).
2. Uji menyeluruh di 375px dan 1440px, terang dan gelap, offline (PWA), dan pastikan tidak ada scroll horizontal.
3. `npm run lint && npm test && npm run build` lulus, `git fetch` + cek origin, commit, push.
4. Laporan akhir ke saya dalam Bahasa Indonesia sederhana: apa saja yang selesai, sumber data yang dipakai, apa yang **tidak bisa** dipenuhi dan kenapa (misalnya kuartalan 5 tahun atau jadwal tertentu yang tidak ada sumber gratisnya), dan langkah update di Google AI Studio (import ulang dari GitHub sebagai app baru, lalu Publish; jangan klik Push/Sync dari AI Studio).
