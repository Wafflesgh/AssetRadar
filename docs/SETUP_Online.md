# Memasang fitur online AssetRadar (sinkronisasi, notifikasi HP, jadwal harian, Telegram)

Semua fitur tetap jalan **tanpa** langkah di bawah (versi lokal: data hanya di perangkat, notifikasi hanya saat aplikasi terbuka, uji nyata AI hanya tercatat saat aplikasi dibuka). Langkah ini menyalakan versi lengkapnya. Kerjakan sekali; nama tombol bisa sedikit berbeda dari yang tertulis.

**Aturan keamanan:** nilai kunci hanya disalin ke `.env` di laptop, ke **Secrets** di Google AI Studio, dan ke **Secrets** repo GitHub. Jangan pernah menempelkannya di chat, kode, atau file lain.

## 0. Kunci yang sudah dibuat otomatis

Skrip `node scripts/generate-secrets.mjs` sudah mengisi `.env` di laptop dengan:

| Nama | Untuk apa |
|---|---|
| `CRON_TOKEN` | kata sandi untuk jadwal harian (langkah 3) |
| `SYNC_PASSPHRASE` | kata sandi login sinkronisasi — **Anda ketik di setiap HP/PC** (bentuknya `xxxx-xxxx-xxxx`) |
| `SYNC_SESSION_SECRET` | penanda sesi login (cukup disalin) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notifikasi HP (web push) |

Buka file `D:\Asset Radar\assetradar\.env` dengan Notepad untuk melihat nilainya. Kalau ingin kata sandi sinkronisasi buatan sendiri, ganti nilai `SYNC_PASSPHRASE` (minimal 8 karakter).

## 1. Database gratis (Supabase) — untuk sinkronisasi, notifikasi HP, dan catatan uji nyata

1. Buka https://supabase.com → **Start your project** → login (bisa dengan GitHub).
2. **New project**: nama `assetradar`, buat password database (simpan sendiri, tidak dipakai aplikasi), region **Southeast Asia (Singapore)** → **Create new project**. Tunggu ±2 menit.
3. Menu kiri **SQL Editor** → **New query** → tempel isi file `supabase/schema.sql` dari repo → **Run**. Harus muncul "Success".
4. Menu **Project Settings** (ikon gerigi) → **API** (atau **Data API**):
   - **Project URL** → ini `SUPABASE_URL` (bentuknya `https://xxxx.supabase.co`).
   - Di bagian **Project API keys**, kunci **service_role** (klik *Reveal*) → ini `SUPABASE_SERVICE_ROLE_KEY`. **Jangan** pakai kunci `anon`.
5. Tempel keduanya ke `.env` di laptop (baris `SUPABASE_URL=` dan `SUPABASE_SERVICE_ROLE_KEY=`).

Catatan: proyek gratis Supabase dijeda bila 7 hari tidak dipakai. Jadwal harian (langkah 3) memanggil aplikasi tiap hari sehingga database tetap aktif.

## 2. Isi Secrets di Google AI Studio

Di app AssetRadar di AI Studio → panel **Secrets** (ikon kunci) → tambahkan satu per satu (nama persis seperti di kiri, nilai dari `.env`):

| Nama secret | Nilai dari |
|---|---|
| `SUPABASE_URL` | langkah 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | langkah 1 |
| `SYNC_PASSPHRASE` | `.env` |
| `SYNC_SESSION_SECRET` | `.env` |
| `CRON_TOKEN` | `.env` |
| `VAPID_PUBLIC_KEY` | `.env` |
| `VAPID_PRIVATE_KEY` | `.env` |
| `VAPID_SUBJECT` | `.env` (boleh diganti `mailto:email-anda`) |
| `FINNHUB_API_KEY` | `.env` (sudah ada) |
| `APP_URL` | alamat aplikasi yang sudah dipublish (lihat langkah 4) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | opsional, langkah 6 |
| `GEMINI_API_KEY`, `BPS_API_KEY` | opsional |

Lalu **Publish** ulang (aplikasi harus dijalankan ulang agar membaca Secrets baru).

## 3. Cek dari aplikasi yang sudah online

Buka aplikasi online → **Settings** → **Server diagnostics** → **Run diagnostics**:

- Tabel sumber data: mana yang **OK** dan mana yang **Blocked here** dari server Google (mis. Binance bila server ada di AS). Fitur yang terdampak tetap jalan dengan pesan jujur.
- Bagian **Optional features on this server**: setelah langkah 2, *Database*, *Sync*, *Phone notifications* dan *Daily scheduler* harus bercentang hijau. Kalau masih silang, nama secret yang kurang ditampilkan di situ.

## 4. Jadwal harian otomatis (GitHub Actions, gratis)

Repo sudah berisi `.github/workflows/daily-jobs.yml`, yang memanggil aplikasi pukul 07:35 WIB setiap hari (ringkasan pagi) dan 16:20 WIB hari kerja (uji nyata AI).

1. Buka https://github.com/Wafflesgh/AssetRadar → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - `APP_URL` = alamat aplikasi online (contoh `https://xxxx.run.app`, tanpa `/` di akhir).
   - `CRON_TOKEN` = nilai yang **sama persis** dengan `CRON_TOKEN` di AI Studio.
2. Tab **Actions** → **AssetRadar daily jobs** → **Run workflow** untuk mencoba. Hijau = berhasil. Merah dengan "HTTP 401" = `CRON_TOKEN` di GitHub berbeda dengan di AI Studio.
3. Kalau alamat aplikasi berubah (mis. import ulang sebagai app baru), perbarui `APP_URL` di sini dan di AI Studio.

Alternatif tanpa GitHub: cron-job.org → buat job `POST {APP_URL}/api/cron/daily` dengan header `Authorization: Bearer {CRON_TOKEN}`, jam 00:35 dan 09:20 UTC.

## 5. Sinkronisasi & notifikasi di HP/PC

1. Di setiap perangkat: buka aplikasi online → **Settings** → **Sync between devices** → ketik `SYNC_PASSPHRASE` → **Log in & sync**.
2. Notifikasi HP: halaman **Alerts** → **Enable server push on this device** → **Send test notification**.
   - iPhone/iPad: pasang aplikasi dulu (Share → **Add to Home Screen**, iOS 16.4+), buka dari layar utama, baru aktifkan notifikasi.

## 6. Ringkasan pagi ke Telegram (opsional)

1. Di Telegram cari **@BotFather** → `/newbot` → ikuti petunjuk → salin token → secret `TELEGRAM_BOT_TOKEN`.
2. Kirim pesan apa saja ke bot baru Anda, lalu cari **@userinfobot** → ia membalas angka "Id" → secret `TELEGRAM_CHAT_ID`.
3. Publish ulang. Uji: halaman **Morning Brief** akan menunjukkan "Telegram is on"; ringkasan terkirim pukul 07:35 WIB.

## Kalau ada yang tidak jalan

- Lihat **Settings → Server diagnostics** terlebih dulu — biasanya terlihat secret mana yang kurang atau sumber mana yang diblokir.
- Login sinkronisasi gagal "Invalid passphrase": nilai `SYNC_PASSPHRASE` di AI Studio berbeda dengan yang diketik.
- Mengganti `SYNC_PASSPHRASE` akan me-logout semua perangkat (data tetap aman di database).
