'use client';
import { T, useT } from '@/lib/i18n';
import { useMemo } from 'react';
import type { AktivitasInput, VolumeInput } from '@/lib/engine/types';
import { hitungProcessDesign, bolehRangkap, isTkbm, PD_DEFAULT, type IndirectInput, type KalenderResource, type ProcessDesignInput } from '@/lib/engine/processDesign';
import { angka, rp } from '@/lib/format';
import { hitungEskalasi } from '@/lib/engine/index.ts';

const f2 = (x: number) => (x ? x.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
const f0 = (x: number) => (x ? Math.round(x).toLocaleString('id-ID') : '–');
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** jam desimal → "X jam Y mnt" */
const jamMenit = (jam: number) => { const m = Math.round(jam * 60); const j = Math.floor(m / 60), r = m % 60; return j ? `${j} jam${r ? ` ${r} mnt` : ''}` : `${r} mnt`; };
const TIP_FTE = 'FTE = Full Time Equivalent (setara pekerja penuh waktu). 1,00 FTE = 1 orang bekerja penuh selama jam kerja tersedia per bulan. FTE = man hour dibutuhkan ÷ jam kerja tersedia per orang per bulan.';

/** Process Design & Resource Calculation (format Excel): kalender kerja MP/MHE, shift, rincian per task, ringkasan MP & MHE. */
export interface BiayaMpProps {
  /** Biaya per orang per bulan (total + management fee) dari tabel Rincian biaya manpower. */
  perOrang: (role: string) => number;
  persenTahun: number; onPersen: (p: number) => void; kontrakBulan: number;
  mulai: string | null; mulaiDefault: string | null; onMulai: (m: string | null) => void;
}

export default function ProcessDesignPanel({ bagian, indirect, aktivitas, volumes, pd: pdIn, faktorProduktivitas, efisiensi, jumlahShift, onPd, onFaktor, onShift, biaya }: {
  biaya?: BiayaMpProps;
  bagian: 'ringkasan' | 'rincian' | 'desain';
  indirect?: IndirectInput;
  aktivitas: AktivitasInput[]; volumes: VolumeInput[]; pd?: ProcessDesignInput; faktorProduktivitas: number; efisiensi: number;
  jumlahShift: number;
  onPd: (pd: ProcessDesignInput) => void; onFaktor: (patch: { faktorProduktivitas?: number; efisiensi?: number }) => void; onShift: (n: number) => void;
}) {
  const pd = { ...PD_DEFAULT, ...(pdIn ?? {}), mp: { ...PD_DEFAULT.mp, ...(pdIn?.mp ?? {}) }, mhe: { ...PD_DEFAULT.mhe, ...(pdIn?.mhe ?? {}) } };
  const h = useMemo(() => hitungProcessDesign(aktivitas, volumes, pd, faktorProduktivitas, efisiensi, jumlahShift, indirect),
    [aktivitas, volumes, JSON.stringify(pd), faktorProduktivitas, efisiensi, jumlahShift, JSON.stringify(indirect)]); // eslint-disable-line react-hooks/exhaustive-deps

  const setKal = (jenis: 'mp' | 'mhe', key: keyof KalenderResource, v: number) => onPd({ ...pd, [jenis]: { ...pd[jenis], [key]: v } });
  const inp = (v: number, on: (x: number) => void, w = 64) => (
    <input type="number" step="any" value={Number.isFinite(v) ? v : 0} onChange={e => on(e.target.value === '' ? 0 : Number(e.target.value))}
      style={{ width: w, minWidth: w, textAlign: 'right', background: 'var(--input)' }} />);
  const km = h.kalender.mp, kh = h.kalender.mhe;
  /** Waktu kerja di balik FTE: man hour per bulan & per hari kerja. */
  const waktu = (manHour: number, alat = false) => {
    if (!manHour) return null;
    const hari = (alat ? kh.hariBulan : km.hariBulan) || 1;
    return <div className="small muted" style={{ whiteSpace: 'nowrap' }} title={`${angka(manHour, 1)} jam/bln ÷ ${angka(hari, 1)} hari kerja`}>
      {jamMenit(manHour / hari)}/hari<div>{angka(manHour, 1)} jam/bln</div></div>;
  };
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
      <h3><T>{judul}</T></h3>
      <div className="tablewrap"><table className="pd-sum">
        <thead><tr><th>Description</th><th>Remarks</th><th className="num" title={TIP_FTE}>FTE<div className="small muted" style={{ fontWeight: 400 }}>Full Time Equivalent</div></th><th className="num">Resources</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">–</td></tr>}
          {rows.map(r => <tr key={r.nama}><td>{r.nama}</td><td className="small muted">{remark}{r.unitIndirect ? <div title="unit untuk indirect & peran tetap">+{r.unitIndirect} indirect</div> : null}</td><td className="num">{f2(r.fte)}{waktu(r.manHour, true)}</td><td className="num"><b>{r.resources || '–'}</b></td></tr>)}
          {Array.from({ length: Math.max(0, pad - Math.max(1, rows.length)) }, (_, i) => <tr key={`pad${i}`} aria-hidden="true"><td colSpan={4}>&nbsp;</td></tr>)}
          <tr style={{ background: 'var(--link)' }}><td><b>Total</b></td><td className="small"><b>{remark}</b></td><td className="num"><b>{f2(tFte)}</b></td><td className="num"><b>{tRes}</b></td></tr>
        </tbody>
      </table></div>
    </div>);

  const setBeban = (i: number, v: number) => { const b = [...pd.bebanShift]; while (b.length < 3) b.push(0); b[i] = v / 100; onPd({ ...pd, bebanShift: b }); };

  if (bagian === 'ringkasan') {
    // Man Power Summary = direct (process design) + indirect (supervisor) + peran tetap, dalam satu tabel
    const ind = h.indirect.rows;
    // Kolom per shift (hanya shift yang punya workload); peran tetap basis "total" tidak dibagi per shift
    const sIdx: number[] = (h.shiftAktifIdx ?? []).length > 1 ? h.shiftAktifIdx : [];
    const nS = sIdx.length;
    const perShiftDirect = sIdx.map(si => h.mp.reduce((t2, r) => t2 + (r.perShift?.[si] ?? 0), 0));
    const perShiftInd = sIdx.map(si => ind.reduce((t2, r) => t2 + (r.perShift?.[si] ?? 0), 0));
    const nonShift = ind.filter(r => !r.perShift).reduce((t2, r) => t2 + r.qty, 0);
    const selShift = (ps?: number[] | null, tebal = false) => sIdx.map(si => <td key={si} className="num">{ps ? (ps[si] ? (tebal ? <b>{ps[si]}</b> : ps[si]) : '–') : <span className="muted small">–</span>}</td>);
    const colTot = 4 + nS + (biaya ? 2 : 0);
    const totInd = ind.reduce((t, r) => t + r.qty, 0);
    const totalOrang = h.totalMp + totInd;
    const perOrang = (role: string) => biaya?.perOrang(role) ?? 0;
    const totDirect = biaya ? h.mp.reduce((t2, r) => t2 + perOrang(r.nama) * r.resources, 0) : 0;
    const totIndirect = biaya ? ind.reduce((t2, r) => t2 + perOrang(r.nama) * r.qty, 0) : 0;
    const selBiaya = (role: string, qty: number) => biaya ? <>
      <td className="num">{qty ? rp(perOrang(role)) : '–'}</td><td className="num">{qty ? rp(perOrang(role) * qty) : '–'}</td></> : null;
    const esk = biaya ? hitungEskalasi(biaya.persenTahun, biaya.kontrakBulan, biaya.mulai || biaya.mulaiDefault) : null;
    const dasarBln = totDirect + totIndirect;
    const n = Math.max(h.mp.length + ind.length + (ind.length ? 2 : 0), h.mhe.length, 1);
    const sub = (l: string, fte: string, v: number, tot?: number, ps?: number[]) => <tr className="pd-sub"><td colSpan={2}><b>{l}</b></td><td className="num">{fte}</td>{sIdx.map((si, k) => <td key={si} className="num"><b>{ps?.[k] ?? '–'}</b></td>)}<td className="num"><b>{v}</b></td>{biaya && <><td /><td className="num"><b>{tot ? rp(tot) : '–'}</b></td></>}</tr>;
    return (
      <div className="card" style={{ gap: 10 }}>
        <div className={`pd-dua${biaya ? " tumpuk" : ""}`}>
          <div style={{ minWidth: 0 }}>
            <h3><T>Man Power Summary</T></h3>
            <div className="tablewrap"><table className={`pd-sum${biaya ? " pd-sum-biaya" : ""}${nS ? " pd-sum-shift" : ""}`}>
              <thead><tr><th>Description</th><th>Remarks</th><th className="num" title={TIP_FTE}>FTE<div className="small muted" style={{ fontWeight: 400 }}>Full Time Equivalent</div></th>
                {sIdx.map(si => <th key={si} className="num">Shift {si + 1}<div className="small muted" style={{ fontWeight: 400 }}>orang</div></th>)}
                <th className="num">Resources{nS > 0 && <div className="small muted" style={{ fontWeight: 400 }}>total</div>}</th>
                {biaya && <><th className="num">Biaya/orang/bln<div className="small muted" style={{ fontWeight: 400 }}>incl. fee · ubah di Rincian biaya</div></th><th className="num">Total/bln</th></>}</tr></thead>
              <tbody>
                {h.mp.length + ind.length === 0 && <tr><td colSpan={colTot} className="muted">–</td></tr>}
                {h.mp.map(r => {
                  const status = r.tkbm ? (/helper|daily|harian/i.test(r.nama) ? 'Daily worker' : 'TKBM')
                    : r.resources === 0 ? `Dirangkap ${r.dirangkapOleh.join(', ')}` : r.merangkap.length ? 'Direct · multi-skill' : r.dirangkap ? `Direct · sisa dirangkap ${r.dirangkapOleh.join(', ')}` : 'Direct';
                  return <tr key={`d-${r.nama}`}><td>{r.nama}{r.merangkap.length > 0 && <div className="small muted">merangkap: {r.merangkap.join(', ')}</div>}</td>
                    <td className="small"><b>{status}</b>{r.catatan.map((c, k) => <div key={k} className="muted">{c}</div>)}</td>
                    <td className="num">{f2(r.fte)}{waktu(r.manHour)}</td>{selShift(r.perShift)}<td className="num"><b>{r.resources || '–'}</b></td>{selBiaya(r.nama, r.resources)}</tr>;
                })}
                {ind.length > 0 && sub('Subtotal direct', f2(h.totalFteMp), h.totalMp, totDirect, perShiftDirect)}
                {ind.map((r, i) => <tr key={`i-${i}`}><td>{r.nama}{r.alat.length > 0 && <div className="small muted">alat: {r.alat.join(', ')}</div>}</td>
                  <td className="small muted">{r.ket.startsWith('Peran tetap') ? r.ket : `Indirect · ${r.ket}`}{nS > 0 && !r.perShift ? <div>non-shift (total, tidak dibagi per shift)</div> : null}</td><td className="num muted">–</td>{selShift(r.perShift)}<td className="num"><b>{r.qty || '–'}</b></td>{selBiaya(r.nama, r.qty)}</tr>)}
                {ind.length > 0 && sub('Subtotal indirect & peran tetap', '–', totInd, totIndirect, perShiftInd)}
                {Array.from({ length: Math.max(0, n - Math.max(1, h.mp.length + ind.length + (ind.length ? 2 : 0))) }, (_, i) => <tr key={`pad${i}`} aria-hidden="true"><td colSpan={colTot}>&nbsp;</td></tr>)}
                <tr style={{ background: 'var(--link)' }}><td><b>Total</b></td><td className="small"><b>Head Count</b>{nS > 0 && nonShift > 0 ? <div className="muted">+ {nonShift} orang non-shift</div> : null}</td><td className="num"><b>{f2(h.totalFteMp)}</b></td>{sIdx.map((si, k) => <td key={si} className="num"><b>{perShiftDirect[k] + perShiftInd[k]}</b></td>)}<td className="num"><b>{totalOrang}</b></td>{biaya && <><td /><td className="num"><b>{rp(totDirect + totIndirect)}</b></td></>}</tr>
              </tbody>
            </table></div>
          </div>
          <Ringkas judul="MHE Summary" rows={h.mhe} remark="Equipment" tFte={h.totalFteMhe} tRes={h.totalMhe} pad={n} />
        </div>
        {biaya && esk && <div style={{ minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
            <h3><T>Skema biaya manpower selama kontrak</T></h3>
            <div className="row" style={{ alignItems: 'end' }}>
            <label className="f" htmlFor="esk-mulai">Mulai kontrak
              <input id="esk-mulai" type="month" value={biaya.mulai || biaya.mulaiDefault || esk.mulai} onChange={e => biaya.onMulai(e.target.value || null)} style={{ minWidth: 150 }} />
              <span className="small muted">{biaya.mulai ? 'diisi manual' : biaya.mulaiDefault ? 'dari tanggal go-live' : 'go-live kosong → Januari tahun ini'}</span></label>
            <label className="f" htmlFor="esk-mp">Kenaikan upah tiap Januari
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><input id="esk-mp" type="number" step="any" min={0} value={Math.round(esk.persenTahun * 1000) / 10}
                onChange={e => biaya.onPersen(Number(e.target.value) / 100)} style={{ width: 80, minWidth: 80, textAlign: 'right' }} /><span>%</span></div>
              <span className="small muted">kebijakan UMK, umumnya 5–7%</span></label>
            </div>
          </div>
          <div className="tablewrap"><table>
            <thead><tr><th>Periode</th><th className="num">Bulan</th><th className="num">Indeks</th><th className="num">Biaya/bln</th><th className="num">Total periode</th></tr></thead>
            <tbody>{esk.tahun.map(y => <tr key={y.tahun}><td><b>{y.tahun}</b> <span className="small muted">{y.dari === y.sampai ? y.dari : `${y.dari} – ${y.sampai}`}{y.ke > 0 ? ` · naik ke-${y.ke}` : ' · upah dasar'}</span></td><td className="num">{y.bulan}</td><td className="num">{(y.indeks * 100).toFixed(1)}%</td>
              <td className="num">{rp(dasarBln * y.indeks)}</td><td className="num">{rp(dasarBln * y.indeks * y.bulan)}</td></tr>)}
              <tr className="pd-sub"><td><b>Total kontrak</b></td><td className="num"><b>{esk.kontrakBulan}</b></td><td /><td /><td className="num"><b>{rp(dasarBln * esk.faktor * esk.kontrakBulan)}</b></td></tr>
              <tr style={{ background: 'var(--link)' }}><td colSpan={3}><b>Biaya manpower/bln dipakai di cost model</b><div className="small muted">total kontrak ÷ {esk.kontrakBulan} bulan (faktor {esk.faktor.toFixed(4)}×)</div></td>
                <td className="num"><b>{rp(dasarBln * esk.faktor)}</b></td><td /></tr>
            </tbody></table></div>
          <p className="small muted">Upah naik setiap Januari (UMK baru) sebesar {(esk.persenTahun * 100).toLocaleString('id-ID')}% dan bertingkat: indeks = (1 + {(esk.persenTahun * 100).toLocaleString('id-ID')}%)^(jumlah Januari yang sudah dilewati). Biaya/orang dari tabel Rincian biaya manpower di bawah (gaji pokok + lisensi + BPJS + THR + kompensasi + supervisi, ditambah management fee). Angka ini masuk ke Hasil setelah tekan Hitung.</p>
        </div>}
        <p className="small muted"><b>FTE (Full Time Equivalent)</b> = man hour dibutuhkan ÷ jam kerja tersedia per orang per bulan ({Math.round(km.jamBulan)} jam MP · {Math.round(kh.jamBulan)} jam MHE).
          Contoh: 0,79 FTE = {jamMenit(0.79 * km.jamBulan / (km.hariBulan || 1))} kerja per hari dari {jamMenit(km.jamBulan / (km.hariBulan || 1))} jam tersedia. Angka kecil di bawah FTE = waktu kerja per hari & per bulan untuk menyelesaikan volume/order.</p>
        <div className="small muted" style={{ borderTop: '1px solid var(--g200, #e5e7eb)', paddingTop: 8 }}>
          <b>Catatan jam kerja (aturan ketenagakerjaan)</b> — UU 13/2003 Pasal 77 jo. UU 6/2023 (Cipta Kerja) & PP 35/2021:
          <ul style={{ margin: '4px 0 4px 18px', padding: 0 }}>
            <li>Jam kerja normal 40 jam/minggu: 7 jam × 6 hari atau 8 jam × 5 hari ≈ <b>173 jam/bulan</b> (40 × 52 ÷ 12). Lembur maksimal 4 jam/hari & 18 jam/minggu.</li>
            <li>173 jam = jam yang <b>dibayar</b> (termasuk cuti, libur nasional, sakit) → dipakai untuk gaji & upah lembur (upah sejam = 1/173 × upah sebulan).</li>
            <li>{Math.round(km.jamBulan)} jam di tabel Working day = jam <b>hadir efektif</b> setelah dikurangi Minggu, cuti, libur nasional & sakit → dipakai untuk FTE dan jumlah orang, agar kebutuhan orang tidak kurang saat karyawan cuti/libur.</li>
          </ul>
        </div>
        {h.indirect.spvManual && <p className="small muted">Supervisor ({indirect?.roleSupervisor}) mengikuti jumlah yang Anda isi di peran tetap — tidak dihitung otomatis dari span of control.</p>}
        <div className="row small" style={{ justifyContent: 'flex-end' }}>
          <span className="pill ok">Total manpower: {h.totalMp} direct + {totInd} indirect/tetap = <b>{totalOrang} orang</b></span>
          <span className="pill info">Total equipment: <b>{h.totalMhe} unit</b></span>
        </div>
      </div>);
  }

  if (bagian === 'rincian') return (
    <div className="card" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2><T>Rincian per task</T></h2>
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
          <th className="num">Man hours tersedia</th><th className="num">Operating</th><th>Resources</th><th className="num" title={TIP_FTE}>FTE (Full Time Equivalent)</th><th className="num">Prod. per man</th>
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
      <h2><T>Process Design & Resource Calculation</T></h2>
      <div className="pd-atas">
        <div style={{ minWidth: 0 }}>
          <h3><T>Working day</T></h3>
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
              <h3><T>Workload shift</T></h3>
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
              <h3><T>Faktor</T></h3>
              <table className="pd-shift"><tbody>
                <tr><td>Produktivitas faktor</td><td className="num">{inp(Math.round(faktorProduktivitas * 1000) / 10, v => onFaktor({ faktorProduktivitas: v / 100 }))}%</td></tr>
                <tr><td>Efficiency</td><td className="num">{inp(Math.round(efisiensi * 1000) / 10, v => onFaktor({ efisiensi: v / 100 }))}%</td></tr>
                <tr><td>Operating (alat dipakai bergantian)<div className="small muted">otomatis = jumlah shift aktif</div></td><td className="num"><b>{h.operating}</b></td></tr>
              </tbody></table>
              <p className="small muted" style={{ marginTop: 6 }}>Resources man power = FTE × workload shift per shift aktif, dibulatkan dengan multi-skill pooling sesuai matriks rangkap di bawah. Working days & group untuk dokumentasi (belum mengubah hitungan).</p>
            </div>
          </div>
        </div>
      </div>
      <MatriksRangkap roles={h.mp.map(r => r.nama)} matriks={pd.rangkap} onChange={rangkap => onPd({ ...pd, rangkap })} />
    </div>
  );
}

/** Matriks multi-skill: baris = orang yang merangkap, kolom = pekerjaan yang boleh dirangkap. */
function MatriksRangkap({ roles, matriks, onChange }: { roles: string[]; matriks?: Record<string, string[]>; onChange: (m: Record<string, string[]> | undefined) => void }) {
  if (roles.length < 2) return null;
  const boleh = (a: string, b: string) => bolehRangkap(a, b, matriks);
  const toggle = (a: string, b: string) => {
    const baris = roles.filter(x => x !== a && boleh(a, x));
    const baru = baris.includes(b) ? baris.filter(x => x !== b) : [...baris, b];
    onChange({ ...(matriks ?? {}), [a]: baru });
  };
  const diubah = !!matriks && Object.keys(matriks).length > 0;
  return (
    <div style={{ minWidth: 0 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3><T>Matriks multi-skill (siapa boleh merangkap siapa)</T></h3>
        {diubah && <button className="ghost" onClick={() => onChange(undefined)}>Kembalikan ke default</button>}
      </div>
      <p className="small muted">Centang = role di baris boleh merangkap pekerjaan role di kolom. Default: Checker ↔ Picker ↔ Operator RT/CB; Admin hanya Picker & Checker (tidak operator);
        Operator RT/CB hanya sesama operator; TKBM & Helper (daily worker) tidak merangkap dan tidak dirangkap.</p>
      <div className="tablewrap"><table className="pd-matriks">
        <thead><tr><th>Merangkap ↓ / dirangkap →</th>{roles.map(c => <th key={c} className="small" style={{ textAlign: 'center' }}>{c}</th>)}</tr></thead>
        <tbody>{roles.map(a => (
          <tr key={a}><td><b>{a}</b>{isTkbm(a) && <div className="small muted">non-karyawan</div>}</td>
            {roles.map(b => <td key={b} style={{ textAlign: 'center' }}>
              {a === b ? <span className="muted">—</span>
                : <input type="checkbox" aria-label={`${a} merangkap ${b}`} checked={boleh(a, b)} disabled={isTkbm(a) || isTkbm(b)} onChange={() => toggle(a, b)} />}
            </td>)}
          </tr>))}</tbody>
      </table></div>
    </div>);
}
