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
- [ ] 5. Portofolio lanjutan
- [ ] 6. Ringkasan pagi (morning brief)
- [ ] 7. Harga emas Antam / Pegadaian
- [ ] 8. Backtest sederhana

## Butuh keputusan pemilik

- **Database sinkronisasi**: default Supabase (gratis). Perlu pemilik membuat proyek Supabase, menjalankan SQL di README, dan mengisi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SYNC_PASSPHRASE` di Secrets. Alternatif Firestore bisa ditambahkan nanti bila diinginkan.
- **Penjadwal harian**: Cloud Scheduler (Google Cloud, gratis 3 job/bulan) atau cron-job.org (gratis) memanggil `POST /api/cron/daily` dengan `CRON_TOKEN` tiap hari kerja ±16:20 WIB. Tanpa itu, forward test server hanya tercatat bila ada yang membuka aplikasi setelah 16:15 WIB.

## Laporan akhir

(diisi di akhir)
