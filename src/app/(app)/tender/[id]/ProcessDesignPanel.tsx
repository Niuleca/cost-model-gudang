'use client';
import { useMemo } from 'react';
import type { AktivitasInput, VolumeInput } from '@/lib/engine/types';
import { hitungProcessDesign, PD_DEFAULT, type KalenderResource, type ProcessDesignInput } from '@/lib/engine/processDesign';
import { angka } from '@/lib/format';

const f2 = (x: number) => (x ? x.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
const f0 = (x: number) => (x ? Math.round(x).toLocaleString('id-ID') : '–');
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Process Design & Resource Calculation (format Excel): kalender kerja MP/MHE, shift, rincian per task, ringkasan MP & MHE. */
export default function ProcessDesignPanel({ bagian, aktivitas, volumes, pd: pdIn, faktorProduktivitas, efisiensi, jumlahShift, onPd, onFaktor, onShift }: {
  bagian: 'ringkasan' | 'rincian' | 'desain';
  aktivitas: AktivitasInput[]; volumes: VolumeInput[]; pd?: ProcessDesignInput; faktorProduktivitas: number; efisiensi: number;
  jumlahShift: number;
  onPd: (pd: ProcessDesignInput) => void; onFaktor: (patch: { faktorProduktivitas?: number; efisiensi?: number }) => void; onShift: (n: number) => void;
}) {
  const pd = { ...PD_DEFAULT, ...(pdIn ?? {}), mp: { ...PD_DEFAULT.mp, ...(pdIn?.mp ?? {}) }, mhe: { ...PD_DEFAULT.mhe, ...(pdIn?.mhe ?? {}) } };
  const h = useMemo(() => hitungProcessDesign(aktivitas, volumes, pd, faktorProduktivitas, efisiensi, jumlahShift),
    [aktivitas, volumes, JSON.stringify(pd), faktorProduktivitas, efisiensi, jumlahShift]); // eslint-disable-line react-hooks/exhaustive-deps

  const setKal = (jenis: 'mp' | 'mhe', key: keyof KalenderResource, v: number) => onPd({ ...pd, [jenis]: { ...pd[jenis], [key]: v } });
  const inp = (v: number, on: (x: number) => void, w = 64) => (
    <input type="number" step="any" value={Number.isFinite(v) ? v : 0} onChange={e => on(e.target.value === '' ? 0 : Number(e.target.value))}
      style={{ width: w, minWidth: w, textAlign: 'right', background: 'var(--input)' }} />);
  const km = h.kalender.mp, kh = h.kalender.mhe;
  const barisKal: { label: string; key?: keyof KalenderResource; mp: number; mhe: number; tebal?: boolean; satuan: string }[] = [
    { label: 'Total hari per tahun', key: 'totalHari', mp: pd.mp.totalHari, mhe: pd.mhe.totalHari, satuan: 'hari' },
    { label: 'Minggu (libur)', key: 'minggu', mp: pd.mp.minggu, mhe: pd.mhe.minggu, satuan: 'hari' },
    { label: 'Cuti tahunan', key: 'cuti', mp: pd.mp.cuti, mhe: pd.mhe.cuti, satuan: 'hari' },
    { label: 'Libur nasional', key: 'libur', mp: pd.mp.libur, mhe: pd.mhe.libur, satuan: 'hari' },
    { label: 'Sakit / repair', key: 'sakit', mp: pd.mp.sakit, mhe: pd.mhe.sakit, satuan: 'hari' },
    { label: 'Sub total tidak kerja', mp: km.off, mhe: kh.off, satuan: 'hari' },
    { label: 'Hari kerja per tahun', mp: km.hariTahun, mhe: kh.hariTahun, satuan: 'hari' },
    { label: 'Hari kerja per bulan', mp: km.hariBulan, mhe: kh.hariBulan, satuan: 'hari' },
    { label: 'Sabtu kerja per tahun', key: 'sabtuPerTahun', mp: pd.mp.sabtuPerTahun, mhe: pd.mhe.sabtuPerTahun, satuan: 'hari' },
    { label: 'Sabtu per bulan', mp: km.sabtuBulan, mhe: kh.sabtuBulan, satuan: 'hari' },
    { label: 'Weekday per bulan', mp: km.weekdayBulan, mhe: kh.weekdayBulan, satuan: 'hari' },
    { label: 'Jam efektif Sabtu', key: 'jamSabtu', mp: pd.mp.jamSabtu, mhe: pd.mhe.jamSabtu, satuan: 'jam/hari' },
    { label: 'Jam efektif weekday', key: 'jamWeekday', mp: pd.mp.jamWeekday, mhe: pd.mhe.jamWeekday, satuan: 'jam/hari' },
    { label: 'Man hour Sabtu', mp: km.jamSabtu, mhe: kh.jamSabtu, satuan: 'jam' },
    { label: 'Man hour weekday', mp: km.jamWeekday, mhe: kh.jamWeekday, satuan: 'jam' },
    { label: 'Man hours per bulan', mp: km.jamBulan, mhe: kh.jamBulan, tebal: true, satuan: 'jam' },
  ];

  // Kelompokkan baris per task (tahap) → workload driver (aktivitas)
  const grup = useMemo(() => {
    const m: { tahap: string; driver: { nama: string; no: number; rows: typeof h.baris }[] }[] = [];
    for (const b of h.baris) {
      let g = m.find(x => x.tahap === b.tahap); if (!g) { g = { tahap: b.tahap, driver: [] }; m.push(g); }
      let d = g.driver.find(x => x.no === b.no); if (!d) { d = { nama: b.aktivitas, no: b.no, rows: [] }; g.driver.push(d); }
      d.rows.push(b);
    }
    return m;
  }, [h.baris]);

  const Ringkas = ({ judul, rows, remark, tFte, tRes, pad = 0 }: { judul: string; rows: typeof h.mp; remark: string; tFte: number; tRes: number; pad?: number }) => (
    <div style={{ minWidth: 0 }}>
      <h3>{judul}</h3>
      <div className="tablewrap"><table className="pd-sum">
        <thead><tr><th>Description</th><th>Remarks</th><th className="num">FTE</th><th className="num">Resources</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">–</td></tr>}
          {rows.map(r => <tr key={r.nama}><td>{r.nama}</td><td className="small muted">{remark}</td><td className="num">{f2(r.fte)}</td><td className="num"><b>{r.resources || '–'}</b></td></tr>)}
          {Array.from({ length: Math.max(0, pad - Math.max(1, rows.length)) }, (_, i) => <tr key={`pad${i}`} aria-hidden="true"><td colSpan={4}>&nbsp;</td></tr>)}
          <tr style={{ background: 'var(--link)' }}><td><b>Total</b></td><td className="small"><b>{remark}</b></td><td className="num"><b>{f2(tFte)}</b></td><td className="num"><b>{tRes}</b></td></tr>
        </tbody>
      </table></div>
    </div>);

  const setBeban = (i: number, v: number) => { const b = [...pd.bebanShift]; while (b.length < 3) b.push(0); b[i] = v / 100; onPd({ ...pd, bebanShift: b }); };

  if (bagian === 'ringkasan') {
    const n = Math.max(h.mp.length, h.mhe.length, 1);
    return (
      <div className="card pd-dua">
        <Ringkas judul="Man Power Summary" rows={h.mp} remark="Head Count" tFte={h.totalFteMp} tRes={h.totalMp} pad={n} />
        <Ringkas judul="MHE Summary" rows={h.mhe} remark="Equipment" tFte={h.totalFteMhe} tRes={h.totalMhe} pad={n} />
      </div>);
  }

  if (bagian === 'rincian') return (
    <div className="card" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Rincian per task</h2>
        <div className="row small">
          <span className="pill ok">Man Power {h.totalMp} org · FTE {f2(h.totalFteMp)}</span>
          <span className="pill info">Equipment {h.totalMhe} unit · FTE {f2(h.totalFteMhe)}</span>
        </div>
      </div>
      <p className="small muted">Workload = volume per bulan × %. RfR (MH) = workload ÷ (produktivitas × faktor). Man hour = RfR ÷ efisiensi.
        FTE = man hour ÷ man hours per bulan (Man Power) atau ÷ (man hours MHE × operating) untuk equipment.</p>
      <div className="tablewrap" style={{ maxHeight: '70vh' }}><table className="pd-tabel">
        <thead><tr>
          <th>No</th><th>Task</th><th>Workload driver</th><th>Equipment / role</th><th className="num">Volume/bln</th><th>UoM</th><th className="num">%</th>
          <th className="num">Workload</th><th className="num">Productivity</th><th className="num">RfR (MH)</th><th className="num">Efficiency</th><th className="num">Man hour</th>
          <th className="num">Man hours tersedia</th><th className="num">Operating</th><th>Resources</th><th className="num">FTE</th><th className="num">Prod. per man</th>
        </tr></thead>
        <tbody>
          {grup.length === 0 && <tr><td colSpan={17} className="muted">Belum ada aktivitas. Tambahkan di bagian Aktivitas (VSM) & manpower di bawah.</td></tr>}
          {grup.flatMap((g, gi) => g.driver.flatMap((d, di) => d.rows.map((b, ri) => (
            <tr key={`${gi}-${di}-${ri}`} className={ri === 0 && (di > 0 || gi > 0) ? 'pd-pisah' : ''}>
              <td className="num">{di === 0 && ri === 0 ? gi + 1 : ''}</td>
              <td>{di === 0 && ri === 0 ? <b>{g.tahap || '—'}</b> : ''}</td>
              <td>{ri === 0 ? d.nama : ''}</td>
              <td>{b.resource}</td>
              <td className="num">{f0(b.volume)}</td><td className="small">{b.uom}</td><td className="num">{pct(b.persen)}</td>
              <td className="num">{f0(b.workload)}</td><td className="num">{angka(b.prod, 1)}</td><td className="num">{f0(b.rfr)}</td>
              <td className="num">{pct(b.efisiensi)}</td><td className="num">{f0(b.manHour)}</td><td className="num">{Math.round(b.jamTersedia)}</td>
              <td className="num">{b.jenis === 'Equipment' ? b.operating : ''}</td>
              <td className="small"><span className={`pill ${b.jenis === 'Equipment' ? 'info' : 'ok'}`}>{b.jenis}</span></td>
              <td className="num"><b>{f2(b.fte)}</b></td><td className="num">{angka(b.prodDasar)}</td>
            </tr>))))}
        </tbody>
      </table></div>
    </div>);

  return (
    <div className="card" style={{ gap: 14 }}>
      <h2>Process Design & Resource Calculation</h2>
      <div className="pd-atas">
        <div style={{ minWidth: 0 }}>
          <h3>Working day</h3>
          <div className="tablewrap"><table>
            <thead><tr><th>Working day</th><th className="num">Man Power</th><th className="num">MHE</th><th></th></tr></thead>
            <tbody>{barisKal.map(b => (
              <tr key={b.label} style={b.tebal ? { background: 'var(--link)', fontWeight: 700 } : undefined}>
                <td>{b.label}</td>
                <td className="num">{b.key ? inp(b.mp, v => setKal('mp', b.key!, v)) : (b.tebal ? Math.round(b.mp) : angka(b.mp, b.mp % 1 ? 2 : 0))}</td>
                <td className="num">{b.key ? inp(b.mhe, v => setKal('mhe', b.key!, v)) : (b.tebal ? Math.round(b.mhe) : angka(b.mhe, b.mhe % 1 ? 2 : 0))}</td>
                <td className="small muted">{b.satuan}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
          <div className="pd-ringkas">
            <div style={{ minWidth: 0 }}>
              <h3>Workload shift</h3>
              <table className="pd-shift"><tbody>
                <tr><td>Number of working shift</td><td className="num">
                  <select aria-label="Jumlah shift" value={jumlahShift} onChange={e => onShift(Number(e.target.value))} style={{ width: 64, minWidth: 64 }}>{[1, 2, 3].map(n => <option key={n}>{n}</option>)}</select></td><td>Shift</td></tr>
                <tr><td>Working Days</td><td className="num">{inp(pd.hariKerjaBulan ?? 25, v => onPd({ ...pd, hariKerjaBulan: v }))}</td><td></td></tr>
                <tr><td>Working Days Employee</td><td className="num">{inp(pd.hariKerjaKaryawan ?? 25, v => onPd({ ...pd, hariKerjaKaryawan: v }))}</td><td></td></tr>
                <tr><td>Group</td><td className="num">{inp(pd.group ?? 1, v => onPd({ ...pd, group: Math.max(1, v) }))}</td><td>Group</td></tr>
                {[0, 1, 2].map(i => (
                  <tr key={i} style={i >= jumlahShift ? { opacity: 0.5 } : undefined}>
                    {i === 0 && <td rowSpan={3} style={{ verticalAlign: 'middle' }}>Workload</td>}
                    <td className="num">{inp(Math.round((pd.bebanShift[i] ?? 0) * 1000) / 10, v => setBeban(i, v))}%</td>
                    <td>Shift {i + 1}{i < jumlahShift ? <span className="small muted"> · dipakai {pct(h.beban[i] ?? 0)}</span> : <span className="small muted"> · tidak aktif</span>}</td>
                  </tr>))}
              </tbody></table>
            </div>
            <div style={{ minWidth: 0 }}>
              <h3>Faktor</h3>
              <table className="pd-shift"><tbody>
                <tr><td>Produktivitas faktor</td><td className="num">{inp(Math.round(faktorProduktivitas * 1000) / 10, v => onFaktor({ faktorProduktivitas: v / 100 }))}%</td></tr>
                <tr><td>Efficiency</td><td className="num">{inp(Math.round(efisiensi * 1000) / 10, v => onFaktor({ efisiensi: v / 100 }))}%</td></tr>
                <tr><td>Operating (alat dipakai bergantian)</td><td className="num">{inp(pd.operatingAlat, v => onPd({ ...pd, operatingAlat: Math.max(1, v) }))}</td></tr>
              </tbody></table>
              <p className="small muted" style={{ marginTop: 6 }}>Resources man power = ROUNDUP(FTE × workload shift) per shift aktif. Working days & group untuk dokumentasi (belum mengubah hitungan).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
