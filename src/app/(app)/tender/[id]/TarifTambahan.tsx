'use client';
// Rate card: pilih layanan utama yang dijual + tarif tambahan (additional charges) yang bisa ditambah / dihapus sendiri.
import type { HasilTender, Bucket, TarifTambahanInput } from '@/lib/engine/index.ts';
import { useState } from 'react';
import { rp, persen, BUCKET_LABEL } from '@/lib/format';

type Jual = Partial<Record<Bucket, 'jual' | 'termasuk'>>;
const OPS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas'];
const SATUAN = ['per karton', 'per pcs', 'per palet', 'per drum', 'per container', 'per container 20ft', 'per container 40ft', 'per event', 'per movement', 'per jam', 'per jam per orang',
  'per hari', 'per shipment', 'per DO', 'per order', 'per dokumen', 'per label', 'per SKU', 'per truk', 'per trip', 'per m²', 'per CBM', 'per kg', 'per ton', 'per bulan'];
const KETIK = '__ketik__';

/** Satuan: pilih dari daftar, atau "✎ ketik sendiri" untuk satuan bebas. */
function PilihSatuan({ nilai, set }: { nilai: string; set: (v: string) => void }) {
  const bebas = !!nilai && !SATUAN.includes(nilai) || nilai === '';
  return <span style={{ display: 'grid', gap: 4 }}>
    <select aria-label="Satuan" value={bebas ? KETIK : nilai} onChange={e => set(e.target.value === KETIK ? '' : e.target.value)} style={{ width: 150, minWidth: 150 }}>
      {SATUAN.map(x => <option key={x} value={x}>{x}</option>)}<option value={KETIK}>✎ ketik sendiri…</option></select>
    {bebas && <input aria-label="Satuan manual" value={nilai} placeholder="mis. per pallet-day" onChange={e => set(e.target.value)} style={{ width: 150, minWidth: 150 }} autoFocus={nilai === ''} />}
  </span>;
}
const uid = () => `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Layanan utama yang dijual terpisah atau "termasuk" (biayanya dipindah ke layanan lain). */
export function LayananDijual({ h, nilai, onUbah }: { h: HasilTender; nilai: Jual; onUbah: (x: Jual) => void }) {
  const ada = OPS.filter(b => (h.alokasiLayanan?.porsiLayanan?.[b] ?? 0) > 0);
  if (!ada.length) return null;
  const termasuk = h.layananTermasuk ?? [];
  return <div className="umk-box" style={{ alignItems: 'center' }}>
    <b className="small">Layanan yang dijual:</b>
    {ada.map(b => {
      const mode = nilai[b] ?? 'jual';
      return <label key={b} className="row small" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={mode !== 'termasuk'} aria-label={`Jual ${BUCKET_LABEL[b]}`}
          onChange={e => { const x = { ...nilai }; if (e.target.checked) delete x[b]; else x[b] = 'termasuk'; onUbah(x); }} />
        {BUCKET_LABEL[b]}{mode === 'termasuk' && <span className="pill warn">termasuk</span>}</label>;
    })}
    <span className="small muted" style={{ flex: 1, minWidth: 240 }}>
      {termasuk.length
        ? termasuk.map(t => `${BUCKET_LABEL[t.bucket]} tidak ditagih terpisah — biaya ${rp(t.biayaBulan)}/bln dipindah ke ${t.ke.map(k => BUCKET_LABEL[k]).join(' & ')}`).join(' · ')
        : 'Hapus centang bila layanan tidak ditagih terpisah (mis. handling in sudah termasuk storage) — biayanya otomatis dipindah ke layanan yang dijual, total biaya & GP tetap.'}</span>
  </div>;
}

type Preset = { label: string; grup?: string; buat: (h: HasilTender) => Omit<TarifTambahanInput, 'id'> };
const opsiUom = (h: HasilTender, b: Bucket, re: RegExp) => h.rateCard.find(r => r.bucket === b)?.opsiUom?.find(o => re.test(o.uom) && o.volume > 0)?.uom;
const turunanAtau = (nama: string, satuan: string, b: Bucket, re: RegExp, menit: number) => (h: HasilTender): Omit<TarifTambahanInput, 'id'> => {
  const u = opsiUom(h, b, re);
  return u ? { nama, satuan, dasar: 'turunan', bucket: b, uom: u } : { nama, satuan, dasar: 'aktivitas', menit, orang: 1 };
};
const PRESET: Preset[] = [
  { label: 'Handling in per karton', buat: turunanAtau('Handling in (karton / loose)', 'per karton', 'handling_in', /case|karton|carton|dus/i, 0.5) },
  { label: 'Handling in per pcs', buat: turunanAtau('Handling in (pcs)', 'per pcs', 'handling_in', /^pcs$|pieces|unit/i, 0.1) },
  { label: 'Handling out per karton', buat: turunanAtau('Handling out (karton / case picking)', 'per karton', 'handling_out', /case|karton|carton|dus/i, 0.6) },
  { label: 'Handling out per pcs', buat: turunanAtau('Handling out (pcs picking)', 'per pcs', 'handling_out', /^pcs$|pieces|unit/i, 0.15) },
  { label: 'Movement / relokasi produk', buat: () => ({ nama: 'Movement product charge (relokasi internal)', satuan: 'per palet', dasar: 'aktivitas', menit: 5, orang: 1, alat: true }) },
  { label: 'Labeling / stickering', buat: () => ({ nama: 'VAS — labeling / stickering', satuan: 'per pcs', dasar: 'aktivitas', menit: 0.3, orang: 1, material: 100 }) },
  { label: 'Wrapping', buat: () => ({ nama: 'VAS — wrapping stretch film', satuan: 'per palet', dasar: 'aktivitas', menit: 3, orang: 1, material: 15000 }) },
  { label: 'Repacking', buat: () => ({ nama: 'VAS — repacking', satuan: 'per karton', dasar: 'aktivitas', menit: 2, orang: 1, material: 3000 }) },
  { label: 'Palletizing curah', buat: () => ({ nama: 'Palletizing barang curah', satuan: 'per palet', dasar: 'aktivitas', menit: 15, orang: 2 }) },
  { label: 'Cross-docking', buat: () => ({ nama: 'Cross-docking', satuan: 'per palet', dasar: 'aktivitas', menit: 6, orang: 1, alat: true }) },
  { label: 'Lembur / overtime', buat: () => ({ nama: 'Lembur (overtime) di luar jam operasional', satuan: 'per jam per orang', dasar: 'aktivitas', menit: 60, orang: 1, pengali: 1.5 }) },
  { label: 'Admin dokumen tambahan', buat: () => ({ nama: 'Admin dokumen tambahan', satuan: 'per dokumen', dasar: 'aktivitas', menit: 5, orang: 1 }) },
  { label: 'Unloading per container 20ft', buat: () => ({ nama: 'Unloading container 20ft (curah / loose)', satuan: 'per container 20ft', dasar: 'aktivitas', menit: 60, orang: 4 }) },
  { label: 'Unloading per container 40ft', buat: () => ({ nama: 'Unloading container 40ft / 40HC (curah / loose)', satuan: 'per container 40ft', dasar: 'aktivitas', menit: 120, orang: 4 }) },
  { label: 'Stuffing per container', buat: () => ({ nama: 'Stuffing / loading container', satuan: 'per container', dasar: 'aktivitas', menit: 90, orang: 4, alat: true }) },
  { label: 'Per event (stock opname, dll.)', buat: () => ({ nama: 'Stock opname tambahan / event khusus', satuan: 'per event', dasar: 'aktivitas', menit: 480, orang: 4 }) },
  { label: 'Tarif manual (isi harga sendiri)', buat: () => ({ nama: '', satuan: '', dasar: 'tarif', tarif: 0 }) },
];
const GRUP: [string, string[]][] = [
  ['Handling', ['Handling in per karton', 'Handling in per pcs', 'Handling out per karton', 'Handling out per pcs', 'Movement / relokasi produk', 'Cross-docking', 'Palletizing curah']],
  ['Container & event', ['Unloading per container 20ft', 'Unloading per container 40ft', 'Stuffing per container', 'Per event (stock opname, dll.)']],
  ['VAS', ['Labeling / stickering', 'Wrapping', 'Repacking']],
  ['Lainnya', ['Lembur / overtime', 'Admin dokumen tambahan', 'Tarif manual (isi harga sendiri)']],
];

const num = (v: string) => (v === '' ? undefined : Number(v));

/** Baris tarif tambahan di dalam tabel rate card (10 kolom) + baris (+) dengan droplist pilihan. */
export function BarisTambahan({ h, nilai, onUbah, ppnInclude }: { h: HasilTender; nilai: TarifTambahanInput[]; onUbah: (x: TarifTambahanInput[]) => void; ppnInclude: boolean }) {
  const [buka, setBuka] = useState<Record<string, boolean>>({});
  const [pilih, setPilih] = useState(false);
  const tt = h.tarifTambahan;
  const ubah = (id: string, patch: Partial<TarifTambahanInput>) => onUbah(nilai.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const hit = (id: string) => tt?.items.find(x => x.id === id);
  const inp = (w = 70) => ({ style: { width: w, minWidth: w, textAlign: 'right' as const } });
  const tambah = (label: string) => { const p = PRESET.find(x => x.label === label); if (p) { const id = uid(); onUbah([...nilai, { id, ...p.buat(h) }]); if (p.buat(h).dasar === 'tarif') setBuka(b => ({ ...b, [id]: true })); } setPilih(false); };
  const totPend = (tt?.items ?? []).reduce((a, x) => a + x.pendapatanBulan, 0), totGp = (tt?.items ?? []).reduce((a, x) => a + x.gpBulan, 0);
  return <>
    {nilai.length > 0 && <tr className="baris-sub-tt"><td colSpan={10} className="small"><b>Layanan tambahan</b> <span className="muted">— ditagih sesuai pemakaian, ikut ke quotation; tidak mengubah biaya & GP layanan utama.
      {tt ? ` Tarif dasar aktivitas: orang ${rp(tt.tarifJamOrang)}/jam · alat ${rp(tt.tarifJamAlat)}/jam.` : ''}</span></td></tr>}
    {nilai.map(x => {
      const c = hit(x.id), detail = !!buka[x.id];
      const tarifDiisi = Number(x.tarif) > 0;
      return [
        <tr key={x.id} className="baris-tt">
          <td><input aria-label="Nama layanan tambahan" value={x.nama} placeholder="nama layanan" onChange={e => ubah(x.id, { nama: e.target.value })} style={{ minWidth: 150 }} />
            <div className="small"><button className="link-kecil" onClick={() => setBuka(b => ({ ...b, [x.id]: !detail }))}>{detail ? '▾' : '▸'} dasar biaya</button>
              {c?.dasarTeks && !detail && <span className="dasar-def"> {c.dasarTeks}</span>}</div></td>
          <td><PilihSatuan nilai={x.satuan} set={v => ubah(x.id, { satuan: v })} /></td>
          <td className="num"><input aria-label="Estimasi volume per bulan" type="number" value={x.volumeBulan ?? ''} placeholder="est. vol" onChange={e => ubah(x.id, { volumeBulan: num(e.target.value) })} {...inp(80)} /></td>
          <td className="num">{c && c.biayaBulan > 0 ? rp(c.biayaBulan) : '—'}</td>
          <td className="num">{c ? rp(c.biayaPerUnit) : '…'}</td>
          <td className="num">{c?.tarifDiubah ? <>{c.biayaPerUnit > 0 ? persen(c.gpDipakai) : '—'}<div className="dasar-def">dari tarif</div></> : <>
            <input aria-label="GP tarif tambahan" type="number" step="0.1" value={x.gp == null ? '' : Math.round(x.gp * 1000) / 10}
              placeholder={c ? String(Math.round(c.gpDipakai * 1000) / 10) : ''} onChange={e => ubah(x.id, { gp: e.target.value === '' ? null : Number(e.target.value) / 100 })} {...inp(64)} />%</>}</td>
          <td className="num">{c && c.pendapatanBulan > 0 ? <>{rp(c.pendapatanBulan)}<div className="dasar-def">GP {rp(c.gpBulan)}</div></> : '—'}</td>
          <td className={`num${ppnInclude ? '' : ' tier-kini'}`}>
            <input aria-label="Tarif tambahan excl PPN" type="number" value={tarifDiisi ? x.tarif : ''} placeholder={c ? String(c.tarifDefault || '') : ''}
              onChange={e => ubah(x.id, { tarif: num(e.target.value) })} {...inp(100)} style={{ width: 100, minWidth: 100, textAlign: 'right', fontWeight: 700 }} />
            <div className="dasar-def">{tarifDiisi ? <>diubah · <button className="link-kecil" onClick={() => ubah(x.id, { tarif: undefined })}>default {c ? rp(c.tarifDefault) : ''}</button></> : `default ${c ? rp(c.tarifPerUnit) : ''}`}</div></td>
          <td className="num">{c ? rp(c.ppnPerUnit) : ''}</td>
          <td className="num"><span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>{c ? rp(c.tarifInclPpn) : ''}
            <button className="danger" aria-label="Hapus layanan tambahan" title="Hapus" onClick={() => onUbah(nilai.filter(y => y.id !== x.id))}>×</button></span></td>
        </tr>,
        detail && <tr key={x.id + '-d'} className="baris-tt-detail"><td colSpan={10}>
          <div className="row small" style={{ gap: 8 }}>
            <label>Dasar biaya <select aria-label="Dasar biaya" value={x.dasar} onChange={e => ubah(x.id, { dasar: e.target.value as TarifTambahanInput['dasar'] })}>
              <option value="turunan">Turunan layanan utama</option><option value="aktivitas">Aktivitas (menit × orang/alat)</option><option value="manual">Biaya manual (+ GP%)</option><option value="tarif">Tarif saja (tanpa hitungan biaya)</option></select></label>
            {x.dasar === 'turunan' && <>
              <select aria-label="Layanan dasar" value={x.bucket ?? ''} onChange={e => ubah(x.id, { bucket: e.target.value as Bucket, uom: undefined })}>
                <option value="">pilih layanan…</option>{h.rateCard.map(r => <option key={r.bucket} value={r.bucket}>{BUCKET_LABEL[r.bucket]}</option>)}</select>
              <select aria-label="Satuan dasar" value={x.uom ?? ''} onChange={e => ubah(x.id, { uom: e.target.value })}>
                {(h.rateCard.find(r => r.bucket === x.bucket)?.opsiUom ?? []).filter(o => o.volume > 0).map(o => <option key={o.uom} value={o.uom}>{o.uom}</option>)}</select></>}
            {x.dasar === 'aktivitas' && <>
              <label>menit/unit <input aria-label="Menit per unit" type="number" step="0.05" value={x.menit ?? ''} onChange={e => ubah(x.id, { menit: num(e.target.value) })} {...inp(64)} /></label>
              <label>orang <input aria-label="Orang" type="number" step="1" value={x.orang ?? ''} onChange={e => ubah(x.id, { orang: num(e.target.value) })} {...inp(52)} /></label>
              <label title="Pengali upah, mis. 1,5 untuk lembur">pengali <input aria-label="Pengali" type="number" step="0.1" value={x.pengali ?? ''} placeholder="1" onChange={e => ubah(x.id, { pengali: num(e.target.value) })} {...inp(52)} /></label>
              <label className="row" style={{ gap: 2 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!x.alat} onChange={e => ubah(x.id, { alat: e.target.checked })} />pakai alat (MHE)</label>
              <label>material Rp <input aria-label="Material per unit" type="number" value={x.material ?? ''} onChange={e => ubah(x.id, { material: num(e.target.value) })} {...inp(90)} /></label></>}
            {(x.dasar === 'manual' || x.dasar === 'tarif') && <label>biaya/unit Rp <input aria-label="Biaya per unit" type="number" value={x.biaya ?? ''} placeholder={x.dasar === 'tarif' ? 'opsional' : ''} onChange={e => ubah(x.id, { biaya: num(e.target.value) })} {...inp(100)} /></label>}
            {c?.dasarTeks && <span className="muted">{c.dasarTeks}</span>}
          </div></td></tr>,
      ];
    })}
    <tr className="baris-tambah"><td colSpan={10}>
      {!pilih ? <button className="ghost" onClick={() => setPilih(true)} aria-label="Tambah layanan tambahan">＋ Tambah layanan</button>
        : <span className="row" style={{ gap: 6 }}>
          <select aria-label="Pilih layanan tambahan" autoFocus defaultValue="" onChange={e => e.target.value && tambah(e.target.value)} style={{ width: 320, minWidth: 320 }}>
            <option value="" disabled>Pilih layanan tambahan…</option>
            {GRUP.map(([g, ls]) => <optgroup key={g} label={g}>{ls.map(l => <option key={l} value={l}>{l}</option>)}</optgroup>)}
          </select>
          <button className="link-kecil" onClick={() => setPilih(false)}>batal</button>
          <span className="small muted">Harga default dihitung dari data tender (biaya layanan, tarif orang & alat per jam) dan bisa diubah langsung di kolom Tarif.</span></span>}
      {totPend > 0 && <span className="small" style={{ float: 'right' }}>Potensi pendapatan tambahan: <b>{rp(totPend)}</b>/bln · GP {rp(totGp)}</span>}
    </td></tr>
  </>;
}
