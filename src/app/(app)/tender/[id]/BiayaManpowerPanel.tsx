'use client';
import { rp, angka } from '@/lib/format';
import { ringkasBiayaMp, type InputBiayaRole, type ParamBiayaMp, type RincianBiayaRole } from '@/lib/engine/biayaMp';

const r0 = (x: number) => (x ? Math.round(x).toLocaleString('id-ID') : '–');
const pct = (x: number) => Math.round(x * 100000) / 1000;

/** Rincian biaya manpower — format sheet: gaji → sub total → BPJS/THR/kompensasi/supervisi → total × orang → Sub Total-1 → fee → Sub Total-2. */
export default function BiayaManpowerPanel({ rows, param, input, onInput, onParam, bisaEdit }: {
  rows: RincianBiayaRole[]; param: ParamBiayaMp; input: Record<string, InputBiayaRole>;
  onInput: (x: Record<string, InputBiayaRole>) => void; onParam: (p: Partial<ParamBiayaMp>) => void; bisaEdit: boolean;
}) {
  const g = ringkasBiayaMp(rows, param);
  const ubah = (role: string, patch: Partial<InputBiayaRole>) => {
    const cur = { ...(input[role] ?? {}), ...patch };
    for (const k of Object.keys(cur) as (keyof InputBiayaRole)[]) if (cur[k] === undefined || cur[k] === null || (cur[k] as unknown) === '') delete cur[k];
    const x = { ...input }; if (Object.keys(cur).length) x[role] = cur; else delete x[role];
    onInput(x);
  };
  const num = (role: string, k: 'gajiPokok' | 'hariKerja' | 'hariAktual' | 'lisensi' | 'supervisi', nilai: number, ph: number, w = 104) => (
    <input type="number" min={0} step="any" aria-label={`${k} ${role}`} value={input[role]?.[k] ?? ''} placeholder={ph ? String(Math.round(ph)) : '0'}
      onChange={e => ubah(role, { [k]: e.target.value === '' ? undefined : Number(e.target.value) })} disabled={!bisaEdit}
      style={{ width: w, minWidth: w, textAlign: 'right' }} title={`dipakai: ${r0(nilai)}`} />);
  const pIn = (k: 'bpjsTk' | 'bpjsKs' | 'bpjsPensiun' | 'thr' | 'kompensasi' | 'feePersen', label: string) => (
    <label className="f" style={{ minWidth: 0 }}>{label}
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><input type="number" step="any" min={0} value={pct(param[k])} disabled={!bisaEdit}
        onChange={e => onParam({ [k]: Number(e.target.value) / 100 })} style={{ width: 80, minWidth: 80, textAlign: 'right' }} /><span>%</span></div></label>);

  return (
    <div className="card" style={{ gap: 10 }}>
      <h2>Rincian biaya manpower</h2>
      <p className="small muted">Jumlah orang dari Man Power Summary. Kotak kosong = default (gaji pokok = UMK lokasi × faktor jabatan; lisensi & insentif = tunjangan jabatan; hari kerja = Working Days Employee).
        BPJS, THR & kompensasi dihitung dari gaji pokok; gaji dibayar = gaji pokok × actual hari kerja ÷ hari kerja.</p>
      <div className="row" style={{ alignItems: 'end' }}>
        {pIn('bpjsTk', 'BPJS TK')}{pIn('bpjsKs', 'BPJS KS')}{pIn('bpjsPensiun', 'BPJS Pensiun')}{pIn('thr', 'THR')}{pIn('kompensasi', 'Kompensasi')}{pIn('feePersen', 'Management fee')}
      </div>
      <details className="small muted">
        <summary>Dasar aturan default</summary>
        <ul style={{ margin: '4px 0 4px 18px', padding: 0 }}>
          <li><b>BPJS TK 5,27%</b> (pemberi kerja) = JHT 3,7% (PP 46/2015) + JKK 1,27% + JKM 0,3% (PP 44/2015). Gudang/penimbunan barang termasuk <b>Kelompok IV – risiko tinggi</b> (Lampiran I PP 44/2015). 0,14% dari JKK direkomposisi ke JKP (PP 6/2025) tanpa menambah iuran.</li>
          <li><b>BPJS Kesehatan 4%</b> pemberi kerja, upah maksimal {rp(param.batasUpahKs ?? 0)} (Perpres 64/2020).</li>
          <li><b>BPJS Pensiun 2%</b> pemberi kerja, upah maksimal {rp(param.batasUpahPensiun ?? 0)} (PP 45/2015; batas diperbarui tiap Maret).</li>
          <li><b>THR 1/12</b> upah per bulan (Permenaker 6/2016) · <b>Kompensasi PKWT 1/12</b> = 1 bulan upah per 12 bulan kontrak (PP 35/2021 Pasal 15–16).</li>
          <li>Management fee bukan aturan pemerintah — sesuaikan kebijakan perusahaan / tender.</li>
        </ul>
      </details>
      <div className="tablewrap"><table className="bmp">
        <thead><tr>
          <th>No</th><th>Jabatan</th><th>Area</th><th className="num">Gaji pokok</th><th className="num">Hari kerja</th><th className="num">Actual hari kerja</th>
          <th className="num">Lisensi + Insentif</th><th className="num">Sub total</th><th className="num">BPJS TK ({angka(pct(param.bpjsTk), 2)}%)</th>
          <th className="num">BPJS KS ({angka(pct(param.bpjsKs), 2)}%)</th><th className="num">BPJS Pensiun ({angka(pct(param.bpjsPensiun), 2)}%)</th>
          <th className="num">THR</th><th className="num">Kompensasi</th><th className="num">Supervisi & Operasional</th><th className="num">Total</th>
          <th className="num">Manpower</th><th className="num">TOTAL</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={17} className="muted">Belum ada manpower. Isi aktivitas & peran tetap terlebih dahulu.</td></tr>}
          {rows.map((r, i) => <tr key={r.role}>
            <td className="num">{i + 1}</td>
            <td><b>{r.role}</b>{r.manual && <div className="small muted">diubah · <button type="button" className="linkbtn" disabled={!bisaEdit} onClick={() => { const x = { ...input }; delete x[r.role]; onInput(x); }}>reset</button></div>}</td>
            <td><input aria-label={`Area ${r.role}`} value={input[r.role]?.area ?? ''} placeholder={r.area} onChange={e => ubah(r.role, { area: e.target.value || undefined })} disabled={!bisaEdit} style={{ width: 86, minWidth: 86 }} /></td>
            <td className="num">{num(r.role, 'gajiPokok', r.gajiPokok, r.gajiDefault, 96)}</td>
            <td className="num">{num(r.role, 'hariKerja', r.hariKerja, r.hariKerja, 48)}</td>
            <td className="num">{num(r.role, 'hariAktual', r.hariAktual, r.hariAktual, 48)}</td>
            <td className="num">{num(r.role, 'lisensi', r.lisensi, r.lisensi, 86)}</td>
            <td className="num"><b>{r0(r.subTotal)}</b></td>
            <td className="num">{r0(r.bpjsTk)}</td><td className="num">{r0(r.bpjsKs)}</td><td className="num">{r0(r.bpjsPensiun)}</td>
            <td className="num">{r0(r.thr)}</td><td className="num">{r0(r.kompensasi)}</td>
            <td className="num">{num(r.role, 'supervisi', r.supervisi, 0, 80)}</td>
            <td className="num">{r0(r.total)}</td><td className="num">{r.qty}</td><td className="num"><b>{r0(r.totalQty)}</b></td>
          </tr>)}
          {rows.length > 0 && <>
            <tr className="pd-sub"><td colSpan={15} className="num"><b>Sub Total Biaya-1</b></td><td className="num"><b>{rows.reduce((s, r) => s + r.qty, 0)}</b></td><td className="num"><b>{r0(g.sub1)}</b></td></tr>
            <tr><td colSpan={15} className="num">Management Fee {angka(pct(param.feePersen), 2)}%</td><td /><td className="num">{r0(g.fee)}</td></tr>
            <tr style={{ background: 'var(--link)' }}><td colSpan={15} className="num"><b>Sub Total Biaya-2</b> <span className="small muted">(masuk cost model, sebelum kenaikan tahunan)</span></td><td /><td className="num"><b>{rp(g.sub2)}</b></td></tr>
          </>}
        </tbody>
      </table></div>
    </div>);
}
