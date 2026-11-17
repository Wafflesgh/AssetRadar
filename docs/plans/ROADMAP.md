# Roadmap AssetRadar — Nov 2026 s.d. Feb 2027

Disusun Claude (perencana utama) setelah membaca pendapat Codex (`codex-opinion.md`).
Alasan setiap keputusan: `DECISIONS.md`. Rancangan teknis: `TRD.md`.

**Prinsip:** buat aplikasi lebih **bisa dipercaya dan dipulihkan** dulu, baru tambah fitur.
Biaya tetap di bawah Rp50.000/bulan; kredit Rp5,4 juta (habis 12 Feb 2027) dipakai untuk uji coba
terbatas, bukan langganan permanen.

## Fase 0 — Klik di konsol, tanpa kode (Anda, dipandu Claude) · ±1 jam
| | Apa | Hasil |
|---|---|---|
| 0.1 | Cek apakah "spend cap" Cloud Run benar ada, lalu perbaiki `docs/SETUP_CloudRun.md` | Dokumen tidak saling bertentangan |
| 0.2 | Uptime check `/api/health` tiap 15 menit + email bila mati | Anda tahu kalau aplikasi mati |
| 0.3 | Cek apakah kunci rahasia sudah di Secret Manager; bila belum, pindahkan | Kunci lebih aman |
| 0.4 | Catat biaya mingguan 4 minggu (Billing → Reports) | Tahu biaya asli sebelum kredit habis |

## Fase 1 — Keandalan (Codex mengerjakan, Claude review) · ±2 minggu
| Tugas | Apa | Ukuran |
|---|---|---|
| T1 | Gerbang deploy: test & lint wajib lulus sebelum versi baru live | S |
| T2 | Perbaiki daftar kunci database yang terpotong di 1.000 | S |
| T3 | Halaman "Kesegaran data": umur tiap data, kapan terakhir berhasil, telat atau tidak + peringatan | M |
| T4 | Cadangan harian otomatis ke Cloud Storage (data Anda + riwayat trace/arena) + uji pulihkan | M |

## Fase 2 — Fitur baru · ±3 minggu
| Tugas | Apa | Ukuran |
|---|---|---|
| T5 | Batas harian Gemini (selesai). Gemini sendiri **ditunda** 17 Nov: kunci ditolak, manfaatnya kecil | M |
| T6 | Ekspor/impor semua data Anda (bukan hanya portofolio) | M |
| T7 | Ringkasan mingguan watchlist (perubahan minggu ini, agenda minggu depan) | M |

## Nanti (dievaluasi ulang setelah Fase 1–2)
Konsentrasi portofolio, jurnal keputusan, Cloud Run Jobs / Cloud Tasks (hanya bila T3 membuktikan
tugas tiap jam sering telat), domain sendiri.

## Ditolak
Min instances, Memorystore/Redis, Cloud CDN, Firestore, Pub/Sub, layanan monitoring tambahan —
mahal atau rumit tanpa kebutuhan nyata untuk satu pemilik.

## Cara jalan
Setiap tugas T1–T7 dibuat Claude sebagai file di `docs/tasks/`, dikerjakan Codex, di-review dan
di-commit Claude. Urutan wajib: T1 → T2 → T3 → T4, lalu T5–T7.
