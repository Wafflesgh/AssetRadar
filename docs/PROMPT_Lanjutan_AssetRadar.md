# Prompt Lanjutan AssetRadar untuk Google AI Studio

Cara pakai:
- Kirim prompt **satu per satu, berurutan**, di kotak chat Build ("Make changes, add new features...").
- Tunggu Gemini selesai, cek hasilnya dengan daftar "Cek setelah selesai", baru kirim prompt berikutnya.
- Kalau ada error, kirim: `Perbaiki error berikut tanpa mengubah fitur lain: <tempel pesan error>`
- Kotak permintaan GOLD_API_KEY boleh ditutup (klik X); kunci itu tidak dibutuhkan.

---

## PROMPT 1 — Perbaikan teknis

```
Lakukan perbaikan teknis berikut tanpa mengubah tampilan dan fitur yang sudah berjalan:

1. server.ts: beri tipe eksplisit `let newsItems: MarketNewsItem[] = []` (impor tipenya dari src/config/assets.ts) agar `tsc --noEmit` bebas error.

2. Hemat request Indodax:
   - Di MarketDataManager, polling REST /api/market/indodax tiap 10 detik HANYA berjalan saat WebSocket tidak tersambung. Saat WebSocket tersambung kembali, hentikan polling REST.
   - Di server, cache sparkline Indodax (history_v2) terpisah selama 5 menit per pair, jangan diambil ulang setiap kali harga diambil.

3. Analisis AI (Gemini):
   - Pastikan nama model di getAssetIntelligence adalah model Gemini yang benar-benar tersedia saat ini di AI Studio (model "flash" terbaru yang valid). Jika ragu, pilih nama model yang kamu yakin valid dan tulis di chat model apa yang dipakai.
   - Jika respons pertama belum diperkaya AI (aiPowered = false), komponen AssetIntelligencePanel otomatis memuat ulang SEKALI setelah 8 detik untuk mengambil hasil AI dari cache server.
   - Catat error Gemini ke console server (console.warn) agar mudah dilacak, jangan ditelan diam-diam.

4. Akurasi nada berita (src/utils/sentiment.ts):
   - Cocokkan kata kunci sebagai kata utuh dengan regex batas kata (\b), bukan `includes`, agar "high" tidak cocok dengan "highlight".
   - Hapus "inflasi", "risk", dan "high" dari daftar kata kunci karena maknanya tidak selalu positif/negatif.
   - Perbarui test sentiment.test.ts agar sesuai.

5. Emas: tambahkan keterangan kecil di kartu dan halaman detail emas: "Harga: spot XAU. Perubahan 24j & grafik mini: kontrak futures emas (GC=F)."

6. Navigasi dengan alamat (hash routing) tanpa library tambahan:
   - #/radar, #/aset/<id> (contoh #/aset/btc, #/aset/ihsg), #/watchlist, #/risiko, #/pengaturan.
   - Refresh browser tetap di halaman yang sama; tombol Back browser berfungsi; link bisa dibagikan.

7. Ganti "name" di package.json menjadi "assetradar" dan perbarui README.md (Bahasa Indonesia): fitur, sumber data, cara menjalankan lokal.

Setelah selesai, jalankan pengecekan tipe dan build, lalu laporkan ringkas apa yang diubah.
```

**Cek setelah selesai:** buka detail BTC lalu tekan refresh (harus tetap di detail BTC); label "Diperkaya AI" muncul di panel sentimen dalam ±10 detik; angka error merah di pojok kanan bawah berkurang.

---

## PROMPT 2 — Tahap 3: grafik cadangan IHSG

```
Kerjakan Tahap 3 sesuai spesifikasi AssetRadar (bagian 4.2):

- Tambah endpoint server GET /api/market/history?symbol=<yahooSymbol>&interval=<interval> yang mengambil candle OHLC dari Yahoo Finance. Petakan interval: 1→1m (range 1d), 5→5m (5d), 15→15m (5d), 30→30m (1mo), 60→60m (1mo), 240→ pakai 60m lalu gabungkan per 4 jam (3mo), D→1d (1y), W→1wk (5y). Cache sesuai interval (1 menit untuk intraday, 1 jam untuk harian/mingguan).
- Buat komponen FallbackChart memakai lightweight-charts (candlestick + volume), mengikuti tema terang/gelap dan tombol timeframe yang sama dengan TradingViewChart.
- Di AssetDetailView: untuk aset dengan usesBackupChartFallback (IHSG), tampilkan widget TradingView lebih dulu; jika dalam 8 detik widget tidak memuat grafik atau menampilkan pesan simbol tidak tersedia, ganti otomatis ke FallbackChart. Sediakan juga tombol manual "Pakai grafik alternatif" / "Coba grafik TradingView".
- Tampilkan keterangan kecil di bawah FallbackChart: "Grafik alternatif, data tertunda (Yahoo Finance)."
- Watchlist yang sudah ada jangan diubah.
```

**Cek setelah selesai:** buka IHSG, ganti timeframe 15m → 1H → 1M, grafiknya ikut berubah.

---

## PROMPT 3 — Tahap 4: Profil Risiko lengkap

```
Kerjakan Tahap 4 sesuai spesifikasi AssetRadar bagian 6 (Profil Risiko), ganti tabel sementara yang ada sekarang:

- Pindahkan data alokasi ke src/config/riskProfiles.ts.
- Kuesioner 7 pertanyaan (6.1), satu pertanyaan per layar dengan progress bar; tombol "Lanjut" nonaktif sebelum ada jawaban; tombol "Kembali" tersedia.
- Skor 7–13 Konservatif, 14–20 Moderat, 21–28 Agresif. Simpan hasil di localStorage (try/catch), ada tombol "Ulangi kuesioner".
- Halaman hasil: disclaimer kuning di paling atas (teks 6.4), nama dan deskripsi profil, grafik donut alokasi (tambahkan paket recharts), daftar instrumen dengan penjelasan, label risiko, dan tombol "Lihat harga" ke halaman detail untuk emas, IHSG, crypto.
- Tab "Bandingkan" ketiga profil berdampingan (di HP bertumpuk).
- Simulator modal awal (format ribuan otomatis) → nominal Rupiah per instrumen. JANGAN tampilkan proyeksi keuntungan.
- Mode "Sesuaikan sendiri": slider per instrumen, tampilkan total; jika total ≠ 100% tampilkan pesan error merah dan nonaktifkan tombol simpan.
```

**Cek setelah selesai:** isi kuesioner sampai akhir; coba simulator Rp10.000.000; geser slider sampai total bukan 100% (tombol simpan harus mati).

---

## PROMPT 4 — Tahap 5: PWA & penyempurnaan

```
Kerjakan Tahap 5 sesuai spesifikasi AssetRadar bagian 8:

- public/manifest.webmanifest: name "AssetRadar", short_name "AssetRadar", start_url "/", display "standalone", theme_color dan background_color #0B1220, ikon PNG 192 dan 512 (buat dari logo radar SVG yang sudah ada) plus ikon maskable.
- Tautkan manifest dan apple-touch-icon di index.html.
- Service worker sederhana tanpa library berat: cache aset statis aplikasi; JANGAN cache respons /api/* kecuali sebagai cadangan offline.
- Simpan snapshot harga terakhir di localStorage. Saat offline, tampilkan harga terakhir dengan label "Offline – data terakhir" dan indikator koneksi abu-abu.
- Halaman Pengaturan: bagian "Tentang" berisi sumber data (Indodax, Yahoo Finance, gold-api.com, Google News, TradingView), keterangan data IHSG tertunda, dan disclaimer.
```

**Cek setelah selesai:** buka link aplikasi di Chrome HP → menu ⋮ → "Tambahkan ke layar utama"; aplikasi terbuka tanpa bilah alamat.

---

## PROMPT 5 — Mode Terminal (bagian 1: tata letak, ticker, baris perintah)

```
Tambahkan mode baru "Terminal" yang terinspirasi tampilan Bloomberg Terminal, sebagai halaman terpisah #/terminal (menu baru di sidebar dan bottom navigation). Halaman lain tidak berubah.

Gaya visual khusus mode Terminal:
- Latar hitam pekat #05070A, panel #0B0F14, garis panel tipis #1F2937, teks utama #E5E7EB.
- Aksen oranye-amber #F59E0B untuk judul panel dan perintah; hijau #22C55E naik; merah #EF4444 turun.
- Font monospace (JetBrains Mono yang sudah dimuat), ukuran kecil dan padat, angka tabular-nums. Sudut panel hampir siku (radius 2px).

Komponen:
1. Ticker tape berjalan di paling atas: semua aset (simbol, harga, % perubahan berwarna), bergerak pelan, berhenti saat disentuh/hover. Hormati prefers-reduced-motion (tanpa animasi, cukup tampil statis).
2. Baris perintah di bawah ticker, fokus otomatis dengan tombol "/" :
   - Ketik kode aset lalu Enter (contoh: BTC, ETH, SOL, IHSG, EMAS/XAU, USD) → panel utama menampilkan aset itu.
   - Perintah: "<KODE> GP" = grafik, "<KODE> N" = berita, "HELP" = daftar perintah, "RADAR" = kembali ke Radar.
   - Saran otomatis (autocomplete) saat mengetik; pesan error jelas jika perintah tidak dikenal.
3. Tata letak grid multi-panel (PC: 3 kolom; tablet: 2; HP: 1 kolom bertumpuk):
   - Panel "MONITOR": tabel semua aset (kode, harga, perubahan, tertinggi/terendah 24j, waktu update, status), baris berkedip saat harga berubah, klik baris = pilih aset.
   - Panel "CHART": TradingViewChart tema gelap untuk aset terpilih + tombol timeframe (pakai komponen dan logika fallback yang sudah ada).
   - Panel "SENTIMEN": skor dan faktor penggerak aset terpilih (pakai data /api/market/intelligence yang sudah ada).
   - Panel "BERITA": berita aset terpilih dengan jam (WIB), sumber, dan nada.
4. Jam WIB berjalan dan status pasar BEI (Buka/Tutup) di pojok kanan atas.
5. Pintasan keyboard: angka 1–6 memilih aset sesuai urutan di MONITOR; Esc mengosongkan baris perintah.

Semua data berasal dari sumber yang sudah ada di aplikasi. Jangan membuat angka contoh/dummy.
```

**Cek setelah selesai:** tekan "/" lalu ketik `ETH GP` + Enter; tekan angka 1–6; buka di HP (panel harus bertumpuk rapi, tanpa scroll ke samping).

---

## PROMPT 6 — Mode Terminal (bagian 2: heatmap, kalender, korelasi, umpan berita)

```
Lengkapi mode Terminal dengan panel tambahan berikut (tetap gaya Terminal yang sama):

1. Panel "HEATMAP": kotak per aset yang dipantau, warna hijau/merah dengan intensitas sesuai % perubahan 24 jam, menampilkan kode dan persen. Klik = pilih aset.

2. Panel "KALENDER EKONOMI": gunakan widget resmi TradingView Economic Calendar (embed-widget-events.js), tema gelap, locale "id", filter negara Indonesia dan Amerika Serikat, tingkat kepentingan sedang dan tinggi. Atribusi TradingView tetap terlihat.

3. Panel "KORELASI 30H": endpoint server baru /api/market/correlation yang mengambil harga penutupan harian 30 hari terakhir dari Yahoo Finance untuk BTC-USD, ETH-USD, SOL-USD, ^JKSE, GC=F, IDR=X, menghitung return harian lalu korelasi Pearson antar-aset. Cache 6 jam. Tampilkan sebagai matriks kecil berwarna (-1 merah, 0 netral, +1 hijau) dengan angka 2 desimal dan keterangan "Korelasi bukan hubungan sebab-akibat."

4. Panel "UMPAN BERITA": gabungan berita terbaru dari semua aset (endpoint baru /api/market/news-feed yang memakai fungsi RSS Google News yang sudah ada, cache 10 menit), diurutkan dari yang terbaru, setiap berita diberi label kode aset, jam WIB, sumber, dan nada. Maksimal 20 berita.

5. Perintah baru di baris perintah: "HM" = fokus ke heatmap, "ECO" = kalender ekonomi, "CORR" = korelasi, "TOP" = umpan berita. Perbarui daftar di "HELP".

6. Pengaturan: tambah opsi "Buka aplikasi di mode Terminal" (disimpan di localStorage).

Pastikan semua panel tetap tampil wajar jika salah satu sumber data gagal (tampilkan "Data tidak tersedia" + tombol "Coba lagi"), dan tidak ada angka contoh/dummy.
```

**Cek setelah selesai:** ketik `CORR`, `ECO`, `HM`, `TOP` di baris perintah; semua panel terisi data nyata.

---

Setelah semua prompt selesai, download ZIP terbaru ke folder ini lagi, nanti saya review ulang.
