# Prompt untuk Claude Cloud — AssetRadar tahap 3

> Cara pakai: buka **claude.ai/code**, pilih repo **Wafflesgh/AssetRadar** (branch `main`), pastikan environment cloud punya akses internet penuh (lihat bagian 1), lalu kirim pesan singkat ini:
>
> **"Jalankan semua instruksi di docs/PROMPT_Cloud_Tahap3.md dari awal sampai akhir."**
>
> Kalau sesi terputus, buka sesi baru di repo yang sama dan kirim:
>
> **"Lanjutkan docs/PROMPT_Cloud_Tahap3.md dari fitur pertama yang belum dicentang di docs/PROGRESS_Tahap3.md, di branch claude/tahap3-features."**

---

Kamu adalah Claude Code yang berjalan di **cloud**, di salinan repo AssetRadar dari GitHub. Pemilik (Dilan) tidak memantau terus, jadi bekerjalah mandiri sampai selesai, dengan aturan di bawah. Balas dan tulis laporan untuk pemilik dalam **Bahasa Indonesia sederhana**; kode dan UI tetap **Bahasa Inggris**.

## 0. Baca dulu

1. `CLAUDE.md` — aturan wajib, arsitektur, status proyek.
2. `docs/PROMPT_Fitur_Lanjutan_3.md` — **spesifikasi lengkap 8 fitur** yang harus dikerjakan: (1) sinkronisasi antar perangkat + uji nyata AI di server, (2) alert harga & notifikasi HP, (3) screener saham BEI, (4) bandingkan saham, (5) portofolio lanjutan, (6) ringkasan pagi, (7) harga emas Antam/Pegadaian, (8) backtest sederhana. Ikuti semua isinya, **kecuali bagian Git, kunci, dan pengecekan browser**, yang diganti oleh aturan cloud di file ini.
3. `docs/PROGRESS_Tahap2.md` — hasil tahap sebelumnya (contoh format catatan).
4. `docs/PROGRESS_Tahap3.md` — catatan kemajuan tahap ini. Buat bila belum ada. Kalau sudah ada fitur yang dicentang selesai (sesi sebelumnya terputus), **lanjutkan dari fitur berikutnya** di branch yang sama, jangan mulai ulang.

## 1. Cek lingkungan cloud (wajib sebelum menulis kode)

- `node -v` harus ≥ 22. `npm install` (`.npmrc` sudah mengatur `legacy-peer-deps`).
- `npm run lint && npm test && npm run build` harus lulus di kondisi awal. Kalau tidak, catat dan perbaiki dulu.
- Cek akses internet (cukup status HTTP, mis. `curl -s -o /dev/null -w "%{http_code}" <url>`):
  - `https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=1d&interval=1d`
  - `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/BBCA.JK?symbol=BBCA.JK&type=annualNetIncome&period1=1600000000&period2=1900000000`
  - `https://indodax.com/api/summaries`
  - `https://news.google.com/rss/search?q=IHSG&hl=id&gl=ID&ceid=ID:id`
  - `https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json` (header `User-Agent: AssetRadar personal research app (non-commercial)`)
  - `https://api.telegram.org` (cukup terjangkau; tanpa token tidak dipakai)
  - `https://www.logammulia.com` dan `https://www.pegadaian.co.id` (untuk Fitur 7 — cek juga `robots.txt` dan syarat penggunaannya)
- Tulis hasilnya di `docs/PROGRESS_Tahap3.md`. Kalau sumber yang dibutuhkan sebuah fitur **terblokir oleh jaringan cloud**, tetap tulis kodenya dengan penanganan "Data unavailable" dan test berbasis contoh respons kecil (fixture) yang disimpan di repo. Tandai fitur itu **"belum diverifikasi dengan data live"**. **Jangan pernah** mengganti data live dengan angka contoh di aplikasi; fixture hanya untuk test.

## 2. Kunci dan layanan luar di cloud

- Di cloud **tidak ada file `.env`** dan tidak ada kunci (Finnhub, Gemini, database, VAPID, Telegram, cron). Jangan meminta, membuat akun, atau memasang kunci sungguhan.
- Setiap fitur yang memakai kunci dibuat **lengkap** (kode server, UI, test, langkah pemasangan di README) **dan** harus berjalan dengan baik **tanpa kunci** (versi terbatas yang dijelaskan di UI, mis. sinkronisasi → tetap lokal; web push → notifikasi di browser saat aplikasi terbuka; Telegram → hanya tampil di aplikasi).
- Semua nama kunci baru dicatat di `.env.example` **tanpa nilai**, dan daftar lengkap "kunci apa, untuk apa, diisi di mana" ditulis di laporan akhir.
- Pemilihan layanan database (Fitur 1): tulis perbandingan singkat (batas gratis, cara pasang) dan pilih default, tetapi jangan membuat akun. Catat di "Butuh keputusan pemilik".
- Fitur 7: kalau tidak ada sumber resmi yang boleh diakses server, **jangan scraping**; pakai jalan cadangan di spesifikasi (tautan resmi + input manual) dan catat di "Butuh keputusan pemilik".

## 3. Aturan Git di cloud (menggantikan aturan Git di file spesifikasi)

- **Jangan push ke `main`.** Kerjakan semuanya di **satu branch** `claude/tahap3-features` dan **satu pull request** ke `main`.
- Buat PR sejak fitur pertama selesai, lalu terus perbarui. Judul: `AssetRadar stage 3: sync, alerts, IDX screener, compare, portfolio analytics, morning brief, Antam gold, backtest`. Isi PR: daftar fitur dengan status, sumber data, keterbatasan, kunci opsional, dan cara mengujinya. Akhiri isi PR dengan baris atribusi yang berlaku.
- **Commit dan push ke branch setiap selesai satu fitur** (dan juga di tengah fitur besar), supaya pekerjaan aman kalau sesi terputus. Pesan commit berbahasa Inggris, diakhiri baris Co-Authored-By yang berlaku.
- Sebelum push, `git fetch` dan cek apakah `origin/main` berubah; kalau ya, gabungkan `main` ke branch (merge, bukan rebase paksa) dan pastikan test tetap lulus.
- Jangan force-push. Jangan menghapus branch. Jangan merge PR sendiri; pemilik yang merge.
- Jangan pernah menulis kunci ke kode atau commit `.env`.

## 4. Cara menguji tanpa browser

1. **Unit test** untuk semua logika baru (merge sinkronisasi, evaluasi alert, filter screener, normalisasi perbandingan, TWR/dividen/drawdown, penyusunan ringkasan, konversi emas, mesin backtest). Gunakan fixture respons nyata yang kecil.
2. **Uji server**: jalankan `npm run dev` di latar belakang, panggil endpoint baru dengan `curl` (termasuk kondisi tanpa kunci dan input salah). Pastikan bentuk JSON benar, error ditangani, dan cache bekerja.
3. **Uji build produksi**: `npm run build` lalu `NODE_ENV=production npm start`; halaman utama, `/manifest.webmanifest`, `/sw.js` mengembalikan HTTP 200; service worker tetap tidak meng-cache stream SSE.
4. Kalau ada browser headless (mis. Playwright sudah terpasang), pakai untuk cek 375px/1440px dan terang/gelap. Kalau tidak ada, **jangan memasang paket baru hanya untuk itu**; periksa kode tata letak dengan teliti (kelas responsif, tabel lebar dibungkus `overflow-x-auto`, tidak ada lebar tetap > 375px) dan tulis di laporan bahwa cek visual perlu dilakukan pemilik.

## 5. Urutan kerja

Ikuti urutan fitur 1 → 8 di `docs/PROMPT_Fitur_Lanjutan_3.md`. Untuk setiap fitur:

1. Tulis rencana singkat di `docs/PROGRESS_Tahap3.md`.
2. Kerjakan dan buat/ubah test.
3. `npm run lint && npm test && npm run build` lulus.
4. Uji server/build seperti bagian 4.
5. Centang fitur di `docs/PROGRESS_Tahap3.md` dengan ringkasan: apa yang dibuat, sumber data, keterbatasan, kunci opsional, status verifikasi live.
6. Commit dan push ke branch, perbarui isi PR.

Kalau sebuah fitur tidak bisa diselesaikan sepenuhnya (sumber data tidak ada, butuh kunci), selesaikan bagian yang bisa, tampilkan keterangan yang jujur di UI untuk sisanya, catat alasannya, lalu **lanjut ke fitur berikutnya**. Jangan berhenti.

## 6. Penutup

1. Perbarui `CLAUDE.md` (arsitektur, endpoint baru, kunci baru, status) dan `README.md` (fitur, sumber data, keterbatasan, langkah pemasangan kunci opsional).
2. Pastikan semua test lulus dan build sukses, push terakhir, PR siap direview.
3. Tulis **laporan akhir** di `docs/PROGRESS_Tahap3.md` dan sebagai pesan terakhir sesi, dalam Bahasa Indonesia sederhana:
   - fitur yang selesai dan cara mencobanya di aplikasi;
   - sumber data yang dipakai, mana yang sudah diverifikasi live dan mana yang belum (karena jaringan cloud);
   - apa yang tidak bisa dipenuhi dan kenapa;
   - daftar "Butuh keputusan pemilik";
   - **kunci/Secrets yang perlu diisi pemilik** (nama, untuk fitur apa, cara mendapatkannya, diisi di mana) — fitur tetap jalan tanpa kunci;
   - hal yang perlu dicek pemilik di HP/PC (tampilan 375px, mode terang/gelap, notifikasi, install PWA);
   - langkah berikutnya untuk pemilik: **review dan klik "Merge pull request" di GitHub**, lalu perbarui aplikasi online dengan cara pemilik sendiri (yang mengambil versi terbaru dari `main`). Jangan klik Push/Sync dari AI Studio.
