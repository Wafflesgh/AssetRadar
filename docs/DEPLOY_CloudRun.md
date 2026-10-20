# Deploy AssetRadar ke Google Cloud Run (auto-update dari GitHub)

Tujuan: aplikasi punya **satu alamat tetap** (mis. `https://assetradar-xxxxx.asia-southeast2.run.app`). Setiap kali ada commit baru di cabang `main` GitHub — dari laptop atau dari Claude Cloud — Google otomatis membangun dan memasang versi baru **di alamat yang sama**. Aplikasi yang sudah di-install di HP ikut ter-update sendiri saat dibuka berikutnya. Tidak perlu lagi import ulang ke AI Studio.

Yang sudah disiapkan di repo: `Dockerfile` (cara membangun aplikasi) dan `.dockerignore`. Langkah di bawah cukup dilakukan **sekali**. Nama tombol di Google Cloud kadang sedikit berbeda dari yang tertulis di sini; cari yang paling mirip.

## 0. Persiapan

- Akun Google (boleh yang sama dengan AI Studio).
- Akun penagihan (billing) Google Cloud dengan kartu. Cloud Run punya kuota gratis bulanan; untuk pemakaian pribadi biayanya biasanya kecil, tetapi **pasang batas anggaran** (langkah 2) supaya aman.
- Kunci Finnhub (dan Gemini bila dipakai) siap untuk ditempel.

## 1. Buat / pilih proyek

1. Buka https://console.cloud.google.com
2. Klik pemilih proyek di kiri atas → **New Project** → nama `assetradar` → **Create**. (Kalau AI Studio sudah membuat proyek, boleh pakai yang itu.)
3. Pastikan proyek `assetradar` yang terpilih di kiri atas.

## 2. Hubungkan billing + pasang batas anggaran

1. Menu ☰ → **Billing** → hubungkan proyek ke akun billing Anda (ikuti petunjuknya).
2. Di Billing → **Budgets & alerts** → **Create budget**: pilih proyek `assetradar`, jumlah misalnya **Rp100.000 per bulan**, peringatan email di 50%, 90%, 100% → **Finish**.
   (Budget hanya mengirim email peringatan, tidak mematikan layanan otomatis.)

## 3. Buat layanan Cloud Run yang tersambung ke GitHub

1. Buka https://console.cloud.google.com/run → **Create service** (atau **Deploy container → Service**).
2. Pilih **Continuously deploy from a repository (source or function)** → klik **Set up with Cloud Build**.
   - Bila diminta mengaktifkan API (Cloud Build, Artifact Registry, Cloud Run) → klik **Enable**.
3. **Repository provider**: GitHub → **Authenticate** / login GitHub.
   - Saat diminta memasang aplikasi **Google Cloud Build** di GitHub: pilih **Only select repositories** → `Wafflesgh/AssetRadar` → **Install**.
   - Pilih repository `Wafflesgh/AssetRadar`, centang persetujuan → **Next**.
4. **Build configuration**:
   - Branch: `^main$`
   - Build type: **Dockerfile**
   - Source location: `/Dockerfile`
   - → **Save**.
5. **Service name**: `assetradar`. **Region**: `asia-southeast2 (Jakarta)`.
6. **Authentication**: pilih **Allow public access** (atau "Allow unauthenticated invocations") — supaya bisa dibuka dari HP tanpa login Google.
7. **Billing**: **Request-based** (bayar hanya saat aplikasi sedang dipakai).
8. **Service scaling / Autoscaling**: Minimum instances `0`, **Maximum instances `1`** (semua pengguna berbagi satu server: cache dan stream harga tetap konsisten, dan tidak membebani Yahoo).
9. Buka bagian **Containers, Volumes, Networking, Security** → tab **Settings**:
   - Container port: `8080`
   - Memory: `1 GiB`, CPU: `1`
   - **Request timeout: `3600`** detik (stream harga & berita memakai koneksi panjang).
10. Tab **Variables & Secrets** → bagian **Secrets exposed as environment variables** → **Reference a secret**:
    - Name: `FINNHUB_API_KEY` → Secret: **Create new secret** → nama `FINNHUB_API_KEY`, tempel nilai kunci → **Create secret** → Version: `latest` → **Done**.
    - (Opsional) ulangi untuk `GEMINI_API_KEY`.
    - Bila muncul peringatan bahwa service account belum punya akses ke secret → klik **Grant**.
    - Jangan isi kunci di kolom "Environment variables" biasa, dan jangan pernah menaruh kunci di GitHub.
11. Klik **Create**. Build pertama butuh ±5–10 menit (progres terlihat di Cloud Build → **History**).

## 4. Cek hasilnya

1. Di halaman layanan `assetradar`, salin **URL** di bagian atas (berakhiran `.run.app`). **Alamat ini tetap sama selamanya.**
2. Buka URL itu. Di header harus muncul **"Live (streaming)"**, dan harga bergerak.
3. Pasang di HP **dari URL ini**:
   - Android (Chrome): menu ⋮ → **Install app** (atau tombol "Install app" di Settings aplikasi).
   - iPhone (Safari): tombol **Share** → **Add to Home Screen**.
4. Hapus ikon aplikasi lama (versi AI Studio) dari HP supaya tidak tertukar.

## 5. Cara update setelah ini

- Cukup commit & push ke `main` (saya yang melakukannya saat mengerjakan fitur, dari laptop atau Claude Cloud). Google otomatis membangun versi baru ±5–10 menit kemudian, di alamat yang sama.
- Aplikasi di HP: tutup lalu buka lagi → versi baru dipakai (kadang perlu buka-tutup dua kali).
- Lihat status build: Cloud Build → **History** (hijau = berhasil). Kalau build gagal, versi lama tetap jalan.

## 6. Kalau versi baru bermasalah (rollback)

- Cloud Run → `assetradar` → tab **Revisions** → pilih revisi sebelumnya → **Manage traffic** → 100% ke revisi itu → **Save**. Aplikasi langsung kembali ke versi lama.
- Lalu minta saya memperbaiki (lewat `git revert`, tanpa force-push).

## 7. Penting

- **Jangan klik Push/Sync dari AI Studio lagi.** Sekarang setiap commit di `main` langsung dipasang ke aplikasi online, jadi kode lama dari AI Studio akan langsung tayang. App lama di AI Studio boleh dibiarkan atau dihapus.
- Ingin alamat sendiri (mis. `assetradar.namaanda.com`)? Bisa ditambahkan nanti lewat Cloud Run → **Manage custom domains**.
