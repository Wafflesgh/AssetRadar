import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface RiskProfileViewProps {
  onSelectAsset: (symbol: string) => void;
}

export function RiskProfileView({ onSelectAsset }: RiskProfileViewProps) {
  return (
    <div className="space-y-6">
      {/* Mandatory Yellow Educational Disclaimer Box (Spec 6.4 & 11) */}
      <div
        role="note"
        aria-label="Disclaimer Edukasi Investasi"
        className="p-4 rounded-xl border flex items-start gap-3 text-xs md:text-sm leading-relaxed"
        style={{
          backgroundColor: 'var(--color-gold-soft)',
          borderColor: 'var(--color-gold)',
          color: 'var(--text-primary)',
        }}
      >
        <AlertTriangle
          className="w-5 h-5 shrink-0 mt-0.5"
          style={{ color: 'var(--color-gold)' }}
        />
        <p>
          <strong>Disclaimer Edukasi:</strong> Contoh alokasi ini bersifat umum dan edukatif, bukan
          rekomendasi investasi personal. Kinerja masa lalu tidak menjamin hasil masa depan.
          Pastikan produk investasi terdaftar/diawasi OJK atau Bappebti.
        </p>
      </div>

      {/* Header */}
      <header className="space-y-1">
        <div
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>Materi Edukasi Alokasi Aset</span>
          <span aria-hidden="true">·</span>
          <span>Kuesioner Interaktif di Tahap 4</span>
        </div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">
          Profil Risiko Investasi
        </h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Kenali karakter profil risiko investasi (Konservatif, Moderat, dan Agresif). Kuesioner 7
          pertanyaan, grafik donut alokasi, simulator modal awal, dan kustomisasi slider akan
          diaktifkan pada <strong>Tahap 4</strong>.
        </p>
      </header>

      {/* Preview of 3 Risk Profiles Allocation Table (from Spec 6.3) */}
      <section
        aria-label="Tabel Referensi Alokasi Profil Risiko"
        className="p-5 md:p-6 rounded-xl border space-y-4"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent-radar)' }} />
          <h2 className="text-base font-bold">
            Referensi Contoh Alokasi Portofolio
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr
                className="border-b"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <th className="py-2.5 pr-4 font-semibold">Instrumen</th>
                <th className="py-2.5 px-3 font-semibold">Tingkat Risiko</th>
                <th className="py-2.5 px-3 font-semibold text-right">Konservatif</th>
                <th className="py-2.5 px-3 font-semibold text-right">Moderat</th>
                <th className="py-2.5 px-3 font-semibold text-right">Agresif</th>
                <th className="py-2.5 pl-3 font-semibold text-right">Grafik Pasar</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              <tr>
                <td className="py-3 pr-4 font-medium">Pasar uang / deposito</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Rendah
                </td>
                <td className="py-3 px-3 text-right font-mono-num">45%</td>
                <td className="py-3 px-3 text-right font-mono-num">20%</td>
                <td className="py-3 px-3 text-right font-mono-num">5%</td>
                <td
                  className="py-3 pl-3 text-right text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Instrumen bank
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">SBN ritel / obligasi</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Rendah–sedang
                </td>
                <td className="py-3 px-3 text-right font-mono-num">30%</td>
                <td className="py-3 px-3 text-right font-mono-num">25%</td>
                <td className="py-3 px-3 text-right font-mono-num">10%</td>
                <td
                  className="py-3 pl-3 text-right text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Surat berharga negara
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Emas</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Sedang
                </td>
                <td className="py-3 px-3 text-right font-mono-num">15%</td>
                <td className="py-3 px-3 text-right font-mono-num">15%</td>
                <td className="py-3 px-3 text-right font-mono-num">10%</td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectAsset('XAU/USD')}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--accent-radar)' }}
                  >
                    Lihat harga Emas
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Saham / reksa dana indeks</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Tinggi
                </td>
                <td className="py-3 px-3 text-right font-mono-num">10%</td>
                <td className="py-3 px-3 text-right font-mono-num">35%</td>
                <td className="py-3 px-3 text-right font-mono-num">55%</td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectAsset('^JKSE')}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--accent-radar)' }}
                  >
                    Lihat grafik IHSG
                  </button>
                </td>
              </tr>
              <tr>
                <td className="py-3 pr-4 font-medium">Crypto</td>
                <td className="py-3 px-3" style={{ color: 'var(--text-secondary)' }}>
                  Sangat tinggi
                </td>
                <td className="py-3 px-3 text-right font-mono-num">0%</td>
                <td className="py-3 px-3 text-right font-mono-num">5%</td>
                <td className="py-3 px-3 text-right font-mono-num">20%</td>
                <td className="py-3 pl-3 text-right">
                  <button
                    type="button"
                    onClick={() => onSelectAsset('BTC/IDR')}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: 'var(--accent-radar)' }}
                  >
                    Lihat harga BTC
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
