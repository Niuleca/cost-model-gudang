'use client';
import { useMemo } from 'react';
import { hitungKekuatan, hitungSpaceExcel, lengkapiSpaceExcel, type HasilKekuatan, type KekuatanInput, type SpaceExcel, type StagingIn, type RakDim, type Porsi, type StatusBeban } from '@/lib/engine/space';
import { angka } from '@/lib/format';
import { InputPanjang, useSatuanPanjang, type SatuanPanjang } from '@/lib/satuanPanjang';
import { pj } from '@/lib/satuanPanjangInti';

type Pj = (v: number | null | undefined, basis: SatuanPanjang, on: (n: number | null) => void, opt?: { w?: number; kosong?: boolean; ph?: number | null }) => React.ReactNode;

const f1 = (x: number) => (x ? x.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–');
const f0 = (x: number) => (x ? Math.round(x).toLocaleString('id-ID') : '–');

// Komponen baris di luar komponen utama supaya input tidak kehilangan fokus saat mengetik.
function Baris({ l, v, u, input, tebal }: { l: string; v?: React.ReactNode; u?: string; input?: React.ReactNode; tebal?: boolean }) {
  return <tr className={tebal ? 'sp-foot' : ''}><td>{l}</td><td className="num">{input ?? v}</td><td className="small muted">{u}</td></tr>;
}
const Judul = ({ t }: { t: string }) => <tr className="sp-judul"><td colSpan={3}>{t}</td></tr>;

/** Kebutuhan space format Excel (A–E) + visual racking level dan komposisi luas. */
export default function SpacePanel({ excel, ppTotal, inboundBulan, outboundBulan, uomIn, uomOut, jumlahShift, onChange, komersial, kekuatan }: {
  excel?: Partial<SpaceExcel> | null; ppTotal: number; inboundBulan: number; outboundBulan: number; uomIn: string; uomOut: string; jumlahShift: number;
  onChange: (x: SpaceExcel) => void; komersial: React.ReactNode;
  /** dasar cek kekuatan rak & lantai: berat palet default (+ sumbernya), daya dukung lantai gudang terpilih, kapasitas beam per posisi */
  kekuatan?: { beratDefaultKg: number; sumberBerat: string; kapLantaiDefaultKgM2?: number | null; sumberLantai?: string; kapPosisiKg?: number };
}) {
  const x = lengkapiSpaceExcel(excel);
  const h = useMemo(() => hitungSpaceExcel(x, ppTotal, inboundBulan, outboundBulan, jumlahShift), [JSON.stringify(x), ppTotal, inboundBulan, outboundBulan, jumlahShift]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<SpaceExcel>) => onChange({ ...x, ...patch });
  const inp = (v: number | null | undefined, on: (n: number | null) => void, opt: { w?: number; kosong?: boolean; ph?: string } = {}) => (
    <input type="number" step="any" value={v == null ? '' : v} placeholder={opt.ph}
      onChange={e => on(e.target.value === '' ? (opt.kosong ? null : 0) : Number(e.target.value))}
      style={{ width: opt.w ?? 80, minWidth: opt.w ?? 80, textAlign: 'right', background: 'var(--input)' }} />);
  // isian panjang dalam satuan global (m / cm / mm); disimpan dalam satuan dasar field
  const sp = useSatuanPanjang(); const U = sp.satuan;
  const pjn: Pj = (v, basis, on, opt = {}) => <InputPanjang nilai={v} basis={basis} onNilai={on} kosong={opt.kosong} placeholderDasar={opt.ph ?? undefined}
    style={{ width: opt.w ?? 80, minWidth: opt.w ?? 80, textAlign: 'right', background: 'var(--input)' }} />;

  const RakRows = (k: 'sd' | 'dd', r: typeof h.sd) => {
    const d = x[k];
    const setD = (patch: Partial<RakDim>) => set({ [k]: { ...d, ...patch } } as Partial<SpaceExcel>);
    return <>
      <Baris l="Corridor (½ lebar gang)" input={pjn(d.koridor, 'm', v => setD({ koridor: v ?? 0 }))} u={U} />
      <Baris l="Depth" input={pjn(d.depth, 'm', v => setD({ depth: v ?? 0 }))} u={U} />
      <Baris l="Width (lebar bay)" input={pjn(d.width, 'm', v => setD({ width: v ?? 0 }))} u={U} />
      <Baris l="Palet per level per bay" input={inp(d.paletPerLevel, v => setD({ paletPerLevel: v ?? 1 }))} u="palet" />
      {k === 'dd' && <Baris l="Kedalaman (deep)" input={inp(d.deep ?? 2, v => setD({ deep: v ?? 2 }))} u="palet" />}
      <Baris l="Foot print rack per bay" v={f1(r.rakBay)} u="m²" />
      <Baris l="Foot print corridor per bay" v={f1(r.koridorBay)} u="m²" />
      <Baris l="Foot print total per bay" v={f1(r.totalBay)} u="m²" />
      <Baris l="Level of rack" v={angka(r.level, 1)} u="level" />
      <Baris l={`${k === 'sd' ? 'SPR' : 'DDR'} capacity per bay`} v={angka(r.kapBay, 1)} u="palet" />
      <Baris l="Space required per pallet position" v={angka(r.m2PerPP, 2)} u="m²" />
      <Baris l="Capacity required" v={<span className="sp-pink">{angka(r.ppReq, 1)}</span>} u={`PP · ${r.bay} bay`} />
      <Baris l="Foot print" v={<b>{f1(r.footprint)}</b>} u="m²" tebal />
    </>;
  };
  const LantaiRows = (k: 'block' | 'floor', r: typeof h.block) => {
    const d = x[k];
    const setL = (patch: Partial<typeof d>) => set({ [k]: { ...d, ...patch } } as Partial<SpaceExcel>);
    return <>
      <Baris l="Luas palet rata-rata" v={<span title={`${(x.paletTipe ?? []).map(p => `${p.nama} ${p.panjang} × ${p.lebar} m · ${Math.round((p.porsi || 0) * 100)}%`).join('\n')}`}>{angka(r.luasPalet, 3)}</span>} u={`m² · ${(x.paletTipe ?? []).length || 1} jenis palet (Key Assumption)`} />
      {k === 'block' ? <Baris l="Tumpukan (stacking)" input={inp(d.tumpuk, v => setL({ tumpuk: Math.max(1, v ?? 1) }), { w: 64 })} u="level" />
        : <Baris l="Tumpukan" v="1" u="level (palet di lantai, tidak ditumpuk)" />}
      <Baris l="Allowance gang / akses" input={<>{inp(Math.round(d.gangPersen * 1000) / 10, v => setL({ gangPersen: (v ?? 0) / 100 }), { w: 64 })}%</>} u="dari luas palet" />
      <Baris l="Space required per pallet position" v={angka(r.m2PerPP, 2)} u="m²" />
      <Baris l="Capacity required" v={<span className="sp-pink">{angka(r.ppReq, 1)}</span>} u={`PP · ${f0(r.tapak)} tapak palet`} />
      <Baris l="Foot print" v={<b>{f1(r.footprint)}</b>} u="m²" tebal />
    </>;
  };
  const p = x.porsi!;
  const setP = (k: keyof Porsi, v: number | null) => set({ porsi: { ...p, [k]: Math.min(100, Math.max(0, v ?? 0)) / 100 } });
  const PorsiRow = ({ k, l, pp }: { k: keyof Porsi; l: string; pp: number }) =>
    <Baris l={l} input={<>{inp(Math.round(p[k] * 1000) / 10, v => setP(k, v), { w: 64 })}%</>} u={`${f0(pp)} PP`} />;

  const StgRows = (k: 'inbound' | 'outbound', r: typeof h.inbound, uom: string) => {
    const d = x[k];
    const setS = (patch: Partial<StagingIn>) => set({ [k]: { ...d, ...patch } } as Partial<SpaceExcel>);
    return <>
      <Baris l={`${k === 'inbound' ? 'Inbound' : 'Outbound'} per month`} v={`${f0(k === 'inbound' ? inboundBulan : outboundBulan)} ${uom}`} u="dari Volume (peak)" />
      {uom !== 'palet' && <Baris l={`${uom} per palet`} input={inp(d.unitPerPalet, v => setS({ unitPerPalet: v ?? 1 }))} u={`→ ${f0(r.palet)} palet`} />}
      <Baris l={k === 'inbound' ? 'Porsi per minggu (rata-rata = 25%)' : 'Highest throughput week (porsi)'} input={<>{inp(Math.round(d.porsiMinggu * 1000) / 10, v => setS({ porsiMinggu: (v ?? 0) / 100 }), { w: 64 })}%</>} u={`= ${f0(r.mingguan)} palet/minggu`} />
      <Baris l="Hari kerja per minggu" input={inp(d.hariPerMinggu, v => setS({ hariPerMinggu: v ?? 1 }), { w: 64 })} u={`daily = ${f0(r.harian)} palet`} />
      <Baris l="Number of shift" v={r.shift} u="shift" />
      <Baris l="Volume per shift" input={inp(d.volumePerShiftManual ?? null, v => setS({ volumePerShiftManual: v }), { kosong: true, ph: f0(r.perShiftHitung) })} u="palet (kosong = otomatis)" />
      <Baris l="Sequence per shift" input={inp(d.sequence, v => setS({ sequence: v ?? 1 }), { w: 64 })} u="times" />
      <Baris l="Throughput per sequence" v={f0(r.perSequence)} u="PP" />
      <Baris l="Tumpuk di staging" input={inp(d.tumpuk, v => setS({ tumpuk: Math.max(1, v ?? 1) }), { w: 64 })} u="level" />
      <Baris l="m² per palet staging" input={inp(d.m2PerPalet, v => setS({ m2PerPalet: v ?? 0 }), { w: 64 })} u="m²" />
      <Baris l="Foot print" v={<b>{f0(r.footprint)}</b>} u="m²" tebal />
    </>;
  };

  // ---- Visual komposisi luas ----
  const komp = [
    { l: 'SPR', v: h.sd.footprint, c: '#1f1f1f' },
    { l: 'DDR', v: h.dd.footprint, c: '#4a4a4a' },
    { l: 'Block stack', v: h.block.footprint, c: '#6b6b6b' },
    { l: 'Pallet floor', v: h.floor.footprint, c: '#8a8a8a' },
    { l: 'Receiving & staging', v: h.inbound.footprint, c: '#a0a0a0' },
    { l: 'Outbound & staging', v: h.outbound.footprint, c: '#b0b0b0' },
    { l: 'Fasilitas', v: h.fasilitasM2, c: '#d9d9d9' },
    { l: 'Pembulatan', v: h.spaceRent - h.subtotal, c: '#f0f0f0' },
  ].filter(k => k.v > 0.05);

  return (
    <div className="card" style={{ gap: 14 }}>
      <h2>Space</h2>
      <div className="sp-grid">
        <div style={{ minWidth: 0 }}>
          <table className="sp-tabel"><tbody>
            <Judul t="A  Capacity Requirement" />
            <Baris l="Total posisi palet (dari Volume storage peak)" v={<b>{f0(ppTotal)}</b>} u="PP" />
            {PorsiRow({ k: 'spr', l: 'Porsi SPR (selective pallet rack)', pp: h.sd.ppReq })}
            {PorsiRow({ k: 'ddr', l: 'Porsi DDR (double deep rack)', pp: h.dd.ppReq })}
            {PorsiRow({ k: 'block', l: 'Porsi block stack (palet ditumpuk)', pp: h.block.ppReq })}
            {PorsiRow({ k: 'floor', l: 'Porsi pallet floor (palet di lantai)', pp: h.floor.ppReq })}
            <tr className="sp-foot"><td>Total porsi</td><td className="num"><span className={`pill ${h.porsiOk ? 'ok' : 'bad'}`}>{angka(h.totalPorsi * 100, 1)}%</span></td>
              <td className="small muted">{h.porsiOk ? 'OK' : 'harus 100%'}{!h.porsiOk && <button className="ghost" style={{ marginLeft: 6, padding: '0 8px' }}
                onClick={() => { const sisa = Math.max(0, 1 - p.spr - p.block - p.floor); set({ porsi: { ...p, ddr: sisa } }); }}>Sisa ke DDR</button>}</td></tr>
            {p.spr > 0 && <><Judul t="B  Racking space (SPR · Selective Pallet Rack)" />{RakRows('sd', h.sd)}</>}
            {p.ddr > 0 && <><Judul t="C  Racking space (DDR · Double Deep Rack)" />{RakRows('dd', h.dd)}</>}
            {p.block > 0 && <><Judul t="C2  Block stack" />{LantaiRows('block', h.block)}</>}
            {p.floor > 0 && <><Judul t="C3  Pallet floor" />{LantaiRows('floor', h.floor)}</>}
            <Judul t="D  Receiving & Staging" />{StgRows('inbound', h.inbound, uomIn)}
            <Judul t="D  Outbound & Staging" />{StgRows('outbound', h.outbound, uomOut)}
            <Judul t="E  Foot Print Requirement (TOTAL)" />
            <Baris l="Racking space (SPR)" v={f0(h.sd.footprint)} u="m²" />
            <Baris l="Racking space (DDR)" v={f0(h.dd.footprint)} u="m²" />
            {h.block.footprint > 0 && <Baris l="Block stack" v={f0(h.block.footprint)} u="m²" />}
            {h.floor.footprint > 0 && <Baris l="Pallet floor" v={f0(h.floor.footprint)} u="m²" />}
            <Baris l="Receiving & Staging" v={f0(h.inbound.footprint)} u="m²" />
            <Baris l="Outbound & Staging" v={f0(h.outbound.footprint)} u="m²" />
            {x.fasilitas.map((fa, i) => (
              <tr key={i}>
                <td><input aria-label="Nama fasilitas" value={fa.nama} onChange={e => set({ fasilitas: x.fasilitas.map((y, j) => j === i ? { ...y, nama: e.target.value } : y) })} style={{ minWidth: 200 }} /></td>
                <td className="num">{inp(fa.m2, v => set({ fasilitas: x.fasilitas.map((y, j) => j === i ? { ...y, m2: v ?? 0 } : y) }))}</td>
                <td><button className="ghost" aria-label="Hapus fasilitas" style={{ padding: '0 8px' }} onClick={() => set({ fasilitas: x.fasilitas.filter((_, j) => j !== i) })}>×</button></td>
              </tr>))}
            <tr><td colSpan={3}><button className="ghost" onClick={() => set({ fasilitas: [...x.fasilitas, { nama: 'Area baru', m2: 0 }] })}>+ Fasilitas</button></td></tr>
            <tr className="sp-judul"><td>Total</td><td className="num">{f0(h.subtotal)}</td><td>m²</td></tr>
            <Baris l="Dibulatkan ke atas kelipatan" input={inp(x.pembulatan, v => set({ pembulatan: v ?? 1 }), { w: 64 })} u="m²" />
            <tr className="sp-rent"><td>Space Rent</td><td className="num">{angka(h.spaceRent, 2)}</td><td>m²</td></tr>
            {x.cad.map((c, i) => (
              <tr key={`cad${i}`} className="sp-rent">
                <td>Based on CAD · <input aria-label="Area CAD" value={c.nama} onChange={e => set({ cad: x.cad.map((y, j) => j === i ? { ...y, nama: e.target.value } : y) })} style={{ width: 90, minWidth: 90 }} /></td>
                <td className="num">{inp(c.m2, v => set({ cad: x.cad.map((y, j) => j === i ? { ...y, m2: v ?? 0 } : y) }))}</td>
                <td><button className="ghost" aria-label="Hapus CAD" style={{ padding: '0 8px' }} onClick={() => set({ cad: x.cad.filter((_, j) => j !== i) })}>×</button></td>
              </tr>))}
            <tr><td colSpan={3}><button className="ghost" onClick={() => set({ cad: [...x.cad, { nama: x.cad.length ? 'RM' : 'PM', m2: 0 }] })}>+ Luas CAD (pembanding)</button>
              {h.cadTotal > 0 && <span className={`pill ${Math.abs(h.spaceRent - h.cadTotal) / h.cadTotal > 0.05 ? 'warn' : 'ok'}`} style={{ marginLeft: 8 }}>CAD {f0(h.cadTotal)} m² · selisih {angka((h.spaceRent / h.cadTotal - 1) * 100, 1)}%</span>}</td></tr>
            <Judul t="F  Building dimension (P × L × T)" />
            <tr><td>Dasar luas sewa</td><td colSpan={2}>
              <div className="tabs" role="tablist" aria-label="Dasar luas sewa" style={{ display: 'inline-flex' }}>
                {([['spaceRent', 'Space Rent (kalkulasi)'], ['cad', 'Ukuran CAD']] as const).map(([v, l]) =>
                  <button key={v} type="button" role="tab" aria-selected={(x.dasarLuas ?? 'spaceRent') === v} className={(x.dasarLuas ?? 'spaceRent') === v ? 'on' : ''} onClick={() => set({ dasarLuas: v })}>{l}</button>)}
              </div></td></tr>
            {(x.dasarLuas ?? 'spaceRent') === 'cad'
              ? <Baris l="Panjang (P) — dari CAD" input={pjn(x.panjangGudangM ?? null, 'm', v => set({ panjangGudangM: v ?? undefined }), { kosong: true })} u={U} />
              : <Baris l="Panjang (P) = luas ÷ L" v={sp.fmt(h.dimensi.panjangM, 'm', { tanpaSatuan: true, desimal: U === 'm' ? 1 : 0 })} u={`${U} (otomatis)`} />}
            <Baris l="Lebar (L) — kiri-kanan" input={pjn(x.lebarGudangM ?? null, 'm', v => set({ lebarGudangM: v ?? undefined }), { kosong: true, ph: h.dimensi.lebarM })} u={U} />
            <Baris l="Tinggi sisi (T)" input={pjn(x.rak.sideMm, 'mm', v => set({ rak: { ...x.rak, sideMm: Math.round(v ?? 0) } }), { w: 80 })} u={`${U} · sama dengan Side height`} />
            <Baris l="Tinggi tengah / puncak" input={pjn(x.rak.centerMm, 'mm', v => set({ rak: { ...x.rak, centerMm: Math.round(v ?? 0) } }), { w: 80 })} u={`${U} · sama dengan Center height`} />
            <Baris l="Gangway (lebar jalur utama MHE)" input={pjn(x.gangwayM != null && x.gangwayM <= 8 ? x.gangwayM : null, 'm', v => set({ gangwayM: v ?? undefined }), { kosong: true, ph: 3.5 })} u={`${U} · dipakai layout simulasi`} />
            <tr className="sp-hitam"><td>Luas dipakai cost model</td><td className="num">{f0(h.luasDipakai)}</td><td>m² · {h.dimensi.dasar === 'cad' ? `CAD ${sp.fmt(h.dimensi.panjangM, 'm', { tanpaSatuan: true })} × ${sp.fmt(h.dimensi.lebarM, 'm')}` : 'Space Rent'}
              {h.dimensi.dasar === 'cad' && h.spaceRent > 0 && <span className={`pill ${Math.abs(h.luasDipakai / h.spaceRent - 1) > 0.05 ? 'warn' : 'ok'}`} style={{ marginLeft: 6 }}>vs kalkulasi {f0(h.spaceRent)} m² ({angka((h.luasDipakai / h.spaceRent - 1) * 100, 1)}%)</span>}</td></tr>
          </tbody></table>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
          <div className="card" style={{ gap: 8, padding: 12 }}>
            <h3 style={{ textAlign: 'center' }}>{(x.porsi?.spr ?? 0) + (x.porsi?.ddr ?? 0) > 0 ? ((x.porsi?.block ?? 0) + (x.porsi?.floor ?? 0) > 0 ? 'RACKING LEVEL & BLOCK STACK' : 'RACKING LEVEL') : 'BLOCK STACK / PALLET FLOOR'}</h3>
            <VisualRak x={x} lv={h.level} />
            <table className="sp-tabel sp-kecil"><tbody>
              <tr className="sp-judul"><td>Dimensi</td><td className="num">Number</td><td>UoM</td></tr>
              {([['Center height', 'centerMm'], ['Side height', 'sideMm'], ['Beam', 'beamMm'], ['Pallet', 'palletMm'], ['Product', 'productMm'], ['Clearance', 'clearanceMm']] as const).map(([l, k]) => (
                <tr key={k} className={k === 'clearanceMm' ? 'sp-hijau' : ''}><td>{l}</td><td className="num">{k === 'palletMm'
                  ? <span title="Tebal palet terbesar dari Key Assumption → Jenis palet">{sp.fmt(x.rak.palletMm, 'mm', { tanpaSatuan: true })}</span>
                  : pjn(x.rak[k], 'mm', v => set({ rak: { ...x.rak, [k]: Math.round((v ?? 0) * 1000) / 1000 } }), { w: 90 })}</td><td>{k === 'palletMm' ? <span className="small muted">{U} · dari Jenis palet</span> : U}</td></tr>))}
              <tr><td>Total height / pallet (level 2 up)</td><td className="num">{sp.fmt(h.level.levelN, 'mm', { tanpaSatuan: true })}</td><td>{U}</td></tr>
              <tr><td>Total height / pallet (level 1)</td><td className="num">{sp.fmt(h.level.level1, 'mm', { tanpaSatuan: true })}</td><td>{U}</td></tr>
              <tr><td>Level manual (opsional)</td><td className="num">{inp(x.rak.levelManual ?? null, v => set({ rak: { ...x.rak, levelManual: v } }), { w: 90, kosong: true, ph: String(h.level.auto) })}</td><td>level</td></tr>
              <tr className="sp-hitam"><td>Rack Level</td><td className="num">{angka(h.level.level, 1)}</td><td>Level</td></tr>
              <tr><td>Total height ({U})</td><td className="num">{sp.fmt(h.level.tinggi, 'mm', { tanpaSatuan: true })}</td><td><span className={`pill ${h.level.ok ? 'ok' : 'bad'}`}>{h.level.ok ? 'OK' : 'Melebihi'}</span></td></tr>
            </tbody></table>
            <details open={h.level.adaManual}>
              <summary className="small" style={{ cursor: 'pointer' }}><b>Tinggi per level</b> (opsional){h.level.adaManual ? ' · ada level manual' : ' · semua otomatis'}</summary>
              <p className="small muted" style={{ margin: '6px 0' }}>Isi kolom Manual hanya untuk level yang tingginya beda. Kosong = otomatis: level 1 = Pallet + Product + Clearance ({sp.fmt(h.level.level1, 'mm')}), level 2+ = ditambah Beam ({sp.fmt(h.level.levelN, 'mm')}). Tinggi level = dari lantai / beam bawah s/d beam berikutnya.</p>
              <table className="sp-tabel sp-kecil"><tbody>
                <tr className="sp-judul"><td>Level</td><td className="num">Otomatis ({U})</td><td className="num">Manual ({U})</td><td className="num">Dasar → puncak ({U})</td></tr>
                {h.level.perLevel.map((t, i) => {
                  const man = x.rak.tinggiLevel?.[i];
                  const setMan = (v: number | null) => { const arr = [...(x.rak.tinggiLevel ?? [])]; while (arr.length <= i) arr.push(null); arr[i] = v && v > 0 ? v : null;
                    while (arr.length && !(Number(arr[arr.length - 1]) > 0)) arr.pop(); set({ rak: { ...x.rak, tinggiLevel: arr } }); };
                  return <tr key={i} className={h.level.manual[i] ? 'sp-hijau' : ''}><td>L{i + 1}</td><td className="num muted">{sp.fmt(i === 0 ? h.level.level1 : h.level.levelN, 'mm', { tanpaSatuan: true })}</td>
                    <td className="num">{pjn(man ?? null, 'mm', v => setMan(v != null ? Math.round(v * 1000) / 1000 : null), { w: 80, kosong: true })}</td>
                    <td className="num small">{sp.fmt(h.level.dasar[i] ?? 0, 'mm', { tanpaSatuan: true })} → {sp.fmt(h.level.dasar[i] + t, 'mm', { tanpaSatuan: true })}</td></tr>;
                })}
              </tbody></table>
              {h.level.adaManual && <div className="row" style={{ marginTop: 6 }}><button className="ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => set({ rak: { ...x.rak, tinggiLevel: [] } })}>Reset semua ke otomatis</button></div>}
            </details>
          </div>

          {kekuatan && <KekuatanRak x={x} set={set} inp={inp} pjn={pjn} o={kekuatan} />}

          <div className="card" style={{ gap: 8, padding: 12 }}>
            <h3>Komposisi luas · {f0(h.spaceRent)} m²{h.dimensi.dasar === 'cad' ? ` (dasar sewa CAD ${f0(h.luasDipakai)} m²)` : ''}</h3>
            <div className="sp-bar" role="img" aria-label="Komposisi luas gudang">
              {komp.map(k => <div key={k.l} title={`${k.l}: ${f0(k.v)} m²`} style={{ flexGrow: k.v, background: k.c }} />)}
            </div>
            <div className="sp-legend">
              {komp.map(k => <span key={k.l}><i style={{ background: k.c }} />{k.l} <b>{f0(k.v)} m²</b> <span className="muted">({angka(k.v / Math.max(1, h.spaceRent) * 100, 0)}%)</span></span>)}
            </div>
          </div>

          {komersial}
        </div>
      </div>
    </div>
  );
}

/** Penampang gudang: tinggi sisi & tengah, rak dengan level, tinggi total rak. */
function VisualRak({ x, lv }: { x: SpaceExcel; lv: ReturnType<typeof import('@/lib/engine/space').hitungLevelRak> }) {
  const W = 540, H = 230, kiri = 96, kanan = W - 20, dasar = H - 24;
  const maxMm = Math.max(x.rak.centerMm, x.rak.sideMm, lv.tinggi, 1);
  const sk = (dasar - 20) / maxMm;
  const ySide = dasar - x.rak.sideMm * sk, yCenter = dasar - x.rak.centerMm * sk;
  const tengah = (kiri + kanan) / 2;
  const adaRak = (x.porsi?.spr ?? 0) + (x.porsi?.ddr ?? 0) > 0, adaBlok = (x.porsi?.block ?? 0) + (x.porsi?.floor ?? 0) > 0;
  // rak di kolom kiri, block stack di kanan bila campuran; hanya satu jenis → keempat kolom jenis itu
  const posisi = [kiri + 40, kiri + 100, tengah + 30, tengah + 90];
  const rakX = adaRak ? (adaBlok ? posisi.slice(0, 2) : posisi) : [];
  const blokX = adaBlok ? (adaRak ? posisi.slice(2) : posisi) : [];
  const tumpuk = Math.max(1, (x.porsi?.block ?? 0) > 0 ? x.block?.tumpuk ?? 1 : 1);
  const tPaletMm = x.rak.palletMm + x.rak.productMm, tBlokMm = tumpuk * tPaletMm;
  const tinggiLevel = (i: number) => lv.dasar[i] ?? (i === 0 ? 0 : lv.level1 + (i - 1) * lv.levelN);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Rak ${lv.level} level, tinggi ${lv.tinggi} mm, tinggi sisi gudang ${x.rak.sideMm} mm`}>
      <polygon points={`${kiri},${dasar} ${kiri},${ySide} ${tengah},${yCenter} ${kanan},${ySide} ${kanan},${dasar}`} fill="var(--surface-2)" stroke="var(--line)" />
      <line x1={kiri - 10} x2={kanan + 10} y1={dasar} y2={dasar} stroke="var(--ink)" strokeWidth={2} />
      {rakX.map((rx, k) => (
        <g key={k}>
          <rect x={rx} y={dasar - lv.tinggi * sk} width={44} height={lv.tinggi * sk} fill="none" stroke="#6b6b6b" strokeWidth={1.2} />
          {Array.from({ length: lv.level }, (_, i) => {
            const y0 = dasar - tinggiLevel(i) * sk;
            // level manual: sisa tinggi setelah beam, palet & clearance = ruang produk
            const tinggiLv = lv.perLevel[i] ?? (i === 0 ? lv.level1 : lv.levelN);
            const prodMm = Math.max(0, tinggiLv - (i === 0 ? 0 : x.rak.beamMm) - x.rak.palletMm - x.rak.clearanceMm);
            const tProd = prodMm * sk, tPal = x.rak.palletMm * sk, tBeam = i === 0 ? 0 : x.rak.beamMm * sk;
            return <g key={i}>
              {i > 0 && <rect x={rx} y={y0 - tBeam} width={44} height={Math.max(1, tBeam)} fill="#4a4a4a" />}
              <rect x={rx + 3} y={y0 - tBeam - tPal} width={38} height={Math.max(1, tPal)} fill="#a0a0a0" />
              <rect x={rx + 4} y={y0 - tBeam - tPal - tProd} width={36} height={Math.max(1, tProd)} fill="#d9d9d9" stroke="#b0b0b0" strokeWidth={0.5} />
            </g>;
          })}
        </g>))}
      {blokX.map((bx, k) => (
        <g key={`b${k}`}>
          {Array.from({ length: tumpuk }, (_, i) => {
            const y0 = dasar - i * tPaletMm * sk;
            return <g key={i}>
              <rect x={bx + 3} y={y0 - x.rak.palletMm * sk} width={38} height={Math.max(1, x.rak.palletMm * sk)} fill="#c8a165" stroke="#8a6a3a" strokeWidth={0.5} />
              <rect x={bx + 4} y={y0 - (x.rak.palletMm + x.rak.productMm) * sk} width={36} height={Math.max(1, x.rak.productMm * sk)} fill="#e7d3b0" stroke="#b39064" strokeWidth={0.5} />
            </g>;
          })}
        </g>))}
      {adaBlok && blokX.length > 0 && <>
        <line x1={blokX[blokX.length - 1] + 56} x2={blokX[blokX.length - 1] + 56} y1={dasar - tBlokMm * sk} y2={dasar} stroke={tBlokMm <= x.rak.sideMm ? 'var(--ok)' : 'var(--bad)'} markerStart="url(#pa)" markerEnd="url(#pa)" />
        <text x={blokX[blokX.length - 1] + 60} y={dasar - tBlokMm * sk / 2} fontSize="11" fill={tBlokMm <= x.rak.sideMm ? 'var(--ok)' : 'var(--bad)'}>{tumpuk} tumpuk · {pj(tBlokMm, 'mm', 1)}</text>
      </>}
      {/* dimensi sisi */}
      <line x1={kiri - 30} x2={kiri - 30} y1={ySide} y2={dasar} stroke="var(--ink)" markerStart="url(#pa)" markerEnd="url(#pa)" />
      <text x={kiri - 34} y={(ySide + dasar) / 2} textAnchor="end" fontSize="11" fill="var(--ink)">{pj(x.rak.sideMm, 'mm', 1)}</text>
      {/* dimensi tengah */}
      <line x1={tengah} x2={tengah} y1={yCenter} y2={dasar} stroke="var(--muted)" strokeDasharray="4 3" />
      <text x={tengah + 4} y={yCenter + 14} fontSize="11" fill="var(--ink)">{pj(x.rak.centerMm, 'mm', 1)}</text>
      {/* tinggi rak */}
      {rakX.length > 0 && <><line x1={rakX[rakX.length - 1] + 56} x2={rakX[rakX.length - 1] + 56} y1={dasar - lv.tinggi * sk} y2={dasar} stroke={lv.ok ? 'var(--ok)' : 'var(--bad)'} markerStart="url(#pa)" markerEnd="url(#pa)" />
      <text x={rakX[rakX.length - 1] + 60} y={dasar - lv.tinggi * sk / 2} fontSize="11" fill={lv.ok ? 'var(--ok)' : 'var(--bad)'}>{lv.level} lvl · {pj(lv.tinggi, 'mm', 1)}</text></>}
      <defs><marker id="pa" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker></defs>
    </svg>);
}

// di luar komponen supaya input tidak kehilangan fokus saat mengetik
const BarisK = ({ l, v, u, t }: { l: React.ReactNode; v: React.ReactNode; u?: React.ReactNode; t?: string }) => <tr><td title={t}>{l}</td><td className="num">{v}</td><td className="small muted">{u}</td></tr>;
const WARNA_STATUS: Record<StatusBeban, string> = { ok: 'ok', dekat: 'warn', lebih: 'bad', kosong: '' };
const TEKS_STATUS: Record<StatusBeban, string> = { ok: 'OK', dekat: 'Mendekati batas', lebih: 'Melebihi', kosong: 'Belum diisi' };
const Status = ({ s, pct }: { s: StatusBeban; pct?: number }) => <span className={`pill ${WARNA_STATUS[s]}`}>{pct != null && s !== 'kosong' ? `${angka(pct * 100, 1)}% · ` : ''}{TEKS_STATUS[s]}</span>;

/** Kekuatan rak (beam & frame) dan daya dukung lantai — format Excel "Foot print per pallet / Floor capacity usage". */
function KekuatanRak({ x, set, inp, pjn, o }: {
  x: SpaceExcel; set: (p: Partial<SpaceExcel>) => void;
  inp: (v: number | null | undefined, on: (n: number | null) => void, opt?: { w?: number; kosong?: boolean; ph?: string }) => React.ReactNode;
  pjn: Pj;
  o: { beratDefaultKg: number; sumberBerat: string; kapLantaiDefaultKgM2?: number | null; sumberLantai?: string; kapPosisiKg?: number };
}) {
  const r = hitungKekuatan(x, o);
  const sp = useSatuanPanjang(); const U = sp.satuan;
  const setK = (p: Partial<KekuatanInput>) => set({ kekuatan: { ...(x.kekuatan ?? {}), ...p } });
  return (
    <div className="card" style={{ gap: 8, padding: 12 }}>
      <h3 style={{ textAlign: 'center' }}>KEKUATAN RAK &amp; LANTAI</h3>
      <TapakPalet r={r} />
      <table className="sp-tabel sp-kecil"><tbody>
        <tr className="sp-judul"><td>Beban</td><td className="num">Nilai</td><td>Keterangan</td></tr>
        <BarisK l="Berat per palet" v={inp(r.beratOtomatis ? null : r.beratKg, v => setK({ beratPaletKg: v }), { w: 90, kosong: true, ph: String(Math.round(r.beratKg)) })} u={<>kg · {r.beratOtomatis ? `otomatis: ${o.sumberBerat}` : 'manual'}</>} />
        <BarisK l="Jumlah level terisi" v={inp(r.levelOtomatis ? null : r.level, v => setK({ level: v }), { w: 90, kosong: true, ph: String(r.level) })} u={r.levelOtomatis ? 'level · otomatis = Rack Level' : 'level · manual'} />
        <BarisK l="Total beban per tapak" v={<b>{f0(r.totalKg)}</b>} u="kg (berat × level)" />
        <tr className="sp-judul"><td>Tapak per palet (tampak atas)</td><td className="num" /><td /></tr>
        <BarisK l="Lebar palet sepanjang beam" v={sp.fmt(r.lebarPaletCm, 'cm', { tanpaSatuan: true })} u={`${U} · dari Jenis palet (dominan)`} />
        <BarisK l="Celah per palet (upright + jarak antar palet)" v={pjn(r.k.celahCm, 'cm', v => setK({ celahCm: v ?? 0 }), { w: 90 })} u={U} />
        <BarisK l="Panjang tapak" v={pjn(Number(r.k.panjangCm) > 0 ? r.k.panjangCm! : null, 'cm', v => setK({ panjangCm: v }), { w: 90, kosong: true, ph: r.panjangCm })} u={`${U} · kosong = lebar palet + celah`} />
        <BarisK l="Kedalaman frame rak" v={pjn(r.k.kedalamanFrameCm, 'cm', v => setK({ kedalamanFrameCm: v ?? 0 }), { w: 90 })} u={U} />
        <BarisK l="Celah belakang (flue / back-to-back)" v={pjn(r.k.celahBelakangCm, 'cm', v => setK({ celahBelakangCm: v ?? 0 }), { w: 90 })} u={U} />
        <BarisK l="Lebar tapak" v={pjn(Number(r.k.lebarCm) > 0 ? r.k.lebarCm! : null, 'cm', v => setK({ lebarCm: v }), { w: 90, kosong: true, ph: r.lebarCm })} u={`${U} · kosong = frame + celah belakang`} />
        <BarisK l={<b>Foot print per pallet</b>} v={<b>{angka(r.tapakM2, 2)}</b>} u="m² (termasuk celah ke palet sebelah & rak belakang)" />
        <tr className="sp-judul"><td>Lantai</td><td className="num" /><td /></tr>
        <BarisK l="Daya dukung lantai (floor capacity)" v={inp(Number(x.kekuatan?.kapLantaiKgM2) > 0 ? x.kekuatan!.kapLantaiKgM2 : null, v => setK({ kapLantaiKgM2: v }), { w: 90, kosong: true, ph: String(Math.round(r.kapLantai)) })}
          u={<>kg/m² · {x.kekuatan?.kapLantaiKgM2 ? 'manual' : o.sumberLantai ?? 'default 3.000'}</>} />
        <BarisK l="Beban per m² (workload)" v={<b>{f0(r.bebanM2)}</b>} u="kg/m²" />
        <tr className="sp-hitam"><td>Floor capacity usage</td><td className="num">{angka(r.pakaiLantai * 100, 2)}%</td><td><Status s={r.statusLantai} /></td></tr>
        {(x.porsi?.block ?? 0) > 0 && <BarisK l={`Block stack (${r.tumpuk} tumpuk ÷ ${angka(r.luasPalet, 2)} m²)`} v={f0(r.bebanBlokM2)} u={<>kg/m² · <Status s={r.statusBlok} pct={r.kapLantai > 0 ? r.bebanBlokM2 / r.kapLantai : undefined} /></>} />}
        <tr className="sp-judul"><td>Rak</td><td className="num" /><td /></tr>
        <BarisK l={`Beam per level (${r.ppl} palet)`} v={f0(r.bebanBeamKg)} u={<>kg vs kapasitas {inp(Number(x.kekuatan?.kapBeamKg) > 0 ? x.kekuatan!.kapBeamKg : null, v => setK({ kapBeamKg: v }), { w: 80, kosong: true, ph: String(Math.round(r.kapBeamKg)) })} kg · <Status s={r.statusBeam} pct={r.kapBeamKg > 0 ? r.bebanBeamKg / r.kapBeamKg : undefined} /></>}
          t="Kosong = kapasitas per posisi (tab Produk → aturan berat) × palet per level" />
        <BarisK l={`Frame / upright (${r.ppl} palet × ${r.level} level)`} v={f0(r.bebanFrameKg)} u={<>kg vs kapasitas {inp(r.kapFrameKg > 0 ? r.kapFrameKg : null, v => setK({ kapFrameKg: v }), { w: 80, kosong: true, ph: 'vendor' })} kg · <Status s={r.statusFrame} pct={r.kapFrameKg > 0 ? r.bebanFrameKg / r.kapFrameKg : undefined} /></>}
          t="1 frame menanggung ½ bay kiri + ½ bay kanan = 1 bay penuh. Isi kapasitas frame dari spesifikasi vendor rak." />
      </tbody></table>
      <p className="small muted" style={{ margin: 0 }}>Floor capacity usage = berat palet × level ÷ foot print per pallet ÷ daya dukung lantai. ≤ 90% OK · 90–100% mendekati batas · &gt; 100% melebihi (kurangi level / berat, atau perkuat lantai).</p>
    </div>
  );
}

/** Tampak atas: 2 bay × palet per level, kotak putus-putus = tapak satu palet. */
function TapakPalet({ r }: { r: HasilKekuatan }) {
  const W = 560, H = 170, sk = Math.min((W - 170) / Math.max(1, r.panjangCm * Math.min(4, r.ppl * 2)), (H - 50) / Math.max(1, r.lebarCm + 40));
  const n = Math.min(4, r.ppl * 2), x0 = 64, y0 = 28;
  const pw = Math.max(1, r.lebarPaletCm) * sk, ph = Math.max(1, Number(r.k.kedalamanFrameCm) + 20) * sk;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Tapak per palet ${pj(r.panjangCm, 'cm')} × ${pj(r.lebarCm, 'cm')} = ${angka(r.tapakM2, 2)} m²`}>
      <text x={x0} y={14} fontSize="11" fill="var(--ink)" fontWeight={700}>Tampak atas</text>
      {Array.from({ length: n }, (_, i) => {
        const px = x0 + i * r.panjangCm * sk + (r.panjangCm - r.lebarPaletCm) * sk / 2;
        return <g key={i}>
          <rect x={px} y={y0 + 10 * sk} width={pw} height={ph} fill={i === 0 ? '#ffe066' : 'var(--surface-2)'} stroke="#6b6b6b" />
          <text x={px + pw / 2} y={y0 + 10 * sk + ph / 2 + 4} textAnchor="middle" fontSize="10" fill="var(--ink)">{angka(r.beratKg, 0)} kg</text>
        </g>;
      })}
      <rect x={x0} y={y0} width={r.panjangCm * sk} height={r.lebarCm * sk} fill="none" stroke="var(--ink)" strokeDasharray="4 3" />
      <text x={x0 + r.panjangCm * sk / 2} y={y0 + r.lebarCm * sk + 14} textAnchor="middle" fontSize="11" fill="var(--ink)">{pj(r.panjangCm, 'cm')}</text>
      <text x={x0 - 6} y={y0 + r.lebarCm * sk / 2} textAnchor="end" fontSize="11" fill="var(--ink)">{pj(r.lebarCm, 'cm')}</text>
      <text x={x0 + n * r.panjangCm * sk + 8} y={y0 + 20} fontSize="11" fill="var(--ink)">Tapak / palet</text>
      <text x={x0 + n * r.panjangCm * sk + 8} y={y0 + 36} fontSize="12" fill="var(--ink)" fontWeight={700}>{angka(r.tapakM2, 2)} m²</text>
    </svg>
  );
}
