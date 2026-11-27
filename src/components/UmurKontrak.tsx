'use client';
import InputDesimal from '@/components/InputDesimal';
// Isian periode depresiasi aset beli. Default = masa kontrak (disusutkan min(umur ekonomis, kontrak), sama dengan mesin hitung).
// Bisa diisi manual berapa pun bulannya (umurManual) — termasuk lebih lama dari kontrak; tombol ↺ kembali ke default kontrak.

/** Periode depresiasi efektif (bulan): manual → isian; default → min(umur ekonomis, kontrak); umur kosong → kontrak. */
export function periodeDepresiasi(umur: number | null | undefined, kontrak: number, manual?: boolean) {
  const n = Math.max(1, Math.round(kontrak || 1));
  const u = umur && umur > 0 ? umur : n;
  return manual ? Math.max(1, u) : Math.min(u, n);
}

export default function UmurKontrak({ umur, kontrak, onChange, onReset, manual, disabled, label = 'Umur', lebar = 70, inputStyle }: {
  umur: number | null | undefined; kontrak: number; onChange: (v: number) => void; onReset?: () => void; manual?: boolean;
  disabled?: boolean; label?: string; lebar?: number; inputStyle?: React.CSSProperties;
}) {
  const n = Math.max(1, Math.round(kontrak || 1));
  const efektif = periodeDepresiasi(umur, n, manual);
  const dibatasi = !disabled && !manual && !!umur && umur > n;
  const lewat = !disabled && manual && efektif > n;
  return <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
    <InputDesimal aria-label={label} min={1} value={disabled ? (umur ?? '') : efektif} disabled={disabled}
      title={`Periode depresiasi (bln) — default = kontrak ${n} bln; bisa diisi berapa pun`}
      onChange={e => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v) && v > 0) onChange(v); }}
      style={{ width: lebar, minWidth: lebar, textAlign: 'right', ...inputStyle }} />
    {dibatasi && <span className="dasar-def" style={{ whiteSpace: 'nowrap' }}>umur ekonomis {umur} → kontrak {n}</span>}
    {lewat && <span className="dasar-def" style={{ whiteSpace: 'nowrap', color: 'var(--warn, #b45309)' }}>&gt; kontrak {n} bln · sisa nilai tidak tertagih</span>}
    {!disabled && manual && efektif !== n && onReset && <button type="button" className="link-kecil" onClick={onReset} title={`Kembali ke default: sesuai kontrak ${n} bln`}>↺ sesuai kontrak</button>}
  </span>;
}
