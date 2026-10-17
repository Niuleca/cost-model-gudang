'use client';
import type { VolumeInput } from '@/lib/engine/types';
import { angka } from '@/lib/format';
import { hitungProfil, KENDARAAN_DEFAULT, MODA, PARAM_DEFAULT, SATUAN_UNIT, TON_KONTAINER, type BarisProfil, type Kendaraan, type ProfilVolume } from '@/lib/profilVolume';

const PROFIL_KOSONG: ProfilVolume = { inbound: [], outbound: [], param: PARAM_DEFAULT };
const pct = (x: number) => `${(x * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

/** Profil order inbound/outbound per moda → palet ekuivalen, porsi %, trip kendaraan outbound. */
export default function ProfilVolumePanel({ profil: pIn, volumes, hariBulan, onChange, onTerapkan }: {
  profil?: ProfilVolume; volumes: VolumeInput[]; hariBulan: number;
  onChange: (p: ProfilVolume) => void; onTerapkan: (arus: 'inbound' | 'outbound', totalPalet: number) => void;
}) {
  const p: ProfilVolume = { ...PROFIL_KOSONG, ...(pIn ?? {}), param: { ...PARAM_DEFAULT, ...(pIn?.param ?? {}) } };
  const kendaraan: Kendaraan[] = p.kendaraan?.length ? p.kendaraan : KENDARAAN_DEFAULT;
  const n = (v: number | undefined, on: (x: number) => void, w = 80, ph?: string) => (
    <input type="number" step="any" min={0} value={v || v === 0 && !ph ? v : ''} placeholder={ph} onChange={e => on(Number(e.target.value))} style={{ width: w, minWidth: w }} />);
  const setParam = (k: keyof ProfilVolume['param'], v: number) => onChange({ ...p, param: { ...p.param, [k]: v } });

  const bagian = (arus: 'inbound' | 'outbound') => {
    const rows = p[arus];
    const out = arus === 'outbound';
    const vol = volumes.find(v => v.arus === arus);
    const def = { casePerPalet: vol?.konversi?.per1 ?? 0, unitPerCase: vol?.konversi?.per2 ?? 0 };
    const h = hitungProfil(rows, p.param, out, kendaraan, def, hariBulan);
    const set = (i: number, patch: Partial<BarisProfil>) => onChange({ ...p, [arus]: rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
    const beda = vol && h.totalPalet > 0 && Math.abs(vol.rataRataBulan - h.totalPalet) > 0.5;
    return (
      <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
        <h3>{out ? 'Outbound (export / pengiriman)' : 'Inbound (import / penerimaan)'}</h3>
        <div className="tablewrap"><table>
          <thead><tr><th>Moda</th><th className="num">Qty/bln</th><th>Konversi</th>{out && <th>Kendaraan</th>}
            <th className="num">Palet eq.</th><th className="num">Porsi</th>{out && <th className="num">Trip/bln</th>}{out && <th>Cek muatan per trip</th>}<th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={out ? 9 : 6} className="muted">Belum ada. Tambah moda di bawah.</td></tr>}
            {rows.map((r, i) => {
              const x = h.hasil[i];
              const isKont = r.moda.startsWith('cont');
              const satuan = r.moda === 'unit' ? (r.satuanUnit ?? 'pcs') : MODA.find(m => m.v === r.moda)?.satuan;
              return <tr key={i}>
                <td><select aria-label="Moda" value={r.moda} onChange={e => set(i, { moda: e.target.value as BarisProfil['moda'] })} style={{ minWidth: 170 }}>
                  {MODA.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}</select></td>
                <td className="num"><div className="row" style={{ flexWrap: 'nowrap', gap: 4, justifyContent: 'flex-end' }}>{n(r.qty, v => set(i, { qty: v }), 90)}
                  {r.moda === 'unit' ? <select aria-label="Satuan" value={r.satuanUnit ?? 'pcs'} onChange={e => set(i, { satuanUnit: e.target.value })} style={{ minWidth: 80 }}>{SATUAN_UNIT.map(u => <option key={u}>{u}</option>)}</select>
                    : <span className="small muted">{satuan}</span>}</div></td>
                <td><div className="row small" style={{ flexWrap: 'nowrap', gap: 4 }}>
                  {isKont && <>{n(r.tonPerKontainer, v => set(i, { tonPerKontainer: v }), 64, String(TON_KONTAINER[r.moda as keyof typeof TON_KONTAINER]))}<span className="muted">ton/kont</span></>}
                  {r.moda === 'palet' && <span className="muted">—</span>}
                  {(r.moda === 'case' || r.moda === 'unit') && <>{n(r.casePerPalet, v => set(i, { casePerPalet: v }), 64, def.casePerPalet ? String(def.casePerPalet) : 'case')}<span className="muted">case/palet</span></>}
                  {r.moda === 'unit' && <>{n(r.unitPerCase, v => set(i, { unitPerCase: v }), 64, def.unitPerCase ? String(def.unitPerCase) : r.satuanUnit ?? 'pcs')}<span className="muted">{r.satuanUnit ?? 'pcs'}/case</span></>}
                </div><div className="small muted">{x.ket}</div></td>
                {out && <td>{isKont ? <span className="small muted">kontainer export</span>
                  : <select aria-label="Kendaraan" value={r.kendaraan ?? kendaraan[0].nama} onChange={e => set(i, { kendaraan: e.target.value })} style={{ minWidth: 160 }}>
                    {kendaraan.map(k => <option key={k.nama} value={k.nama}>{k.nama} · {k.palet} plt · {k.cbm} m³ · {k.ton} t</option>)}</select>}</td>}
                <td className="num"><b>{angka(x.palet, 1)}</b></td>
                <td className="num">{pct(x.persen)}</td>
                {out && <td className="num"><b>{x.trip ? angka(x.trip.trip) : '–'}</b>{x.trip && <div className="small muted">{angka(x.trip.tripHari, 1)}/hari</div>}</td>}
                {out && <td className="small">{x.trip && !isKont && <>
                  {r.moda === 'palet' && <div>{angka(x.trip.muatPalet, 1)} / {x.trip.cbmKap ? kendaraan.find(k => k.nama === x.trip!.kendaraan)?.palet : '–'} palet</div>}
                  <div>CBM {angka(x.trip.cbmMuat, 1)} / {x.trip.cbmKap} m³ <span className={`pill ${x.trip.cbmCukup ? 'ok' : 'bad'}`}>{x.trip.cbmCukup ? 'cukup' : 'tidak cukup'}</span></div>
                  <div>Ton {angka(x.trip.tonMuat, 2)} / {x.trip.tonKap} t <span className={`pill ${x.trip.tonCukup ? 'ok' : 'bad'}`}>{x.trip.tonCukup ? 'cukup' : 'overload'}</span></div>
                  <div className="muted">pembatas: {x.trip.pembatas}{!x.trip.cbmCukup && r.moda === 'palet' && p.param.cbmPerPalet > 0 && ` · maks ${Math.floor(x.trip.cbmKap / p.param.cbmPerPalet)} palet/trip`}</div>
                </>}</td>}
                <td><button className="danger" onClick={() => onChange({ ...p, [arus]: rows.filter((_, j) => j !== i) })}>Hapus</button></td>
              </tr>;
            })}
            {rows.length > 0 && <tr className="pd-sub"><td colSpan={3}><b>Total</b></td>{out && <td />}<td className="num"><b>{angka(h.totalPalet, 1)} palet</b></td><td className="num"><b>100%</b></td>
              {out && <td className="num"><b>{angka(h.totalTrip)}</b><div className="small muted">{angka(hariBulan > 0 ? h.totalTrip / hariBulan : 0, 1)}/hari</div></td>}{out && <td />}<td /></tr>}
          </tbody></table></div>
        <div className="row">
          <button className="ghost" onClick={() => onChange({ ...p, [arus]: [...rows, { moda: rows.length ? 'case' : (out ? 'palet' : 'cont40hc'), qty: 0 }] })}>+ Tambah moda</button>
          {h.totalPalet > 0 && <button className="ghost" disabled={!vol} onClick={() => onTerapkan(arus, h.totalPalet)}>Pakai {angka(h.totalPalet, 0)} palet ke volume {arus}</button>}
          {beda && <span className="small muted">Volume {arus} sekarang {angka(vol!.rataRataBulan)} {vol!.uom}/bln (rata-rata)</span>}
        </div>
      </div>);
  };

  return (
    <div className="card" style={{ gap: 12 }}>
      <h2>Profil order inbound & outbound</h2>
      <p className="small muted">Pecah volume per moda kedatangan/pengiriman. Kontainer: total ton ÷ ton per palet. Case: ÷ case per palet. Pcs/roll/liter/CBM: ÷ isi per case ÷ case per palet
        (default dari konversi di tabel Volume). Outbound: jumlah trip = kebutuhan terbesar antara palet, CBM, dan ton dibanding kapasitas kendaraan.</p>
      <div className="row" style={{ alignItems: 'end' }}>
        <label className="f">Ton per palet {n(p.param.tonPerPalet, v => setParam('tonPerPalet', v), 90)}</label>
        <label className="f">CBM per palet {n(p.param.cbmPerPalet, v => setParam('cbmPerPalet', v), 90)}</label>
        <label className="f">CBM per case {n(p.param.cbmPerCase, v => setParam('cbmPerCase', v), 90)}</label>
        <label className="f">Kg per case {n(p.param.kgPerCase, v => setParam('kgPerCase', v), 90)}</label>
        <span className="small muted">Hari operasional {hariBulan}/bln (dari Process Design)</span>
      </div>
      {bagian('inbound')}
      {bagian('outbound')}
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
