'use client';
// Menu penentu pembagian total biaya ke layanan rate card (Storage / Handling In / Handling Out / VAS).
// Mode: cost-to-serve (default, sesuai pemicu biaya) · bagi rata · persentase manual. Total biaya & total GP tidak berubah.
import { useEffect, useState } from 'react';
import type { HasilTender, Bucket, TenderInput } from '@/lib/engine/index.ts';
import { rp, persen, BUCKET_LABEL } from '@/lib/format';

export type AlokasiLayanan = NonNullable<TenderInput['alokasiLayanan']>;
const OPS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas'];

/** Dasar pembagian cost-to-serve per kelompok biaya (sesuai engine). */
const DASAR: Record<string, string> = {
  Manpower: 'Direct labor: jam aktivitas per arus (inbound → Handling In, outbound → Handling Out, storage/cycle count → Storage). Indirect (admin, checker, leader): 40% In · 40% Out · 20% Storage. Peran tetap (manager, supervisor) → Manajemen.',
  Fasilitas: 'Sewa gedung / space → 100% Storage (luas dipakai untuk menyimpan barang).',
  Racking: 'Rak → 100% Storage.',
  MHE: 'Sesuai jam pakai alat per aktivitas (forklift/reach truck/HPT); bila tidak ada data jam: 40% Storage · 30% In · 30% Out.',
  Utilitas: 'Listrik: 60% Storage · 20% In · 20% Out (penerangan & area simpan dominan).',
  IT: 'Biaya bersama → Manajemen, lalu disebar.',
  Overhead: '% × subtotal, dibagi 40% Storage · 30% In · 30% Out.',
  Startup: 'Amortisasi startup otomatis: 40% Storage · 30% In · 30% Out.',
  Office: 'Sesuai alokasi baris di Biaya lain (default 40/30/30).', Consumable: 'Sesuai alokasi baris di Biaya lain (default 40/30/30).',
  HSE: 'Sesuai alokasi baris di Biaya lain (default 40/30/30).', Asuransi: 'Sesuai alokasi baris di Biaya lain (default 40/30/30).',
  Lainnya: 'Sesuai alokasi baris di Biaya lain (default 40/30/30).', Finance: 'Sesuai alokasi baris.', 'Interest cost': 'Mengikuti alokasi aset yang dibiayai.',
};

const PRESET: { label: string; porsi: Partial<Record<Bucket, number>> }[] = [
  { label: 'Storage lebih besar (50 / 25 / 25)', porsi: { storage: 0.5, handling_in: 0.25, handling_out: 0.25 } },
  { label: 'Handling lebih besar (20 / 40 / 40)', porsi: { storage: 0.2, handling_in: 0.4, handling_out: 0.4 } },
  { label: 'Seimbang (34 / 33 / 33)', porsi: { storage: 0.34, handling_in: 0.33, handling_out: 0.33 } },
];

function InputPorsi({ nilai, set, label }: { nilai: number; set: (v: number) => void; label: string }) {
  const ke = (v: number) => String(Math.round(v * 1000) / 10).replace('.', ',');
  const [t, setT] = useState(ke(nilai));
  useEffect(() => { setT(ke(nilai)); }, [nilai]);
  const simpan = () => { const v = Number(t.replace(',', '.')); if (t.trim() === '') set(0); else if (isFinite(v) && v >= 0 && v <= 100) set(v / 100); else setT(ke(nilai)); };
  return <span className="row" style={{ gap: 2, flexWrap: 'nowrap', display: 'inline-flex' }}>
    <input aria-label={label} className="input-kecil" inputMode="decimal" style={{ width: 70, textAlign: 'right' }} value={t} onChange={e => setT(e.target.value)}
      onBlur={simpan} onKeyDown={e => { if (e.key === 'Enter') { simpan(); (e.target as HTMLInputElement).blur(); } }} />%</span>;
}

export default function PembagianLayanan({ h, alokasi, onAlokasi }: { h: HasilTender; alokasi: AlokasiLayanan | undefined; onAlokasi: (a: AlokasiLayanan) => void }) {
  const al = h.alokasiLayanan;
  const [dasar, setDasar] = useState(false);
  if (!al) return null;
  const mode = alokasi?.mode ?? 'cts';
  const porsiInput = alokasi?.porsi ?? {};
  const tampil = OPS.filter(b => (al.porsiCts[b] ?? 0) > 0 || (al.porsiDipakai[b] ?? 0) > 0 || (porsiInput[b] ?? 0) > 0);
  const totBiaya = tampil.reduce((s, b) => s + (al.biayaCts[b] ?? 0), 0);
  const dariCts = () => Object.fromEntries(tampil.map(b => [b, Math.round((al.porsiCts[b] ?? 0) * 1000) / 1000])) as Partial<Record<Bucket, number>>;
  const pilih = (m: AlokasiLayanan['mode']) => onAlokasi(m === 'manual' ? { mode: m, porsi: Object.keys(porsiInput).length ? porsiInput : dariCts() } : { mode: m, porsi: alokasi?.porsi });
  const jmlInput = tampil.reduce((s, b) => s + (porsiInput[b] ?? 0), 0);
  const rc = (b: Bucket) => h.rateCard.find(r => r.bucket === b);
  const kelompok = [...al.rincian].sort((a, b) => b.total - a.total);

  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Pembagian biaya ke layanan</h2>
        <span className="small muted">Total biaya {rp(totBiaya)}/bln tetap sama — yang bergeser hanya porsi & tarif per layanan</span>
      </div>
      <div className="row" role="radiogroup" aria-label="Cara pembagian biaya" style={{ gap: 6 }}>
        {([['cts', 'Cost-to-serve (default)'], ['rata', 'Bagi rata'], ['manual', 'Persentase manual']] as const).map(([k, l]) =>
          <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? '' : 'ghost'} onClick={() => pilih(k)}>{l}</button>)}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {mode === 'cts' && 'Cost-to-serve: tiap baris biaya dibebankan ke layanan yang memicunya (lihat "Dasar pembagian" di bawah). Paling bisa dipertanggungjawabkan saat customer membandingkan tarif per layanan.'}
        {mode === 'rata' && `Bagi rata: total biaya dibagi sama besar ke ${tampil.length} layanan yang punya biaya. Tarif per layanan jadi tidak mencerminkan pemicu biaya — risiko bila volume aktual per arus berbeda dari komitmen.`}
        {mode === 'manual' && 'Persentase manual: isi porsi tiap layanan (total 100%). Cocok untuk strategi harga, mis. storage dibuat lebih besar agar pendapatan tetap stabil walau throughput turun.'}
      </p>
      {mode === 'manual' && <div className="row small" style={{ gap: 6 }}>
        <span className="muted">Preset:</span>
        {PRESET.map(p => <button key={p.label} className="ghost" onClick={() => onAlokasi({ mode: 'manual', porsi: Object.fromEntries(Object.entries(p.porsi).filter(([b]) => tampil.includes(b as Bucket))) })}>{p.label}</button>)}
        <button className="link-kecil" onClick={() => onAlokasi({ mode: 'manual', porsi: dariCts() })}>isi dari cost-to-serve</button>
      </div>}
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Layanan</th><th className="num">Porsi cost-to-serve</th><th className="num">Biaya cost-to-serve/bln</th><th className="num">Porsi dipakai</th><th className="num">Biaya dipakai/bln</th><th className="num">Selisih/bln</th><th className="num">Tarif excl. PPN</th></tr></thead>
        <tbody>{tampil.map(b => {
          const r = rc(b), dipakai = r?.biayaBulan ?? 0, sel = dipakai - (al.biayaCts[b] ?? 0);
          return <tr key={b}><td>{BUCKET_LABEL[b]}</td><td className="num">{persen(al.porsiCts[b] ?? 0)}</td><td className="num">{rp(al.biayaCts[b] ?? 0)}</td>
            <td className="num">{mode === 'manual' ? <InputPorsi label={`Porsi ${BUCKET_LABEL[b]}`} nilai={porsiInput[b] ?? 0} set={v => onAlokasi({ mode: 'manual', porsi: { ...porsiInput, [b]: v } })} /> : <b>{persen(al.porsiDipakai[b] ?? 0)}</b>}</td>
            <td className="num"><b>{rp(dipakai)}</b></td>
            <td className="num" style={{ color: Math.abs(sel) < 1 ? undefined : sel > 0 ? 'var(--warn)' : 'var(--ok)' }}>{Math.abs(sel) < 1 ? '—' : `${sel > 0 ? '+' : '−'}${rp(Math.abs(sel))}`}</td>
            <td className="num">{r ? `${rp(r.tarifPerUnit)} / ${r.uom}` : <span className="muted">tidak ada tarif</span>}</td></tr>;
        })}</tbody>
        <tfoot><tr><td><b>Total</b></td><td className="num">100%</td><td className="num">{rp(totBiaya)}</td>
          <td className="num"><b style={{ color: mode === 'manual' && Math.abs(jmlInput - 1) > 0.0005 ? 'var(--bad)' : undefined }}>{mode === 'manual' ? persen(jmlInput) : '100%'}</b></td>
          <td className="num"><b>{rp(h.rateCard.reduce((s, r) => s + r.biayaBulan, 0))}</b></td><td></td><td></td></tr></tfoot>
      </table></div>
      {mode === 'manual' && Math.abs(jmlInput - 1) > 0.0005 && <p className="small notice" style={{ margin: 0 }}>Total porsi {persen(jmlInput)} — {jmlInput < 1 ? `kurang ${persen(1 - jmlInput)}` : `lebih ${persen(jmlInput - 1)}`}. Sementara dinormalisasi otomatis ke 100%.</p>}
      <div>
        <button className="link-kecil" onClick={() => setDasar(x => !x)}>{dasar ? '▾' : '▸'} Dasar pembagian cost-to-serve per kategori biaya</button>
        {dasar && <div className="tablewrap fit" style={{ marginTop: 6 }}><table className="tabel-fit">
          <thead><tr><th>Kategori</th><th className="num">Biaya/bln</th><th className="num">Storage</th><th className="num">Handling In</th><th className="num">Handling Out</th><th className="num">VAS</th><th className="num">Manajemen*</th><th>Dasar</th></tr></thead>
          <tbody>{kelompok.map(k => <tr key={k.kelompok}><td style={{ whiteSpace: 'nowrap' }}>{k.kelompok}</td><td className="num">{rp(k.total)}</td>
            {(['storage', 'handling_in', 'handling_out', 'vas', 'manajemen'] as Bucket[]).map(b => <td key={b} className="num">{k.perBucket[b] ? persen(k.perBucket[b] / k.total) : '—'}</td>)}
            <td className="small muted">{DASAR[k.kelompok] ?? 'Sesuai alokasi baris biaya.'}</td></tr>)}</tbody>
        </table>
          <p className="small muted" style={{ margin: '4px 0 0' }}>* Manajemen (supervisor, manager, IT, biaya tetap) disebar ke layanan sesuai porsi biaya operasionalnya: {OPS.filter(b => (al.porsiManajemen[b] ?? 0) > 0).map(b => `${BUCKET_LABEL[b]} ${persen(al.porsiManajemen[b])}`).join(' · ')}.
            {' '}Alokasi per baris bisa diubah di tab Biaya lain / Manpower (kolom Alokasi).</p></div>}
      </div>
    </div>);
}
