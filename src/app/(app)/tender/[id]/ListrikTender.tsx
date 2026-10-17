'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { hitungListrik, type DataListrik } from '@/lib/listrik';
import type { ListrikInput, TenderInput } from '@/lib/engine/types';
import { rp, angka } from '@/lib/format';

interface Sim { id: string; nama: string; is_template: boolean; data: DataListrik }
interface Tarif { golongan: string; tarif_kwh: number }
interface ItemW { item: string; daya_watt: number | null }
type Simulasi = NonNullable<TenderInput['listrikSimulasi']>;

/** Listrik di tender: ambil dari simulasi Utilities (Price Inquiry) atau pilih peralatan dari daftar — tidak diketik manual. */
export default function ListrikTender({ simulasi, listrik, golongan, tarifKwh, tarif, items, onSimulasi, onListrik, onTarif }: {
  simulasi: Simulasi | null | undefined; listrik: ListrikInput[]; golongan: string; tarifKwh: number; tarif: Tarif[]; items: ItemW[];
  onSimulasi: (s: Simulasi | null) => void; onListrik: (l: ListrikInput[]) => void; onTarif: (golongan: string, tarifKwh: number) => void;
}) {
  const [sims, setSims] = useState<Sim[]>([]);
  useEffect(() => {
    supabaseBrowser().from('electricity_simulations').select('id, nama, is_template, data').order('is_template', { ascending: false }).order('updated_at', { ascending: false })
      .then(({ data }: { data: Sim[] | null }) => setSims(data ?? []));
  }, []);
  const [mode, setMode] = useState<'simulasi' | 'alat'>(simulasi ? 'simulasi' : listrik.length ? 'alat' : 'simulasi');

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
            <option value="simulasi">Simulasi Utilities (Price Inquiry)</option>
            <option value="alat">Pilih peralatan per titik</option>
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
        <div className="tablewrap"><table>
          <thead><tr><th>Peralatan</th><th className="num">Watt</th><th className="num">Qty</th><th className="num">Jam/hari</th><th className="num">kWh/hari</th><th></th></tr></thead>
          <tbody>
            {listrik.length === 0 && <tr><td colSpan={6} className="muted">Belum ada peralatan.</td></tr>}
            {listrik.map((l, i) => {
              const ubah = (p: Partial<ListrikInput>) => onListrik(listrik.map((x, j) => j === i ? { ...x, ...p } : x));
              return <tr key={i}>
                <td style={{ minWidth: 260 }}><select aria-label="Peralatan" value={katalog.some(k => k.nama === l.item) ? l.item : ''} onChange={e => {
                  const k = katalog.find(x => x.nama === e.target.value); if (k) ubah({ item: k.nama, watt: k.watt, jamPerHari: k.jam || l.jamPerHari });
                }}>
                  <option value="">{l.item ? `${l.item} (tidak ada di daftar)` : '— pilih peralatan —'}</option>
                  {katalog.map(k => <option key={k.nama} value={k.nama}>{k.nama} · {angka(k.watt)} W</option>)}
                </select></td>
                <td className="num">{angka(l.watt)}</td>
                <td className="num"><input aria-label="Qty" type="number" min={0} value={l.qty} onChange={e => ubah({ qty: Number(e.target.value) })} style={{ width: 80, minWidth: 80 }} /></td>
                <td className="num"><input aria-label="Jam per hari" type="number" min={0} max={24} value={l.jamPerHari} onChange={e => ubah({ jamPerHari: Number(e.target.value) })} style={{ width: 70, minWidth: 70 }} /></td>
                <td className="num">{angka(l.watt * l.qty * l.jamPerHari / 1000, 1)}</td>
                <td><button className="danger" onClick={() => onListrik(listrik.filter((_, j) => j !== i))}>Hapus</button></td>
              </tr>;
            })}
          </tbody></table></div>
        <div className="row"><button className="ghost" disabled={!katalog.length} onClick={() => { const k = katalog[0]; onListrik([...listrik, { item: k.nama, watt: k.watt, qty: 1, jamPerHari: k.jam || 8 }]); }}>+ Tambah peralatan</button>
          <span className="small muted">Daftar peralatan dari kalkulator listrik (Utilities) dan item Price Inquiry yang punya daya watt.</span></div>
      </>}
    </div>);
}
