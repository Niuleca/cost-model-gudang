'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { hitungListrik, type DataListrik } from '@/lib/listrik';
import type { ListrikInput, TenderInput } from '@/lib/engine/types';
import { rp, angka } from '@/lib/format';
import { listrikDefault, type BarisListrik, type DriverListrik } from '@/lib/utilitas';

interface Sim { id: string; nama: string; is_template: boolean; data: DataListrik }
interface Tarif { golongan: string; tarif_kwh: number }
interface ItemW { item: string; daya_watt: number | null }
type Simulasi = NonNullable<TenderInput['listrikSimulasi']>;

/** Listrik di tender: ambil dari simulasi Utilities (Price Inquiry) atau pilih peralatan dari daftar — tidak diketik manual. */
export default function ListrikTender({ simulasi, listrik, golongan, tarifKwh, tarif, items, onSimulasi, onListrik, onTarif, driver }: {
  simulasi: Simulasi | null | undefined; listrik: ListrikInput[]; golongan: string; tarifKwh: number; tarif: Tarif[]; items: ItemW[];
  onSimulasi: (s: Simulasi | null) => void; onListrik: (l: ListrikInput[]) => void; onTarif: (golongan: string, tarifKwh: number) => void;
  driver?: DriverListrik;
}) {
  const [sims, setSims] = useState<Sim[]>([]);
  useEffect(() => {
    supabaseBrowser().from('electricity_simulations').select('id, nama, is_template, data').order('is_template', { ascending: false }).order('updated_at', { ascending: false })
      .then(({ data }: { data: Sim[] | null }) => setSims(data ?? []));
  }, []);
  const [mode, setMode] = useState<'simulasi' | 'alat'>(simulasi ? 'simulasi' : 'alat');
  const def = useMemo(() => (driver ? listrikDefault(driver) : []), [driver]);
  // daftar default otomatis saat belum ada isian (tetap bisa diubah / dihapus)
  useEffect(() => { if (driver && !simulasi && listrik.length === 0 && def.length) onListrik(def); }, [!!driver]); // eslint-disable-line react-hooks/exhaustive-deps
  // baris default ikut data terbaru (qty & status merah) selama belum diubah manual
  const sinkronDefault = () => onListrik(listrik.map(l => { const b = l as BarisListrik; const d = b.kunci ? def.find(x => x.kunci === b.kunci) : undefined; return d && !(b as { manual?: boolean }).manual ? { ...d } : l; }));
  const merah = (listrik as BarisListrik[]).filter(l => l.belumDiketahui).length;

  // Daftar peralatan: dari template/simulasi Utilities + item Price Inquiry yang punya daya (watt)
  const katalog = useMemo(() => {
    const m = new Map<string, { nama: string; watt: number; jam: number }>();
    for (const s of sims) for (const a of s.data?.alat ?? []) if (a.nama && !m.has(a.nama)) m.set(a.nama, { nama: a.nama, watt: Number(a.watt) || 0, jam: Number(a.jam) || 0 });
    for (const it of items) if (it.daya_watt && !m.has(it.item)) m.set(it.item, { nama: it.item, watt: Number(it.daya_watt), jam: 8 });
    return Array.from(m.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [sims, items]);

  const sim = sims.find(s => s.id === simulasi?.id);
  const live = sim ? hitungListrik(sim.data) : null;
  const pilihSim = (id: string) => {
    const s = sims.find(x => x.id === id);
    if (!s) { onSimulasi(null); return; }
    const h = hitungListrik(s.data);
    onSimulasi({ id: s.id, nama: s.nama, totalBulan: Math.round(h.total), kwhBulan: Math.round(h.kwhPakai) });
  };
  const berubah = live && simulasi && Math.round(live.total) !== simulasi.totalBulan;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row">
        <label className="f" htmlFor="sumber-listrik" style={{ minWidth: 260 }}>Sumber biaya listrik
          <select id="sumber-listrik" value={mode} onChange={e => { const m = e.target.value as 'simulasi' | 'alat'; setMode(m); if (m === 'alat') onSimulasi(null); }}>
            <option value="alat">Daftar peralatan (default dari data tender)</option>
            <option value="simulasi">Simulasi Utilities (Price Inquiry)</option>
          </select></label>
      </div>

      {mode === 'simulasi' ? <>
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="f" htmlFor="sim-listrik" style={{ minWidth: 320, flex: 1 }}>Simulasi listrik
            <select id="sim-listrik" value={simulasi?.id ?? ''} onChange={e => pilihSim(e.target.value)}>
              <option value="">— pilih simulasi —</option>
              {sims.map(s => <option key={s.id} value={s.id}>{s.nama}{s.is_template ? ' (template)' : ''}</option>)}
            </select></label>
          <Link className="btn ghost" href="/price/utilities">Buka kalkulator listrik</Link>
        </div>
        {simulasi && <div className="tablewrap"><table><tbody>
          <tr><td>Simulasi</td><td><b>{simulasi.nama}</b></td></tr>
          {live && <>
            <tr><td>Daya terpasang / dibutuhkan</td><td>{angka(live.dayaW)} W · {angka(live.kvaButuh, 2)} kVA {live.kurangDaya && <span className="pill bad">melebihi kVA terpasang</span>}</td></tr>
            <tr><td>Pemakaian</td><td>{angka(live.kwhPakai)} kWh/bln (LWBP {angka(live.lwbp)} · WBP {angka(live.wbp)})</td></tr>
            <tr><td>Energi · kVArh · beban</td><td>{rp(live.biayaEnergi)} · {rp(live.biayaKvarh)} · {rp(live.biayaBeban)}</td></tr>
          </>}
          <tr><td><b>Biaya listrik per bulan (masuk cost model)</b></td><td className="out"><b>{rp(simulasi.totalBulan)}</b>
            {berubah && <> <span className="pill warn">simulasi sudah berubah: {rp(live!.total)}</span> <button className="ghost" onClick={() => pilihSim(simulasi.id)}>Perbarui</button></>}</td></tr>
        </tbody></table></div>}
        {!simulasi && <p className="small muted">Belum dipilih — biaya listrik dihitung dari daftar peralatan (bila ada).</p>}
      </> : <>
        <label className="f" htmlFor="gol" style={{ maxWidth: 420 }}>Golongan tarif PLN
          <select id="gol" value={golongan} onChange={e => { const g = tarif.find(x => x.golongan === e.target.value); onTarif(e.target.value, Number(g?.tarif_kwh ?? tarifKwh)); }}>
            {tarif.map(x => <option key={x.golongan} value={x.golongan}>{x.golongan} — {rp(x.tarif_kwh, 2)}/kWh</option>)}
          </select></label>
        {driver && <div className="row" style={{ alignItems: 'center' }}>
          <button className="ghost" onClick={() => onListrik(def)}>Isi ulang default dari data tender</button>
          <button className="ghost" onClick={sinkronDefault} disabled={!listrik.some(l => (l as BarisListrik).kunci)}>Perbarui qty default</button>
          {!listrik.some(l => (l as BarisListrik).kunci) ? <span className="pill warn">Daftar manual — klik "Isi ulang default" untuk memakai daftar dari data tender</span>
            : merah > 0 ? <span className="pill bad">{merah} item belum diketahui — lengkapi datanya (baris merah)</span> : <span className="pill ok">Semua item punya dasar data</span>}
        </div>}
        <div className="tablewrap fit"><table className="tabel-fit">
          <thead><tr><th>Peralatan</th><th className="num">Watt</th><th className="num">Qty</th><th className="num">Jam/hari</th><th className="num">kWh/bln</th><th>Dasar</th><th></th></tr></thead>
          <tbody>
            {listrik.length === 0 && <tr><td colSpan={7} className="muted">Belum ada peralatan.</td></tr>}
            {listrik.map((l, i) => {
              const b = l as BarisListrik;
              const ubah = (p: Partial<ListrikInput>) => onListrik(listrik.map((x, j) => j === i ? { ...x, ...p, manual: true, belumDiketahui: undefined } as ListrikInput : x));
              return <tr key={i} className={b.belumDiketahui ? 'baris-merah' : undefined}>
                <td>{b.kunci ? <b>{l.item}</b> : <select aria-label="Peralatan" value={katalog.some(k => k.nama === l.item) ? l.item : ''} onChange={e => {
                  const k = katalog.find(x => x.nama === e.target.value); if (k) ubah({ item: k.nama, watt: k.watt, jamPerHari: k.jam || l.jamPerHari });
                }}>
                  <option value="">{l.item ? `${l.item} (tidak ada di daftar)` : '— pilih peralatan —'}</option>
                  {katalog.map(k => <option key={k.nama} value={k.nama}>{k.nama} · {angka(k.watt)} W</option>)}
                </select>}</td>
                <td className="num"><input aria-label="Watt" type="number" min={0} value={l.watt} onChange={e => ubah({ watt: Number(e.target.value) })} style={{ width: 76, minWidth: 0 }} /></td>
                <td className="num"><input aria-label="Qty" type="number" min={0} value={l.qty} onChange={e => ubah({ qty: Number(e.target.value) })} style={{ width: 64, minWidth: 0 }} /></td>
                <td className="num"><input aria-label="Jam per hari" type="number" min={0} max={24} value={l.jamPerHari} onChange={e => ubah({ jamPerHari: Number(e.target.value) })} style={{ width: 56, minWidth: 0 }} /></td>
                <td className="num">{angka(l.watt * l.qty * l.jamPerHari * 30 / 1000, 0)}</td>
                <td className="small">{b.dasar ?? <span className="muted">manual</span>}</td>
                <td><button className="ghost" aria-label="Hapus" style={{ padding: '0 8px' }} onClick={() => onListrik(listrik.filter((_, j) => j !== i))}>×</button></td>
              </tr>;
            })}
          </tbody></table></div>
        {listrik.length > 0 && <p className="small"><b>Total ±{angka(listrik.reduce((t, l) => t + l.watt * l.qty * l.jamPerHari * 30 / 1000, 0), 0)} kWh/bln</b> × {rp(tarifKwh, 2)}/kWh = <b>{rp(listrik.reduce((t, l) => t + l.watt * l.qty * l.jamPerHari * 30 / 1000, 0) * tarifKwh)}</b>/bln (estimasi 30 hari, belum termasuk biaya beban)</p>}
        <div className="row"><button className="ghost" disabled={!katalog.length} onClick={() => { const k = katalog[0]; onListrik([...listrik, { item: k.nama, watt: k.watt, qty: 1, jamPerHari: k.jam || 8 }]); }}>+ Tambah peralatan</button>
          <span className="small muted">Daftar peralatan dari kalkulator listrik (Utilities) dan item Price Inquiry yang punya daya watt.</span></div>
      </>}
    </div>);
}
