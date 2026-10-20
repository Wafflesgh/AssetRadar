# AssetRadar tahap 4 — catatan kemajuan

Diisi oleh sesi Claude yang mengerjakan `docs/PROMPT_Cloud_Tahap4.md` (cloud). Sesi berikutnya melanjutkan dari fase pertama yang belum dicentang, di branch `claude/tahap4-sentiment`.

Dijalankan di Claude Code cloud, 20 Okt 2026. Branch: **`claude/tahap4-sentiment`**, dibuat dari `main` terbaru (55ea0de). PR tahap 3 (https://github.com/Wafflesgh/AssetRadar/pull/1, branch `claude/ecstatic-fermat-nyv2f9`) **belum di-merge** dan tidak diubah; karena dua bahasa (Fase 1) menyentuh hampir semua komponen, **kemungkinan ada konflik** saat PR kedua di-merge setelah yang pertama — perlu dibereskan saat itu (merge `main` ke branch PR yang tersisa).

## Fase 0 — Cek sumber

Node v22.22.0 · `npm install` lulus · kondisi awal `npm run lint && npm test && npm run build`: **lulus (123 test)**.

Kebijakan jaringan lingkungan cloud ini **menolak semua host di bawah** (proxy menjawab `403` pada CONNECT; hanya registry npm yang diizinkan). Status HTTP `000` = koneksi ditolak sebelum sampai ke server tujuan, jadi tidak ada contoh data, tanggal data terbaru, `exchangeInfo.rateLimits` maupun header `X-MBX-USED-WEIGHT-1M` yang bisa dibaca.

| Sumber | URL dicek | Hasil dari cloud |
|---|---|---|
| Yahoo spark | `query1.finance.yahoo.com/v7/finance/spark?symbols=BBCA.JK` | diblokir (403 proxy) |
| Yahoo quoteSummary (cookie + crumb) | `query2.finance.yahoo.com/v10/finance/quoteSummary/BBCA.JK?modules=earningsTrend`, `fc.yahoo.com` | diblokir |
| SEC submissions | `data.sec.gov/submissions/CIK0000320193.json` | diblokir |
| Binance spot data | `data-api.binance.vision/api/v3/ping` | diblokir |
| Binance spot cadangan | `api.binance.com`, `api-gcp.binance.com`, `api1.binance.com` | diblokir |
| Binance WebSocket | `data-stream.binance.vision` | diblokir |
| Binance futures | `fapi.binance.com/fapi/v1/ping` | diblokir |
| Fear & Greed | `api.alternative.me/fng/` | diblokir |
| FRED | `fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU` | diblokir |
| World Bank | `api.worldbank.org/v2/...` | diblokir |
| Bank Indonesia | `www.bi.go.id/...bi-rate.aspx` | diblokir |
| BPS API | `webapi.bps.go.id` | diblokir |
| Badan Pangan | `panelharga.badanpangan.go.id` | diblokir |
| DJPPR | `www.djppr.kemenkeu.go.id` | diblokir |
| CoinGecko | `api.coingecko.com` | diblokir |
| registry.npmjs.org | — | 200 |

Akibatnya semua fitur tahap 4 ditulis lengkap dengan deteksi kegagalan/blokir dan pesan jujur di UI, diuji dengan fixture kecil (hanya di test), dan ditandai **"belum diverifikasi live — perlu dicek pemilik di laptop"**. Fakta yang sudah dicek pemilik di rencana (batas Binance, alamat cadangan, ketersediaan `earningsTrend` dll.) dipakai apa adanya.

## Fase

- [x] 0. Cek sumber (di atas)
- [ ] 1. Dua bahasa (English / Bahasa Indonesia)
- [ ] 2. Lapisan data (cross-section, fundamental tambahan, estimasi analis, Binance, 50 crypto)
- [ ] 3. Pilar & horizon sentimen
- [ ] 4. Proyeksi teknikal & kalkulator posisi
- [ ] 5. Validasi & cadence
- [ ] 6. Tampilan
- [ ] 7. Makro Indonesia diperluas
- [ ] 8. Penutup

## Butuh keputusan pemilik

(diisi per fase)

## Laporan akhir

(diisi di akhir)
