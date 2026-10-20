<!-- PANDUAN_Fitur_Terbaru.md — Short owner guide (Indonesian) to the features added on 20 Oct 2026: what each does, where to find it, and what is needed for it to run. -->

# Ringkasan fitur terbaru AssetRadar (20 Okt 2026)

Ringkas: apa fiturnya, di mana, dan apa yang perlu disiapkan agar jalan.

## Yang baru

| Fitur | Di mana | Perlu apa |
|---|---|---|
| **SBN Ritel** (ORI, SBR, Sukuk Ritel, Sukuk Tabungan, Sukuk Wakaf): kupon, tetap/mengambang, tenor, jatuh tempo, masa penawaran (Sedang dibuka / Segera / Selesai), minimum–maksimum, bisa dijual sebelum jatuh tempo atau tidak, daftar mitra distribusi (bank, sekuritas, aplikasi) | Halaman **ID Macro** (`#/macro`), paling atas | Tidak ada. Data dari halaman resmi DJPPR Kemenkeu, diperbarui 2× sehari. Seri lama tetap tercatat bila database aktif. |
| **Analisis AI harian**: setiap hari 16:15 WIB server memotret semua 147 aset (harga, perubahan 24 jam, sentimen pendek/menengah/panjang), memeriksa kualitas data, lalu Gemini menulis analisis dari fakta itu saja (EN + ID). Semua hari tersimpan dan bisa dipilih lagi. | Menu **Daily AI Analysis / Analisis AI Harian** (`#/analyst`) | Database (Supabase) agar tidak hilang saat server restart; jadwal GitHub Actions; `GEMINI_API_KEY` (di AI Studio sudah ada). |
| **Riwayat rekomendasi**: kapan sebuah aset pernah dinilai Bullish/Bearish (sentimen) atau "Favorable" (AI Advisor), untuk investor jangka pendek/menengah/panjang, harga saat itu, perubahan sejak itu, dan setelah horizonnya lewat: **Tepat / Meleset**. | Halaman setiap aset (bagian bawah) dan halaman **AI Advisor** (cari aset) | Sama dengan di atas. Hasil pertama: sentimen pendek ±2 minggu, AI Advisor 20 hari bursa ±1 bulan, menengah ±3 bulan, panjang ±1 tahun. |
| **Penilaian metode**: per metode (sentimen 3 horizon, AI Advisor 20 & 60 hari) — berapa tersimpan, berapa sudah dinilai, % tepat vs base rate, dan status "Hasil belum cukup / Lebih baik dari base rate / Perlu ditinjau". | Halaman Analisis AI Harian dan AI Advisor | Minimal 30 hasil per metode sebelum dinilai. |
| **Reaksi pasar di peringatan geopolitik** kini dihitung **sejak berita terbit** (bar 1 menit; juga 15 menit & 1 jam pertama). Pasar yang tutup sejak berita ditulis "tutup sejak berita". | Banner merah di semua halaman | Tidak ada. |
| **Data penuh sejak aset pertama ada**: IHSG sejak 1990, S&P 500 sejak 1927, BBCA sejak 2004, BTC/IDR (Indodax) sejak 2014. Compare & Backtest punya pilihan **10Y** dan **MAX**. | Compare, Backtest, analitik portofolio | Tidak ada. Model AI Advisor memakai 10 tahun terakhir (lebih dari itu terlalu berat untuk server dan pola pasarnya sudah lain). |
| **Perbaikan 2 error dari Argon**: FRED (data makro AS/OECD) kini selalu terjangkau; Gemini otomatis pindah ke model cadangan saat kuota habis (429). | Otomatis | `GEMINI_MODELS` opsional (urutan model cadangan). |
| **Kalkulator ukuran posisi dihapus** (sesuai permintaan). | — | — |

## Apakah data disimpan untuk dianalisis lagi?

- **Sebelumnya**: sebagian besar data hanya di memori server (cache) — hilang saat server restart. Yang tersimpan permanen hanya bila database aktif: uji nyata AI Advisor, ringkasan pagi, data sinkron, screener.
- **Sekarang** (dengan database aktif), tiap hari tersimpan:
  - `snap:<tanggal>` — foto harga + sentimen semua aset,
  - `sentcalls:<bulan>` — rekomendasi sentimen per horizon (untuk riwayat & penilaian),
  - `forward:<bulan>` — verdict AI Advisor (sudah ada sebelumnya),
  - `analysis:<tanggal>` — analisis harian (fakta, pemeriksaan data, narasi Gemini, catatan agen),
  - `sbn:series` — semua seri SBN ritel yang pernah terlihat.
- Data mentahnya bisa diambil untuk dianalisis ulang: `GET /api/analyst/export?from=2026-10-01&to=2026-10-31` (maksimal 31 hari per permintaan).

## Agar semuanya jalan (langkah pemilik)

Ikuti `docs/SETUP_Online.md`. Ringkasnya:

1. **Supabase**: buat proyek gratis → SQL Editor → jalankan `supabase/schema.sql` → salin *Project URL* dan kunci *service_role*.
2. **AI Studio → Secrets**: isi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan nilai dari `.env` (`SYNC_PASSPHRASE`, `SYNC_SESSION_SECRET`, `CRON_TOKEN`, `VAPID_*`, `FINNHUB_API_KEY`) → **Publish** ulang.
3. **GitHub → Settings → Secrets → Actions**: `APP_URL` (alamat aplikasi online) dan `CRON_TOKEN` (sama persis dengan di AI Studio) → tab Actions → **Run workflow** untuk mencoba.
4. (Opsional) **Telegram**: bot dari @BotFather → `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.

Cek hasilnya: aplikasi online → **Settings → Server diagnostics** (sumber data, fitur opsional, status Gemini & tugas harian) dan menu **Analisis AI Harian**.

## Jadwal otomatis

| Jam (WIB) | Apa yang berjalan |
|---|---|
| 07:35 setiap hari | Ringkasan pagi (+ Telegram/push bila diatur) |
| 16:20 setiap hari | Uji nyata AI Advisor (hari kerja) → analisis AI harian + penilaian rekomendasi yang jatuh tempo |

Tanpa GitHub Actions, tugas tetap berjalan pada permintaan pertama ke aplikasi setelah jamnya.

## Peran Gemini dan Argon

- **Gemini di server (otomatis, tiap hari)**: menulis analisis harian, ringkasan pagi, ringkasan AI Advisor, dan sentimen aset — hanya dari fakta yang dihitung aplikasi, tidak pernah menjanjikan keuntungan.
- **Argon di Google AI Studio (saat Anda membukanya)**: agen yang memeriksa data, membaca analisis & rekam jejak metode, menulis catatan ke analisis harian, dan menyusun usulan perbaikan. Perintah siap pakai: `docs/PROMPT_Argon.md`.
