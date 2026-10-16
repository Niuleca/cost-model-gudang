'use client';

/** Tombol pembagi (divider) per kelompok: "Semua" + satu tombol per nilai, masing-masing dengan jumlah baris. */
export default function GroupChips({ nilai, pilih, onPilih, label }: { nilai: string[]; pilih: string; onPilih: (v: string) => void; label: string }) {
  const hitung = new Map<string, number>();
  for (const v of nilai) hitung.set(v, (hitung.get(v) ?? 0) + 1);
  const daftar = Array.from(hitung.entries()).sort((a, b) => a[0].localeCompare(b[0], 'id'));
  if (daftar.length < 2) return null;
  return (
    <div className="row" role="group" aria-label={`Bagi per ${label}`} style={{ gap: 6 }}>
      <span className="small muted">{label}:</span>
      {[['', nilai.length] as [string, number], ...daftar].map(([v, n]) => (
        <button key={v || '__semua'} className={pilih === v ? '' : 'ghost'} aria-pressed={pilih === v} onClick={() => onPilih(v)}
          style={{ padding: '4px 10px', fontSize: 13 }}>
          {v || 'Semua'} <span style={{ opacity: 0.7 }}>({n})</span>
        </button>))}
    </div>
  );
}
