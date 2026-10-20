# Prompt — AssetRadar fitur lanjutan (tahap 3)

> Cara pakai:
> - **Di laptop** (Claude Code desktop, folder `D:\Asset Radar\assetradar`): kirim pesan **"Jalankan semua instruksi di docs/PROMPT_Fitur_Lanjutan_3.md dari awal sampai akhir."**
> - **Di Claude Cloud**: pakai `docs/PROMPT_Cloud_Tahap3.md` (aturan branch + pull request, tanpa kunci, uji tanpa browser).

---

Lanjutkan pengembangan AssetRadar. Baca dulu `CLAUDE.md` (aturan wajib, arsitektur, status), `README.md` dan `docs/PROGRESS_Tahap2.md`. Kerjakan 8 fitur di bawah **berurutan**, satu per satu. Untuk setiap fitur: buat rencana singkat, kerjakan, tulis/ubah test, jalankan `npm run lint && npm test && npm run build` sampai lulus, cek di browser (375px dan 1440px, mode terang dan gelap), lalu commit dan push sebelum lanjut ke fitur berikutnya.

Catat kemajuan di `docs/PROGRESS_Tahap3.md` (buat bila belum ada, formatnya seperti `PROGRESS_Tahap2.md`) setiap selesai satu fitur: centang, ringkasan, sumber data, keterbatasan, status verifikasi live. Kalau sesi terputus atau konteks habis, lanjutkan dari fitur pertama yang belum dicentang — jangan mulai ulang. Kerjakan mandiri sampai selesai; keputusan yang biasanya ditanyakan ke saya (layanan luar, kunci baru, biaya) dicatat di bagian "Butuh keputusan pemilik" dengan pilihan paling aman sebagai default, lalu lanjut.

## Aturan yang wajib diikuti (ringkasan dari CLAUDE.md)

- Semua teks UI, nama aset, komentar kode dan keterangan di awal setiap file dalam **Bahasa Inggris**. Setiap file baru diawali komentar keterangan singkat. Judul berita tidak diterjemahkan. Balas saya dalam Bahasa Indonesia yang sederhana.
- **Jangan pernah menampilkan angka contoh/dummy.** Sumber gagal → "Data unavailable" + "Try again"; satu angka tidak ada → "Not reported".
- Grafik TradingView hanya lewat widget resmi. Tidak boleh scraping yang melanggar syarat situs mana pun.
- Semua localStorage lewat helper `src/utils/storage.ts` (try/catch).
- HP 375px tanpa scroll horizontal; PC 1440px; terang dan gelap terbaca; hormati `prefers-reduced-motion`.
- Kunci/rahasia baru hanya lewat `.env` / Secrets AI Studio / Secret Manager, dicatat di `.env.example` **tanpa nilai**. Jangan pernah menampilkan, mencetak ke log, menyalin, mengirim ke browser, atau meng-commit nilainya. **Setiap fitur harus tetap jalan (versi terbatas) tanpa kunci.**
- Analisis, screener, portofolio, backtest, ringkasan, AI = **edukasi/informasi, bukan saran investasi personal**. Disclaimer tetap ada. Tidak ada janji atau proyeksi keuntungan. Screener dan alert = filter/pengingat yang dibuat pengguna sendiri, bukan sinyal beli/jual.
- Git: sebelum push, `git fetch` lalu cek apakah ada commit di `origin/main` yang bukan dari sini (AI Studio pernah menimpa main). Jangan pernah force-push; perbaikan lewat `git revert`. Akhiri pesan commit dengan baris Co-Authored-By yang berlaku.
- Node test "strip-only": jangan pakai parameter properties di constructor TypeScript; impor tipe pakai `import type`.
- Server berjalan di Cloud Run yang **tidak punya penyimpanan permanen** dan bisa tidur saat tidak ada pengunjung — data pengguna yang harus awet disimpan di database luar (Fitur 1), bukan di disk atau memori server.
- Logika murni (perhitungan, filter, aturan) ditaruh di `src/utils/` atau `src/ai/` dengan test; komponen besar di-lazy-load.

## Fakta yang sudah diketahui (20 Okt 2026) — verifikasi ulang sebelum dipakai

- Data laporan keuangan per saham sudah ada: `GET /api/fundamentals/statements` (`src/utils/statements.ts`); saham IDX hanya dari Yahoo (±4 tahun tahunan, ±5 kuartal).
- Kalender dividen/earnings sudah ada: `GET /api/idx/calendar` (`src/utils/corporateCalendar.ts`).
- Harga live sudah lewat price stream SSE (`src/utils/priceStream.ts`, loop server tiap 1 dtk saat ada klien).
- Riwayat harian ±5 tahun per aset sudah dipakai AI Advisor (`dailyHistoryFor` di server.ts); indikator di `src/ai/technical.ts` dan `src/ai/indicators.ts`.
- Notifikasi web push butuh pasangan kunci VAPID dan paket `web-push`; di iPhone hanya jalan untuk PWA yang sudah di-install (iOS 16.4+).
- Pengiriman Telegram butuh bot token dari @BotFather dan chat id pemilik.

---

## Fitur 1 — Sinkronisasi antar perangkat + uji nyata AI di server

- Simpan **watchlist, portofolio, catatan forward test AI, profil risiko dan pengaturan** di database gratis supaya sama di HP dan PC. Pilih satu dan jelaskan alasannya (perbandingan singkat batas gratis): Supabase (Postgres) atau Firestore. Default yang disarankan: yang paling mudah dipasang dari Cloud Run dengan satu kunci server.
- Semua akses database **lewat server** (`/api/sync/*`); kunci database hanya di server. Aplikasi pribadi satu pemilik: login sederhana dengan **passphrase pemilik** (`SYNC_PASSPHRASE` di Secrets; server membandingkan hash, memberi token sesi bertanda tangan yang disimpan lewat `storage.ts`; batasi percobaan login).
- Sinkronisasi: data lokal tetap jadi cadangan (aplikasi tetap jalan offline/tanpa login). Gabung per item dengan `updatedAt` (yang terbaru menang; transaksi portofolio digabung per id, tidak ada yang hilang). Saat pertama login: gabungkan data lokal dan server, tampilkan ringkasan apa yang digabung.
- **Forward test di server**: catat snapshot verdict AI sekali sehari (setelah BEI tutup, ±16:15 WIB) walau aplikasi tidak dibuka. Karena Cloud Run bisa tidur, sediakan endpoint `POST /api/cron/daily` yang dilindungi `CRON_TOKEN` (untuk dipanggil Cloud Scheduler atau layanan cron gratis) **dan** cadangan: snapshot dibuat saat permintaan pertama hari itu bila belum ada. Penilaian hasil tetap memakai `src/ai/forwardTest.ts`.
- UI: kartu "Sync" di Settings (status, waktu sinkron terakhir, login/logout, tombol "Sync now"), indikator kecil di header bila sinkron gagal.
- Tanpa kunci database: semuanya tetap lokal seperti sekarang, kartu Sync menjelaskan cara mengaktifkan.
- Test: logika merge (konflik, hapus, item baru di dua sisi), token sesi, jadwal snapshot harian.
- Ini menjawab keputusan yang tertunda di `PROGRESS_Tahap2.md`; tulis langkah pemasangan (buat proyek DB, isi Secrets, jadwalkan cron) di README.

## Fitur 2 — Alert harga & notifikasi di HP

- Jenis alert: harga di atas/di bawah nilai tertentu, perubahan harian ≥ X%, ex-dividend / laporan keuangan besok untuk saham di watchlist/portofolio, berita baru untuk aset tertentu, dan peringatan geopolitik "high" (yang sudah ada).
- Buat/ubah/hapus alert dari halaman detail aset (tombol lonceng) dan halaman baru `#/alerts` (daftar, status aktif/terpicu, riwayat). Alert sekali-picu atau berulang (dengan jeda minimal, mis. 1 jam per alert).
- Pemeriksaan di **server** memakai harga dari price loop (tanpa permintaan Yahoo tambahan); alert disimpan di database Fitur 1. Kirim **web push** (`web-push`, kunci `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, subscription disimpan di DB) lewat service worker (`push` + `notificationclick` membuka `#/asset/<id>`).
- Tanpa kunci VAPID atau DB: alert disimpan lokal dan diperiksa di browser saat aplikasi terbuka (Notification API), jelaskan batasnya di UI.
- Petunjuk di UI untuk iPhone (harus di-install dulu), tombol "Send test notification", jam tenang opsional.
- Test: evaluasi alert (lintas harga, jeda, sekali-picu), pemilihan event kalender, throttle.

## Fitur 3 — Screener saham BEI

- Halaman `#/screener`: saring ±960 saham BEI berdasarkan sektor, papan, harga, % 1 hari/1 minggu, nilai transaksi, market cap, P/E, P/B, ROE, net margin, DER, dividend yield, Piotroski F-score, pertumbuhan laba YoY.
- Data fundamental: server memindai pelan seluruh universe (seperti pemindaian kalender: sedikit paralel + jeda, cache 24 jam, hanya bila ada penonton) memakai logika `statements.ts`; tampilkan progres pemindaian dan tanggal data tiap baris. Saham tanpa data → kolom "Not reported", tidak dibuang diam-diam.
- Preset (mis. "High ROE, low P/E", "Dividend payers", "Strong F-score"), simpan screener sendiri (lewat `storage.ts` / sync), urutkan kolom, unduh CSV, klik baris → detail saham.
- Tulis jelas: "screen = filter angka laporan, bukan rekomendasi".
- Test: logika filter & urut, penanganan nilai kosong, preset.

## Fitur 4 — Bandingkan saham/aset

- Halaman `#/compare?s=BBCA,BBRI,BMRI` (2–4 aset, pilih lewat pencarian): grafik kinerja dinormalkan (mulai = 100) dengan pilihan 1B/3B/1T/3T/5T, tabel harga & perubahan, dan untuk saham: rasio dan pos laporan keuangan utama berdampingan (pilihan tahunan/kuartalan).
- Mata uang berbeda: kinerja dalam % (tanpa konversi), angka laporan ditampilkan dalam mata uang aslinya dengan label.
- Tombol "Compare" di halaman detail dan di screener; perintah Terminal `CMP BBCA BBRI`.
- Test: normalisasi seri dengan tanggal libur berbeda per bursa, parser parameter URL.

## Fitur 5 — Portofolio lanjutan

- **Dividen**: catat dividen tunai yang diterima (manual), plus usulan otomatis dari riwayat dividen di kalender × jumlah saham yang dimiliki pada ex-date (pengguna mengonfirmasi dulu, tidak otomatis masuk).
- **Kinerja vs IHSG**: nilai portofolio harian dari riwayat harga, time-weighted return dibanding IHSG pada periode yang sama; grafik. Jelaskan metodenya di UI.
- **Risiko**: volatilitas tahunan, max drawdown, korelasi antar holding, porsi per kelas aset dibanding alokasi contoh profil risiko pengguna (`riskProfiles.ts`) — sebagai edukasi.
- **Kalender portofolio**: ex-date, pembayaran dividen dan jadwal laporan keuangan khusus saham yang dimiliki.
- Test: TWR dengan setoran/penarikan, dividen di ex-date, drawdown.

## Fitur 6 — Ringkasan pagi otomatis (morning brief)

- Halaman `#/brief` (juga panel Terminal `BRIEF`): ringkasan setiap pagi ±07:30 WIB — penutupan Wall Street & pasar Asia, IHSG kemarin, movers, kurs & emas, jadwal emiten hari ini (watchlist/portofolio diutamakan), rilis makro terbaru, 5 berita terpenting, status forward test AI.
- Dibuat di server dari data yang sudah ada; kata-kata dirapikan Gemini bila ada `GEMINI_API_KEY`, jika tidak berbasis aturan. Simpan ringkasan harian (DB Fitur 1, atau cache bila tanpa DB).
- Opsional kirim ke **Telegram** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) dan/atau web push Fitur 2, dipicu `POST /api/cron/daily` atau saat permintaan pertama hari itu. Tanpa kunci: hanya tampil di aplikasi.
- Isinya ringkasan suasana pasar, bukan sinyal beli/jual; disclaimer di bawahnya.
- Test: penyusunan ringkasan dari data contoh di test (bukan di UI), pemilihan berita, jadwal WIB.

## Fitur 7 — Harga emas Antam / Pegadaian

- Cari sumber **resmi** harga emas batangan (jual & buyback per gram, per ukuran) dari Logam Mulia (Antam) dan/atau Pegadaian. Periksa syarat penggunaan dan apakah server boleh mengaksesnya (robots.txt, syarat situs, ada API/feed resmi atau tidak).
- Kalau ada sumber yang boleh dipakai: tampilkan di halaman emas (kartu "Antam gold bar") dan di portofolio (nilai emas fisik memakai harga buyback), dengan tanggal pembaruan dan sumber; riwayat hanya dari snapshot yang benar-benar dikumpulkan server.
- Kalau tidak ada yang boleh dipakai: **jangan** scraping; tampilkan tautan resmi + input manual harga buyback untuk portofolio, dan catat di "Butuh keputusan pemilik".
- Test: parser (bila ada sumber), konversi ukuran, pemilihan harga buyback untuk portofolio.

## Fitur 8 — Uji strategi sendiri (backtest sederhana)

- Halaman `#/backtest`: pilih aset (inti atau saham BEI), periode (hingga ±5 tahun data harian), aturan masuk/keluar dari blok sederhana — moving average cross, harga vs MA, RSI di atas/bawah, breakout N hari, stop-loss / take-profit % — memakai indikator yang sudah ada (`technical.ts` / `indicators.ts`), tanpa look-ahead.
- Biaya transaksi bisa diubah (default BEI: beli 0,15%, jual 0,25%; crypto/US: isi sendiri), lot 100 untuk saham BEI.
- Hasil: grafik ekuitas vs buy & hold, total & tahunan return, volatilitas, max drawdown, win rate, jumlah transaksi, daftar transaksi. Peringatan overfitting dan uji paruh-akhir (in-sample vs out-of-sample) seperti AI Advisor.
- Simpan strategi (storage/sync). Tulis jelas: hasil masa lalu tidak menjamin hasil masa depan.
- Test: eksekusi sinyal di bar berikutnya (tanpa look-ahead), biaya & lot, stop-loss, statistik.

---

## Penutup

1. Perbarui `CLAUDE.md` (arsitektur, endpoint baru, kunci baru, aturan baru, status) dan `README.md` (fitur, sumber data & keterbatasan, langkah pemasangan DB / VAPID / Telegram / cron, kunci opsional baru di `.env.example`).
2. Uji menyeluruh di 375px dan 1440px, terang dan gelap, offline (PWA), tanpa scroll horizontal; pastikan semua fitur tetap jalan **tanpa** kunci baru.
3. `npm run lint && npm test && npm run build` lulus, `git fetch` + cek origin, commit, push.
4. Laporan akhir ke saya dalam Bahasa Indonesia sederhana: apa yang selesai, sumber data, apa yang tidak bisa dipenuhi dan kenapa, daftar "Butuh keputusan pemilik", kunci/Secrets apa saja yang perlu saya isi dan di mana, serta langkah update aplikasi yang sudah online.
