'use client';
// Sheet Interest cost: simulasi pinjaman bank untuk capex / biaya tertentu.
// Pokok × bunga %/thn × tenor → total bunga, dibebankan rata selama kontrak sebagai baris biaya "Interest cost".
import { useMemo } from 'react';
import { T } from '@/lib/i18n';
import type { HasilTender } from '@/lib/engine/index.ts';
import type { InterestCost, InterestItem } from '@/lib/engine/types';
import { rp, persen } from '@/lib/format';

export const INTEREST_DEFAULT: InterestCost = { bungaTahun: 0.09, metode: 'flat', items: [] };
const idBaru = () => Math.random().toString(36).slice(2, 9);

export default function InterestPanel({ nilai, onChange, hasilLive, kontrakBulan }: {
  nilai: InterestCost | undefined; onChange: (v: InterestCost) => void; hasilLive: HasilTender | null; kontrakBulan: number;
}) {
  const ic = { ...INTEREST_DEFAULT, ...(nilai ?? {}) };
  const set = (p: Partial<InterestCost>) => onChange({ ...ic, ...p });
  const setItem = (id: string, p: Partial<InterestItem>) => set({ items: ic.items.map(x => x.id === id ? { ...x, ...p } : x) });
  const sumber = hasilLive?.sumberPinjaman ?? [];
  const hasilItem = new Map((hasilLive?.interestCost.items ?? []).map(x => [x.id, x]));
  const dipilih = new Set(ic.items.filter(x => x.sumber).map(x => x.sumber!));
  const kelompok = useMemo(() => Array.from(new Set(sumber.map(s => s.kelompok))), [sumber]);
  const totalCost = hasilLive?.totalBiayaBulan ?? 0;
  const ringkas = hasilLive?.interestCost;

  function toggleSumber(desk: string, on: boolean) {
    if (on) set({ items: [...ic.items, { id: idBaru(), sumber: desk, deskripsi: desk, aktif: true }] });
    else set({ items: ic.items.filter(x => x.sumber !== desk) });
  }

  return (<>
    <div className="card">
      <h2><T>Interest cost</T> — simulasi pinjaman bank</h2>
      <p className="small muted">Pilih capex atau biaya yang dananya dipinjam dari bank (atau tambah baris manual). Bunga pinjaman dihitung dari pokok × bunga %/thn × tenor,
        lalu dibebankan rata selama kontrak <b>{kontrakBulan} bln</b> sebagai kategori biaya <b>Interest cost</b> — ikut ke total cost, rate card, quotation dan export.</p>
      <div className="grid3">
        <label className="f" htmlFor="ic-bunga">Bunga pinjaman (%/tahun)
          <input id="ic-bunga" type="number" step="any" min={0} value={+(ic.bungaTahun * 100).toFixed(4)} onChange={e => set({ bungaTahun: e.target.value === '' ? 0 : Number(e.target.value) / 100 })} /></label>
        <label className="f" htmlFor="ic-metode">Metode bunga
          <select id="ic-metode" value={ic.metode} onChange={e => set({ metode: e.target.value as InterestCost['metode'] })}>
            <option value="flat">Flat — bunga atas pokok penuh selama tenor</option>
            <option value="menurun">Menurun — pokok dicicil rata, bunga atas sisa pokok</option>
          </select></label>
        <div className="umk-box"><span className="small muted">Contoh 1 bulan</span>
          <b>Rp100 jt × {persen(ic.bungaTahun, 2)} ÷ 12 = {rp(100_000_000 * ic.bungaTahun / 12)}/bln</b></div>
      </div>
    </div>

    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <h3>1 · Pilih capex</h3>
        {!hasilLive && <p className="muted small">Memuat data master… (daftar muncul setelah data master selesai dimuat)</p>}
        {hasilLive && !sumber.length && <p className="muted small">Belum ada capex di tender ini (semua MHE/racking/IT berstatus sewa). Gunakan baris manual.</p>}
        <p className="small muted">Hanya <b>capex</b> (barang dibeli → depresiasi, biaya sekali → amortisasi). Pokok default = nilai investasinya, bisa diubah di tabel di bawah. Untuk pinjaman lain (mis. sewa gudang dibayar di muka) pakai <b>+ Baris manual</b>.
          Capex yang dipilih otomatis <b>tidak lagi</b> dikenai “bunga modal” default supaya bunga tidak dihitung dua kali.</p>
        <div className="tablewrap" style={{ maxHeight: 460 }}><table>
          <thead><tr><th style={{ width: 36 }} /><th>Capex</th><th className="num">Biaya/bln</th><th className="num">Nilai capex (pokok default)</th></tr></thead>
          <tbody>{kelompok.map(k => [
            <tr key={`h-${k}`} className="kat-head"><td colSpan={4}><b>{k}</b></td></tr>,
            ...sumber.filter(s => s.kelompok === k).map(s => <tr key={s.deskripsi}>
              <td><input type="checkbox" aria-label={`Biayai ${s.deskripsi} dengan pinjaman`} checked={dipilih.has(s.deskripsi)} onChange={e => toggleSumber(s.deskripsi, e.target.checked)} /></td>
              <td>{s.deskripsi}</td>
              <td className="num">{rp(s.biayaBulan)}</td><td className="num">{rp(s.pokokDefault)}</td></tr>),
          ])}</tbody>
        </table></div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>2 · Pinjaman yang disimulasikan</h3>
          <button className="ghost" onClick={() => set({ items: [...ic.items, { id: idBaru(), deskripsi: 'Pinjaman manual', pokok: 0, aktif: true }] })}>+ Baris manual</button>
        </div>
        <div className="tablewrap"><table>
          <thead><tr><th style={{ width: 36 }}>Aktif</th><th>Deskripsi</th><th className="num">Pokok pinjaman</th><th className="num">Tenor (bln)</th>
            <th className="num">Bunga/bln</th><th className="num">Total bunga</th><th className="num">Interest cost/bln</th><th /></tr></thead>
          <tbody>
            {ic.items.map(x => { const h = hasilItem.get(x.id); const def = x.sumber ? sumber.find(s => s.deskripsi === x.sumber)?.pokokDefault : undefined;
              return <tr key={x.id} className={x.aktif ? undefined : 'muted'}>
                <td><input type="checkbox" aria-label="Aktif" checked={x.aktif} onChange={e => setItem(x.id, { aktif: e.target.checked })} /></td>
                <td>{x.sumber ? <>{x.deskripsi}{def == null && <div className="small bad">baris sumber tidak ada lagi</div>}</>
                  : <input aria-label="Deskripsi pinjaman" value={x.deskripsi} onChange={e => setItem(x.id, { deskripsi: e.target.value })} />}</td>
                <td className="num"><input type="number" min={0} step={1000000} style={{ width: 150, textAlign: 'right' }} aria-label="Pokok pinjaman"
                  value={x.pokok ?? ''} placeholder={def != null ? String(def) : '0'} onChange={e => setItem(x.id, { pokok: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td className="num"><input type="number" min={1} step={1} style={{ width: 80, textAlign: 'right' }} aria-label="Tenor bulan"
                  value={x.tenorBulan ?? ''} placeholder={String(kontrakBulan)} onChange={e => setItem(x.id, { tenorBulan: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td className="num">{h ? rp(h.bungaBulanAwal) : '—'}</td>
                <td className="num">{h ? rp(h.totalBunga) : '—'}</td>
                <td className="num"><b>{h ? rp(h.biayaBulan) : '—'}</b></td>
                <td><button className="linkbtn" onClick={() => set({ items: ic.items.filter(y => y.id !== x.id) })}>hapus</button></td>
              </tr>; })}
            {!ic.items.length && <tr><td colSpan={8} className="muted">Belum ada pinjaman. Centang baris di kiri atau tambah baris manual.</td></tr>}
            {ringkas && ic.items.length > 0 && <tr className="pd-sub"><td colSpan={2}><b>Total</b></td><td className="num"><b>{rp(ringkas.totalPokok)}</b></td><td />
              <td className="num"><b>{rp(ringkas.items.reduce((a, y) => a + y.bungaBulanAwal, 0))}</b></td><td className="num"><b>{rp(ringkas.totalBunga)}</b></td>
              <td className="num out"><b>{rp(ringkas.biayaBulan)}</b></td><td /></tr>}
          </tbody>
        </table></div>
        {ringkas && ringkas.biayaBulan > 0 && <div className="umk-box">
          <span className="small">Interest cost <b>{rp(ringkas.biayaBulan)}/bln</b> = {persen(ringkas.biayaBulan / (totalCost || 1))} dari total cost {rp(totalCost)}/bln · selama kontrak {rp(ringkas.biayaBulan * kontrakBulan)}.</span></div>}
        <details className="small muted"><summary>Cara hitung</summary>
          <p><b>Flat:</b> total bunga = pokok × bunga/12 × tenor. <b>Menurun:</b> pokok dicicil rata, total bunga = pokok × bunga/12 × (tenor + 1) ÷ 2.
            Interest cost/bln = total bunga ÷ durasi kontrak ({kontrakBulan} bln). Tenor kosong = durasi kontrak. Alokasi ke storage/handling mengikuti baris sumbernya (baris manual: 40/30/30).
            Tekan <b>Hitung</b> untuk memperbarui tab Hasil.</p></details>
      </div>
    </div>
  </>);
}
