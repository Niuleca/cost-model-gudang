'use client';
// Upload kembali file Excel hasil Export (sheet "Data Input" + tabel Volume) → pratinjau perubahan → terapkan ke tender & hitung ulang.
import { useState } from 'react';
import type { TenderRow } from '@/lib/tender';
import type { HasilUpload } from '@/lib/excelSinkron';

export default function UploadExcelPanel({ t, bisaEdit, onTerapkan }: {
  t: TenderRow; bisaEdit: boolean; onTerapkan: (kolom: Partial<TenderRow>, asumsi: TenderRow['asumsi']) => Promise<void>;
}) {
  const [hasil, setHasil] = useState<(HasilUpload & { file: string }) | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [cari, setCari] = useState('');
  const [ringkas, setRingkas] = useState<(v: unknown) => string>(() => (v: unknown) => String(v));

  async function baca(f?: File) {
    if (!f) return;
    setSibuk(true); setPesan('Membaca file…'); setHasil(null);
    try {
      const m = await import('@/lib/excelSinkron');
      const h = await m.bacaUpload(f, t);
      setRingkas(() => m.ringkasNilai);
      setHasil({ ...h, file: f.name });
      setPesan(h.perubahan.length ? null : 'Tidak ada perubahan dibanding data di sistem.');
    } catch (e) { setPesan(`Gagal membaca: ${(e as Error).message}`); }
    setSibuk(false);
  }
  async function terapkan() {
    if (!hasil) return;
    setSibuk(true); setPesan('Menerapkan & menghitung ulang…');
    try { await onTerapkan(hasil.kolom, hasil.asumsi as unknown as TenderRow['asumsi']); setPesan(`${hasil.perubahan.length} perubahan diterapkan — tender dihitung ulang & disimpan otomatis.`); setHasil(null); }
    catch (e) { setPesan(`Gagal menerapkan: ${(e as Error).message}`); }
    setSibuk(false);
  }
  const tampil = hasil?.perubahan.filter(p => !cari || p.path.toLowerCase().includes(cari.toLowerCase())) ?? [];
  const bagian = (p: string) => p.replace(/\[\d+\].*$/, '').split('.')[0];
  const perBagian = hasil ? Object.entries(hasil.perubahan.reduce<Record<string, number>>((o, p) => { const k = p.sumber === 'tender' ? 'Key assumption' : bagian(p.path); o[k] = (o[k] ?? 0) + 1; return o; }, {})) : [];
  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Upload Excel (ubah data lewat Excel)</h2>
        {bisaEdit
          ? <label className="btn" style={{ cursor: 'pointer' }}>{sibuk ? 'Memproses…' : 'Pilih file .xlsx'}<input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={sibuk} onChange={e => { baca(e.target.files?.[0]); e.target.value = ''; }} /></label>
          : <span className="small muted">Hanya pembuat draft / tim tender yang bisa mengubah.</span>}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Alur: <b>Unduh</b> file di atas → ubah di Excel (sel putih tulang di sheet <b>Key assumption</b>, tabel <b>Volume</b>, atau kolom Nilai di sheet <b>Data Input</b> untuk isian lain) → simpan → upload di sini.
        Leca membandingkan setiap isian dengan data sistem dan menampilkan <b>pratinjau perubahan</b>; setelah diterapkan, tender dihitung ulang dengan rumus yang sama dengan web, jadi hasilnya identik dengan Excel.
      </p>
      {pesan && <p className="small" role="status" style={{ margin: 0 }}>{pesan}</p>}
      {hasil && hasil.perubahan.length > 0 && <div className="notice small" style={{ display: 'grid', gap: 8 }}>
        <div><b>{hasil.file}</b>: {hasil.perubahan.length} perubahan — {perBagian.map(([k, n]) => `${k} ${n}`).join(' · ')}</div>
        {hasil.peringatan.map(w => <div key={w} style={{ color: 'var(--warn)' }}>⚠ {w}</div>)}
        <input aria-label="Cari path" placeholder="Cari path, mis. costLines atau volumes" value={cari} onChange={e => setCari(e.target.value)} style={{ maxWidth: 320 }} />
        <div className="tablewrap fit" style={{ maxHeight: '50vh' }}><table className="tabel-fit">
          <thead><tr><th>Bagian</th><th>Isian (path)</th><th>Di sistem</th><th>Di Excel (baru)</th></tr></thead>
          <tbody>{tampil.slice(0, 300).map(p => <tr key={`${p.sumber}-${p.path}`}>
            <td className="small">{p.sumber === 'tender' ? 'Key assumption' : bagian(p.path)}</td>
            <td className="small"><code>{p.path}</code></td>
            <td className="small muted">{ringkas(p.lama)}</td><td className="small"><b>{ringkas(p.baru)}</b></td></tr>)}</tbody>
        </table></div>
        {tampil.length > 300 && <div className="muted">… {tampil.length - 300} perubahan lain (semua ikut diterapkan)</div>}
        <div className="row"><button onClick={terapkan} disabled={sibuk}>Terapkan {hasil.perubahan.length} perubahan & hitung ulang</button><button className="ghost" onClick={() => setHasil(null)} disabled={sibuk}>Batal</button></div>
      </div>}
    </div>);
}
