# AssetRadar tahap 3 — catatan kemajuan

Diisi oleh sesi Claude yang mengerjakan `docs/PROMPT_Cloud_Tahap3.md` (cloud). Sesi berikutnya melanjutkan dari fitur pertama yang belum dicentang.

Dijalankan di Claude Code cloud, 20 Okt 2026. Branch kerja: **`claude/ecstatic-fermat-nyv2f9`** (branch yang ditetapkan oleh sesi cloud ini; lingkungan cloud hanya mengizinkan push ke branch tersebut, jadi branch ini menggantikan `claude/tahap3-features` yang disebut di prompt). Satu pull request ke `main`.

## Cek lingkungan

Node v22.22.0 · `npm install` lulus · kondisi awal `npm run lint && npm test && npm run build`: **lulus (123 test)**.

Akses internet dari container cloud (`curl`, 20 Okt 2026): kebijakan jaringan lingkungan ini **menolak semua host di bawah** (proxy menjawab `403` pada CONNECT; hanya registry npm yang diizinkan).

| Sumber | Hasil | Dipakai untuk |
|---|---|---|
| Yahoo Finance chart (`query1.finance.yahoo.com/v8/finance/chart/BBCA.JK`) | diblokir (403 proxy) | harga, riwayat harian, compare, backtest, portofolio |
| Yahoo fundamentals-timeseries | diblokir (403 proxy) | screener |
| Indodax `api/summaries` | diblokir (403 proxy) | harga crypto |
| Google News RSS | diblokir (403 proxy) | ringkasan pagi, alert berita |
| SEC EDGAR companyfacts | diblokir (403 proxy) | compare (saham AS) |
| `api.telegram.org` | diblokir (403 proxy) | ringkasan pagi ke Telegram |
| `www.logammulia.com` (+ `robots.txt`) | diblokir (403 proxy) | fitur 7 |
| `www.pegadaian.co.id` (+ `robots.txt`) | diblokir (403 proxy) | fitur 7 |
| gold-api.com, CoinGecko, FRED, bi.go.id, World Bank, supabase.com | diblokir (403 proxy) | — |
| registry.npmjs.org | 200 | pemasangan paket |

Akibatnya: semua fitur ditulis lengkap dengan penanganan "Data unavailable", logika diuji dengan fixture kecil di repo, dan **belum diverifikasi dengan data live**. Endpoint server tetap diuji dengan `curl` (bentuk JSON, input salah, tanpa kunci, galat sumber).

## Fitur

Untuk setiap fitur: rencana singkat, apa yang dibuat, sumber data, keterbatasan, kunci opsional, status verifikasi live, commit.

- [x] 1. Sinkronisasi antar perangkat + uji nyata AI di server
  - Rencana: database lewat server saja (`/api/sync/*`), satu tabel key/value; login passphrase pemilik → token sesi bertanda tangan; merge per item dengan waktu edit; forward test di server lewat `POST /api/cron/daily` + cadangan "permintaan pertama setelah 16:15 WIB".
  - Pilihan database: **Supabase** (default). Perbandingan singkat: Supabase gratis = Postgres 500 MB, 5 GB transfer/bulan, proyek gratis *dijeda setelah 1 minggu tanpa aktivitas* (cron harian di bawah mencegahnya), dipasang dengan 2 nilai (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) dan diakses lewat REST tanpa paket tambahan. Firestore gratis = 1 GiB, 50.000 baca & 20.000 tulis per hari, tetapi butuh proyek Google Cloud + kunci service account JSON (atau izin IAM Cloud Run) dan paket `firebase-admin` yang besar. Supabase dipilih karena paling sederhana dipasang dari Cloud Run (AI Studio) dengan kunci server.
  - Dibuat: `src/utils/sync.ts` (merge per item: edit terbaru menang, hapus = tombstone 180 hari, transaksi portofolio per id, entri forward test yang sudah punya hasil selalu menang, delta berdasarkan waktu server, jadwal harian WIB) + `src/utils/syncAuth.ts` (passphrase dibandingkan lewat hash SHA-256 waktu-konstan, token HMAC 90 hari — ganti passphrase = semua perangkat logout, batas login 5 gagal/15 mnt per klien + 30 gagal/15 mnt total) + 14 test. Server: `server/store.ts` (Supabase REST / memori), `server/sync.ts` (`GET /api/sync/status`, `POST /api/sync/login`, `POST /api/sync/merge` — body besar hanya diterima setelah login). `storage.ts` mencatat otomatis item yang berubah di setiap penyimpan (watchlist, portofolio, log forward test, profil risiko, pengaturan: tema, timeframe, preferensi AI, start-in-Terminal). `src/services/syncService.ts`: sinkron saat mulai, 4 dtk setelah ada perubahan, tiap 5 mnt, saat tab terlihat/online lagi. Kartu **Sync** di Settings (status, waktu sinkron terakhir, login/logout, "Sync now", ringkasan penggabungan pertama), ikon awan merah di header bila sinkron gagal.
  - Forward test di server: tiap hari kerja ≥16:15 WIB server menyimpan verdict AI untuk horizon 20 & 60 hari × 3 profil (per bulan, kunci `forward:YYYY-MM`) lalu menilai yang sudah jatuh tempo dengan close harian (`src/ai/forwardTest.ts`). Dipicu `POST /api/cron/daily` (header `Authorization: Bearer <CRON_TOKEN>`) atau otomatis oleh permintaan API pertama setelah jamnya. Hasil: `GET /api/ai/forward-track?horizon=&profile=`, tampil di AI Advisor di bawah rekaman perangkat ("Server record").
  - Tanpa kunci: semua tetap lokal seperti sebelumnya; kartu Sync menjelaskan cara mengaktifkan. Forward test server tetap jalan di memori (hilang saat server restart/tidur — dijelaskan di UI).
  - Uji server (curl, mode memori dev `SYNC_DEV_MEMORY_DB=1`): status, login salah/benar, merge dua perangkat (item baru dua sisi, hapus menang karena lebih baru, delta kosong setelah sinkron), merge tanpa login 401, token palsu 401, login ke-6 → 429 + `Retry-After`, cron tanpa/benar token, forward-track. Build produksi: `/`, `/manifest.webmanifest`, `/sw.js` 200; SW tetap melewati stream SSE.
  - Status verifikasi live: **belum** — Supabase dan sumber harga diblokir jaringan cloud; perlu dicoba pemilik setelah mengisi Secrets.
- [x] 2. Alert harga & notifikasi HP
  - Rencana: logika alert murni dipakai bersama oleh browser dan server; definisi alert ikut sinkronisasi (koleksi `alerts`), status & riwayat disimpan terpisah per pemeriksa; push lewat `web-push` + service worker.
  - Dibuat: `src/utils/alerts.ts` (+10 test): harga menembus naik/turun (crossing — alert yang dibuat saat harga sudah lewat menunggu tembusan berikutnya, dijelaskan di form), perubahan harian ≥ X% (aktif lagi setelah kembali di bawah ambang), ex-dividend/laporan keuangan **besok** (WIB) untuk satu saham atau semua saham di watchlist+portofolio, berita baru per aset, alert geopolitik "high"; sekali-picu atau berulang dengan jeda minimal 1 jam; jam tenang (WIB, boleh lewat tengah malam); throttle 5 notifikasi/menit; riwayat 200 entri.
  - Server: `server/push.ts` (`GET /api/push/config`, `POST /api/push/subscribe|unsubscribe|test` — hanya pemilik yang login; subscription disimpan di DB, yang kedaluwarsa 404/410 dihapus), mesin alert di `server.ts` memakai harga dari price loop (loop tetap berjalan tiap ±15 dtk saat ada alert server walau tidak ada penonton; simbol alert dijadikan prioritas loop, tanpa permintaan Yahoo tambahan), kalender dari cache kalender (maks 1×/jam/saham), berita dari hub berita. Alert sekali-picu dimatikan di data sinkron sehingga ikut mati di semua perangkat. `GET /api/alerts/history`.
  - Browser: `src/services/alertService.ts` (pemeriksaan lokal tiap 5 dtk saat aplikasi terbuka, Notification API lewat service worker, langganan push, "Send test notification"); `public/sw.js` menangani `push` dan `notificationclick` (membuka `#/asset/<id>`). Halaman **`#/alerts`** (cara notifikasi di perangkat ini, petunjuk iPhone: harus Add to Home Screen + iOS 16.4, jam tenang, pengingat kalender watchlist/portofolio, daftar alert: aktif/mati, pause, edit, hapus, riwayat gabungan lokal+server) dan tombol **Alert** (lonceng) di halaman detail aset. Menu: sidebar & "More" di HP.
  - Tanpa kunci (VAPID/DB/passphrase): alert disimpan lokal dan diperiksa di browser hanya saat aplikasi terbuka — dijelaskan di halaman Alerts.
  - Uji server (curl, kunci VAPID sementara yang tidak disimpan): config publik tanpa jumlah subscription, subscribe tanpa login 401, subscription tidak valid 400, subscribe ok, test push ke endpoint palsu → `failed: 1` (jaringan cloud), riwayat tanpa login 401.
  - Status verifikasi live: **belum** — pengiriman push ke HP sungguhan dan harga live tidak bisa dicoba dari cloud. Perlu dicek pemilik: izin notifikasi di Android/PC, iPhone setelah install PWA.
- [x] 3. Screener saham BEI
  - Rencana: harga dari sapuan IDX yang sudah ada + rasio dari logika `statements.ts`; pemindaian laporan keuangan pelan di server (2 paralel + jeda 300 ms, cache 24 jam, hanya bila ada penonton ≤1 jam), progres terlihat di UI.
  - Dibuat: `src/utils/screener.ts` (+8 test: filter rentang dalam satuan tampilan, sektor/papan/teks, baris tanpa angka dihitung "left out because not reported", urutan dengan nilai kosong selalu di bawah, preset, CSV "Not reported", pemilihan tahunan vs TTM, penyesuaian P/E–P/B–yield ke harga terkini). Server `GET /api/screener/idx` (962 baris: harga, % 1 hari/1 minggu, nilai transaksi, market cap, P/E, P/B, ROE, net margin, DER, dividend yield, F-score, pertumbuhan laba YoY, periode data per baris; progres pemindaian). Hasil pindaian disimpan di DB (bila ada) agar restart tidak mulai ulang; "tidak ada data" dicoba lagi setelah 2 jam (bisa karena gagal jaringan).
  - Halaman **`#/screener`** (lazy): 5 preset ("High ROE, low P/E", "Dividend payers", "Strong F-score", "Liquid, below book value", "Profit growth, low debt"), filter teks/sektor/papan + rentang min/max 13 kolom, simpan screen sendiri (ikut sinkronisasi, koleksi `screens`), urutkan kolom, unduh CSV, 50 baris/halaman, klik baris → detail saham, centang 2–4 saham → Compare (Fitur 4). Tulisan "A screen filters reported numbers — it is not a recommendation." Tabel di dalam `overflow-x-auto`.
  - Uji server (curl): 962 baris, pemindaian berjalan & progres naik (34 saham dalam ±5 dtk saat sumber gagal), baris tanpa data tetap tampil.
  - Keterbatasan: sumber hanya Yahoo (saham IDX ±4 tahun tahunan, ±5 kuartal); pemindaian penuh ±10–20 menit; P/E dll. memakai harga tertunda dari sapuan IDX.
  - Status verifikasi live: **belum** (Yahoo diblokir jaringan cloud).
- [x] 4. Bandingkan saham/aset
  - Rencana: endpoint riwayat harian OHLC ±5 tahun (dipakai juga oleh portofolio & backtest), normalisasi murni dengan test, halaman lazy dengan recharts.
  - Dibuat: `src/utils/compare.ts` (+5 test: parameter URL — kode/simbol/id, huruf besar-kecil bebas, duplikat dibuang, maks 4; tanggal awal periode; normalisasi mulai = 100 dengan libur berbeda per bursa → close terakhir dibawa maju; basis = hari pertama semua aset punya harga). Server `GET /api/market/daily?symbol=` (Yahoo `1d/5y` OHLC; crypto Indodax `tf=1D`; emas GC=F; SAR dari USD/IDR; cache 6 jam). Halaman **`#/compare?s=BBCA,BBRI,BMRI`** (2–4 aset lewat pencarian, chip warna, grafik kinerja 1M/3M/1Y/3Y/5Y, tabel harga & perubahan 24h/7d/30d/periode, untuk saham: pos laporan & rasio berdampingan tahunan/kuartalan dengan label mata uang laporan). Tombol **Compare** di detail aset dan di screener (centang 2–4), perintah Terminal **`CMP BBCA BBRI`** (+ test parser), menu Compare.
  - Mata uang berbeda: kinerja dalam % mata uang masing-masing (tanpa konversi), angka laporan dalam mata uang aslinya.
  - Uji server (curl): simbol tidak dikenal 400, sumber gagal 502 "History unavailable" (UI: "Data unavailable" + "Try again").
  - Status verifikasi live: **belum** (Yahoo/Indodax diblokir jaringan cloud).
- [x] 5. Portofolio lanjutan
  - Rencana: logika murni (TWR, dividen, risiko) dengan test; bagian "Portfolio analytics" yang di-lazy-load di bawah halaman portofolio; data harga dari endpoint riwayat harian Fitur 4.
  - Dibuat: `src/utils/portfolioAnalytics.ts` (+8 test: TWR dengan setoran/penarikan — beli/jual tidak dihitung sebagai kinerja, biaya & harga beli di atas close = rugi hari pertama, dividen dihitung pada tanggal bayar, harga hilang → harga transaksi terakhir + tanda "estimated", saham yang dimiliki sebelum ex-date — beli tepat di ex-date tidak berhak, usulan dividen, drawdown, volatilitas, korelasi). Komponen `PortfolioAnalytics.tsx` dengan 4 tab:
    - **Performance**: nilai portofolio harian dalam Rupiah (harga asing × kurs hari itu, emas dari GC=F per gram), grafik TWR vs IHSG periode yang sama, TWR total & per tahun (≥1 tahun), metode dijelaskan di UI ("How is this calculated?").
    - **Risk**: volatilitas tahunan & max drawdown portofolio vs IHSG, korelasi antar holding (±12 bulan). Porsi per kelas aset vs alokasi contoh profil risiko sudah ada di bagian alokasi (dirujuk).
    - **Dividends**: catat dividen tunai manual (jumlah saham sebelum ex-date dihitung otomatis), usulan otomatis dari riwayat dividen × saham yang dimiliki pada ex-date → tombol Confirm/Dismiss (tidak masuk otomatis), total dividen; ikut sinkronisasi (koleksi `dividends`).
    - **Calendar**: ex-date, pembayaran dividen dan jadwal laporan keuangan untuk saham yang dimiliki.
  - Keterbatasan: aset tanpa kurs Rupiah historis (KRW, HKD) tidak masuk perhitungan (ditulis di UI); nilai harian memakai close (bukan harga live); pajak dividen harus diisi sendiri.
  - Status verifikasi live: **belum** (riwayat harga & kalender dari Yahoo diblokir jaringan cloud).
- [x] 6. Ringkasan pagi (morning brief)
  - Rencana: penyusun ringkasan murni (dengan test, data contoh hanya di test), dibuat server dari cache yang sudah ada, disimpan per tanggal di DB (atau memori), dikirim opsional ke Telegram & web push.
  - Dibuat: `src/utils/morningBrief.ts` (+4 test: pemilihan 5 berita terpenting — alert geopolitik "high" dulu, lalu bobot event (kebijakan moneter, laporan keuangan, makro…) di atas berita harga, berita sama dari beberapa media dibuang, >18 jam dibuang; jadwal 07:30 WIB — sebelum itu ringkasan kemarin; penyusunan dari data contoh; teks Telegram ≤4096 karakter). Server: `generateBrief` (penutupan Wall Street SPX/NDX/DJI & Asia N225/HSI/KOSPI/SSE/STI, IHSG sesi terakhir, 3 naik/turun terbesar 24 jam, kurs USD/EUR/SGD/JPY/CNY & emas, jadwal emiten hari ini — watchlist/portofolio dari data sinkron diberi ★ dan di atas, data makro terbaru BI-Rate dll., 5 berita, status forward test AI); Gemini merapikan paragraf ringkasan bila `GEMINI_API_KEY` ada, jika tidak berbasis aturan. Job harian `brief` (≥07:30 WIB) lewat `POST /api/cron/daily` atau permintaan API pertama; tidak dikirim bila tidak ada data pasar sama sekali (dicoba lagi 30 mnt). `GET /api/brief[?date=]`, `GET /api/brief/dates`, `POST /api/brief/send-test` (pemilik). Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) dan web push Fitur 2 bila dikonfigurasi; token tidak pernah dicetak ke log.
  - Halaman **`#/brief`** (pilih tanggal tersimpan, berita dengan tautan, baris kalender bisa diklik, ★ untuk watchlist/portofolio, keterangan "preview" bila belum tersimpan, disclaimer) dan panel Terminal **`BRIEF`** (+ tombol QuickBar). Menu: Morning Brief.
  - Tanpa kunci: hanya tampil di aplikasi (preview langsung bila belum ada yang tersimpan).
  - Uji server (curl): `/api/brief` → preview dengan bagian "Market data is unavailable right now." (sumber diblokir), tanggal salah 400, tanggal tanpa ringkasan 404, send-test tanpa login → 503/401, cron → brief gagal dengan pesan jelas lalu dicoba lagi.
  - Status verifikasi live: **belum** (sumber harga, berita dan Telegram diblokir jaringan cloud).
- [x] 7. Harga emas Antam / Pegadaian — **jalan cadangan** (tautan resmi + input manual)
  - Pemeriksaan sumber: `www.logammulia.com`, `robots.txt`-nya, `www.pegadaian.co.id` dan `robots.txt`-nya **tidak bisa dibuka dari cloud** (diblokir kebijakan jaringan), jadi syarat penggunaan dan izin akses server tidak bisa diperiksa. Sepengetahuan saya kedua situs tidak menyediakan API/feed resmi untuk publik; harga hanya ditampilkan di halaman web. Sesuai aturan: **tidak ada scraping**.
  - Dibuat: `src/utils/goldBar.ts` (+4 test: ukuran batangan Antam 0,5–1.000 g, konversi per gram ↔ per batang, validasi input (tanggal tidak di masa depan, angka per gram masuk akal), pemilihan harga untuk portofolio: buyback terbaru ≤30 hari, jika tidak harga spot per gram dengan label, jika tidak "none"; selisih buyback vs spot). Kartu **"Antam gold bar (Logam Mulia / Pegadaian)"** di halaman emas: tautan resmi, form harga buyback per gram (+ harga jual 1 g opsional, tanggal, sumber), harga terakhir vs spot, nilai per ukuran batangan, daftar harga yang dicatat (riwayat hanya dari yang benar-benar dimasukkan). Disimpan lokal + sinkronisasi (koleksi `goldPrices`). Portofolio: emas fisik dinilai dengan harga buyback yang dicatat (≤30 hari) dan diberi keterangan; jika tidak ada, harga spot per gram dengan keterangan.
  - Status verifikasi live: tidak berlaku (tidak ada sumber otomatis); tautan resmi perlu dicek pemilik (tautan Pegadaian sengaja ke halaman utama karena alamat halaman harga tidak bisa diverifikasi dari cloud).
- [x] 8. Backtest sederhana
  - Rencana: mesin backtest murni dengan test (tanpa look-ahead), memakai `sma`/`rsi` dari `src/ai/indicators.ts`, data harian OHLC dari endpoint Fitur 4; halaman lazy.
  - Dibuat: `src/utils/backtest.ts` (+9 test: sinyal di close dieksekusi di open hari berikutnya — mengubah bar masa depan tidak mengubah keputusan sebelumnya, tidak ada order di bar terakhir; biaya beli/jual & pembulatan lot 100 (BEI) atau pecahan (crypto); stop-loss terisi di harga stop atau di open bila gap; take-profit; statistik: total & tahunan, volatilitas, max drawdown, jumlah transaksi, win rate, rata-rata transaksi, waktu di pasar; buy & hold dengan biaya & lot yang sama; uji paruh-awal (in-sample) vs paruh-akhir (out-of-sample) masing-masing mulai tanpa posisi; validasi aturan). Blok aturan: MA cross, harga vs MA, RSI di atas/bawah level, breakout N hari, stop-loss/take-profit %.
  - Halaman **`#/backtest`**: pilih aset (aset inti atau saham BEI mana pun), periode 1/2/3/5 tahun, aturan beli (semua harus benar) & jual (salah satu), biaya (default BEI 0,15% / 0,25%, lot 100; crypto/AS isi sendiri), modal; grafik ekuitas vs buy & hold, tabel statistik strategi / buy & hold / paruh 1 / paruh 2, peringatan overfitting (transaksi <10, kalah dari buy & hold, untung di paruh 1 tapi tidak di paruh 2, dll.), daftar transaksi, simpan strategi (lokal + sinkronisasi, koleksi `strategies`). Tulisan jelas: "Past results do not guarantee future results."
  - Keterbatasan: dividen tidak dihitung; harga Yahoo tidak selalu disesuaikan untuk semua aksi korporasi; satu posisi (long saja) per strategi.
  - Status verifikasi live: **belum** (riwayat harga diblokir jaringan cloud); logika diverifikasi dengan test.

## Butuh keputusan pemilik

- **Database sinkronisasi**: default Supabase (gratis). Perlu pemilik membuat proyek Supabase, menjalankan SQL di README, dan mengisi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_PASSPHRASE` di Secrets. Alternatif Firestore bisa ditambahkan nanti bila diinginkan.
- **Harga emas Antam/Pegadaian otomatis**: belum ada sumber resmi yang boleh diakses server. Pilihan: (a) tetap input manual (default, aman); (b) pemilik memeriksa syarat situs Logam Mulia/Pegadaian atau meminta izin/API resmi — bila ada, parser bisa ditambahkan; (c) layanan data berbayar yang berlisensi.
- **Penjadwal harian**: Cloud Scheduler (Google Cloud, gratis 3 job/bulan) atau cron-job.org (gratis) memanggil `POST /api/cron/daily` dengan `CRON_TOKEN` tiap hari kerja ±16:20 WIB. Tanpa itu, forward test server hanya tercatat bila ada yang membuka aplikasi setelah 16:15 WIB.

## Laporan akhir

- Semua 8 fitur selesai dan di-push ke branch `claude/ecstatic-fermat-nyv2f9` (PR https://github.com/Wafflesgh/AssetRadar/pull/1). `npm run lint && npm test && npm run build` lulus (190 test).
- Uji tampilan dengan Chromium headless (tanpa paket baru): 12 halaman (termasuk semua halaman baru) di 375px dan 1440px, mode gelap dan terang → **tidak ada scroll horizontal**; tangkapan layar diperiksa (screener, alerts, backtest, compare, emas).
- Build produksi: `/`, `/manifest.webmanifest`, `/sw.js` → 200; service worker tetap melewati stream SSE dan kini menangani push.
- Sumber data: semua host luar diblokir jaringan cloud → **tidak ada yang diverifikasi dengan data live**; aplikasi tetap terbuka tanpa crash dengan "Data unavailable".
- README ("Optional setup (stage 3)") dan CLAUDE.md diperbarui; kunci baru di `.env.example` tanpa nilai.
