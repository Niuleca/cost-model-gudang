'use client';
import { Fragment } from 'react';
import { T, useT } from '@/lib/i18n';
import type { VolumeInput } from '@/lib/engine/types';
import { angka } from '@/lib/format';
import {
  hitungProfil, volumePalet, orderAdmin, KENDARAAN_DEFAULT, MODA, MUATAN, muatanBaris, PARAM_DEFAULT, SATUAN_UNIT,
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
    const vp = volumePalet(vol, basis, p.param);
    const paletHari = hariBulan > 0 ? vp.paletBulan / hariBulan : 0;
    const h = hitungProfil(rows, paletHari, p.param, kendaraan, { cpp: vp.cpp, upc: vp.upc }, hariBulan);
    const set = (i: number, patch: Partial<BarisProfil>) => onChange({ ...p, [arus]: rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
    const sisa = 1 - h.totalPersen;
    return (
      <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{out ? 'Outbound (pengiriman · kontainer / land transport)' : 'Inbound (penerimaan · kontainer / land transport)'}</h3>
          <span className="pill info">{angka(vp.paletBulan)} palet/bln ÷ {hariBulan} hari = <b>{angka(paletHari, 1)} palet/hari</b></span>
        </div>
        {vp.ket && <p className="small" style={{ color: 'var(--warn, #b45309)' }}>{vp.ket}</p>}
        <div className="tablewrap"><table>
          <thead><tr><th>Moda & cara muat</th><th className="num">Porsi</th><th className="num">Palet/hari</th><th>Konversi</th><th className="num">Qty/hari</th>
            <th>Kendaraan</th><th className="num">Mobil/hari</th><th>Cek muatan per mobil</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="muted">Belum ada. Tambah moda di bawah lalu isi porsinya (%).</td></tr>}
            {rows.map((r, i) => {
              const x = h.hasil[i];
              const isKont = r.moda.startsWith('cont');
              const mu = muatanBaris(r);
              const m = x.mobil;
              return <Fragment key={i}><tr>
                <td><select aria-label="Moda" value={r.moda} onChange={e => set(i, { moda: e.target.value as BarisProfil['moda'] })} style={{ minWidth: 170 }}>
                  <optgroup label="Kontainer">{MODA.filter(o => o.v.startsWith('cont')).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>
                  <optgroup label="Land transport (truk)">{MODA.filter(o => !o.v.startsWith('cont')).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup></select>
                  {isKont && <select aria-label="Cara muat" value={mu} onChange={e => set(i, { muatan: e.target.value as BarisProfil['muatan'] })} style={{ minWidth: 170, marginTop: 4 }}>
                    {MUATAN.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>}
                  {mu === 'unit' && <select aria-label="Satuan" value={r.satuanUnit ?? 'pcs'} onChange={e => set(i, { satuanUnit: e.target.value })} style={{ minWidth: 80, marginTop: 4 }}>{SATUAN_UNIT.map(u => <option key={u}>{u}</option>)}</select>}</td>
                <td className="num"><div className="row" style={{ flexWrap: 'nowrap', gap: 2, justifyContent: 'flex-end' }}>
                  {n(r.persen ? Math.round(r.persen * 1000) / 10 : 0, v => set(i, { persen: v / 100 }), 64)}<span className="small">%</span></div></td>
                <td className="num"><b>{angka(x.paletHari, 1)}</b></td>
                <td><div className="row small" style={{ flexWrap: 'nowrap', gap: 4 }}>
                  {mu === 'palet' && <span className="muted">—</span>}
                  {(mu === 'case' || mu === 'unit') && <>{n(r.casePerPalet, v => set(i, { casePerPalet: v }), 60, vp.cpp ? String(vp.cpp) : 'case')}<span className="muted">case/plt</span></>}
                  {mu === 'unit' && <>{n(r.unitPerCase, v => set(i, { unitPerCase: v }), 60, vp.upc ? String(vp.upc) : r.satuanUnit ?? 'pcs')}<span className="muted">/case</span></>}
                </div><div className="small muted">{x.ket}</div></td>
                <td className="num"><b>{angka(x.qtyHari, x.qtyHari < 10 ? 1 : 0)}</b><div className="small muted">{x.satuan}</div></td>
                <td>{isKont ? <><span className="small">{m?.kendaraan ?? 'kontainer'}</span>
                    <div className="row small" style={{ flexWrap: 'nowrap', gap: 4, marginTop: 4 }}>{n(r.tonPerKontainer ? r.tonPerKontainer * 1000 : undefined, v => set(i, { tonPerKontainer: v ? v / 1000 : undefined }), 70, m ? String(Math.round(m.kap.ton * 1000)) : 'kg')}<span className="muted">kg maks/kont</span></div></>
                  : <select aria-label="Kendaraan" value={r.kendaraan ?? kendaraan[0].nama} onChange={e => set(i, { kendaraan: e.target.value })} style={{ minWidth: 150 }}>
                    {kendaraan.map(k => <option key={k.nama} value={k.nama}>{k.nama} · {k.palet} plt · {k.cbm} m³ · {(k.ton * 1000).toLocaleString('id-ID')} kg</option>)}</select>}</td>
                <td className="num">{m ? <><b>{m.bulat}</b>{isKont && <div className="small">kontainer</div>}<div className="small muted">({angka(m.perHari, 2)}) / hari</div><div className="small"><b>{angka(m.bulatBulan)}</b> / bln</div></> : '–'}</td>
                <td className="small">{m && <>
                  {mu !== 'palet' && m.casePerMobil > 0 && <div><b>{angka(m.casePerMobil)} case/{isKont ? 'kont' : 'mobil'}</b> <span className="muted">({m.kap.cbm} m³ × {Math.round(m.util * 100)}% ÷ {p.param.cbmPerCase})</span></div>}
                  {mu === 'palet' && <div>{angka(m.paletTrip, 1)} / {m.kap.palet} palet</div>}
                  <div>CBM {angka(m.cbmTrip, 1)} / {angka(m.cbmEfektif, 1)} m³ <span className={`pill ${m.cbmCukup ? 'ok' : 'bad'}`}>{m.cbmCukup ? 'cukup' : 'tidak cukup'}</span></div>
                  <div>Berat {angka(m.tonTrip * 1000)} / {angka(m.kap.ton * 1000)} kg <span className={`pill ${m.tonCukup ? 'ok' : 'bad'}`}>{m.tonCukup ? 'cukup' : 'overload'}</span></div>
                  <div className="muted">pembatas: {m.pembatas === 'ton' ? 'berat' : m.pembatas}{mu === 'palet' && m.maksPaletCbm < m.kap.palet && ` · CBM hanya muat ${m.maksPaletCbm} palet`}</div>
                </>}</td>
                <td><button className="danger" onClick={() => onChange({ ...p, [arus]: rows.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>{m && (() => {
                const trip = m.bulat || 1, cbm = m.cbmTrip * trip, kg = m.tonTrip * trip * 1000;
                const cpp = r.casePerPalet || vp.cpp || 0, loose = mu !== 'palet';
                const nP = loose ? 0 : (m.kap.palet > 0 ? x.paletHari / m.kap.palet : 0), nCbmEf = loose && m.casePerMobil > 0 && cpp > 0 ? x.paletHari * cpp / m.casePerMobil : m.cbmEfektif > 0 ? cbm / m.cbmEfektif : 0, nT = m.kap.ton > 0 ? kg / (m.kap.ton * 1000) : 0;
                const tbl = (l: string, v: string, b?: boolean) => <tr><td>{l}</td><td className="num">{b ? <b>{v}</b> : v}</td></tr>;
                const beda = loose && cpp > 0 && Math.abs(cpp * p.param.cbmPerCase - p.param.cbmPerPalet) > 0.01;
                return <tr className="rumus-baris"><td colSpan={9}>
                  <details><summary className="small">Lihat rumus baris ini</summary>
                    <div className="rumus-grid small">
                      <div><b>1 · Volume per hari</b><table><tbody>
                        {vol && vol.uom.trim().toLowerCase() !== 'palet' && cpp > 0 && tbl(`Palet/bln = ${angka(Number(vol[basis]) || 0)} ${vol.uom} ÷ ${angka(vp.cpp)}`, `${angka(vp.paletBulan, 1)} palet`)}
                        {tbl(`Palet/hari = ${angka(vp.paletBulan, 1)} ÷ ${hariBulan} hari`, `${angka(paletHari, 1)} palet`)}
                        {tbl(`Porsi moda = ${angka(paletHari, 1)} × ${pct(r.persen || 0)}`, `${angka(x.paletHari, 1)} palet`)}
                        {loose && tbl(`Qty/hari = ${angka(x.paletHari, 2)} × ${angka(cpp)} case/palet`, `${angka(x.qtyHari)} ${x.satuan}`, true)}
                      </tbody></table></div>
                      <div><b>2 · CBM & berat per hari</b><table><tbody>
                        {loose ? <>
                          {tbl(`CBM = ${angka(x.paletHari * cpp)} case × ${p.param.cbmPerCase} CBM`, `${angka(cbm, 1)} CBM`)}
                          {tbl(`Berat = ${angka(x.paletHari * cpp)} case × ${p.param.kgPerCase} kg`, `${angka(kg)} kg`)}
                        </> : <>
                          {tbl(`CBM = ${angka(x.paletHari, 1)} palet × ${p.param.cbmPerPalet} CBM`, `${angka(cbm, 1)} CBM`)}
                          {tbl(`Berat = ${angka(x.paletHari, 1)} palet × ${angka(p.param.tonPerPalet * 1000)} kg`, `${angka(kg)} kg`)}
                        </>}
                      </tbody></table></div>
                      <div><b>3 · {isKont ? 'Kontainer' : 'Mobil'} per hari</b> <span className="muted">({m.kendaraan}: {m.kap.palet} plt · {m.kap.cbm} m³ · {angka(m.kap.ton * 1000)} kg)</span><table><tbody>
                        {tbl(`Palet: ${loose ? 'tidak dipakai (loose)' : `${angka(x.paletHari, 1)} ÷ ${m.kap.palet}`}`, loose ? '–' : angka(nP, 2), m.pembatas === 'palet')}
                        {tbl(`CBM efektif = ${m.kap.cbm} m³ × ${Math.round(m.util * 100)}% (toleransi ${Math.round((1 - m.util) * 100)}%)`, `${angka(m.cbmEfektif, 1)} m³`)}
                        {loose && m.casePerMobil > 0
                          ? <>{tbl(`Kapasitas = FLOOR(${angka(m.cbmEfektif, 1)} ÷ ${p.param.cbmPerCase} CBM/case)`, `${angka(m.casePerMobil)} case/${isKont ? 'kont' : 'mobil'}`, true)}
                              {tbl(`CBM: ${angka(x.paletHari * cpp)} case ÷ ${angka(m.casePerMobil)}`, angka(nCbmEf, 2), m.pembatas === 'cbm')}</>
                          : tbl(`CBM: ${angka(cbm, 1)} ÷ ${angka(m.cbmEfektif, 1)}`, angka(nCbmEf, 2), m.pembatas === 'cbm')}
                        {tbl(`Berat: ${angka(kg)} ÷ ${angka(m.kap.ton * 1000)}`, angka(nT, 2), m.pembatas === 'ton')}
                        {tbl(`Per hari = ROUNDUP(terbesar ${angka(m.perHari, 2)})`, `${m.bulat} ${isKont ? 'kontainer' : 'mobil'}`, true)}
                        {tbl(loose && m.casePerMobil > 0 ? `Per bulan = ${angka(m.qtyBulan)} case/bln ÷ ${angka(m.casePerMobil)} (ROUNDUP)` : `Per bulan = ROUNDUP(${angka(m.perHari, 2)} × ${hariBulan} hari)`, `${angka(m.bulatBulan)} ${isKont ? 'kontainer' : 'mobil'}`, true)}
                      </tbody></table></div>
                      <div><b>4 · Muatan per {isKont ? 'kontainer' : 'mobil'}</b><table><tbody>
                        {!loose && tbl(`Palet = ${angka(x.paletHari, 1)} ÷ ${trip}`, `${angka(m.paletTrip, 1)} / ${m.kap.palet}`)}
                        {tbl(`CBM = ${angka(cbm, 1)} ÷ ${trip}`, `${angka(m.cbmTrip, 1)} / ${angka(m.cbmEfektif, 1)} m³ efektif`)}
                        {tbl(`Berat = ${angka(kg)} ÷ ${trip}`, `${angka(m.tonTrip * 1000)} / ${angka(m.kap.ton * 1000)} kg`)}
                        {tbl('Pembatas', m.pembatas === 'ton' ? 'berat' : m.pembatas.toUpperCase(), true)}
                      </tbody></table></div>
                    </div>
                    {beda && <p className="small" style={{ color: 'var(--warn, #b45309)', marginTop: 6 }}>Cek parameter: {angka(cpp)} case × {p.param.cbmPerCase} CBM = {angka(cpp * p.param.cbmPerCase, 2)} CBM per palet, sedangkan Parameter muatan {p.param.cbmPerPalet} CBM per palet. Bila {p.param.cbmPerPalet} yang benar, CBM per case = {angka(p.param.cbmPerPalet / cpp, 3)}.</p>}
                  </details></td></tr>;
              })()}</Fragment>;
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
      <h2><T>Profil order inbound & outbound (per hari)</T></h2>
      <p className="small muted">Mengikuti volume di tabel Volume: volume per bulan ÷ hari operasional = palet per hari, lalu dipecah per moda sesuai porsi (%).
        Berlaku untuk kontainer 20ft / 40ft / 40HC maupun land transport (truk), inbound & outbound — tidak hanya import/export. Cara muat: <b>palletize</b> (dibatasi jumlah palet, CBM, berat) atau <b>loose case/karton/pcs</b> (case = palet × case/palet; CBM & berat dari parameter per case).
        Kontainer/mobil per hari = kebutuhan terbesar antara palet, CBM, dan berat dibanding kapasitas kontainer/kendaraan (dibulatkan ke atas per moda). Kapasitas kontainer bisa diubah di "Kapasitas kendaraan".</p>
      <div className="row" style={{ alignItems: 'end' }}>
        <label className="f">Basis volume
          <select value={basis} onChange={e => onChange({ ...p, basis: e.target.value as BasisVolume })} style={{ minWidth: 170 }}>
            {BASIS.map(b => <option key={b.v} value={b.v}>{b.l}</option>)}</select></label>
        <span className="small muted" style={{ alignSelf: 'center' }}>Muatan: <b>{(p.param.tonPerPalet * 1000).toLocaleString('id-ID')} kg</b> & <b>{p.param.cbmPerPalet.toLocaleString('id-ID')} CBM</b> per palet ·
          {' '}<b>{p.param.kgPerCase.toLocaleString('id-ID')} kg</b> & <b>{p.param.cbmPerCase.toLocaleString('id-ID')} CBM</b> per case — diatur di <b>Parameter muatan</b> di atas</span>
        <label className="f" title="Inbound: barang masuk + put away; outbound: picking + barang keluar">Input admin per mobil {n(p.param.inputAdminPerMobil ?? 2, v => setParam('inputAdminPerMobil', v), 90)}</label>
        <label className="f" title="CBM efektif = CBM kendaraan × pemakaian; sisanya toleransi (ruang tidak terpakai)">Pemakaian ruang muat (CBM)
          <span className="row" style={{ flexWrap: 'nowrap', gap: 2 }}>{n(Math.round((p.param.utilCbm ?? 0.9) * 1000) / 10, v => setParam('utilCbm', Math.min(100, Math.max(1, v)) / 100), 70)}%
            <span className="small muted"> · toleransi {Math.round((1 - (p.param.utilCbm ?? 0.9)) * 1000) / 10}%</span></span></label>
        <span className="small muted">Hari operasional {hariBulan}/bln (Working Days di Process Design)</span>
      </div>
      {bagian('inbound')}
      {bagian('outbound')}
      {(() => {
        const oa = orderAdmin(p, volumes, hariBulan);
        if (!oa.inbound.mobilHari && !oa.outbound.mobilHari) return null;
        return <div style={{ minWidth: 0 }}>
          <h3><T>Volume admin (order)</T></h3>
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
          <thead><tr><th>Kendaraan</th><th className="num">Palet</th><th className="num">CBM</th><th className="num">Berat (kg)</th></tr></thead>
          <tbody>{kendaraan.map((k, i) => {
            const uk = (patch: Partial<Kendaraan>) => onChange({ ...p, kendaraan: kendaraan.map((x, j) => j === i ? { ...x, ...patch } : x) });
            return <tr key={k.nama}><td>{k.nama}</td><td className="num">{n(k.palet, v => uk({ palet: v }), 70)}</td><td className="num">{n(k.cbm, v => uk({ cbm: v }), 70)}</td><td className="num">{n(k.ton * 1000, v => uk({ ton: v / 1000 }), 80)}</td></tr>;
          })}</tbody></table></div>
        {p.kendaraan?.length ? <button className="ghost" onClick={() => onChange({ ...p, kendaraan: undefined })}>Kembalikan kapasitas default</button> : null}
      </details>
    </div>);
}
