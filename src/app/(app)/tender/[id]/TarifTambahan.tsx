'use client';
// Rate card: pilih layanan utama yang dijual + tarif tambahan (additional charges) yang bisa ditambah / dihapus sendiri.
import type { HasilTender, Bucket, TarifTambahanInput } from '@/lib/engine/index.ts';
import { rp, persen, BUCKET_LABEL } from '@/lib/format';

type Jual = Partial<Record<Bucket, 'jual' | 'termasuk'>>;
const OPS: Bucket[] = ['storage', 'handling_in', 'handling_out', 'vas'];
const SATUAN = ['per karton', 'per pcs', 'per palet', 'per container', 'per container 20ft', 'per container 40ft', 'per event', 'per movement', 'per jam', 'per jam per orang',
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

type Preset = { label: string; buat: (h: HasilTender) => Omit<TarifTambahanInput, 'id'> };
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

const num = (v: string) => (v === '' ? undefined : Number(v));

export function TarifTambahan({ h, nilai, onUbah, ppnInclude }: { h: HasilTender; nilai: TarifTambahanInput[]; onUbah: (x: TarifTambahanInput[]) => void; ppnInclude: boolean }) {
  const tt = h.tarifTambahan;
  const ubah = (id: string, patch: Partial<TarifTambahanInput>) => onUbah(nilai.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const hit = (id: string) => tt?.items.find(x => x.id === id);
  const totPend = (tt?.items ?? []).reduce((a, x) => a + x.pendapatanBulan, 0), totGp = (tt?.items ?? []).reduce((a, x) => a + x.gpBulan, 0);
  const inp = (w = 70) => ({ style: { width: w, minWidth: w, textAlign: 'right' as const } });
  return <div className="card" style={{ display: 'grid', gap: 10 }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0 }}>Tarif tambahan (additional charges)</h2>
      {tt && <span className="small muted">Tarif dasar aktivitas: orang {rp(tt.tarifJamOrang)}/jam (biaya manpower ÷ headcount ÷ {Math.round(tt.jamOrangBln)} jam) · alat {rp(tt.tarifJamAlat)}/jam (biaya MHE ÷ unit ÷ {Math.round(tt.jamAlatBln)} jam)</span>}
    </div>
    <p className="small muted" style={{ margin: 0 }}>Layanan di luar rate card utama yang ditagih sesuai pemakaian (per karton, per pcs, movement, VAS, lembur, dll.). Tambah atau hapus sesuai yang akan dijual — semua baris ikut ke quotation sebagai tarif tambahan.
      {' '}Tidak mengubah biaya & GP rate card utama; estimasi volume hanya untuk melihat potensi pendapatan.</p>
    <div className="row small" style={{ gap: 6 }}>
      <span className="muted">Tambah cepat:</span>
      {PRESET.map(p => <button key={p.label} className="ghost" onClick={() => onUbah([...nilai, { id: uid(), ...p.buat(h) }])}>+ {p.label}</button>)}
      <button className="ghost" onClick={() => onUbah([...nilai, { id: uid(), nama: '', satuan: 'per karton', dasar: 'manual', biaya: 0 }])}>+ Baris kosong</button>
    </div>
    {nilai.length > 0 && <div className="tablewrap"><table className="tabel-tambahan">
      <thead><tr><th>Layanan tambahan</th><th>Satuan</th><th>Dasar biaya</th><th>Parameter</th><th className="num">Biaya/unit</th><th className="num">GP%</th>
        <th className="num">Tarif excl. PPN</th><th className="num">Tarif incl. PPN</th><th className="num">Est. vol/bln</th><th className="num">Est. pendapatan · GP/bln</th><th></th></tr></thead>
      <tbody>{nilai.map(x => {
        const c = hit(x.id);
        return <tr key={x.id}>
          <td><input aria-label="Nama layanan tambahan" value={x.nama} placeholder="mis. Handling in per karton" onChange={e => ubah(x.id, { nama: e.target.value })} style={{ minWidth: 200 }} /></td>
          <td><PilihSatuan nilai={x.satuan} set={v => ubah(x.id, { satuan: v })} /></td>
          <td><select aria-label="Dasar biaya" value={x.dasar} onChange={e => ubah(x.id, { dasar: e.target.value as TarifTambahanInput['dasar'] })}>
            <option value="turunan">Turunan layanan utama</option><option value="aktivitas">Aktivitas (menit × orang/alat)</option><option value="manual">Biaya manual (+ GP%)</option><option value="tarif">Tarif manual (isi harga jual)</option></select></td>
          <td className="small">
            {x.dasar === 'turunan' && <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <select aria-label="Layanan dasar" value={x.bucket ?? ''} onChange={e => ubah(x.id, { bucket: e.target.value as Bucket, uom: undefined })}>
                <option value="">pilih…</option>{h.rateCard.map(r => <option key={r.bucket} value={r.bucket}>{BUCKET_LABEL[r.bucket]}</option>)}</select>
              <select aria-label="Satuan dasar" value={x.uom ?? ''} onChange={e => ubah(x.id, { uom: e.target.value })}>
                {(h.rateCard.find(r => r.bucket === x.bucket)?.opsiUom ?? []).filter(o => o.volume > 0).map(o => <option key={o.uom} value={o.uom}>{o.uom}</option>)}</select></span>}
            {x.dasar === 'aktivitas' && <span className="row" style={{ gap: 4 }}>
              <label>mnt <input aria-label="Menit per unit" type="number" step="0.05" value={x.menit ?? ''} onChange={e => ubah(x.id, { menit: num(e.target.value) })} {...inp(60)} /></label>
              <label>org <input aria-label="Orang" type="number" step="1" value={x.orang ?? ''} onChange={e => ubah(x.id, { orang: num(e.target.value) })} {...inp(48)} /></label>
              <label title="Pengali upah, mis. 1,5 untuk lembur">×<input aria-label="Pengali" type="number" step="0.1" value={x.pengali ?? ''} placeholder="1" onChange={e => ubah(x.id, { pengali: num(e.target.value) })} {...inp(48)} /></label>
              <label className="row" style={{ gap: 2 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!x.alat} onChange={e => ubah(x.id, { alat: e.target.checked })} />alat</label>
              <label>material Rp <input aria-label="Material per unit" type="number" value={x.material ?? ''} onChange={e => ubah(x.id, { material: num(e.target.value) })} {...inp(80)} /></label></span>}
            {x.dasar === 'manual' && <label>Rp <input aria-label="Biaya per unit" type="number" value={x.biaya ?? ''} onChange={e => ubah(x.id, { biaya: num(e.target.value) })} {...inp(100)} /> /unit</label>}
            {x.dasar === 'tarif' && <span className="row" style={{ gap: 4 }}>
              <label>tarif Rp <input aria-label="Tarif manual excl PPN" type="number" value={x.tarif ?? ''} onChange={e => ubah(x.id, { tarif: num(e.target.value) })} {...inp(110)} /></label>
              <label>biaya Rp <input aria-label="Biaya per unit (opsional)" type="number" value={x.biaya ?? ''} placeholder="opsional" onChange={e => ubah(x.id, { biaya: num(e.target.value) })} {...inp(100)} /></label></span>}
            {c?.dasarTeks && <div className="dasar-def">{c.dasarTeks}</div>}</td>
          <td className="num">{c ? rp(c.biayaPerUnit) : '…'}</td>
          <td className="num">{x.dasar === 'tarif' ? <>{c && c.biayaPerUnit > 0 ? persen(c.gpDipakai) : '—'}<div className="dasar-def">dari tarif</div></> : <>
            <input aria-label="GP tarif tambahan" type="number" step="0.1" value={x.gp == null ? '' : Math.round(x.gp * 1000) / 10}
            placeholder={c ? String(Math.round(c.gpDipakai * 1000) / 10) : ''} onChange={e => ubah(x.id, { gp: e.target.value === '' ? null : Number(e.target.value) / 100 })} {...inp(64)} />%
            {x.gp == null && <div className="dasar-def">default</div>}</>}</td>
          <td className={`num${ppnInclude ? '' : ' out'}`}><b>{c ? rp(c.tarifPerUnit) : '…'}</b></td>
          <td className={`num${ppnInclude ? ' out' : ''}`}>{c ? rp(c.tarifInclPpn) : '…'}</td>
          <td className="num"><input aria-label="Estimasi volume per bulan" type="number" value={x.volumeBulan ?? ''} onChange={e => ubah(x.id, { volumeBulan: num(e.target.value) })} {...inp(80)} /></td>
          <td className="num">{c && c.pendapatanBulan > 0 ? <>{rp(c.pendapatanBulan)}<div className="dasar-def">GP {rp(c.gpBulan)}</div></> : '—'}</td>
          <td><button className="danger" aria-label="Hapus tarif tambahan" onClick={() => onUbah(nilai.filter(y => y.id !== x.id))}>×</button></td>
        </tr>;
      })}</tbody>
      {totPend > 0 && <tfoot><tr><td colSpan={9}><b>Potensi pendapatan tambahan / bln</b> <span className="small muted">(di luar simulasi utama)</span></td><td className="num"><b>{rp(totPend)}</b><div className="dasar-def">GP {rp(totGp)} · {persen(totPend > 0 ? totGp / totPend : 0)}</div></td><td /></tr></tfoot>}
    </table></div>}
    <p className="small muted" style={{ margin: 0 }}>Turunan = biaya layanan utama dibagi volume dalam satuan lain (sama dengan opsi satuan rate card), GP default = GP layanan itu. Aktivitas = menit/unit ÷ 60 × (orang × tarif orang/jam × pengali + tarif alat/jam bila pakai alat) + material; GP default = GP total rate card. Tarif manual = harga jual diisi langsung (isi biaya bila ingin melihat GP). Satuan bisa dipilih atau diketik sendiri (✎).
      {' '}Tarif = biaya ÷ (1 − GP%) {h.pajak?.pphPersen ? `÷ (1 − PPh ${(h.pajak.pphPersen * 100).toFixed(0)}%) bila PPh exclude` : ''}, dibulatkan ke atas.</p>
  </div>;
}
