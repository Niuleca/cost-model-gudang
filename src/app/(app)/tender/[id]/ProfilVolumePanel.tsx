'use client';
import type { VolumeInput } from '@/lib/engine/types';
import { angka } from '@/lib/format';
import {
  hitungProfil, volumePalet, orderAdmin, KENDARAAN_DEFAULT, MODA, PARAM_DEFAULT, SATUAN_UNIT, TON_KONTAINER,
  type BarisProfil, type BasisVolume, type Kendaraan, type ProfilVolume,
} from '@/lib/profilVolume';

const PROFIL_KOSONG: ProfilVolume = { inbound: [], outbound: [], param: PARAM_DEFAULT };
const BASIS: { v: BasisVolume; l: string }[] = [
  { v: 'peakBulan', l: 'Peak/bln (sizing)' }, { v: 'rataRataBulan', l: 'Rata-rata/bln' }, { v: 'komitmenBulan', l: 'Komitmen/bln' }];
const pct = (x: number) => `${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

/** Profil order inbound/outbound: volume/bln dari tabel Volume ÷ hari operasional → dipecah per moda (%) → mobil per hari. */
export default function ProfilVolumePanel({ profil: pIn, volumes, hariBulan, onChange }: {
  profil?: ProfilVolume; volumes: VolumeInput[]; hariBulan: number; onChange: (p: ProfilVolume) => void;
}) {
  const p: ProfilVolume = { ...PROFIL_KOSONG, ...(pIn ?? {}), param: { ...PARAM_DEFAULT, ...(pIn?.param ?? {}) } };
  const basis: BasisVolume = p.basis ?? 'peakBulan';
  const kendaraan: Kendaraan[] = p.kendaraan?.length ? p.kendaraan : KENDARAAN_DEFAULT;
  const n = (v: number | undefined, on: (x: number) => void, w = 80, ph?: string) => (
    <input type="number" step="any" min={0} value={v ? v : ph ? '' : 0} placeholder={ph} onChange={e => on(Number(e.target.value))} style={{ width: w, minWidth: w }} />);
  const setParam = (k: keyof ProfilVolume['param'], v: number) => onChange({ ...p, param: { ...p.param, [k]: v } });

  const bagian = (arus: 'inbound' | 'outbound') => {
    const rows = p[arus];
    const out = arus === 'outbound';
    const vol = volumes.find(v => v.arus === arus);
    const vp = volumePalet(vol, basis);
    const paletHari = hariBulan > 0 ? vp.paletBulan / hariBulan : 0;
    const h = hitungProfil(rows, paletHari, p.param, kendaraan, { cpp: vp.cpp, upc: vp.upc }, hariBulan);
    const set = (i: number, patch: Partial<BarisProfil>) => onChange({ ...p, [arus]: rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
    const sisa = 1 - h.totalPersen;
    return (
      <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{out ? 'Outbound (export / pengiriman)' : 'Inbound (import / penerimaan)'}</h3>
          <span className="pill info">{angka(vp.paletBulan)} palet/bln ÷ {hariBulan} hari = <b>{angka(paletHari, 1)} palet/hari</b></span>
        </div>
        {!vp.ok && <p className="small" style={{ color: 'var(--warn, #b45309)' }}>{vp.ket}</p>}
        <div className="tablewrap"><table>
          <thead><tr><th>Moda</th><th className="num">Porsi</th><th className="num">Palet/hari</th><th>Konversi</th><th className="num">Qty/hari</th>
            <th>Kendaraan</th><th className="num">Mobil/hari</th><th>Cek muatan per mobil</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="muted">Belum ada. Tambah moda di bawah lalu isi porsinya (%).</td></tr>}
            {rows.map((r, i) => {
              const x = h.hasil[i];
              const isKont = r.moda.startsWith('cont');
              const m = x.mobil;
              return <tr key={i}>
                <td><select aria-label="Moda" value={r.moda} onChange={e => set(i, { moda: e.target.value as BarisProfil['moda'] })} style={{ minWidth: 170 }}>
                  {MODA.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
                  {r.moda === 'unit' && <select aria-label="Satuan" value={r.satuanUnit ?? 'pcs'} onChange={e => set(i, { satuanUnit: e.target.value })} style={{ minWidth: 80, marginTop: 4 }}>{SATUAN_UNIT.map(u => <option key={u}>{u}</option>)}</select>}</td>
                <td className="num"><div className="row" style={{ flexWrap: 'nowrap', gap: 2, justifyContent: 'flex-end' }}>
                  {n(r.persen ? Math.round(r.persen * 1000) / 10 : 0, v => set(i, { persen: v / 100 }), 64)}<span className="small">%</span></div></td>
                <td className="num"><b>{angka(x.paletHari, 1)}</b></td>
                <td><div className="row small" style={{ flexWrap: 'nowrap', gap: 4 }}>
                  {isKont && <>{n(r.tonPerKontainer, v => set(i, { tonPerKontainer: v }), 60, String(TON_KONTAINER[r.moda as keyof typeof TON_KONTAINER]))}<span className="muted">t/kont</span></>}
                  {r.moda === 'palet' && <span className="muted">—</span>}
                  {(r.moda === 'case' || r.moda === 'unit') && <>{n(r.casePerPalet, v => set(i, { casePerPalet: v }), 60, vp.cpp ? String(vp.cpp) : 'case')}<span className="muted">case/plt</span></>}
                  {r.moda === 'unit' && <>{n(r.unitPerCase, v => set(i, { unitPerCase: v }), 60, vp.upc ? String(vp.upc) : r.satuanUnit ?? 'pcs')}<span className="muted">/case</span></>}
                </div><div className="small muted">{x.ket}</div></td>
                <td className="num"><b>{angka(x.qtyHari, x.qtyHari < 10 ? 1 : 0)}</b><div className="small muted">{x.satuan}</div></td>
                <td>{isKont ? <span className="small muted">{m?.kendaraan ?? 'kontainer'}</span>
                  : <select aria-label="Kendaraan" value={r.kendaraan ?? kendaraan[0].nama} onChange={e => set(i, { kendaraan: e.target.value })} style={{ minWidth: 150 }}>
                    {kendaraan.map(k => <option key={k.nama} value={k.nama}>{k.nama} · {k.palet} plt · {k.cbm} m³ · {k.ton} t</option>)}</select>}</td>
                <td className="num">{m ? <><b>{m.bulat}</b><div className="small muted">({angka(m.perHari, 2)}) · {angka(m.perBulan)}/bln</div></> : '–'}</td>
                <td className="small">{m && !isKont && <>
                  {r.moda === 'palet' && <div>{angka(m.paletTrip, 1)} / {m.kap.palet} palet</div>}
                  <div>CBM {angka(m.cbmTrip, 1)} / {m.kap.cbm} m³ <span className={`pill ${m.cbmCukup ? 'ok' : 'bad'}`}>{m.cbmCukup ? 'cukup' : 'tidak cukup'}</span></div>
                  <div>Ton {angka(m.tonTrip, 2)} / {m.kap.ton} t <span className={`pill ${m.tonCukup ? 'ok' : 'bad'}`}>{m.tonCukup ? 'cukup' : 'overload'}</span></div>
                  <div className="muted">pembatas: {m.pembatas}{r.moda === 'palet' && m.maksPaletCbm < m.kap.palet && ` · CBM hanya muat ${m.maksPaletCbm} palet`}</div>
                </>}{m && isKont && <span className="muted">{angka(x.qtyHari, 2)} kontainer/hari</span>}</td>
                <td><button className="danger" onClick={() => onChange({ ...p, [arus]: rows.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>;
            })}
            {rows.length > 0 && <tr className="pd-sub"><td><b>Total</b></td>
              <td className="num"><b style={{ color: Math.abs(sisa) > 0.001 ? 'var(--bad, #b91c1c)' : undefined }}>{pct(h.totalPersen)}</b></td>
              <td className="num"><b>{angka(h.totalPaletHari, 1)}</b></td><td /><td /><td />
              <td className="num"><b>{h.totalMobilBulat}</b><div className="small muted">mobil/hari</div></td><td /><td /></tr>}
          </tbody></table></div>
        {rows.length > 0 && Math.abs(sisa) > 0.001 && <p className="small" style={{ color: 'var(--bad, #b91c1c)' }}>
          Total porsi {pct(h.totalPersen)} — {sisa > 0 ? `masih kurang ${pct(sisa)}` : `lebih ${pct(-sisa)}`} agar 100%.</p>}
        <div className="row">
          <button className="ghost" onClick={() => onChange({ ...p, [arus]: [...rows, { moda: rows.length ? 'case' : (out ? 'palet' : 'cont40hc'), persen: Math.max(0, Math.round(sisa * 1000) / 1000) }] })}>+ Tambah moda</button>
        </div>
      </div>);
  };

  return (
    <div className="card" style={{ gap: 12 }}>
      <h2>Profil order inbound & outbound (per hari)</h2>
      <p className="small muted">Mengikuti volume di tabel Volume: volume per bulan ÷ hari operasional = palet per hari, lalu dipecah per moda sesuai porsi (%).
        Kontainer = ton ÷ ton per kontainer; case = palet × case/palet; pcs = × isi per case. Mobil per hari = kebutuhan terbesar antara palet, CBM, dan ton dibanding kapasitas kendaraan (dibulatkan ke atas per moda).</p>
      <div className="row" style={{ alignItems: 'end' }}>
        <label className="f">Basis volume
          <select value={basis} onChange={e => onChange({ ...p, basis: e.target.value as BasisVolume })} style={{ minWidth: 170 }}>
            {BASIS.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</select></label>
        <label className="f">Ton per palet {n(p.param.tonPerPalet, v => setParam('tonPerPalet', v), 90)}</label>
        <label className="f">CBM per palet {n(p.param.cbmPerPalet, v => setParam('cbmPerPalet', v), 90)}</label>
        <label className="f">CBM per case {n(p.param.cbmPerCase, v => setParam('cbmPerCase', v), 90)}</label>
        <label className="f">Kg per case {n(p.param.kgPerCase, v => setParam('kgPerCase', v), 90)}</label>
        <label className="f" title="Inbound: barang masuk + put away; outbound: picking + barang keluar">Input admin per mobil {n(p.param.inputAdminPerMobil ?? 2, v => setParam('inputAdminPerMobil', v), 90)}</label>
        <span className="small muted">Hari operasional {hariBulan}/bln (Working Days di Process Design)</span>
      </div>
      {bagian('inbound')}
      {bagian('outbound')}
      {(() => {
        const oa = orderAdmin(p, volumes, hariBulan);
        if (!oa.inbound.mobilHari && !oa.outbound.mobilHari) return null;
        return <div style={{ minWidth: 0 }}>
          <h3>Volume admin (order)</h3>
          <div className="tablewrap"><table>
            <thead><tr><th>Arus</th><th className="num">Mobil/hari</th><th className="num">Input admin per mobil</th><th className="num">Order/hari</th><th className="num">Order/bln</th><th>Keterangan</th></tr></thead>
            <tbody>{(['inbound', 'outbound'] as const).map(ar => <tr key={ar}>
              <td>{ar === 'inbound' ? 'Inbound' : 'Outbound'}</td><td className="num">{oa[ar].mobilHari}</td><td className="num">× {oa.perMobil}</td>
              <td className="num"><b>{angka(oa[ar].orderHari)}</b></td><td className="num"><b>{angka(oa[ar].orderBulan)}</b></td>
              <td className="small muted">{ar === 'inbound' ? 'barang masuk + put away' : 'picking + barang keluar'}</td></tr>)}</tbody>
          </table></div>
          <p className="small muted">Order/bln otomatis menjadi volume aktivitas admin (role Admin, UoM order/line) di tab Aktivitas & manpower bila kolom Volume/bln-nya kosong. Bila ada beberapa aktivitas admin di satu arus, order dibagi rata.</p>
        </div>;
      })()}
      <details>
        <summary className="small">Kapasitas kendaraan (bisa diubah)</summary>
        <div className="tablewrap"><table>
          <thead><tr><th>Kendaraan</th><th className="num">Palet</th><th className="num">CBM</th><th className="num">Ton</th></tr></thead>
          <tbody>{kendaraan.map((k, i) => {
            const uk = (patch: Partial<Kendaraan>) => onChange({ ...p, kendaraan: kendaraan.map((x, j) => j === i ? { ...x, ...patch } : x) });
            return <tr key={k.nama}><td>{k.nama}</td><td className="num">{n(k.palet, v => uk({ palet: v }), 70)}</td><td className="num">{n(k.cbm, v => uk({ cbm: v }), 70)}</td><td className="num">{n(k.ton, v => uk({ ton: v }), 70)}</td></tr>;
          })}</tbody></table></div>
        {p.kendaraan?.length ? <button className="ghost" onClick={() => onChange({ ...p, kendaraan: undefined })}>Kembalikan kapasitas default</button> : null}
      </details>
    </div>);
}
