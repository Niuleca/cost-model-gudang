'use client';
// Parameter layout otomatis (angka awal = sheet Space tender; revisi hanya untuk desain gudang, tender tidak berubah).
import type { ParamSim } from '@/lib/simulasi3d/layout';

const angka = (v: number, d = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Isian angka; ditandai bila berbeda dari angka awal (Space tender). */
function Isian({ l, v, a, set, u, step = 0.01, pct }: { l: string; v: number | null; a: number | null; set: (x: number | null) => void; u?: string; step?: number; pct?: boolean }) {
  const tampil = v == null ? '' : pct ? Math.round(v * 1000) / 10 : v;
  const beda = (v ?? null) !== (a ?? null) && !(v != null && a != null && Math.abs(v - a) < 1e-9);
  return (
    <label className={`f sim3d-isian${beda ? ' beda' : ''}`}>{l}{u ? ` (${u})` : ''}
      <input type="number" step={pct ? 1 : step} value={tampil} placeholder={a == null ? 'otomatis' : undefined}
        onChange={e => { const x = e.target.value === '' ? null : Number(e.target.value); set(x == null ? null : pct ? x / 100 : x); }} />
      {beda && <span className="small muted">awal: {a == null ? 'otomatis' : pct ? `${angka(a * 100, 1)}%` : angka(a, 2)}</span>}
    </label>
  );
}

export default function ParamSpace({ param, awal, setParam, level }: { param: ParamSim; awal: ParamSim; setParam: (p: ParamSim) => void; level?: { level: number; tinggi: number } }) {
  const ubah = (f: (p: ParamSim) => ParamSim) => setParam(f(param));
  return (
    <div className="sim2d-param">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="small muted" style={{ margin: 0 }}>Angka awal dari sheet <b>Space</b> tender.</p>
        <button type="button" className="ghost" style={{ padding: '3px 8px' }} onClick={() => setParam(awal)}>Reset ke Space</button>
      </div>
      <div className="eyebrow">Gudang</div>
      <div className="grid2" style={{ gap: 6 }}>
        <Isian l="Lebar gudang" u="m" step={0.5} v={param.lebarM} a={awal.lebarM} set={x => ubah(p => ({ ...p, lebarM: x ?? awal.lebarM }))} />
        <Isian l="Side height" u="mm" step={100} v={param.sideMm} a={awal.sideMm} set={x => ubah(p => ({ ...p, sideMm: x ?? awal.sideMm }))} />
        <Isian l="Center height" u="mm" step={100} v={param.centerMm} a={awal.centerMm} set={x => ubah(p => ({ ...p, centerMm: x ?? awal.centerMm }))} />
        <Isian l="Dock inbound" step={1} v={param.dockIn} a={awal.dockIn} set={x => ubah(p => ({ ...p, dockIn: x ?? awal.dockIn }))} />
        <Isian l="Dock outbound" step={1} v={param.dockOut} a={awal.dockOut} set={x => ubah(p => ({ ...p, dockOut: x ?? awal.dockOut }))} />
      </div>
      <div className="eyebrow">Racking level</div>
      <div className="grid2" style={{ gap: 6 }}>
        <Isian l="Beam" u="mm" step={10} v={param.beamMm} a={awal.beamMm} set={x => ubah(p => ({ ...p, beamMm: x ?? awal.beamMm }))} />
        <Isian l="Pallet" u="mm" step={10} v={param.palletMm} a={awal.palletMm} set={x => ubah(p => ({ ...p, palletMm: x ?? awal.palletMm }))} />
        <Isian l="Product" u="mm" step={50} v={param.productMm} a={awal.productMm} set={x => ubah(p => ({ ...p, productMm: x ?? awal.productMm }))} />
        <Isian l="Clearance" u="mm" step={10} v={param.clearanceMm} a={awal.clearanceMm} set={x => ubah(p => ({ ...p, clearanceMm: x ?? awal.clearanceMm }))} />
        <Isian l="Level manual" step={1} v={param.levelManual} a={awal.levelManual} set={x => ubah(p => ({ ...p, levelManual: x && x > 0 ? x : null }))} />
        {level && <div className="f small"><span className="muted">Level dipakai</span><b>{level.level} level · {angka(level.tinggi, 2)} m</b></div>}
      </div>
      <div className="eyebrow">Porsi metode simpan (total 100%)</div>
      <div className="grid2" style={{ gap: 6 }}>
        {(['spr', 'ddr', 'block', 'floor'] as const).map(k => (
          <Isian key={k} l={{ spr: 'SPR', ddr: 'DDR', block: 'Block stack', floor: 'Pallet floor' }[k]} u="%" pct v={param.porsi[k]} a={awal.porsi[k]} set={x => ubah(p => ({ ...p, porsi: { ...p.porsi, [k]: x ?? 0 } }))} />
        ))}
      </div>
      {param.porsi.spr > 0 && (<>
        <div className="eyebrow">SPR · selective pallet rack</div>
        <div className="grid2" style={{ gap: 6 }}>
          <Isian l="Corridor (½ gang)" u="m" v={param.spr.koridor} a={awal.spr.koridor} set={x => ubah(p => ({ ...p, spr: { ...p.spr, koridor: x ?? awal.spr.koridor } }))} />
          <Isian l="Depth" u="m" v={param.spr.depth} a={awal.spr.depth} set={x => ubah(p => ({ ...p, spr: { ...p.spr, depth: x ?? awal.spr.depth } }))} />
          <Isian l="Width (lebar bay)" u="m" v={param.spr.width} a={awal.spr.width} set={x => ubah(p => ({ ...p, spr: { ...p.spr, width: x ?? awal.spr.width } }))} />
          <Isian l="Palet / level / bay" step={1} v={param.spr.ppl} a={awal.spr.ppl} set={x => ubah(p => ({ ...p, spr: { ...p.spr, ppl: x ?? awal.spr.ppl } }))} />
        </div>
      </>)}
      {param.porsi.ddr > 0 && (<>
        <div className="eyebrow">DDR · double deep rack</div>
        <div className="grid2" style={{ gap: 6 }}>
          <Isian l="Corridor (½ gang)" u="m" v={param.ddr.koridor} a={awal.ddr.koridor} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, koridor: x ?? awal.ddr.koridor } }))} />
          <Isian l="Depth" u="m" v={param.ddr.depth} a={awal.ddr.depth} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, depth: x ?? awal.ddr.depth } }))} />
          <Isian l="Width (lebar bay)" u="m" v={param.ddr.width} a={awal.ddr.width} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, width: x ?? awal.ddr.width } }))} />
          <Isian l="Palet / level / bay" step={1} v={param.ddr.ppl} a={awal.ddr.ppl} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, ppl: x ?? awal.ddr.ppl } }))} />
          <Isian l="Deep" step={1} v={param.ddr.deep} a={awal.ddr.deep} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, deep: x ?? awal.ddr.deep } }))} />
        </div>
      </>)}
      {param.porsi.block > 0 && <div className="grid2" style={{ gap: 6 }}><Isian l="Block stack: tumpuk" step={1} v={param.blockTumpuk} a={awal.blockTumpuk} set={x => ubah(p => ({ ...p, blockTumpuk: x ?? awal.blockTumpuk }))} /></div>}
    </div>
  );
}
