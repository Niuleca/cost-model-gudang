'use client';
import { useMemo } from 'react';
import { hitungSpaceExcel, lengkapiSpaceExcel, type SpaceExcel, type StagingIn, type RakDim, type Porsi } from '@/lib/engine/space';
import { angka } from '@/lib/format';

const f1 = (x: number) => (x ? x.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–');
const f0 = (x: number) => (x ? Math.round(x).toLocaleString('id-ID') : '–');

// Komponen baris di luar komponen utama supaya input tidak kehilangan fokus saat mengetik.
function Baris({ l, v, u, input, tebal }: { l: string; v?: React.ReactNode; u?: string; input?: React.ReactNode; tebal?: boolean }) {
  return <tr className={tebal ? 'sp-foot' : ''}><td>{l}</td><td className="num">{input ?? v}</td><td className="small muted">{u}</td></tr>;
}
const Judul = ({ t }: { t: string }) => <tr className="sp-judul"><td colSpan={3}>{t}</td></tr>;

/** Kebutuhan space format Excel (A–E) + visual racking level dan komposisi luas. */
export default function SpacePanel({ excel, ppTotal, inboundBulan, outboundBulan, uomIn, uomOut, jumlahShift, onChange, komersial }: {
  excel?: Partial<SpaceExcel> | null; ppTotal: number; inboundBulan: number; outboundBulan: number; uomIn: string; uomOut: string; jumlahShift: number;
  onChange: (x: SpaceExcel) => void; komersial: React.ReactNode;
}) {
  const x = lengkapiSpaceExcel(excel);
  const h = useMemo(() => hitungSpaceExcel(x, ppTotal, inboundBulan, outboundBulan, jumlahShift), [JSON.stringify(x), ppTotal, inboundBulan, outboundBulan, jumlahShift]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<SpaceExcel>) => onChange({ ...x, ...patch });
  const inp = (v: number | null | undefined, on: (n: number | null) => void, opt: { w?: number; kosong?: boolean; ph?: string } = {}) => (
    <input type="number" step="any" value={v == null ? '' : v} placeholder={opt.ph}
      onChange={e => on(e.target.value === '' ? (opt.kosong ? null : 0) : Number(e.target.value))}
      style={{ width: opt.w ?? 80, minWidth: opt.w ?? 80, textAlign: 'right', background: 'var(--input)' }} />);

  const RakRows = (k: 'sd' | 'dd', r: typeof h.sd) => {
    const d = x[k];
    const setD = (patch: Partial<RakDim>) => set({ [k]: { ...d, ...patch } } as Partial<SpaceExcel>);
    return <>
      <Baris l="Corridor (½ lebar gang)" input={inp(d.koridor, v => setD({ koridor: v ?? 0 }))} u="m" />
      <Baris l="Depth" input={inp(d.depth, v => setD({ depth: v ?? 0 }))} u="m" />
      <Baris l="Width (lebar bay)" input={inp(d.width, v => setD({ width: v ?? 0 }))} u="m" />
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
      <Baris l="Dimensi palet (panjang × lebar)" input={<>{inp(x.palet.panjang, v => set({ palet: { ...x.palet, panjang: v ?? 0 } }), { w: 60 })} × {inp(x.palet.lebar, v => set({ palet: { ...x.palet, lebar: v ?? 0 } }), { w: 60 })}</>} u="m" />
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
            <Baris l="Gangway" input={inp(x.gangwayM ?? null, v => set({ gangwayM: v ?? undefined }), { kosong: true })} u="m" />
            <Baris l="Desain gudang (kiri-kanan)" input={inp(x.lebarGudangM ?? null, v => set({ lebarGudangM: v ?? undefined }), { kosong: true })} u="m" />
          </tbody></table>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start', minWidth: 0 }}>
          <div className="card" style={{ gap: 8, padding: 12 }}>
            <h3 style={{ textAlign: 'center' }}>RACKING LEVEL</h3>
            <VisualRak x={x} lv={h.level} />
            <table className="sp-tabel sp-kecil"><tbody>
              <tr className="sp-judul"><td>Dimensi</td><td className="num">Number</td><td>UoM</td></tr>
              {([['Center height', 'centerMm'], ['Side height', 'sideMm'], ['Beam', 'beamMm'], ['Pallet', 'palletMm'], ['Product', 'productMm'], ['Clearance', 'clearanceMm']] as const).map(([l, k]) => (
                <tr key={k} className={k === 'clearanceMm' ? 'sp-hijau' : ''}><td>{l}</td><td className="num">{inp(x.rak[k], v => set({ rak: { ...x.rak, [k]: v ?? 0 } }), { w: 90 })}</td><td>mm</td></tr>))}
              <tr><td>Total height / pallet (level 2 up)</td><td className="num">{f0(h.level.levelN)}</td><td>mm</td></tr>
              <tr><td>Total height / pallet (level 1)</td><td className="num">{f0(h.level.level1)}</td><td>mm</td></tr>
              <tr><td>Level manual (opsional)</td><td className="num">{inp(x.rak.levelManual ?? null, v => set({ rak: { ...x.rak, levelManual: v } }), { w: 90, kosong: true, ph: String(h.level.auto) })}</td><td>level</td></tr>
              <tr className="sp-hitam"><td>Rack Level</td><td className="num">{angka(h.level.level, 1)}</td><td>Level</td></tr>
              <tr><td>Total height</td><td className="num">{f0(h.level.tinggi)}</td><td><span className={`pill ${h.level.ok ? 'ok' : 'bad'}`}>{h.level.ok ? 'OK' : 'Melebihi'}</span></td></tr>
            </tbody></table>
          </div>

          <div className="card" style={{ gap: 8, padding: 12 }}>
            <h3>Komposisi luas · {f0(h.spaceRent)} m²</h3>
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
  const W = 520, H = 230, kiri = 70, kanan = W - 20, dasar = H - 24;
  const maxMm = Math.max(x.rak.centerMm, x.rak.sideMm, lv.tinggi, 1);
  const sk = (dasar - 20) / maxMm;
  const ySide = dasar - x.rak.sideMm * sk, yCenter = dasar - x.rak.centerMm * sk;
  const tengah = (kiri + kanan) / 2;
  const rakX = [kiri + 40, kiri + 100, tengah + 30, tengah + 90];
  const tinggiLevel = (i: number) => (i === 0 ? 0 : lv.level1 + (i - 1) * lv.levelN);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Rak ${lv.level} level, tinggi ${lv.tinggi} mm, tinggi sisi gudang ${x.rak.sideMm} mm`}>
      <polygon points={`${kiri},${dasar} ${kiri},${ySide} ${tengah},${yCenter} ${kanan},${ySide} ${kanan},${dasar}`} fill="var(--surface-2)" stroke="var(--line)" />
      <line x1={kiri - 10} x2={kanan + 10} y1={dasar} y2={dasar} stroke="var(--ink)" strokeWidth={2} />
      {rakX.map((rx, k) => (
        <g key={k}>
          <rect x={rx} y={dasar - lv.tinggi * sk} width={44} height={lv.tinggi * sk} fill="none" stroke="#6b6b6b" strokeWidth={1.2} />
          {Array.from({ length: lv.level }, (_, i) => {
            const y0 = dasar - tinggiLevel(i) * sk;
            const tProd = x.rak.productMm * sk, tPal = x.rak.palletMm * sk, tBeam = i === 0 ? 0 : x.rak.beamMm * sk;
            return <g key={i}>
              {i > 0 && <rect x={rx} y={y0 - tBeam} width={44} height={Math.max(1, tBeam)} fill="#4a4a4a" />}
              <rect x={rx + 3} y={y0 - tBeam - tPal} width={38} height={Math.max(1, tPal)} fill="#a0a0a0" />
              <rect x={rx + 4} y={y0 - tBeam - tPal - tProd} width={36} height={Math.max(1, tProd)} fill="#d9d9d9" stroke="#b0b0b0" strokeWidth={0.5} />
            </g>;
          })}
        </g>))}
      {/* dimensi sisi */}
      <line x1={kiri - 30} x2={kiri - 30} y1={ySide} y2={dasar} stroke="var(--ink)" markerStart="url(#pa)" markerEnd="url(#pa)" />
      <text x={kiri - 34} y={(ySide + dasar) / 2} textAnchor="end" fontSize="11" fill="var(--ink)">{angka(x.rak.sideMm / 1000, 1)} m</text>
      {/* dimensi tengah */}
      <line x1={tengah} x2={tengah} y1={yCenter} y2={dasar} stroke="var(--muted)" strokeDasharray="4 3" />
      <text x={tengah + 4} y={yCenter + 14} fontSize="11" fill="var(--ink)">{angka(x.rak.centerMm / 1000, 1)} m</text>
      {/* tinggi rak */}
      <line x1={rakX[3] + 56} x2={rakX[3] + 56} y1={dasar - lv.tinggi * sk} y2={dasar} stroke={lv.ok ? 'var(--ok)' : 'var(--bad)'} markerStart="url(#pa)" markerEnd="url(#pa)" />
      <text x={rakX[3] + 60} y={dasar - lv.tinggi * sk / 2} fontSize="11" fill={lv.ok ? 'var(--ok)' : 'var(--bad)'}>{lv.level} lvl · {angka(lv.tinggi / 1000, 1)} m</text>
      <defs><marker id="pa" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker></defs>
    </svg>);
}
