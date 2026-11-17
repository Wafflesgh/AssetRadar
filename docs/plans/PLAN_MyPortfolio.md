# Rencana: "My Portfolio" + Rotasi Sektor 1 bulan

Disusun Claude, 17 Nov 2026. Rancangan teknis: `TRD.md` bagian T8–T11.

## Yang sudah ada di `#/portfolio` (tidak dibuat ulang)
- Catat beli/jual semua aset (saham BEI per lot, crypto, emas gram, saham AS/dunia, kurs).
- Posisi dengan harga live: harga rata-rata, modal, nilai, untung/rugi belum & sudah terealisasi, total Rupiah.
- Pembagian per kelas aset vs Profil Risiko; skor bukti / F-score per posisi.
- Analitik: kinerja vs IHSG (TWR), volatilitas, penurunan terdalam, korelasi antar-aset,
  dividen (catat + saran), kalender ex-date/laporan; ekspor/impor JSON (portofolio saja).

## Usulan isi section "My Portfolio" (satu halaman, 5 tab)
| Tab | Isi | Status |
|---|---|---|
| **Ringkasan** | Nilai total, untung/rugi hari ini & total, kinerja vs IHSG, 3 posisi naik/turun terbesar hari ini, peringatan singkat (konsentrasi tinggi, data basi) | Sebagian ada → disusun ulang |
| **Posisi** | Tabel posisi + transaksi (yang sekarang) | Ada |
| **Konsentrasi** (T8) | Porsi per aset, sektor, mata uang, negara, kelas aset; skor konsentrasi (HHI) dengan bahasa sederhana; "aset terbesar = X% portofolio"; bagian yang tidak terklasifikasi ditampilkan jujur | Baru |
| **Jurnal** (T9) | Catatan alasan beli/jual per transaksi atau per aset + snapshot otomatis saat dicatat (harga, sentimen 3 horizon, skor bukti); ditinjau ulang 1 minggu / 1 bulan / 3 bulan kemudian: "harga sejak catatan ±%" | Baru |
| **Pendapatan & Risiko** | Dividen, kalender, volatilitas, drawdown, korelasi (yang sekarang) | Ada → dipindah ke tab |

Aturan yang tetap berlaku: bukan saran investasi, tanpa target alokasi atau perintah beli/jual,
tanpa janji untung, disclaimer tetap tampil, semua teks EN + ID.

## Rotasi Sektor: perubahan 1 bulan (T10)
Masalah lama: tidak ada riwayat harian murah untuk ±950 saham. **Solusi:** sejak 23 Okt 2026 tugas
trace BEI sudah menyimpan harga penutupan harian setiap saham (`idxtrace:<SYMBOL>`). Cukup diringkas
menjadi satu tabel kecil harga penutupan 30 hari bursa terakhir, lalu 1M dihitung dari sana.
Data cukup untuk 1 bulan mulai ±24 Nov 2026 (21 hari bursa sejak 23 Okt). Sebelum itu tampil
"riwayat belum cukup", tidak pernah angka karangan.

## Urutan kerja (Codex mengerjakan, Claude review)
1. **T8 Konsentrasi**: murni hitungan di browser, risiko rendah.
2. **T10 Sektor 1 bulan**: kecil di server + logika murni yang sudah ada.
3. **T9 Jurnal**: butuh koleksi sinkron baru `journal` (pola `tracked()` di storage.ts).
4. **T11 Susun ulang halaman jadi 5 tab**: terakhir, setelah isinya siap.
T6 (ekspor semua data) dan T7 (ringkasan mingguan) tetap di antrean; T6 sebaiknya sesudah T9 supaya
jurnal ikut diekspor.

## Belum diputuskan (pemilik)
- Ide awal pemilik untuk "My Portfolio" belum dijelaskan; rencana ini usulan Claude.
- Sektor saham AS/dunia untuk tab Konsentrasi: pakai sub-industri GICS dari `sp500.json` (sudah ada) atau cukup "Saham AS".
