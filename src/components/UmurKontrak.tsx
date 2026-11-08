'use client';
// Isian umur depresiasi yang selalu konsisten dengan masa kontrak: aset beli disusutkan selama min(umur ekonomis, kontrak)
// (sama dengan mesin hitung). Yang tampil = periode depresiasi efektif; bila umur ekonomis > kontrak, ditandai di bawahnya.

/** Periode depresiasi efektif (bulan) = min(umur ekonomis, kontrak); umur kosong → kontrak. */
export function periodeDepresiasi(umur: number | null | undefined, kontrak: number) {
  const n = Math.max(1, Math.round(kontrak || 1));
  const u = umur && umur > 0 ? umur : n;
  return Math.min(u, n);
}

export default function UmurKontrak({ umur, kontrak, onChange, disabled, label = 'Umur', lebar = 70, inputStyle }: {
  umur: number | null | undefined; kontrak: number; onChange: (v: number) => void; disabled?: boolean; label?: string; lebar?: number;
  inputStyle?: React.CSSProperties;
}) {
  const n = Math.max(1, Math.round(kontrak || 1));
  const efektif = periodeDepresiasi(umur, n);
  const dibatasi = !disabled && !!umur && umur > n;
  return <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
    <input aria-label={label} type="number" min={1} max={n} value={disabled ? (umur ?? '') : efektif} disabled={disabled}
      title={`Periode depresiasi = min(umur ekonomis, kontrak ${n} bln)`}
      onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) onChange(Math.min(v, n)); }}
      style={{ width: lebar, minWidth: lebar, textAlign: 'right', ...inputStyle }} />
    {dibatasi && <span className="dasar-def" style={{ whiteSpace: 'nowrap' }}>umur ekonomis {umur} → kontrak {n}</span>}
  </span>;
}
