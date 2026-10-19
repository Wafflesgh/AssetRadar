# AssetRadar — Spesifikasi Aplikasi untuk Google AI Studio (Build)

> Dokumen ini adalah panduan lengkap untuk membangun aplikasi **AssetRadar**. Ikuti semua bagian. Kerjakan **bertahap sesuai urutan Tahap di bagian 10**: selesaikan dan pastikan satu tahap berjalan sebelum lanjut ke tahap berikutnya. Jika ada keterbatasan platform yang membuat suatu instruksi tidak bisa dijalankan, pilih alternatif terdekat dan jelaskan singkat di chat.

---

## 1. Ringkasan

- **Nama aplikasi**: AssetRadar
- **Tagline**: "Pantau emas, saham, dan crypto dalam satu radar."
- **Jenis**: Web app responsif + PWA (bisa dipakai di PC dan dipasang di layar utama HP).
- **Tujuan**: memantau harga instrumen investasi secara real-time, melihat grafik dengan berbagai timeframe, dan mempelajari profil risiko investasi.
- **Bukan**: aplikasi jual-beli. Tidak ada login, tidak ada transaksi.
- **Bahasa antarmuka**: Bahasa Indonesia.
- **Pengguna**: pribadi (non-komersial).

## 2. Instrumen yang dipantau

| Kelompok | Aset | Mata uang tampilan |
|---|---|---|
| Crypto | BTC, ETH, SOL | Rupiah |
| Saham | IHSG (^JKSE) | Poin indeks |
| Emas | Spot XAU | USD/oz **dan** Rupiah per gram |
| Kurs | USD/IDR | Rupiah |

Daftar aset disimpan di satu file konfigurasi (`src/config/assets.ts`) supaya mudah ditambah, misalnya saham LQ45 (`BBCA.JK`, `BBRI.JK`).

## 3. Sumber data

Buat lapisan data terpisah per sumber (`src/services/`). Setiap sumber mengembalikan format yang sama:

```ts
type PriceTick = {
  symbol: string;          // "BTC/IDR", "^JKSE", "XAU/USD", "USD/IDR"
  group: "crypto" | "saham" | "emas" | "kurs";
  price: number;
  changePct24h?: number;
  currency: "IDR" | "USD" | "PTS";
  source: string;
  updatedAt: number;       // epoch ms
  status: "live" | "tertunda" | "error";
};
```

1. **Crypto — Indodax (live)**
   - Data awal: `https://indodax.com/api/ticker_all`
   - Live: WebSocket publik `wss://ws3.indodax.com/ws/` (format sesuai dokumentasi resmi repo GitHub `btcid/indodax-official-api-docs`, bagian Market Data WebSocket).
   - Auto-reconnect dengan exponential backoff (1s, 2s, 4s… maks 30s).
   - Jika WebSocket gagal, polling REST tiap 10 detik.
   - Putuskan koneksi saat tab tidak terlihat (`visibilitychange`), sambungkan lagi saat terlihat.

2. **IHSG dan kurs — Yahoo Finance**
   - Simbol `^JKSE` dan `IDR=X`.
   - Panggil dari **sisi server aplikasi** agar tidak terkena CORS. Cache 60 detik.
   - IHSG dipolling tiap 60 detik **hanya saat jam bursa** (Senin–Jumat 09:00–16:00 WIB, zona `Asia/Jakarta`). Di luar jam bursa tampilkan harga penutupan terakhir dengan label "Pasar tutup".
   - Status IHSG selalu "tertunda".

3. **Emas — API harga emas gratis**
   - Ambil spot XAU (USD per troy ounce) dari penyedia API emas gratis, dipanggil dari sisi server. Kunci API disimpan sebagai **secret**, tidak boleh ada di kode klien.
   - Cache 5 menit (hemat kuota gratis).
   - Konversi: `Rupiah per gram = (XAU_USD / 31.1034768) × USD_IDR`.

4. **Penanganan error**
   - Satu sumber gagal tidak boleh merusak halaman. Kartu terkait menampilkan "Data tidak tersedia" + tombol "Coba lagi".
   - Jangan pernah menampilkan angka palsu atau angka contoh sebagai harga asli.

## 4. Grafik

### 4.1 Grafik utama — widget resmi TradingView
- Script: `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js`
- Bungkus dalam komponen `TradingViewChart` (props: `symbol`, `interval`, `theme`). Bersihkan container dan muat ulang widget saat props berubah.
- Konfigurasi: `autosize: true`, `style: "1"` (candlestick), `timezone: "Asia/Jakarta"`, `locale: "id"`, `allow_symbol_change: false`, `hide_side_toolbar: false`, `withdateranges: true`.
- **Tombol timeframe** di atas grafik (selain pemilih bawaan widget):

  | Label | 1m | 5m | 15m | 30m | 1J | 4J | 1H | 1M |
  |---|---|---|---|---|---|---|---|---|
  | interval | 1 | 5 | 15 | 30 | 60 | 240 | D | W |

  Tombol aktif ditandai. Pilihan terakhir disimpan di `localStorage` (bungkus try/catch). Default: 15m.
- Simbol widget:

  | Aset | Simbol | Cadangan |
  |---|---|---|
  | BTC | `INDODAX:BTCIDR` | `BINANCE:BTCUSDT` |
  | ETH | `INDODAX:ETHIDR` | `BINANCE:ETHUSDT` |
  | SOL | `INDODAX:SOLIDR` | `BINANCE:SOLUSDT` |
  | Emas | `OANDA:XAUUSD` | — |
  | USD/IDR | `FX_IDC:USDIDR` | — |
  | IHSG | `IDX:COMPOSITE` | grafik cadangan (4.2) |

- **Atribusi TradingView harus tetap terlihat.** Jangan disembunyikan.
- **Dilarang** mengambil data dari endpoint tidak resmi atau scraping situs TradingView.

### 4.2 Grafik cadangan — lightweight-charts
- Dipakai jika widget tidak bisa menampilkan simbol (tidak tampil dalam 8 detik atau muncul pesan simbol tidak tersedia).
- Data candle dari Yahoo Finance (lewat sisi server) dengan interval yang sama dengan tombol timeframe.
- Tampilkan keterangan kecil: "Grafik alternatif, data tertunda."

### 4.3 Sparkline di kartu
- Grafik garis mini 24 jam memakai lightweight-charts (mode area, tanpa sumbu).

## 5. Halaman dan navigasi

Navigasi: **bottom navigation** di HP, **sidebar** di PC. Menu: Radar (beranda), Watchlist, Profil Risiko, Pengaturan.

1. **Radar (Dashboard)**
   - Header: logo + nama AssetRadar, indikator koneksi (hijau = live, kuning = menyambung ulang, abu-abu = tertunda).
   - Ringkasan atas: jumlah aset naik vs turun hari ini.
   - Bagian per kelompok (Crypto, Saham, Emas, Kurs) berisi kartu aset: nama, harga, % perubahan (hijau naik ▲, merah turun ▼), sparkline, waktu update ("diperbarui 5 detik lalu"), label status.
   - Harga **berkedip singkat** hijau/merah saat berubah.
   - Klik kartu → halaman Detail.

2. **Detail aset**
   - Harga besar, % perubahan, tertinggi/terendah 24 jam (jika tersedia).
   - Grafik TradingView besar (HP: tinggi ±60% layar) + tombol timeframe.
   - Untuk emas: tampilkan dua angka, USD/oz dan Rupiah/gram.
   - Tombol ☆ tambah ke Watchlist.

3. **Watchlist**
   - Daftar aset favorit, bisa diurutkan (drag) dan dihapus. Disimpan di `localStorage`.
   - Keadaan kosong: ajakan menambahkan aset dari Radar.

4. **Profil Risiko** (lihat bagian 6)

5. **Pengaturan**
   - Tema: Terang / Gelap / Ikuti sistem (ikut diterapkan ke widget grafik).
   - Timeframe default grafik.
   - Tentang aplikasi + disclaimer + sumber data.

## 6. Fitur Profil Risiko (edukasi)

**Ini materi edukasi, bukan rekomendasi investasi personal.**

### 6.1 Kuesioner (7 pertanyaan, skor 1–4)
1. Berapa usia Anda? (>55 / 41–55 / 26–40 / ≤25)
2. Berapa lama dana akan diinvestasikan? (<1 th / 1–3 th / 3–5 th / >5 th)
3. Apa tujuan utama Anda? (menjaga nilai / pendapatan rutin / pertumbuhan / pertumbuhan maksimal)
4. Seberapa berpengalaman Anda berinvestasi? (belum pernah / pemula / cukup / berpengalaman)
5. Apakah Anda sudah punya dana darurat? (belum / <3 bln pengeluaran / 3–6 bln / >6 bln)
6. Jika portofolio turun 20% dalam sebulan, Anda akan… (jual semua / jual sebagian / diam / tambah beli)
7. Berapa porsi penghasilan yang bisa diinvestasikan rutin? (<5% / 5–10% / 10–20% / >20%)

Tampilkan satu pertanyaan per layar dengan progress bar. Tombol "Lanjut" tidak aktif sebelum ada jawaban.

### 6.2 Penentuan profil
Skor total 7–13 = **Konservatif**, 14–20 = **Moderat**, 21–28 = **Agresif**. Simpan hasil di `localStorage`, bisa diulang.

### 6.3 Contoh alokasi (simpan di `src/config/riskProfiles.ts`)

| Instrumen | Risiko | Konservatif | Moderat | Agresif |
|---|---|---|---|---|
| Pasar uang / deposito | Rendah | 45% | 20% | 5% |
| SBN ritel / obligasi | Rendah–sedang | 30% | 25% | 10% |
| Emas | Sedang | 15% | 15% | 10% |
| Saham / reksa dana indeks | Tinggi | 10% | 35% | 55% |
| Crypto | Sangat tinggi | 0% | 5% | 20% |

### 6.4 Tampilan hasil
- **Disclaimer di paling atas hasil** (kotak kuning lembut):
  "Contoh alokasi ini bersifat umum dan edukatif, bukan rekomendasi investasi personal. Kinerja masa lalu tidak menjamin hasil masa depan. Pastikan produk investasi terdaftar/diawasi OJK atau Bappebti."
- Nama profil + deskripsi 2–3 kalimat (toleransi risiko, horizon waktu yang cocok).
- **Grafik donut** alokasi (pakai `recharts`).
- Daftar instrumen: penjelasan 1–2 kalimat, label risiko, dan tombol "Lihat harga" untuk emas, IHSG, crypto (menuju halaman Detail). Deposito dan SBN cukup keterangan.
- Tab **Bandingkan** ketiga profil berdampingan.
- **Simulator**: input modal awal (Rupiah, format ribuan otomatis) → nominal per instrumen sesuai persentase. **Tidak boleh** menampilkan proyeksi keuntungan.
- **Sesuaikan sendiri**: slider per instrumen; total harus 100%, tampilkan pesan error merah jika tidak dan nonaktifkan tombol simpan.

## 7. Desain visual

- **Konsep**: "radar" — bersih, modern, kesan teknologi finansial.
- **Warna** (gunakan sebagai token CSS, dukung mode gelap):

  | Token | Terang | Gelap |
  |---|---|---|
  | Latar | `#F7F9FC` | `#0B1220` |
  | Permukaan kartu | `#FFFFFF` | `#131C2E` |
  | Teks utama | `#0F172A` | `#E6EDF7` |
  | Teks sekunder | `#64748B` | `#94A3B8` |
  | Aksen (radar) | `#10B981` | `#34D399` |
  | Naik | `#16A34A` | `#22C55E` |
  | Turun | `#DC2626` | `#F87171` |
  | Emas | `#D4A017` | `#FACC15` |

- **Logo**: lingkaran radar sederhana dengan garis sapuan dan satu titik, warna aksen. Buat sebagai SVG, juga dipakai untuk ikon PWA (192px dan 512px) dan favicon.
- **Tipografi**: Inter (atau font sans-serif sistem). Angka harga memakai `font-variant-numeric: tabular-nums` agar tidak "goyang" saat berubah.
- **Format angka**: `Intl.NumberFormat("id-ID")` → `Rp1.234.567`; persen dengan 2 desimal → `+1,25%`.
- **Responsif**: HP 1 kolom; tablet 2 kolom; PC 3–4 kolom. Tidak boleh ada scroll horizontal di HP.
- Animasi halus dan singkat; hormati `prefers-reduced-motion`.

## 8. PWA

- `manifest.json`: name "AssetRadar", short_name "AssetRadar", theme_color `#0B1220`, background_color `#0B1220`, display `standalone`, ikon 192/512.
- Service worker: cache tampilan aplikasi; saat offline tampilkan harga terakhir yang tersimpan dengan label "Offline – data terakhir".

## 9. Teks wajib

- Footer setiap halaman: "Data hanya untuk informasi, bukan saran investasi. Grafik oleh TradingView."
- Halaman Tentang: sumber data (Indodax, Yahoo Finance, penyedia API emas, TradingView) dan keterangan bahwa data IHSG tertunda.

## 10. Tahapan pengerjaan

Kerjakan satu tahap, pastikan berjalan tanpa error, lalu lanjut.

1. **Tahap 1 — Kerangka & grafik**: struktur aplikasi, tema warna, navigasi, halaman Detail dengan `TradingViewChart` dan tombol timeframe untuk semua aset. Uji apakah `IDX:COMPOSITE` tampil; laporkan hasilnya di chat.
2. **Tahap 2 — Harga live**: layanan Indodax (WebSocket + fallback), Yahoo (IHSG & kurs), emas + konversi per gram; Dashboard Radar dengan kartu, sparkline, kedip harga, indikator koneksi.
3. **Tahap 3 — Grafik cadangan & Watchlist**: lightweight-charts untuk simbol yang gagal di widget; fitur Watchlist.
4. **Tahap 4 — Profil Risiko**: kuesioner, hasil, donut, perbandingan, simulator, slider, disclaimer.
5. **Tahap 5 — PWA & penyempurnaan**: manifest, ikon, service worker, mode offline, Pengaturan, halaman Tentang.

## 11. Kriteria selesai (cek sebelum menyatakan tahap selesai)

- [ ] Tidak ada error di console saat membuka setiap halaman.
- [ ] Tampilan rapi di lebar 375px (HP) dan 1440px (PC).
- [ ] Mode gelap dan terang sama-sama terbaca.
- [ ] Mengganti timeframe benar-benar mengubah grafik.
- [ ] Mematikan internet tidak membuat aplikasi crash.
- [ ] Tidak ada kunci API di kode klien.
- [ ] Disclaimer tampil di Profil Risiko dan footer.
