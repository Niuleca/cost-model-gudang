'use client';
// Tab Volume: pilihan UoM lengkap (dikelompokkan), isian konversi per baris sesuai jenis satuan,
// dan Ringkasan volume semua satuan (palet / posisi palet / CBM / ton / case / pcs / liter) dari satu mesin konversi.
import { gabungPerArus, kelasUom, uraiUom, MUATAN_DEFAULT, type KelasUom, type Muatan, type VolumeInput } from '@/lib/engine/types';
import { AngkaInput } from '@/components/fields';

/** Daftar UoM volume, dikelompokkan untuk drop list. */
export const GRUP_UOM: { grup: string; uom: string[] }[] = [
  { grup: 'Unit load', uom: ['palet'] },
  { grup: 'Kemasan', uom: ['case', 'karton', 'box', 'inner', 'pack', 'bag', 'sak', 'jumbo bag', 'pail', 'drum', 'ibc', 'jerigen', 'roll', 'bale', 'bundle', 'crate', 'tray'] },
  { grup: 'Satuan barang', uom: ['pcs', 'unit', 'set', 'botol', 'kaleng', 'sachet'] },
  { grup: 'Berat', uom: ['kg', 'ton'] },
  { grup: 'Volume / isi', uom: ['cbm', 'liter'] },
  { grup: 'Transaksi', uom: ['order', 'line', 'lokasi', 'sku'] },
];
/** Isi kecil per kemasan (1 case = … pcs / kg / liter). */
export const UOM_ISI_KECIL = ['pcs', 'unit', 'botol', 'kaleng', 'sachet', 'inner', 'pack', 'set', 'kg', 'liter'];
/** Isi per palet untuk baris palet (1 palet = … case / bag / …). */
export const UOM_ISI_PALET = ['case', 'karton', 'box', 'inner', 'pack', 'bag', 'sak', 'pail', 'drum', 'jerigen', 'roll', 'bale', 'bundle', 'pcs', 'unit', 'kg', 'liter'];

export function PilihUom({ value, onChange, label = 'UoM' }: { value: string; onChange: (u: string) => void; label?: string }) {
  const ada = GRUP_UOM.some(g => g.uom.includes(value));
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} style={{ minWidth: 104 }}>
      {!ada && <option value={value}>{value}</option>}
      {GRUP_UOM.map(g => <optgroup key={g.grup} label={g.grup}>{g.uom.map(u => <option key={u} value={u}>{u}</option>)}</optgroup>)}
    </select>
  );
}

type Konv = NonNullable<VolumeInput['konversi']>;
const KONV_KOSONG: Konv = { uom1: 'case', per1: 0, uom2: 'pcs', per2: 0 };

/** Pindah UoM tanpa merusak isian: isi per palet dipindah antar baris palet ⇄ kemasan, isi kecil tetap. */
export function gantiUom(v: VolumeInput, u: string): Partial<VolumeInput> {
  const a = kelasUom(v.uom), b = kelasUom(u);
  const k0 = v.konversi ?? KONV_KOSONG;
  let k: Konv = { ...k0 };
  if (a === 'palet' && (b === 'case' || b === 'kemasan' || b === 'pcs')) {
    // 1 palet = per1 [uom1] → bila uom baru sama jenis dengan uom1, isi itu jadi "1 palet = … [uom baru]"
    if (!k.paletIsi && k.per1 > 0 && kelasUom(k.uom1) === b) k = { ...k, paletIsi: k.per1 };
  } else if ((a === 'case' || a === 'kemasan' || a === 'pcs') && b === 'palet') {
    if ((k.paletIsi ?? 0) > 0 && !(k.per1 > 0)) k = { ...k, uom1: v.uom, per1: k.paletIsi! };
  }
  return { uom: u, konversi: k };
}

/** Sel isian konversi per baris (dua kolom tabel) — bentuknya mengikuti jenis UoM. */
export function SelKonversi({ v, onKonversi }: { v: VolumeInput; onKonversi: (k: Konv) => void }) {
  const k = { ...KONV_KOSONG, ...(v.konversi ?? {}) };
  const uk = (p: Partial<Konv>) => onKonversi({ ...k, ...p });
  const kl = kelasUom(v.uom);
  const u = uraiUom(v, Number(v.peakBulan) || 0);
  const pilih = (val: string, daftar: string[], on: (x: string) => void, label: string) => (
    <select aria-label={label} value={val} onChange={e => on(e.target.value)} style={{ minWidth: 90 }}>
      {(daftar.includes(val) ? daftar : [val, ...daftar]).map(x => <option key={x}>{x}</option>)}
    </select>);
  const angka = (val: number | undefined, on: (n: number) => void, label: string) => (
    <AngkaInput aria-label={label} step="any" min={0} value={val || 0} onValue={x => on(Math.max(0, x))} style={{ width: 76, minWidth: 76 }} />);
  const baris = (isi: React.ReactNode) => <div className="row" style={{ flexWrap: 'nowrap', gap: 4, margin: 0 }}>{isi}</div>;

  if (kl === 'palet') return <>
    <td>{baris(<><span className="small muted">1 palet =</span>{angka(k.per1, x => uk({ per1: x }), 'Isi per palet')}{pilih(k.uom1, UOM_ISI_PALET, x => uk({ uom1: x }), 'UoM isi palet')}</>)}</td>
    <td>{baris(<><span className="small muted">1 {k.uom1} =</span>{angka(k.per2, x => uk({ per2: x }), `Isi per ${k.uom1}`)}{pilih(k.uom2, UOM_ISI_KECIL, x => uk({ uom2: x }), 'UoM isi kecil')}</>)}</td>
  </>;
  if (kl === 'case' || kl === 'kemasan' || kl === 'pcs') return <>
    <td>{baris(<><span className="small muted">1 palet =</span>{angka(k.paletIsi, x => uk({ paletIsi: x }), `Isi ${v.uom} per palet`)}<span className="small">{v.uom}</span></>)}
      {!(k.paletIsi && k.paletIsi > 0) && <div className="small" style={{ color: 'var(--warn, #b45309)' }}>{u.palet != null ? `sementara: ${u.dasar[0]}` : 'isi agar bisa dihitung ke palet'}</div>}
      {!(k.paletIsi && k.paletIsi > 0) && k.per1 > 0 && kl !== 'pcs' && <button type="button" className="ghost small" style={{ padding: '1px 8px', marginTop: 2 }}
        title="Isian versi lama (1 [satuan] = … ) kemungkinan maksudnya isi per palet" onClick={() => uk({ paletIsi: k.per1 })}>pakai isian lama: 1 palet = {k.per1} {v.uom}</button>}</td>
    <td>{kl === 'pcs' ? <span className="small muted">—</span>
      : baris(<><span className="small muted">1 {v.uom} =</span>{angka(k.per2, x => uk({ per2: x }), `Isi per ${v.uom}`)}{pilih(k.uom2, UOM_ISI_KECIL, x => uk({ uom2: x }), 'UoM isi kecil')}</>)}</td>
  </>;
  const ket: Partial<Record<KelasUom, string>> = {
    cbm: 'pakai CBM per palet', kg: 'pakai berat per palet', ton: 'pakai berat per palet', liter: 'pakai isi cair per palet',
    transaksi: 'satuan transaksi — tidak dikonversi', lain: 'pilih satuan dari daftar',
  };
  return <td colSpan={2}><span className="small muted">{ket[kl]}{(kl === 'cbm' || kl === 'kg' || kl === 'ton' || kl === 'liter') && ' (Parameter muatan di bawah)'}</span>
    {u.kurang[0] && <div className="small" style={{ color: 'var(--warn, #b45309)' }}>{u.kurang[0]}</div>}</td>;
}

const ARUS_LABEL: Record<string, string> = { inbound: 'Inbound', outbound: 'Outbound', storage: 'Storage (stok)', vas: 'VAS' };
const f = (x: number | null | undefined, d = 0) => (x == null ? '—' : x.toLocaleString('id-ID', { maximumFractionDigits: x !== 0 && Math.abs(x) < 10 ? Math.max(d, 1) : d }));

/** Ringkasan volume semua satuan — satu sumber konversi dengan mesin hitung (sizing gudang, tarif, profil order). */
export function RingkasanVolumeSemuaUom({ volumes, muatan, basis, hariOps }: {
  volumes: VolumeInput[]; muatan?: Partial<Muatan>; basis: 'peakBulan' | 'rataRataBulan' | 'komitmenBulan'; hariOps: number;
}) {
  const m = { ...MUATAN_DEFAULT, ...(muatan ?? {}) };
  const baris = volumes.map(v => ({ v, q: Number(v[basis]) || 0, u: uraiUom(v, Number(v[basis]) || 0, m) }));
  const st = baris.find(b => b.v.arus === 'storage');
  const kartu: [string, string, string][] = st ? [
    ['Posisi palet (stok)', f(st.u.palet != null ? Math.ceil(st.u.palet - 1e-9) : null), 'palet'],
    ['Volume stok', f(st.u.cbm, 1), 'CBM'],
    ['Berat stok', f(st.u.kg != null ? st.u.kg / 1000 : null, 1), 'ton'],
    ['Case / karton', f(st.u.case), 'case'],
    ...(st.u.pcs != null ? [['Pcs', f(st.u.pcs), 'pcs'] as [string, string, string]] : []),
    ...(st.u.liter != null ? [['Cair', f(st.u.liter), 'liter'] as [string, string, string]] : []),
  ] : [];
  return (
    <div className="card vol-semua">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0 }}>Ringkasan volume — semua satuan</h3>
        <span className="small muted">Basis: {basis === 'peakBulan' ? 'Peak (sizing)' : basis === 'rataRataBulan' ? 'Rata-rata' : 'Komitmen (MGV)'} · {f(m.cbmPerPalet, 2)} CBM & {f(m.tonPerPalet * 1000)} kg per palet</span>
      </div>
      {st && <div className="vol-kartu">{kartu.map(([l, n, s]) => <div key={l}><span className="small muted">{l}</span><b>{n}</b><span className="small muted">{s}</span></div>)}</div>}
      <div className="tablewrap"><table>
        <thead><tr><th>Arus</th><th className="num">Input</th><th className="num">Palet</th><th className="num">CBM</th><th className="num">Ton</th><th className="num">Case</th><th className="num">Pcs</th><th className="num">Liter</th><th className="num">Palet / hari</th><th>Cara hitung</th></tr></thead>
        <tbody>{baris.map(({ v, q, u }, i) => {
          const stok = v.arus === 'storage';
          return <tr key={i}>
            <td>{ARUS_LABEL[v.arus] ?? v.arus}</td>
            <td className="num"><b>{f(q, 1)}</b> {v.uom}{stok ? <div className="small muted">stok</div> : <div className="small muted">/bln</div>}</td>
            <td className="num">{f(u.palet, 1)}{u.palet != null && !u.paletPasti && <div className="small" style={{ color: 'var(--warn, #b45309)' }}>perkiraan</div>}</td>
            <td className="num">{f(u.cbm, 1)}</td>
            <td className="num">{f(u.kg != null ? u.kg / 1000 : null, 2)}</td>
            <td className="num">{f(u.case)}</td>
            <td className="num">{f(u.pcs)}</td>
            <td className="num">{f(u.liter)}</td>
            <td className="num">{stok || u.palet == null || !(hariOps > 0) ? '—' : f(u.palet / hariOps, 1)}</td>
            <td className="small muted" style={{ minWidth: 200 }}>{[...u.dasar, ...u.kurang.map(x => `⚠ ${x}`)].join(' · ') || '—'}</td>
          </tr>;
        })}
        {gabungPerArus(volumes).filter(v => v.rincian).map((v, i) => { const q = Number(v[basis]) || 0, u = uraiUom(v, q, m), stok = v.arus === 'storage';
          return <tr key={`tot${i}`} className="pd-sub"><td><b>Total {ARUS_LABEL[v.arus] ?? v.arus}</b></td>
            <td className="num"><b>{f(q, 1)}</b> palet eq.</td><td className="num"><b>{f(u.palet, 1)}</b></td><td className="num">{f(u.cbm, 1)}</td>
            <td className="num">{f(u.kg != null ? u.kg / 1000 : null, 2)}</td><td className="num">—</td><td className="num">—</td><td className="num">{f(u.liter)}</td>
            <td className="num">{stok || !(hariOps > 0) ? '—' : <b>{f(q / hariOps, 1)}</b>}</td><td className="small muted">gabungan {v.rincian} — dipakai space, manpower & tarif</td></tr>; })}
        </tbody>
      </table></div>
      <p className="small muted" style={{ margin: 0 }}>Semua angka memakai konversi yang sama dengan hitungan space, manpower dan tarif. Posisi palet storage = stok dalam palet ekuivalen (dibulatkan ke atas).</p>
    </div>
  );
}

/** Satuan utama Ringkasan order — semua arus dikonversi ke satuan ini, satuan lain ditampilkan di bawahnya. */
export type SatuanUtama = 'input' | 'palet' | 'case' | 'pcs' | 'cbm' | 'ton';
export const SATUAN_UTAMA: { v: SatuanUtama; l: string }[] = [
  { v: 'input', l: 'Sesuai input (UoM tiap baris)' }, { v: 'palet', l: 'Palet' }, { v: 'case', l: 'Case / karton' },
  { v: 'pcs', l: 'Pcs' }, { v: 'cbm', l: 'CBM' }, { v: 'ton', l: 'Ton' },
];
const SAT_LABEL: Record<Exclude<SatuanUtama, 'input'>, string> = { palet: 'palet', case: 'case', pcs: 'pcs', cbm: 'CBM', ton: 'ton' };

/** Ringkasan order per hari / bulan / tahun dalam satuan utama + konversi ke palet, case, pcs, CBM, ton (kosong bila tidak bisa dikonversi). */
export function RingkasanOrder({ volumes, basis, hariOps, utama, onUtama, labelArus, ekstra }: {
  ekstra?: React.ReactNode; volumes: VolumeInput[]; basis: 'peakBulan' | 'rataRataBulan' | 'komitmenBulan'; hariOps: number;
  utama: SatuanUtama; onUtama: (u: SatuanUtama) => void; labelArus: (a: string) => string;
}) {
  const nilai = (v: VolumeInput, q: number): Record<Exclude<SatuanUtama, 'input'>, number | null> => {
    const u = uraiUom(v, q);
    return { palet: u.palet, case: u.case, pcs: u.pcs, cbm: u.cbm, ton: u.kg != null ? u.kg / 1000 : null };
  };
  const fx = (x: number | null) => (x == null ? '—' : x.toLocaleString('id-ID', { maximumFractionDigits: Math.abs(x) < 100 && x % 1 ? (Math.abs(x) < 10 ? 2 : 1) : 0 }));
  const sel = (v: VolumeInput, q: number) => {
    const n = nilai(v, q), kl = kelasUom(v.uom);
    const lain = (Object.keys(SAT_LABEL) as (keyof typeof SAT_LABEL)[]).filter(k => k !== utama);
    const pasti = uraiUom(v, q).paletPasti;
    return <>
      {utama === 'input' ? <b>{fx(q)} {v.uom}</b>
        : n[utama] == null ? <span className="muted" title={`${v.uom} tidak bisa dikonversi ke ${SAT_LABEL[utama]} — lengkapi isi per palet / Parameter muatan`}>—</span>
        : <b>{fx(n[utama])} {SAT_LABEL[utama]}</b>}
      {utama !== 'input' && <div className="small muted">input {fx(q)} {v.uom}</div>}
      {lain.filter(k => kelasUom(k) !== kl).map(k => n[k] == null ? null
        : <div key={k} className="small muted">{fx(n[k])} {SAT_LABEL[k]}{k === 'palet' && !pasti && kl !== 'palet' ? ' (perkiraan)' : ''}</div>)}
    </>;
  };
  return <>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
      <h3 style={{ margin: 0 }}>Ringkasan order</h3>
      <div className="row" style={{ alignItems: 'end' }}>{ekstra}<label className="f" htmlFor="satuan-utama">Satuan utama
        <select id="satuan-utama" value={utama} onChange={e => onUtama(e.target.value as SatuanUtama)} style={{ minWidth: 190 }}>
          {SATUAN_UTAMA.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}</select></label></div>
    </div>
    <div className="tablewrap"><table>
      <thead><tr><th>Arus</th><th className="num">Per hari</th><th className="num">Per bulan</th><th className="num">Per tahun</th></tr></thead>
      <tbody>{volumes.map((v, i) => {
        const bln = Number(v[basis]) || 0, stok = v.arus === 'storage';
        return <tr key={i}><td>{labelArus(v.arus)}{stok && <div className="small muted">stok tersimpan (posisi), bukan arus</div>}</td>
          <td className="num">{stok ? <span className="muted">–</span> : sel(v, hariOps > 0 ? bln / hariOps : 0)}</td>
          <td className="num">{sel(v, bln)}</td>
          <td className="num">{stok ? <span className="muted">–</span> : sel(v, bln * 12)}</td></tr>;
      })}
      {gabungPerArus(volumes).filter(v => v.rincian).map((v, i) => { const bln = Number(v[basis]) || 0, stok = v.arus === 'storage';
        return <tr key={`tot${i}`} className="pd-sub"><td><b>Total {labelArus(v.arus)}</b><div className="small muted">{v.rincian}</div></td>
          <td className="num">{stok ? <span className="muted">–</span> : sel(v, hariOps > 0 ? bln / hariOps : 0)}</td>
          <td className="num">{sel(v, bln)}</td>
          <td className="num">{stok ? <span className="muted">–</span> : sel(v, bln * 12)}</td></tr>; })}
      </tbody></table></div>
  </>;
}
