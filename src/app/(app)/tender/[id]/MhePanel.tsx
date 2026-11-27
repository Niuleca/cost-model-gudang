'use client';
import UmurKontrak, { periodeDepresiasi } from '@/components/UmurKontrak';
import type { MheInput } from '@/lib/engine/types';
import { rp, angka } from '@/lib/format';

import { ALAT_IT, jenisMhe, pilihItemMhe } from '@/lib/mheOtomatis';
import InputDesimal from '@/components/InputDesimal';
interface Item { id: number; kategori: string; item: string; vendor?: string | null; tinggi_angkat_m?: number | null; harga_beli: number | null; harga_sewa_bulan: number | null; umur_ekonomis_bulan: number | null; status_efektif: string; mhe_tipe: string | null; kapasitas_ton: number | null; sumber_tenaga: string | null }
type Mhe = MheInput & { priceItemId?: number };

/** Kebutuhan MHE = equipment dari Value Stream Mapping (MHE Summary). User cukup memilih item harga per alat. */
export default function MhePanel({ kebutuhan, mhe, items, metodeExcel, onChange, kontrakBulan, alatRak, opsiPilih }: {
  opsiPilih?: { tonPerPalet?: number; tinggiBeamM?: number };
  kontrakBulan: number;
  /** Pilihan otomatis CBT / RT untuk aktivitas rak + pengaturan tinggi angkat CBT */
  alatRak?: { tool: 'CBT' | 'RT'; alasan: string; batasMm: number; onBatas: (mm: number) => void; manual: number };
  kebutuhan: { nama: string; fte: number | null; unit: number | null }[];   // dari process design / hasil hitung
  mhe: Mhe[]; items: Item[]; metodeExcel: boolean; onChange: (m: Mhe[]) => void;
}) {
  const namaKeb = kebutuhan.map(k => k.nama);
  const baris = [...kebutuhan, ...mhe.filter(m => !namaKeb.includes(m.tool)).map(m => ({ nama: m.tool, fte: null, unit: null, yatim: true }))] as
    { nama: string; fte: number | null; unit: number | null; yatim?: boolean }[];
  const pilihan = items.filter(x => x.kategori === 'MHE' || x.kategori === 'IT');
  const ubah = (tool: string, patch: Partial<Mhe>) => {
    const ada = mhe.find(m => m.tool === tool);
    onChange(ada ? mhe.map(m => m.tool === tool ? { ...m, ...patch } : m)
      : [...mhe, { tool, nama: '', mode: 'sewa', harga: 0, umurBulan: 60, ketersediaan: 0.85, sparePersen: 0, ...patch }]);
  };
  const hargaDari = (it: Item, mode: 'sewa' | 'beli') => Number((mode === 'sewa' ? it.harga_sewa_bulan : it.harga_beli) ?? 0);
  let total = 0;

  return (
    <div className="card" style={{ gap: 10 }}>
      <h2>Kebutuhan MHE</h2>
      <p className="small muted">Daftar alat diambil otomatis dari Value Stream Mapping (kolom Equipment dan Alat pendukung).
        {metodeExcel ? ' Unit = ROUNDUP(FTE alat) + spare, sama dengan MHE Summary.' : ' Unit dihitung saat tombol Hitung (metode per shift).'} Pilih item harga supaya biayanya masuk cost model; alat tanpa item harga tidak dihitung biayanya.</p>
      {alatRak && <div className="notice small" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span>Alat rak (putaway, replenishment, picking palet) otomatis: <b>{alatRak.tool === 'RT' ? 'Reach Truck (RT)' : 'Forklift counterbalance (CBT)'}</b> — {alatRak.alasan}.
          {alatRak.manual > 0 && <> {alatRak.manual} aktivitas diubah manual di Value Stream Mapping (tidak ikut otomatis).</>}</span>
        <label className="row" style={{ gap: 6, margin: 0, flexWrap: 'nowrap' }}>Tinggi angkat maks CBT
          <InputDesimal step="any" min={1} aria-label="Tinggi angkat maksimal CBT (m)" value={alatRak.batasMm / 1000}
            onChange={e => { const v = Number(e.target.value); if (v > 0) alatRak.onBatas(Math.round(v * 1000)); }} style={{ width: 70, minWidth: 70, textAlign: 'right' }} /> m</label>
      </div>}
      <div className="tablewrap"><table>
        <thead><tr><th>Equipment (dari aktivitas)</th><th className="num">FTE</th><th className="num">Unit kebutuhan</th><th>Item harga</th><th>Mode</th>
          <th className="num">Harga</th><th className="num">Umur (bln)</th>{!metodeExcel && <th className="num">Ketersediaan %</th>}<th className="num">Spare %</th>
          <th className="num">Total unit</th><th className="num">Biaya/bln</th><th></th></tr></thead>
        <tbody>
          {baris.length === 0 && <tr><td colSpan={12} className="muted">Belum ada equipment di Value Stream Mapping.</td></tr>}
          {baris.map(b => {
            const m = mhe.find(x => x.tool === b.nama);
            const spare = b.unit && m ? Math.ceil(b.unit * (m.sparePersen || 0) - 1e-9) : 0;
            const unitTot = (b.unit ?? 0) + spare;
            const biaya = m && m.harga ? (m.mode === 'sewa' ? unitTot * m.harga : unitTot * m.harga / periodeDepresiasi(m.umurBulan, kontrakBulan, m.umurManual)) : 0;
            total += biaya;
            return (
              <tr key={b.nama} style={b.yatim ? { opacity: 0.7 } : undefined}>
                <td><b>{b.nama}</b>{b.yatim && <div className="small" style={{ color: 'var(--warn)' }}>tidak dipakai di aktivitas</div>}</td>
                <td className="num">{b.fte != null ? angka(b.fte, 2) : '–'}</td>
                <td className="num"><b>{b.unit ?? '–'}</b></td>
                <td><select aria-label={`Item harga ${b.nama}`} value={m?.priceItemId ?? ''} style={{ minWidth: 240 }} onChange={e => {
                  const it = pilihan.find(x => x.id === Number(e.target.value));
                  if (!it) { ubah(b.nama, { priceItemId: undefined, nama: '', harga: 0, otomatis: false, vendor: null }); return; }
                  const mode = m?.mode ?? (Number(it.harga_sewa_bulan) > 0 ? 'sewa' : 'beli');
                  ubah(b.nama, { priceItemId: it.id, nama: it.item, harga: hargaDari(it, mode), mode, umurBulan: it.umur_ekonomis_bulan ?? m?.umurBulan ?? 60, umurManual: false, otomatis: false, vendor: it.vendor ?? null });
                }}>
                  <option value="">— tanpa biaya —</option>
                  {['MHE', 'IT'].map(kat => <optgroup key={kat} label={kat}>{pilihan.filter(x => x.kategori === kat).map(x => (
                    <option key={x.id} value={x.id}>{x.mhe_tipe ? `${x.mhe_tipe} ${x.kapasitas_ton ?? ''}T${x.sumber_tenaga ? ' ' + x.sumber_tenaga : ''} · ` : ''}{x.item}{x.vendor ? ` · ${x.vendor}` : ''}{x.status_efektif !== 'approved' ? ` (${x.status_efektif})` : ''}</option>))}</optgroup>)}
                </select>
                  {(() => { const p = pilihItemMhe(b.nama, items, opsiPilih);
                    if (ALAT_IT.test(b.nama) && !jenisMhe(b.nama)) return <div className="small muted">biaya {b.nama} dihitung di Kebutuhan IT (di bawah) — biarkan tanpa biaya agar tidak dobel</div>;
                    if (m?.otomatis) return <div className="small" style={{ color: 'var(--accent-ink, #0f766e)' }}>otomatis · {p?.alasan ?? 'termurah'}</div>;
                    if (p && m) return <div className="small muted">manual · <button type="button" className="linkbtn" onClick={() => ubah(b.nama, { otomatis: true })}>pakai termurah ({p.item.item}{p.item.vendor ? ` · ${p.item.vendor}` : ''} {rp(p.harga)})</button></div>;
                    if (!p && jenisMhe(b.nama)) return <div className="small muted">belum ada harga {jenisMhe(b.nama)} yang memenuhi kapasitas di Price Inquiry</div>;
                    return null; })()}</td>
                <td><select aria-label="Mode" style={{ minWidth: 86 }} value={m?.mode ?? 'sewa'} disabled={!m} onChange={e => {
                  const mode = e.target.value as 'sewa' | 'beli'; const it = pilihan.find(x => x.id === m?.priceItemId);
                  ubah(b.nama, { mode, harga: it ? hargaDari(it, mode) : m?.harga ?? 0 });
                }}><option value="sewa">Sewa</option><option value="beli">Beli</option></select></td>
                <td className="num db"><InputDesimal aria-label="Harga" value={m?.harga ?? ''} disabled={!m} onChange={e => ubah(b.nama, { harga: Number(e.target.value) })} style={{ width: 120, minWidth: 120 }} /></td>
                <td className="num"><UmurKontrak umur={m?.umurBulan} manual={m?.umurManual} kontrak={kontrakBulan} disabled={!m || m.mode === 'sewa'} onChange={v => ubah(b.nama, { umurBulan: v, umurManual: true })} onReset={() => ubah(b.nama, { umurManual: false })} /></td>
                {!metodeExcel && <td className="num"><InputDesimal aria-label="Ketersediaan" value={m ? +(m.ketersediaan * 100).toFixed(1) : ''} disabled={!m} onChange={e => ubah(b.nama, { ketersediaan: Number(e.target.value) / 100 })} style={{ width: 70, minWidth: 70 }} /></td>}
                <td className="num"><InputDesimal aria-label="Spare" value={m ? +(m.sparePersen * 100).toFixed(1) : ''} disabled={!m} onChange={e => ubah(b.nama, { sparePersen: Number(e.target.value) / 100 })} style={{ width: 70, minWidth: 70 }} /></td>
                <td className="num"><b>{b.unit != null ? unitTot : '–'}</b></td>
                <td className="num">{biaya ? rp(biaya) : <span className="small muted">tanpa biaya</span>}</td>
                <td>{b.yatim && <button className="danger" onClick={() => onChange(mhe.filter(x => x.tool !== b.nama))}>Hapus</button>}</td>
              </tr>);
          })}
          {baris.length > 0 && <tr style={{ background: 'var(--link)' }}><td colSpan={metodeExcel ? 9 : 10}><b>Total estimasi biaya MHE / bulan</b></td><td className="num"><b>{rp(total)}</b></td><td></td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
