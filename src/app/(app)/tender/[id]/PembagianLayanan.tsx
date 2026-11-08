'use client';
// Tab Cost Allocation: matriks pembagian biaya per kategori ke layanan (default = simulasi cost-to-serve, bisa diubah per sel).
// Hasilnya satu-satunya dasar biaya per layanan di Rate card & margin.
// Total biaya & total GP tidak berubah — yang bergeser hanya porsi & tarif per layanan.
import { useEffect, useState } from 'react';
import type { HasilTender, Bucket, TenderInput } from '@/lib/engine/index.ts';
import { rp, persen, BUCKET_LABEL } from '@/lib/format';

export type AlokasiKategori = NonNullable<TenderInput['alokasiKategori']>;
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


function InputPorsi({ nilai, set, label, lebar = 70 }: { nilai: number; set: (v: number) => void; label: string; lebar?: number }) {
  const ke = (v: number) => String(Math.round(v * 1000) / 10).replace('.', ',');
  const [t, setT] = useState(ke(nilai));
  useEffect(() => { setT(ke(nilai)); }, [nilai]);
  const simpan = () => { const v = Number(t.replace(',', '.')); if (t.trim() === '') set(0); else if (isFinite(v) && v >= 0 && v <= 100) set(v / 100); else setT(ke(nilai)); };
  return <span className="row" style={{ gap: 2, flexWrap: 'nowrap', display: 'inline-flex' }}>
    <input aria-label={label} className="input-kecil" inputMode="decimal" style={{ width: lebar, textAlign: 'right' }} value={t} onChange={e => setT(e.target.value)}
      onBlur={simpan} onKeyDown={e => { if (e.key === 'Enter') { simpan(); (e.target as HTMLInputElement).blur(); } }} />%</span>;
}


/** Contoh pola cepat untuk seluruh matriks. */
const POLA: { label: string; buat: (kat: string[]) => AlokasiKategori }[] = [
  { label: 'Fasilitas & rak → Storage 100%, lainnya Handling In/Out 50/50', buat: kat => Object.fromEntries(kat.map(k => [k, ['Fasilitas', 'Racking'].includes(k) ? { storage: 1 } : { handling_in: 0.5, handling_out: 0.5 }])) },
  { label: 'Semua kategori 1/3 rata', buat: kat => Object.fromEntries(kat.map(k => [k, { storage: 1 / 3, handling_in: 1 / 3, handling_out: 1 / 3 }])) },
];

/** Pola cepat: samakan semua kategori ke porsi yang sama → total layanan otomatis = porsi itu. */
function SamakanSemua({ kol, onTerap }: { kol: Bucket[]; onTerap: (p: Partial<Record<Bucket, number>>) => void }) {
  const [p, setP] = useState<Partial<Record<Bucket, number>>>({ storage: 0.5, handling_in: 0.25, handling_out: 0.25 });
  const jml = kol.reduce((a, b) => a + (p[b] ?? 0), 0);
  return <span className="pill info" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    Samakan semua kategori ke
    {kol.map(b => <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{BUCKET_LABEL[b]} <InputPorsi lebar={52} label={`Samakan ${BUCKET_LABEL[b]}`} nilai={p[b] ?? 0} set={v => setP(x => ({ ...x, [b]: v }))} /></span>)}
    <button className="ghost" disabled={Math.abs(jml - 1) > 0.0005} title={Math.abs(jml - 1) > 0.0005 ? `Total ${persen(jml)} — harus 100%` : undefined}
      onClick={() => onTerap(Object.fromEntries(kol.map(b => [b, p[b] ?? 0])))}>Terapkan</button>
  </span>;
}

/** Matriks pembagian biaya per kategori → layanan. */
export function MatriksKategori({ h, nilai, onUbah, tenderId }: { h: HasilTender; nilai: AlokasiKategori; onUbah: (a: AlokasiKategori) => void; tenderId: string }) {
  const [lihatDasar, setLihatDasar] = useState(false);
  const al = h.alokasiLayanan;
  if (!al?.matriks) return null;
  const mx = al.matriks;
  const kol = OPS.filter(b => b !== 'vas' || mx.some(r => (r.porsiDefault.vas ?? 0) > 0 || (r.porsi.vas ?? 0) > 0 || (nilai[r.kelompok]?.vas ?? 0) > 0) || h.rateCard.some(r => r.bucket === 'vas'));
  const isi = (kel: string) => nilai[kel] ?? null;
  const ubah = (kel: string, b: Bucket, v: number, dasar: Record<Bucket, number>) => {
    const cur = isi(kel) ?? Object.fromEntries(kol.map(k => [k, dasar[k] ?? 0]));
    onUbah({ ...nilai, [kel]: { ...cur, [b]: v } });
  };
  const reset = (kel: string) => { const x = { ...nilai }; delete x[kel]; onUbah(x); };
  const normal = (kel: string) => { const o = isi(kel); if (!o) return; const j = kol.reduce((a, k) => a + (o[k] ?? 0), 0); if (j > 0) onUbah({ ...nilai, [kel]: Object.fromEntries(kol.map(k => [k, (o[k] ?? 0) / j])) }); };
  const totLay = Object.fromEntries(kol.map(b => [b, mx.reduce((a, r) => a + (r.biayaPerLayanan[b] ?? 0), 0)])) as Record<Bucket, number>;
  const totSemua = kol.reduce((a, b) => a + totLay[b], 0) || 1;
  const nDiubah = mx.filter(r => r.override).length;
  const rc = (b: Bucket) => h.rateCard.find(r => r.bucket === b);
  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Pembagian biaya per kategori</h2>
        <span className="small muted">{nDiubah === mx.length ? 'Semua kategori diubah' : nDiubah ? `${nDiubah} kategori diubah · sisanya default simulasi` : 'Semua kategori memakai default simulasi'}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Default = hasil simulasi cost-to-serve dari data tender ini (jam aktivitas per arus di VSM, jam pakai MHE, space, alokasi per baris biaya), dengan biaya manajemen sudah disebar ke layanan.
        {' '}Ubah sel mana pun untuk menimpa satu kategori; kategori yang diubah memakai porsi tetap tersebut untuk semua barisnya. Hasil matriks langsung dipakai di <b>Rate card & margin</b>.</p>
      <div className="row small" style={{ gap: 6 }}>
        <span className="muted">Pola cepat:</span>
        {POLA.map(p => <button key={p.label} className="ghost" onClick={() => onUbah(p.buat(mx.map(r => r.kelompok)))}>{p.label}</button>)}
        <SamakanSemua kol={kol} onTerap={porsi => onUbah(Object.fromEntries(mx.map(r => [r.kelompok, porsi])))} />
        {nDiubah > 0 && <button className="link-kecil" onClick={() => onUbah({})}>reset semua ke default simulasi</button>}
        <button className="link-kecil" onClick={() => setLihatDasar(x => !x)}>{lihatDasar ? 'sembunyikan' : 'tampilkan'} dasar default</button>
      </div>
      <div className="tablewrap fit"><table className="tabel-fit tabel-matriks">
        <thead><tr><th>Kategori</th><th className="num">Biaya/bln</th>{kol.map(b => <th key={b} className="num">{BUCKET_LABEL[b]}</th>)}<th className="num">Total</th><th>Sumber</th>{lihatDasar && <th>Dasar default (simulasi)</th>}</tr></thead>
        <tbody>{mx.map(r => {
          const o = isi(r.kelompok);
          const nilaiSel = (b: Bucket) => o ? (o[b] ?? 0) : (r.porsi[b] ?? 0);
          const jml = kol.reduce((a, b) => a + nilaiSel(b), 0);
          const salah = Math.abs(jml - 1) > 0.0005;
          return <tr key={r.kelompok} className={r.override ? 'baris-ubah' : undefined}>
            <td style={{ whiteSpace: 'nowrap' }}><a href={`/tender/${tenderId}/kategori/${encodeURIComponent(r.kelompok)}`} target="_blank" rel="noopener">{r.kelompok} ↗</a></td>
            <td className="num">{rp(r.biayaBulan)}</td>
            {kol.map(b => <td key={b} className="num"><InputPorsi lebar={64} label={`${r.kelompok} ${BUCKET_LABEL[b]}`} nilai={nilaiSel(b)} set={v => ubah(r.kelompok, b, v, r.porsi)} />
              {o && Math.abs((r.porsiDefault[b] ?? 0) - nilaiSel(b)) > 0.0005 && <div className="dasar-def">default {persen(r.porsiDefault[b] ?? 0)}</div>}</td>)}
            <td className="num"><b style={{ color: salah ? 'var(--bad)' : undefined }}>{persen(jml)}</b>{salah && o && <div><button className="link-kecil" onClick={() => normal(r.kelompok)}>jadikan 100%</button></div>}</td>
            <td className="small">{o ? <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><span className="pill warn">Diubah</span><button className="link-kecil" onClick={() => reset(r.kelompok)} aria-label={`Reset ${r.kelompok}`}>reset</button></span> : <span className="pill info">Default simulasi</span>}</td>
            {lihatDasar && <td className="small muted">{DASAR[r.kelompok] ?? 'Sesuai alokasi baris biaya.'}</td>}
          </tr>;
        })}</tbody>
        <tfoot>
          <tr><td><b>Biaya per layanan / bln</b></td><td className="num"><b>{rp(totSemua)}</b></td>{kol.map(b => <td key={b} className="num"><b>{rp(totLay[b])}</b></td>)}<td></td><td></td>{lihatDasar && <td></td>}</tr>
          <tr><td>Porsi layanan</td><td></td>{kol.map(b => <td key={b} className="num">{persen(totLay[b] / totSemua)}</td>)}<td className="num">100%</td><td></td>{lihatDasar && <td></td>}</tr>
          <tr><td>Tarif rate card (excl. PPN)</td><td></td>{kol.map(b => { const x = rc(b); return <td key={b} className="num">{x ? <><b>{rp(x.tarifPerUnit)}</b><div className="dasar-def">/ {x.uom}</div></> : '—'}</td>; })}<td></td><td></td>{lihatDasar && <td></td>}</tr>
        </tfoot>
      </table></div>
      <p className="small muted" style={{ margin: 0 }}>Persen per baris harus total 100% (kalau tidak, dinormalisasi otomatis dan muncul red flag). Tarif rate card sudah termasuk margin & PPh dari tab Result.</p>
    </div>);
}

/** Isi tab Cost Allocation. */
export default function CostAllocation({ h, alokasiKategori, onAlokasiKategori, tenderId, onKeResult }: {
  h: HasilTender | null; alokasiKategori: AlokasiKategori; onAlokasiKategori: (a: AlokasiKategori) => void; tenderId: string; onKeResult: () => void;
}) {
  if (!h) return <div className="card"><p className="muted" style={{ margin: 0 }}>Menghitung…</p></div>;
  return <div style={{ display: 'grid', gap: 16 }}>
    <MatriksKategori h={h} nilai={alokasiKategori} onUbah={onAlokasiKategori} tenderId={tenderId} />
    <div className="row" style={{ justifyContent: 'flex-end' }}><button onClick={onKeResult}>Lihat Rate card & margin →</button></div>
  </div>;
}
