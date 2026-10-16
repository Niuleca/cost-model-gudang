'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useProfile } from '@/lib/useProfile';
import { rp, angka } from '@/lib/format';
import { hitungListrik, exportListrikExcel, type DataListrik } from '@/lib/listrik';

interface Sim { id: string; nama: string; is_template: boolean; data: DataListrik; updated_at: string }
interface Tarif { golongan: string; tarif_kwh: number }
const PENULIS = ['engineering', 'procurement', 'solution_design', 'admin'];
const n = (v: string) => (v === '' ? 0 : Number(v));

/** Utilities · Kalkulator kebutuhan listrik (peralatan × ruang → kWh → biaya/bulan), format sama dengan Excel. */
export default function ListrikCalculator({ contoh }: { contoh?: DataListrik } = {}) {
  const sb = supabaseBrowser();
  const { profile } = useProfile();
  const [sims, setSims] = useState<Sim[]>([]);
  const [tarif, setTarif] = useState<Tarif[]>([]);
  const [pilih, setPilih] = useState('');
  const [d, setD] = useState<DataListrik | null>(null);
  const [nama, setNama] = useState('');
  const [kotor, setKotor] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const boleh = !!profile && PENULIS.includes(profile.role);

  const muat = useCallback(async (idPilih?: string) => {
    const [a, b] = await Promise.all([
      sb.from('electricity_simulations').select('id, nama, is_template, data, updated_at').order('is_template', { ascending: false }).order('updated_at', { ascending: false }),
      sb.from('electricity_tariffs').select('golongan, tarif_kwh').order('golongan'),
    ]);
    const xs = (a.data ?? []) as Sim[];
    setSims(xs); setTarif((b.data ?? []) as Tarif[]);
    const s = xs.find(x => x.id === idPilih) ?? xs[0];
    if (s) { setPilih(s.id); setD(structuredClone(s.data)); setNama(s.nama); setKotor(false); }
    else if (contoh) { setD(structuredClone(contoh)); setNama('Contoh'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { muat(); }, [muat]);

  const h = useMemo(() => d && hitungListrik(d), [d]);
  if (!d || !h) return <p className="muted">Memuat kalkulator…</p>;

  const set = (patch: Partial<DataListrik>) => { setD({ ...d, ...patch }); setKotor(true); };
  const setAlat = (i: number, patch: Partial<DataListrik['alat'][number]>) => set({ alat: d.alat.map((a, j) => j === i ? { ...a, ...patch } : a) });
  const setQty = (ri: number, id: string, v: number) => set({ ruang: d.ruang.map((r, j) => j === ri ? { ...r, qty: { ...r.qty, [id]: v } } : r) });
  const sim = sims.find(s => s.id === pilih);

  async function simpan(baru: boolean) {
    if (!d) return;
    setPesan(null);
    const namaBaru = baru ? (window.prompt('Nama skenario baru (mis. nama site / tender):', `${nama} (salinan)`) ?? '').trim() : nama;
    if (!namaBaru) return;
    const res = baru || !sim
      ? await sb.from('electricity_simulations').insert({ nama: namaBaru, data: d, is_template: false }).select('id').single()
      : await sb.from('electricity_simulations').update({ nama: namaBaru, data: d }).eq('id', sim.id).select('id').single();
    if (res.error) { setPesan(`Gagal menyimpan: ${res.error.message}`); return; }
    setPesan('Tersimpan.'); muat((res.data as { id: string }).id);
  }

  const inp = (v: number, on: (x: number) => void, w = 80, step = 'any') =>
    boleh ? <input type="number" step={step} value={Number.isFinite(v) ? v : 0} onChange={e => on(n(e.target.value))} style={{ width: w, minWidth: w, background: 'var(--input)' }} /> : (v ? v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '–');

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="row">
        <label className="f" htmlFor="sim" style={{ minWidth: 260 }}>Skenario
          <select id="sim" value={pilih} onChange={e => { const s = sims.find(x => x.id === e.target.value); if (s) { setPilih(s.id); setD(structuredClone(s.data)); setNama(s.nama); setKotor(false); } }}>
            {sims.map(s => <option key={s.id} value={s.id}>{s.is_template ? '★ ' : ''}{s.nama}</option>)}
          </select></label>
        {boleh && <label className="f" htmlFor="simnama" style={{ minWidth: 220 }}>Nama<input id="simnama" value={nama} onChange={e => { setNama(e.target.value); setKotor(true); }} /></label>}
        {boleh && <button onClick={() => simpan(false)} disabled={!kotor}>Simpan</button>}
        {boleh && <button className="ghost" onClick={() => simpan(true)}>Simpan sebagai skenario baru</button>}
        <button className="ghost" onClick={() => exportListrikExcel(nama, d)}>Export Excel (dengan rumus)</button>
        {pesan && <span className="small" role="status">{pesan}</span>}
      </div>
      {sim?.is_template && <p className="small muted">★ Template standar. Untuk site/tender tertentu, ubah jumlah per ruang lalu “Simpan sebagai skenario baru” supaya template tetap utuh.</p>}

      <div className="card">
        <h2>Jumlah peralatan listrik per ruang</h2>
        <p className="small muted">Kolom kuning = input. Watt × jumlah per ruang → total watt; × jam pakai/hari × {d.hariPerBulan} hari = Wh/bulan.</p>
        <div className="tablewrap" style={{ maxHeight: '60vh' }}><table>
          <thead><tr>
            <th>Peralatan</th><th className="num">Watt/unit</th><th className="num">Jam/hari</th>
            {d.ruang.map((r, ri) => (
              <th key={ri} className="num" style={{ minWidth: 90 }}>
                {boleh ? <input aria-label="Nama ruang" value={r.nama} onChange={e => set({ ruang: d.ruang.map((x, j) => j === ri ? { ...x, nama: e.target.value } : x) })} style={{ width: 100, minWidth: 100 }} /> : r.nama}
                {boleh && <button className="ghost" aria-label={`Hapus ruang ${r.nama}`} title="Hapus ruang" style={{ padding: '0 6px', marginLeft: 4 }} onClick={() => set({ ruang: d.ruang.filter((_, j) => j !== ri) })}>×</button>}
              </th>))}
            {boleh && <th><button className="ghost" onClick={() => set({ ruang: [...d.ruang, { nama: `Ruang ${d.ruang.length + 1}`, qty: {} }] })}>+ Ruang</button></th>}
            <th className="num">Total unit</th><th className="num">Total watt</th><th className="num">Jam/bulan</th><th className="num">Wh/bulan</th>{boleh && <th></th>}
          </tr></thead>
          <tbody>
            {d.alat.map((a, i) => {
              const x = h.perAlat[i];
              return (
                <tr key={a.id} style={x.whBulan ? undefined : { opacity: 0.75 }}>
                  <td>{boleh ? <input aria-label="Nama peralatan" value={a.nama} onChange={e => setAlat(i, { nama: e.target.value })} style={{ minWidth: 170 }} /> : a.nama}</td>
                  <td className="num">{inp(a.watt, v => setAlat(i, { watt: v }), 80)}</td>
                  <td className="num">{inp(a.jam, v => setAlat(i, { jam: Math.min(24, v) }), 60)}</td>
                  {d.ruang.map((r, ri) => <td key={ri} className="num">{inp(Number(r.qty[a.id] || 0), v => setQty(ri, a.id, v), 64)}</td>)}
                  {boleh && <td></td>}
                  <td className="num">{x.qty ? angka(x.qty, 1) : '–'}</td>
                  <td className="num"><b>{x.totalWatt ? angka(x.totalWatt) : '–'}</b></td>
                  <td className="num">{angka(x.jamBulan)}</td>
                  <td className="num">{x.whBulan ? angka(x.whBulan) : '–'}</td>
                  {boleh && <td><button className="danger" aria-label={`Hapus ${a.nama}`} onClick={() => set({ alat: d.alat.filter((_, j) => j !== i) })}>Hapus</button></td>}
                </tr>);
            })}
            <tr style={{ background: 'var(--surface-2)' }}>
              <td><b>Total watt per ruang</b></td><td></td><td></td>
              {h.perRuang.map((r, i) => <td key={i} className="num"><b>{angka(r.watt)}</b></td>)}
              {boleh && <td></td>}
              <td></td><td className="num"><b>{angka(h.dayaW)}</b></td><td></td><td className="num"><b>{angka(h.whBulan)}</b></td>{boleh && <td></td>}
            </tr>
          </tbody>
        </table></div>
        {boleh && <div className="row"><button className="ghost" onClick={() => set({ alat: [...d.alat, { id: `a${Date.now()}`, nama: 'Peralatan baru', watt: 0, jam: 8 }] })}>+ Peralatan</button></div>}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Parameter tarif</h2>
          <table><tbody>
            <tr><td>Hari kerja per bulan</td><td className="num">{inp(d.hariPerBulan, v => set({ hariPerBulan: v }), 70)}</td></tr>
            <tr><td>Allowance pemakaian listrik</td><td className="num">{inp(d.allowance * 100, v => set({ allowance: v / 100 }), 70)} %</td></tr>
            <tr><td>Porsi pemakaian LWBP</td><td className="num">{inp(Math.round(d.porsiLwbp * 1000) / 10, v => set({ porsiLwbp: v / 100 }), 70)} %</td></tr>
            <tr><td>Porsi WBP</td><td className="num">{angka((1 - d.porsiLwbp) * 100, 1)} %</td></tr>
            <tr><td>Golongan tarif PLN</td><td className="num">{boleh ? (
              <select aria-label="Golongan" value={d.golongan ?? ''} onChange={e => { const t = tarif.find(x => x.golongan === e.target.value); set({ golongan: e.target.value, ...(t ? { tarifLwbp: Number(t.tarif_kwh), tarifWbp: Number(t.tarif_kwh) } : {}) }); }}>
                <option value="">Manual</option>{tarif.map(t => <option key={t.golongan} value={t.golongan}>{t.golongan} · {rp(t.tarif_kwh, 2)}</option>)}
              </select>) : d.golongan}</td></tr>
            <tr><td>Tarif per kWh (LWBP)</td><td className="num">{inp(d.tarifLwbp, v => set({ tarifLwbp: v }), 100)}</td></tr>
            <tr><td>Tarif per kWh (WBP)</td><td className="num">{inp(d.tarifWbp, v => set({ tarifWbp: v }), 100)}</td></tr>
            <tr><td>Tarif kVArh</td><td className="num">{inp(d.tarifKvarh, v => set({ tarifKvarh: v }), 100)}</td></tr>
            <tr><td>Konsumsi kVArh (% dari kWh)</td><td className="num">{inp(d.porsiKvarh * 100, v => set({ porsiKvarh: v / 100 }), 70)} %</td></tr>
            <tr><td>Biaya beban per kVA per bulan</td><td className="num">{inp(d.bebanPerKva, v => set({ bebanPerKva: v }), 100)}</td></tr>
            <tr><td>Listrik terpasang (kVA)</td><td className="num">{inp(d.kvaTerpasang, v => set({ kvaTerpasang: v }), 80)}</td></tr>
            <tr><td>Power factor</td><td className="num">{inp(d.powerFactor, v => set({ powerFactor: v }), 70)}</td></tr>
          </tbody></table>
          <p className="small muted">Industri &gt; 200 kVA (I-3/TM) dan raksasa ≥ 30.000 kVA (I-4/TT) memakai tarif yang sama untuk blok WBP dan LWBP. Tabel tarif resmi ada di tab Tarif PLN.</p>
        </div>

        <div className="card">
          <h2>Hasil per bulan</h2>
          <table><tbody>
            <tr><td>Grand total kebutuhan listrik</td><td className="num">{angka(h.whBulan)} Wh</td></tr>
            <tr><td>Dalam kWh</td><td className="num">{angka(h.kwh, 1)} kWh</td></tr>
            <tr><td>Setelah allowance {angka(d.allowance * 100)}%</td><td className="num">{angka(h.kwhPakai, 1)} kWh</td></tr>
            <tr><td>Pemakaian LWBP</td><td className="num">{angka(h.lwbp, 1)} kWh</td></tr>
            <tr><td>Pemakaian WBP</td><td className="num">{angka(h.wbp, 1)} kWh</td></tr>
            <tr><td>Estimasi biaya energi</td><td className="num">{rp(h.biayaEnergi)}</td></tr>
            <tr><td>Biaya kVArh</td><td className="num">{rp(h.biayaKvarh)}</td></tr>
            <tr><td>Biaya beban ({angka(d.kvaTerpasang, 1)} kVA × {rp(d.bebanPerKva)})</td><td className="num">{rp(h.biayaBeban)}</td></tr>
            <tr style={{ background: 'var(--ink)', color: 'var(--bg)' }}><td><b>Total biaya listrik / bulan</b></td><td className="num"><b>{rp(h.total)}</b></td></tr>
          </tbody></table>
          <div className="kpis" style={{ marginTop: 10 }}>
            <div className="kpi"><span className="small muted">Daya tersambung</span><b>{angka(h.dayaW)} W</b></div>
            <div className="kpi"><span className="small muted">Kebutuhan daya (÷ PF {d.powerFactor})</span><b>{angka(h.kvaButuh, 2)} kVA</b></div>
          </div>
          {h.kurangDaya && <p className="error small" role="alert">kVA terpasang ({angka(d.kvaTerpasang, 1)}) lebih kecil dari kebutuhan daya ({angka(h.kvaButuh, 2)} kVA). Naikkan daya terpasang.</p>}
        </div>
      </div>
    </div>
  );
}
