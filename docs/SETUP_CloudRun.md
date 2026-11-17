<!-- SETUP_CloudRun.md — Owner's step-by-step guide (Indonesian) to move AssetRadar from Vercel to Google Cloud Run. -->

# Pindah AssetRadar ke Google Cloud Run

Panduan ini untuk pemilik. Ikuti berurutan. **Vercel jangan dihapus dulu** sampai langkah 6 berhasil.

Yang sudah disiapkan di kode: `Dockerfile` (resep menjalankan aplikasi), `.dockerignore`, dan endpoint
`/api/cron/tick` yang di Cloud Run menunggu pekerjaannya selesai (Cloud Run hanya memberi CPU selama
permintaan berjalan).

## 0. Pengaman biaya (lakukan dulu)

Google Cloud **tidak punya batas tagihan otomatis**; yang ada hanya peringatan email. Jadi pakai tiga pengaman:

1. **Budget alert**: ☰ → Billing → Budgets & alerts → Create budget → nama `assetradar`, jumlah **Rp50.000**,
   hilangkan centang "include credits" (agar peringatan tetap datang walau masih dibayar kredit), biarkan 50/90/100%.
2. **Maksimal 1 instance** di Cloud Run (langkah 2) — aplikasi tidak bisa membengkak sendiri.
3. **Kartu dengan limit kecil** sebagai kartu utama (Billing → Payment method → Add → Make primary). Ini satu-satunya
   "batas keras": kalau tagihan melebihi limit kartu, pembayaran ditolak.

## 1. Nyalakan layanan

Di kotak pencarian atas Console, cari lalu klik **Enable** untuk: **Cloud Run Admin API**, **Cloud Build API**,
**Cloud Scheduler API**. Pastikan project di kiri atas adalah project Anda (bisa diganti namanya jadi `assetradar`).

## 2. Buat layanan Cloud Run dari GitHub

1. ☰ → **Cloud Run** → **Deploy container** / **Create service**.
2. Pilih **Continuously deploy from a repository (source or function)** → **Set up with Cloud Build**.
3. Hubungkan GitHub (login & izinkan) → pilih repo **Wafflesgh/AssetRadar** → branch `^main$` →
   Build type **Dockerfile** (lokasi `/Dockerfile`) → Save.
4. Isi:
   - Service name: `assetradar`
   - Region: **asia-southeast1 (Singapore)**
   - Authentication: **Allow public access** (aplikasi punya login sendiri untuk data pribadi)
   - Billing: **Request-based**
   - Autoscaling: minimum **0**, maksimum **1**
5. Buka **Containers, Volumes, Networking, Security** → tab **Settings**: Memory **1 GiB**, CPU **1**,
   Request timeout **600** detik.
6. Tab **Variables & Secrets** → **Add variable** untuk tiap nama di bawah. **Ketik nilainya sendiri**
   (salin dari Vercel → Project → Settings → Environment Variables). Jangan kirim nilainya ke siapa pun, termasuk Claude.

   `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (atau `SUPABASE_SERVICE_ROLE_KEY`), `SYNC_PASSPHRASE`,
   `SYNC_SESSION_SECRET`, `CRON_TOKEN`, `GEMINI_API_KEY`, `BPS_API_KEY`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — isi hanya yang ada di Vercel.

7. Klik **Create**. Build pertama ±5–10 menit. Setelah selesai, di atas muncul alamat seperti
   `https://assetradar-xxxxx.asia-southeast1.run.app`.

## 3. Cek aplikasinya

- Buka `https://<alamat>/api/health` → harus muncul `"host":"cloudRun","serverless":true`.
- Buka `https://<alamat>/` → AssetRadar tampil. Login sinkron di Settings dengan passphrase yang sama.

## 4. Jadwal tiap jam (Cloud Scheduler)

1. ☰ → **Cloud Scheduler** → **Create job**.
2. Name `assetradar-tick`, Region `asia-southeast1`, Frequency `5 * * * *`, Timezone **Asia/Jakarta**.
3. Target type **HTTP**, URL `https://<alamat>/api/cron/tick`, Method **POST**.
4. Headers: tambah `Authorization` = `Bearer ` lalu nilai `CRON_TOKEN` Anda (ada spasi setelah Bearer).
5. Buka **Configure optional settings**: Attempt deadline **10m**, Max retry attempts **0**. Create.
6. Klik **Force run** sekali → status harus **Success** (bisa 1–2 menit).

Paket gratis Cloud Scheduler: 3 job per akun per bulan, jadi satu job ini gratis.

## 5. Matikan jadwal lama

- **Supabase** → SQL Editor → jalankan: `select cron.unschedule('assetradar-tick');`
  (kalau tidak dimatikan, Supabase terus memanggil Vercel).
- **GitHub** → repo → Settings → Secrets and variables → Actions → ubah `APP_URL` menjadi alamat Cloud Run.

## 6. Setelah 1–2 hari berjalan baik

- Cek Cloud Scheduler: riwayat job sukses tiap jam.
- Cek Billing → Reports: biaya (sebelum kredit) seharusnya sangat kecil.
- Kalau semua baik, Vercel boleh dibiarkan atau dihapus (Vercel → Project → Settings → Delete).

## Cadangan harian (opsional)

Fitur mati sampai `GCS_BACKUP_BUCKET` diisi. Tidak perlu memasukkan kunci layanan ke aplikasi.

1. Buat bucket Cloud Storage di **asia-southeast1**, pilih **uniform bucket-level access** dan aktifkan **public access prevention**. Cadangan berisi data pribadi dan langganan push; jangan dibagikan publik.
2. Tambahkan dua aturan lifecycle **Delete object**: awalan `backups/daily/` dengan umur **35 hari**, dan awalan `backups/weekly/` dengan umur **120 hari**. Periksa juga pengaturan soft delete karena salinan yang masih dipertahankan dapat menambah biaya.
3. Pada izin bucket itu saja, beri service account yang dipakai Cloud Run peran **Storage Object Creator**. Jangan berikan izin untuk seluruh project.
4. Tambahkan variabel Cloud Run `GCS_BACKUP_BUCKET` berisi nama bucket, tanpa `gs://`. Cadangan dicoba setelah 02:00 WIB ketika tick masih punya waktu; setiap Minggu dibuat juga salinan mingguan.
5. Untuk memeriksa pemulihan, unduh satu file memakai akun pemilik yang punya akses baca, lalu jalankan dengan Node yang mendukung TypeScript seperti tes proyek: `node scripts/restore-backup.mjs <file.json.gz>`. Skrip memeriksa checksum dan memulihkan ke memori saja. Output hanya jumlah kunci dan OK/mismatch; tidak menulis ke Supabase.

Upload tidak menimpa file yang sudah ada. Jika upload sebagian berhasil atau penyimpanan penanda gagal, percobaan ulang pada tanggal sama dapat menghasilkan HTTP 412. Jangan menghapus cadangan otomatis: minta Claude memeriksa file yang sudah ada dan statusnya. Hari berikutnya memakai nama baru.
Cadangan dibaca bertahap, bukan snapshot transaksi serentak; perubahan saat pencadangan bisa berasal dari waktu berbeda. Checksum mendeteksi kerusakan isi, bukan menjamin konsistensi antarcatatan atau keaslian file. Uji pemulihan berkala dan simpan hasil unduhan di tempat pribadi.

## Kalau ada masalah

- Build gagal: Cloud Build → History → klik build merah → kirim **pesan error-nya saja** ke Claude (bukan nilai secrets).
- Halaman putih / error: Cloud Run → assetradar → **Logs**.
