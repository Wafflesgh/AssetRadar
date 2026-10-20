# Prompt untuk Claude Cloud — AssetRadar tahap 4

> Cara pakai: buka **claude.ai/code**, pilih repo **Wafflesgh/AssetRadar** (branch `main`), pastikan environment cloud punya akses internet penuh, lalu kirim:
>
> **"Jalankan semua instruksi di docs/PROMPT_Cloud_Tahap4.md dari awal sampai akhir."**
>
> Kalau sesi terputus, buka sesi baru di repo yang sama dan kirim:
>
> **"Lanjutkan docs/PROMPT_Cloud_Tahap4.md dari fase pertama yang belum dicentang di docs/PROGRESS_Tahap4.md, di branch claude/tahap4-sentiment."**

---

Kamu adalah Claude Code yang berjalan di **cloud**, di salinan repo AssetRadar dari GitHub. Pemilik (Dilan) tidak memantau terus, jadi bekerjalah mandiri sampai selesai. Balas dan tulis laporan untuk pemilik dalam **Bahasa Indonesia sederhana**; kode tetap **Bahasa Inggris**.

## 0. Baca dulu

1. `CLAUDE.md` — aturan wajib, arsitektur, status.
2. `docs/PROMPT_Fitur_Lanjutan_4.md` — **rencana lengkap** (sentimen multi-horizon dengan 3 pilar jurnal, proyeksi teknikal, Binance, dua bahasa, makro Indonesia diperluas, infrastruktur data, fase 0–8). Ikuti semua isinya, termasuk **catatan & koreksi jurnal di bagian 1** (PDF jurnal tidak ada di repo; rangkuman itu sudah dicek terhadap PDF-nya), **kecuali bagian Git, kunci, dan pengecekan browser** yang diganti aturan di file ini.
3. `docs/PROGRESS_Tahap2.md` (contoh format) dan `docs/PROGRESS_Tahap4.md` (buat bila belum ada). Kalau sudah ada fase yang dicentang, **lanjutkan dari fase berikutnya** di branch yang sama.
4. Cek apakah ada pull request tahap 3 (`claude/tahap3-features`) yang belum di-merge. **Jangan mengubah branch itu.** Mulai dari `main` terbaru dan tulis di laporan bahwa mungkin ada konflik yang perlu dibereskan saat salah satu PR di-merge (perubahan dua bahasa menyentuh hampir semua komponen).

## 1. Cek lingkungan cloud (wajib sebelum menulis kode)

- `node -v` ≥ 22, `npm install` (`.npmrc` sudah `legacy-peer-deps`), `npm run lint && npm test && npm run build` lulus di kondisi awal.
- Kerjakan **Fase 0** di rencana: cek semua sumber (Yahoo spark & quoteSummary dengan cookie+crumb, SEC, Binance (`data-api.binance.vision`, `api.binance.com` + cadangannya, WebSocket `data-stream.binance.vision`, `fapi.binance.com`; baca `exchangeInfo.rateLimits` dan header `X-MBX-USED-WEIGHT-1M`), alternative.me, FRED, World Bank, bi.go.id, BPS, Badan Pangan, DJPPR). Catat status HTTP, contoh data, dan tanggal data terbaru di `docs/PROGRESS_Tahap4.md`.
- Jaringan cloud bisa berbeda dari laptop pemilik (mis. Binance membalas 451 dari IP AS). Sumber yang terblokir **dari cloud**: tetap tulis kodenya lengkap dengan deteksi blokir + pesan jujur di UI, test dengan fixture kecil (respons nyata yang disimpan di repo, hanya untuk test), dan tandai "belum diverifikasi live — perlu dicek pemilik di laptop". **Jangan pernah** menampilkan fixture sebagai data di aplikasi.

## 2. Kunci di cloud

- Tidak ada `.env` di cloud. Jangan membuat akun atau memasang kunci sungguhan.
- Fitur yang memakai kunci (`BPS_API_KEY`, `GEMINI_API_KEY` untuk terjemahan/ringkasan) dibuat lengkap **dan** jalan tanpa kunci (lihat rencana). Nama kunci baru dicatat di `.env.example` tanpa nilai, dan di laporan akhir: nama, fungsi, cara mendapatkan, diisi di mana.

## 3. Aturan Git di cloud

- **Jangan push ke `main`.** Satu branch `claude/tahap4-sentiment`, satu pull request ke `main`.
- Buat PR sejak fase pertama selesai, terus perbarui. Judul: `AssetRadar stage 4: multi-horizon sentiment, technical ranges, Binance, English/Indonesian, wider ID macro`. Isi PR: status per fase, sumber data (terverifikasi/terblokir), keterbatasan, kunci opsional, cara menguji. Akhiri isi PR dengan baris atribusi yang berlaku.
- Commit & push ke branch **setiap selesai satu fase** (dan di tengah fase besar). Pesan commit bahasa Inggris, diakhiri baris Co-Authored-By yang berlaku.
- Sebelum push: `git fetch`; bila `origin/main` berubah, merge `main` ke branch (bukan rebase paksa) dan pastikan test tetap lulus.
- Jangan force-push, jangan hapus branch, jangan merge PR sendiri.

## 4. Cara menguji tanpa browser

1. **Unit test** untuk semua logika baru: percentile/desil/demean industri, 3 pilar, regresi nilai wajar hibrida, sinyal Abarbanell & Bushee, SUE, bobot horizon & pembagian ulang bobot, berita per horizon (half-life), kisaran empiris + kalibrasi, ATR/pivot/level, kalkulator posisi, IC & hit rate point-in-time (uji khusus **tanpa look-ahead**: data setelah tanggal skor tidak boleh mengubah skor), cadence, parser Binance & makro baru, i18n (paritas kunci en/id, placeholder, fallback).
2. **Uji server**: `npm run dev` di latar belakang, panggil endpoint baru dengan `curl` (termasuk `lang=id`, simbol salah, sumber gagal). Pastikan JSON benar, error ditangani, cache dan progres pemindaian bekerja.
3. **Uji build produksi**: `npm run build`, `NODE_ENV=production npm start`, halaman utama / `manifest.webmanifest` / `sw.js` HTTP 200, stream SSE tidak di-cache service worker.
4. Kalau ada browser headless yang sudah terpasang, cek 375px/1440px, terang/gelap, EN/ID. Kalau tidak ada, **jangan memasang paket baru hanya untuk itu**; periksa kode tata letak dengan teliti dan tulis bahwa cek visual perlu dilakukan pemilik.

## 5. Urutan kerja

Ikuti **Fase 0 → 8** di `docs/PROMPT_Fitur_Lanjutan_4.md`. Untuk setiap fase: rencana singkat di `PROGRESS_Tahap4.md` → kerjakan + test → lint/test/build lulus → uji server/build → centang fase dengan ringkasan (apa yang dibuat, sumber, keterbatasan, status verifikasi live) → commit + push + perbarui PR.

Kalau ada keputusan yang biasanya ditanyakan ke pemilik (layanan luar, paket baru yang besar, sumber yang syaratnya meragukan), pilih jalan paling aman, catat di "Butuh keputusan pemilik", lalu lanjut. Kalau satu bagian benar-benar tidak bisa (sumber tidak ada), selesaikan yang bisa, tampilkan keterangan jujur di UI, catat alasannya, dan **lanjut** — jangan berhenti.

## 6. Penutup

1. Perbarui `CLAUDE.md` (arsitektur, endpoint, aturan dua bahasa, status) dan `README.md` (fitur, sumber & keterbatasan, kunci opsional, catatan jurnal dan koreksinya).
2. Semua test lulus, build sukses, push terakhir, PR siap direview.
3. **Laporan akhir** di `docs/PROGRESS_Tahap4.md` dan sebagai pesan terakhir sesi, dalam Bahasa Indonesia sederhana:
   - apa yang selesai dan cara mencobanya (halaman, tombol, perintah Terminal);
   - contoh nyata (bila sumber bisa diakses dari cloud): skor Short/Medium/Long + kisaran 1 minggu untuk BBCA, BTCUSDT, dan IHSG, beserta hasil kalibrasinya;
   - hasil validasi: pilar/horizon mana yang terbukti di data historis dan mana yang belum;
   - sumber data yang dipakai, mana yang terverifikasi live dan mana yang terblokir dari cloud;
   - apa yang tidak bisa dipenuhi dan kenapa;
   - "Butuh keputusan pemilik" dan kunci yang perlu diisi;
   - hal yang perlu dicek pemilik di HP/PC (375px, terang/gelap, EN/ID, halaman Binance);
   - langkah berikutnya: **review dan klik "Merge pull request" di GitHub**, lalu perbarui aplikasi online dengan cara pemilik sendiri (yang mengambil versi terbaru dari `main`). Jangan klik Push/Sync dari AI Studio.
