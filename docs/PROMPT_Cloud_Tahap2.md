# Prompt untuk Claude Cloud — AssetRadar tahap 2

> Cara pakai: buka claude.ai/code, pilih repo **Wafflesgh/AssetRadar** (branch `main`), pastikan environment cloud punya akses internet penuh (lihat bagian 1), lalu kirim pesan singkat ini:
>
> **"Jalankan semua instruksi di docs/PROMPT_Cloud_Tahap2.md dari awal sampai akhir."**

---

Kamu adalah Claude Code yang berjalan di **cloud**, di salinan repo AssetRadar dari GitHub. Pemilik (Dilan) tidak memantau terus, jadi bekerjalah mandiri sampai selesai, dengan aturan di bawah. Balas dan tulis laporan untuk pemilik dalam **Bahasa Indonesia sederhana**; kode dan UI tetap **Bahasa Inggris**.

## 0. Baca dulu

1. `CLAUDE.md` — aturan wajib, arsitektur, status proyek.
2. `docs/PROMPT_Fitur_Lanjutan_2.md` — **spesifikasi lengkap 9 fitur** yang harus dikerjakan (PWA, IHSG + seluruh saham BEI, search bar, portofolio, uji nyata AI Advisor, kalender emiten IDX, makro Indonesia, laporan keuangan + rasio, harga ±5 detik lewat push dari server). Ikuti semua isinya, **kecuali bagian Git dan pengecekan browser**, yang diganti oleh aturan cloud di file ini.
3. `docs/PROGRESS_Tahap2.md` — catatan kemajuan. Kalau sudah ada fitur yang dicentang selesai (sesi sebelumnya terputus), **lanjutkan dari fitur berikutnya** di branch yang sama, jangan mulai ulang.

## 1. Cek lingkungan cloud (wajib sebelum menulis kode)

- `node -v` harus ≥ 22. `npm install` (`.npmrc` sudah mengatur `legacy-peer-deps`).
- `npm run lint && npm test && npm run build` harus lulus di kondisi awal. Kalau tidak, catat dan perbaiki dulu.
- Cek akses internet ke sumber data (cukup status HTTP, mis. `curl -s -o /dev/null -w "%{http_code}" <url>`):
  - `https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=1d&interval=1d`
  - `https://indodax.com/api/summaries`
  - `https://api.coingecko.com/api/v3/ping`
  - `https://api.gold-api.com/price/XAU`
  - `https://news.google.com/rss/search?q=IHSG&hl=id&gl=ID&ceid=ID:id`
  - `https://fred.stlouisfed.org/graph/fredgraph.csv?id=IRSTCI01IDM156N`
  - `https://api.worldbank.org/v2/country/IDN/indicator/FP.CPI.TOTL.ZG?format=json`
  - `https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json` (perlu header `User-Agent` berisi nama aplikasi + email kontak)
  - `https://finnhub.io/api/v1/quote?symbol=AAPL` (tanpa kunci akan membalas 401; itu tanda domainnya terjangkau. Pakai kunci hanya jika `FINNHUB_API_KEY` tersedia di environment)
- Tulis hasilnya di `docs/PROGRESS_Tahap2.md`. Kalau sumber yang dibutuhkan sebuah fitur **terblokir oleh jaringan cloud**, tetap tulis kodenya dengan penanganan "Data unavailable" dan test berbasis contoh respons (fixture) yang disimpan di repo. Tandai fitur itu **"belum diverifikasi dengan data live"** di catatan kemajuan dan di laporan akhir. **Jangan pernah** mengganti data live dengan angka contoh di aplikasi. Fixture hanya untuk test.

## 2. Aturan Git di cloud (menggantikan aturan Git di file spesifikasi)

- **Jangan push ke `main`.** Kerjakan semuanya di **satu branch** (mis. `claude/tahap2-features`) dan **satu pull request** ke `main`.
- Buat PR sejak fitur pertama selesai, lalu terus perbarui. Judul: `AssetRadar stage 2: PWA, all IDX stocks, search, portfolio, forward test, IDX calendar, Indonesia macro, financial statements, faster streaming prices`. Isi PR: daftar fitur dengan status, sumber data, keterbatasan, dan cara mengujinya. Akhiri isi PR dengan baris atribusi yang berlaku.
- **Commit dan push ke branch setiap selesai satu fitur** (dan juga di tengah fitur besar), supaya pekerjaan aman kalau sesi terputus. Pesan commit berbahasa Inggris, diakhiri baris Co-Authored-By yang berlaku.
- Jangan force-push. Jangan menghapus branch. Jangan merge PR sendiri; pemilik yang merge.
- Jangan pernah menulis kunci API ke kode atau commit `.env`. Kunci baru opsional (mis. `BPS_API_KEY`) hanya dicatat di `.env.example` tanpa nilai.

## 3. Cara menguji tanpa browser

Cloud mungkin tidak punya browser. Untuk setiap fitur:

1. **Unit test** untuk semua logika baru (perhitungan portofolio, forward test, turunan semester/TTM/rasio, parser sumber data, router, perintah Terminal). Gunakan fixture respons nyata yang kecil.
2. **Uji server**: jalankan `npm run dev` di latar belakang, lalu panggil endpoint baru dengan `curl`. Pastikan bentuk JSON benar, error ditangani, dan cache bekerja.
3. **Uji build produksi**: `npm run build` lalu `NODE_ENV=production npm start`. Cek `/manifest.webmanifest`, `/sw.js`, ikon, dan halaman utama mengembalikan HTTP 200.
4. Kalau ada browser headless (mis. Playwright sudah terpasang), pakai untuk cek 375px/1440px dan terang/gelap. Kalau tidak ada, **jangan memasang paket baru hanya untuk itu**. Periksa kode tata letak dengan teliti (kelas responsif, tidak ada lebar tetap yang melebihi 375px) dan tulis di laporan bahwa cek visual perlu dilakukan pemilik.

## 4. Urutan kerja

Ikuti urutan fitur 1 → 9 di `docs/PROMPT_Fitur_Lanjutan_2.md`. Untuk setiap fitur:

1. Tulis rencana singkat di `docs/PROGRESS_Tahap2.md`.
2. Kerjakan dan buat/ubah test.
3. `npm run lint && npm test && npm run build` lulus.
4. Uji server/build seperti bagian 3.
5. Centang fitur di `docs/PROGRESS_Tahap2.md` dengan ringkasan: apa yang dibuat, sumber data, keterbatasan, status verifikasi live.
6. Commit dan push ke branch, perbarui isi PR.

Kalau ada keputusan yang biasanya ditanyakan ke pemilik (mis. memakai layanan database luar untuk forward test), **jangan pasang layanan luar atau kunci baru**. Pilih jalan yang paling aman (penyimpanan di perangkat), catat pilihan lain di bagian "Butuh keputusan pemilik" di catatan kemajuan, lalu lanjutkan.

Kalau sebuah fitur benar-benar tidak bisa diselesaikan (sumber data tidak ada), selesaikan bagian yang bisa, tampilkan "Not available from free sources" di UI untuk sisanya, catat alasannya, lalu **lanjut ke fitur berikutnya**. Jangan berhenti.

## 5. Penutup

1. Perbarui `CLAUDE.md` (arsitektur, endpoint baru, status) dan `README.md` (fitur, sumber data, keterbatasan, cara memperbarui daftar emiten BEI, kunci opsional).
2. Pastikan semua test lulus dan build sukses, push terakhir, PR siap direview.
3. Tulis **laporan akhir** di `docs/PROGRESS_Tahap2.md` dan sebagai pesan terakhir sesi, dalam Bahasa Indonesia sederhana:
   - fitur yang selesai dan cara mencobanya di aplikasi;
   - sumber data yang dipakai, mana yang sudah diverifikasi live dan mana yang belum (karena jaringan cloud);
   - apa yang tidak bisa dipenuhi dan kenapa (mis. laporan kuartalan 5 tahun atau jadwal tertentu yang tidak ada sumber gratisnya);
   - daftar "Butuh keputusan pemilik";
   - hal yang perlu dicek pemilik di HP/PC (tampilan 375px, mode terang/gelap, install PWA);
   - langkah berikutnya untuk pemilik: **review dan Merge PR di GitHub → di Google AI Studio import ulang dari GitHub sebagai app baru → Publish**. Jangan klik Push/Sync dari AI Studio.
