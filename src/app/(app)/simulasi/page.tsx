'use client';
// Menu Simulasi Warehouse: pilih project → tata letak 3D otomatis dari hasil hitung tender.
// Parameter rak & gudang memakai angka sheet Space tender sebagai angka awal (bisa direvisi di sini, tidak mengubah tender);
// kecepatan MHE & manpower mengikuti productivity aktivitas (bisa dicek & diatur).
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ASUMSI_DEFAULT, keInput, muatMaster, type TenderRow } from '@/lib/tender';
import { IT_SHEET_DEFAULT } from '@/lib/it';
import { hitungTender, type HasilTender } from '@/lib/engine/index.ts';
import { paramAwal, susunLayout, type LayoutGudang, type ParamSim } from '@/lib/simulasi3d/layout';
import { labelStatus } from '@/lib/status';
import type { Kamera, Kecepatan, OpsiViewer, ViewerApi } from './Viewer3D';
import { WARNA_MHE, WARNA_ORANG } from './warna';

const Viewer3D = dynamic(() => import('./Viewer3D'), { ssr: false, loading: () => <div className="sim3d-wadah sim3d-muat">Menyiapkan 3D…</div> });

interface T { id: string; kode: string | null; customer: string; status: string; updated_at: string }
const LABEL_KAT: Record<string, string> = { admin: 'Admin', checker: 'Checker', picker: 'Picker / packer', operator: 'Operator MHE', tkbm: 'TKBM / helper', supervisor: 'Supervisor / manager', security: 'Security', inventory: 'Inventory', lain: 'Lainnya' };
const LABEL_MHE: Record<string, string> = { reach: 'Reach truck', forklift: 'Forklift', stacker: 'Stacker', hpt: 'Hand pallet', perangkat: 'Perangkat (tidak digambar)' };
const FAKTOR = [1, 5, 10, 30, 60, 120];
const angka = (v: number, d = 0) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
const jamSim = (det: number) => { const s = Math.floor(det); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

type PanelTab = 'layout' | 'prod' | 'info';

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


export default function SimulasiGudang() {
  const sb = supabaseBrowser();
  const [daftar, setDaftar] = useState<T[]>([]);
  const [cari, setCari] = useState('');
  const [id, setId] = useState('');
  const [data, setData] = useState<{ t: TenderRow; h: HasilTender; sumber: 'hitung' | 'tersimpan' } | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [param, setParam] = useState<ParamSim | null>(null);
  const [prodSim, setProdSim] = useState<Record<number, number>>({});
  const [prodDb, setProdDb] = useState<Record<number, number>>({});
  const [faktor, setFaktor] = useState(10);
  const [shift, setShift] = useState(0);
  const [tab, setTab] = useState<PanelTab>('layout');
  const [opsi, setOpsi] = useState<OpsiViewer>({ atap: false, dinding: true, label: true, animasi: true, truk: true, orang: true });
  const [stat, setStat] = useState<{ detikSim: number; siklus: Record<string, number> }>({ detikSim: 0, siklus: {} });
  const api = useRef<ViewerApi>(null);

  useEffect(() => {
    sb.from('tenders').select('id, kode, customer, status, updated_at').order('updated_at', { ascending: false }).then(({ data: d, error }: { data: unknown[] | null; error: { message: string } | null }) => {
      if (error) setErr(error.message);
      setDaftar((d ?? []) as T[]);
      const q = new URLSearchParams(window.location.search).get('id');
      if (q) setId(q);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) { setData(null); return; }
    let batal = false;
    setMemuat(true); setErr(null);
    (async () => {
      const { data: row, error } = await sb.from('tenders').select('*').eq('id', id).single();
      if (error || !row) throw new Error(error?.message ?? 'Tender tidak ditemukan');
      const t = row as TenderRow;
      t.asumsi = { ...ASUMSI_DEFAULT, ...(t.asumsi ?? {}) }; t.asumsi.it = { ...IT_SHEET_DEFAULT, ...(t.asumsi.it ?? {}) };
      try {
        const { master } = await muatMaster(sb, t);
        return { t, h: hitungTender(keInput(t), master), sumber: 'hitung' as const };
      } catch {
        if (t.hasil) return { t, h: t.hasil as HasilTender, sumber: 'tersimpan' as const };
        throw new Error('Tender ini belum bisa dihitung — lengkapi input di halaman tender.');
      }
    })().then(async r => {
      if (batal) return;
      setData(r); setParam(paramAwal(r.t, r.h)); setProdSim({}); setShift(r.h.processDesign?.shiftAktifIdx?.[0] ?? 0);
      const u = new URL(window.location.href); u.searchParams.set('id', id); window.history.replaceState(null, '', u);
      // productivity terdaftar di database (untuk pembanding)
      const ids = (r.t.asumsi.aktivitas ?? []).map(a => (a as { productivityId?: number }).productivityId).filter((v): v is number => Number.isFinite(v));
      if (ids.length) {
        const { data: pr } = await sb.from('productivity').select('id, prod_per_jam').in('id', ids);
        if (!batal) setProdDb(Object.fromEntries(((pr ?? []) as { id: number; prod_per_jam: number }[]).map(x => [x.id, Number(x.prod_per_jam)])));
      } else setProdDb({});
    }).catch(e => { if (!batal) { setErr(e.message); setData(null); } }).finally(() => { if (!batal) setMemuat(false); });
    return () => { batal = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const awal = useMemo(() => (data ? paramAwal(data.t, data.h) : null), [data]);
  const [layout, errLayout] = useMemo((): [LayoutGudang | null, string | null] => {
    if (!data || !param) return [null, null];
    try { return [susunLayout(data.t, data.h, { param }), null]; }
    catch (e) { return [null, `Layout tidak bisa disusun: ${(e as Error).message}`]; }
  }, [data, param]);

  // ---------- productivity → lama satu siklus (detik waktu gudang) per alat & role
  const prodDipakai = (no: number, tender: number) => prodSim[no] ?? tender;
  const kecepatan: Kecepatan = useMemo(() => {
    const siklus: Record<string, number> = {};
    if (!layout) return { faktor, siklus };
    const rata = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    for (const m of layout.mhe) {
      const p = rata(layout.aktivitas.filter(a => a.tool === m.nama).map(a => prodDipakai(a.no, a.prod)).filter(v => v > 0));
      if (p > 0) siklus[`tool:${m.nama}`] = 3600 / p;
    }
    for (const o of layout.orang) {
      const p = rata(layout.aktivitas.filter(a => a.role === o.nama).map(a => prodDipakai(a.no, a.prod)).filter(v => v > 0));
      if (p > 0) siklus[`role:${o.nama}`] = 3600 / p;
    }
    return { faktor, siklus };
  }, [layout, prodSim, faktor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!layout) return;
    const iv = setInterval(() => { const s = api.current?.statistik(); if (s) setStat(s); }, 1000);
    return () => clearInterval(iv);
  }, [layout]);

  const tersaring = daftar.filter(x => !cari || `${x.kode ?? ''} ${x.customer}`.toLowerCase().includes(cari.toLowerCase()));
  const shiftAda = layout?.shiftAktif.length ? layout.shiftAktif : [0];
  const orangShift = layout ? layout.orang.reduce((s, o) => s + Math.round(o.perShift[shift] ?? 0), 0) : 0;
  const totalMhe = layout ? layout.mhe.filter(m => m.jenis !== 'perangkat').reduce((s, m) => s + m.unit, 0) : 0;
  const kap = layout ? layout.rak.reduce((s, r) => s + r.nBay * r.level * r.ppl * r.deep, 0) : 0;
  const isiRak = layout ? layout.palet.filter(p => p.jenis === 'spr' || p.jenis === 'ddr').length : 0;

  function unduh() {
    const url = api.current?.screenshot(); if (!url || !data) return;
    const a = document.createElement('a'); a.href = url; a.download = `Simulasi3D_${(data.t.kode ?? data.t.customer).replace(/[^\w-]+/g, '_')}.png`; a.click();
  }
  const tombolKamera: [Kamera, string][] = [['iso', 'Isometrik'], ['atas', 'Tampak atas'], ['dock', 'Dock'], ['lorong', 'Dalam lorong']];
  const sakelar: [keyof OpsiViewer, string][] = [['animasi', 'Animasi'], ['label', 'Label'], ['orang', 'Manpower'], ['truk', 'Truk'], ['dinding', 'Dinding'], ['atap', 'Atap']];

  // ---------- input parameter (angka awal = Space tender; berubah → ditandai)
  const ubah = (f: (p: ParamSim) => ParamSim) => setParam(p => (p ? f(p) : p));
  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Simulasi Warehouse</div><h1>Simulasi gudang 3D</h1></div>
        {data && <Link className="btn ghost" href={`/tender/${data.t.id}`}>Buka tender</Link>}
      </div>

      <div className="card">
        <div className="sim3d-pilih">
          <label className="f">Cari project<input value={cari} onChange={e => setCari(e.target.value)} placeholder="kode / customer" /></label>
          <label className="f">Project
            <select value={id} onChange={e => setId(e.target.value)}>
              <option value="">— pilih project —</option>
              {tersaring.map(x => <option key={x.id} value={x.id}>{x.kode ? `${x.kode} · ` : ''}{x.customer} ({labelStatus(x.status)})</option>)}
            </select>
          </label>
        </div>
        {(err || errLayout) && <p className="error small" role="alert">{err || errLayout}</p>}
        {!id && <p className="small muted">Pilih project. Tata letak 3D dibuat otomatis dari data tender: Space (lebar gudang, rak SPR/DDR, level, tinggi, staging, fasilitas), MHE & manpower per shift, dan productivity aktivitas.</p>}
        {memuat && <p className="small muted">Menghitung tender & menyusun layout…</p>}
      </div>

      {layout && data && param && awal && (
        <>
          <div className="kpis">
            <div className="kpi"><span className="small muted">Luas layout 3D</span><b>{Math.round(layout.luasLayout).toLocaleString('id-ID')} m²</b><span className="small muted">rencana {layout.luasRencana.toLocaleString('id-ID')} m²</span></div>
            <div className="kpi"><span className="small muted">Posisi rak terisi</span><b>{isiRak.toLocaleString('id-ID')}</b><span className="small muted">dari {kap.toLocaleString('id-ID')} posisi{kap ? ` (${Math.round((isiRak / kap) * 100)}%)` : ''}</span></div>
            <div className="kpi"><span className="small muted">MHE (unit)</span><b>{totalMhe}</b><span className="small muted">{layout.mhe.filter(m => m.jenis !== 'perangkat').map(m => `${m.nama} ${m.unit}`).join(' · ') || '—'}</span></div>
            <div className="kpi"><span className="small muted">Manpower shift {shift + 1}</span><b>{orangShift}</b><span className="small muted">orang di lantai gudang</span></div>
            <div className="kpi"><span className="small muted">Waktu simulasi (×{faktor})</span><b>{jamSim(stat.detikSim)}</b><span className="small muted">jam gudang yang sudah berjalan</span></div>
          </div>

          <div className="sim3d-tata">
            <div className="sim3d-kanvas">
              <Viewer3D ref={api} layout={layout} shift={shift} opsi={opsi} kecepatan={kecepatan} />
              <div className="sim3d-alat">
                {tombolKamera.map(([k, l]) => <button key={k} className="ghost" onClick={() => api.current?.kamera(k)}>{l}</button>)}
                <button className="ghost" onClick={unduh}>Unduh gambar</button>
              </div>
              <p className="sim3d-tip small">Seret = putar · klik kanan / dua jari = geser · scroll = zoom</p>
            </div>

            <div className="card sim3d-panel">
              <div className="grid2" style={{ gap: 8 }}>
                <label className="f">Shift
                  <select value={shift} onChange={e => setShift(Number(e.target.value))}>
                    {shiftAda.map(i => <option key={i} value={i}>Shift {i + 1}</option>)}
                  </select>
                </label>
                <label className="f">Kecepatan simulasi
                  <select value={faktor} onChange={e => setFaktor(Number(e.target.value))}>
                    {FAKTOR.map(f => <option key={f} value={f}>×{f}{f === 1 ? ' (waktu nyata)' : ''}</option>)}
                  </select>
                </label>
              </div>
              <div className="row">
                {sakelar.map(([k, l]) => (
                  <label key={k} className="sim3d-cek"><input type="checkbox" checked={opsi[k]} onChange={e => setOpsi(o => ({ ...o, [k]: e.target.checked }))} />{l}</label>
                ))}
              </div>
              <div className="tabs" role="tablist">
                {([['layout', 'Rak & gudang'], ['prod', 'Productivity'], ['info', 'Ringkasan']] as [PanelTab, string][]).map(([k, l]) =>
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
              </div>

              {tab === 'layout' && (
                <>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <p className="small muted" style={{ margin: 0 }}>Angka awal dari sheet <b>Space</b> tender. Revisi di sini hanya untuk simulasi (tender tidak berubah).</p>
                    <button className="ghost" style={{ padding: '4px 10px' }} onClick={() => setParam(awal)}>Reset ke Space</button>
                  </div>
                  <div className="eyebrow">Gudang</div>
                  <div className="sim3d-isi3">
                    <Isian l="Lebar gudang (kiri-kanan)" u="m" step={0.5} v={param.lebarM} a={awal.lebarM} set={x => ubah(p => ({ ...p, lebarM: x ?? awal.lebarM }))} />
                    <Isian l="Side height" u="mm" step={100} v={param.sideMm} a={awal.sideMm} set={x => ubah(p => ({ ...p, sideMm: x ?? awal.sideMm }))} />
                    <Isian l="Center height" u="mm" step={100} v={param.centerMm} a={awal.centerMm} set={x => ubah(p => ({ ...p, centerMm: x ?? awal.centerMm }))} />
                    <Isian l="Dock inbound" step={1} v={param.dockIn} a={awal.dockIn} set={x => ubah(p => ({ ...p, dockIn: x ?? awal.dockIn }))} />
                    <Isian l="Dock outbound" step={1} v={param.dockOut} a={awal.dockOut} set={x => ubah(p => ({ ...p, dockOut: x ?? awal.dockOut }))} />
                  </div>
                  <div className="eyebrow">Racking level</div>
                  <div className="sim3d-isi3">
                    <Isian l="Beam" u="mm" step={10} v={param.beamMm} a={awal.beamMm} set={x => ubah(p => ({ ...p, beamMm: x ?? awal.beamMm }))} />
                    <Isian l="Pallet" u="mm" step={10} v={param.palletMm} a={awal.palletMm} set={x => ubah(p => ({ ...p, palletMm: x ?? awal.palletMm }))} />
                    <Isian l="Product" u="mm" step={50} v={param.productMm} a={awal.productMm} set={x => ubah(p => ({ ...p, productMm: x ?? awal.productMm }))} />
                    <Isian l="Clearance" u="mm" step={10} v={param.clearanceMm} a={awal.clearanceMm} set={x => ubah(p => ({ ...p, clearanceMm: x ?? awal.clearanceMm }))} />
                    <Isian l="Level manual" step={1} v={param.levelManual} a={awal.levelManual} set={x => ubah(p => ({ ...p, levelManual: x && x > 0 ? x : null }))} />
                    <div className="f small"><span className="muted">Level dipakai</span><b>{layout.level} level · {angka(layout.tinggiRak, 2)} m</b></div>
                  </div>
                  <div className="eyebrow">Porsi metode simpan (total 100%)</div>
                  <div className="sim3d-isi3">
                    {(['spr', 'ddr', 'block', 'floor'] as const).map(k => (
                      <Isian key={k} l={{ spr: 'SPR', ddr: 'DDR', block: 'Block stack', floor: 'Pallet floor' }[k]} u="%" pct v={param.porsi[k]} a={awal.porsi[k]} set={x => ubah(p => ({ ...p, porsi: { ...p.porsi, [k]: x ?? 0 } }))} />
                    ))}
                  </div>
                  {param.porsi.spr > 0 && (<>
                    <div className="eyebrow">SPR · selective pallet rack</div>
                    <div className="sim3d-isi3">
                      <Isian l="Corridor (½ gang)" u="m" v={param.spr.koridor} a={awal.spr.koridor} set={x => ubah(p => ({ ...p, spr: { ...p.spr, koridor: x ?? awal.spr.koridor } }))} />
                      <Isian l="Depth" u="m" v={param.spr.depth} a={awal.spr.depth} set={x => ubah(p => ({ ...p, spr: { ...p.spr, depth: x ?? awal.spr.depth } }))} />
                      <Isian l="Width (lebar bay)" u="m" v={param.spr.width} a={awal.spr.width} set={x => ubah(p => ({ ...p, spr: { ...p.spr, width: x ?? awal.spr.width } }))} />
                      <Isian l="Palet / level / bay" step={1} v={param.spr.ppl} a={awal.spr.ppl} set={x => ubah(p => ({ ...p, spr: { ...p.spr, ppl: x ?? awal.spr.ppl } }))} />
                    </div>
                  </>)}
                  {param.porsi.ddr > 0 && (<>
                    <div className="eyebrow">DDR · double deep rack</div>
                    <div className="sim3d-isi3">
                      <Isian l="Corridor (½ gang)" u="m" v={param.ddr.koridor} a={awal.ddr.koridor} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, koridor: x ?? awal.ddr.koridor } }))} />
                      <Isian l="Depth" u="m" v={param.ddr.depth} a={awal.ddr.depth} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, depth: x ?? awal.ddr.depth } }))} />
                      <Isian l="Width (lebar bay)" u="m" v={param.ddr.width} a={awal.ddr.width} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, width: x ?? awal.ddr.width } }))} />
                      <Isian l="Palet / level / bay" step={1} v={param.ddr.ppl} a={awal.ddr.ppl} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, ppl: x ?? awal.ddr.ppl } }))} />
                      <Isian l="Deep" step={1} v={param.ddr.deep} a={awal.ddr.deep} set={x => ubah(p => ({ ...p, ddr: { ...p.ddr, deep: x ?? awal.ddr.deep } }))} />
                    </div>
                  </>)}
                  {param.porsi.block > 0 && <div className="sim3d-isi3"><Isian l="Block stack: tumpuk" step={1} v={param.blockTumpuk} a={awal.blockTumpuk} set={x => ubah(p => ({ ...p, blockTumpuk: x ?? awal.blockTumpuk }))} /></div>}
                  <label className="f">Okupansi rak {param.okupansi == null ? '(sesuai stok desain)' : `${Math.round(param.okupansi * 100)}%`}
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <input type="range" min={0} max={100} value={param.okupansi == null ? (kap ? Math.round((isiRak / kap) * 100) : 0) : Math.round(param.okupansi * 100)} onChange={e => ubah(p => ({ ...p, okupansi: Number(e.target.value) / 100 }))} />
                      {param.okupansi != null && <button className="ghost" style={{ padding: '4px 10px' }} onClick={() => ubah(p => ({ ...p, okupansi: null }))}>Reset</button>}
                    </div>
                  </label>
                </>
              )}

              {tab === 'prod' && (
                <>
                  <p className="small muted" style={{ margin: 0 }}>Kecepatan MHE & manpower di 3D = productivity aktivitas: satu gerakan bolak-balik = satu siklus (3600 ÷ prod/jam detik). Ubah kolom <b>Simulasi</b> untuk mencoba productivity lain (tender tidak berubah).</p>
                  <div className="row" style={{ justifyContent: 'flex-end' }}><button className="ghost" style={{ padding: '4px 10px' }} onClick={() => setProdSim({})}>Reset ke tender</button></div>
                  <div className="tablewrap"><table className="sim3d-tabel">
                    <thead><tr><th>Aktivitas</th><th>Alat · role</th><th className="num">DB</th><th className="num">Tender</th><th className="num">Simulasi /jam</th></tr></thead>
                    <tbody>
                      {layout.aktivitas.map(a => {
                        const db = a.productivityId != null ? prodDb[a.productivityId] : undefined;
                        const v = prodDipakai(a.no, a.prod);
                        return (
                          <tr key={a.no}>
                            <td>{a.aktivitas}<div className="small muted">{a.arus} · {a.uom}</div></td>
                            <td className="small">{a.tool || '—'}<div className="muted">{a.role}</div></td>
                            <td className="num small">{db != null ? angka(db, 1) : '—'}</td>
                            <td className="num small">{angka(a.prod, 1)}</td>
                            <td className="num"><input type="number" min={0} step={1} value={v} style={{ width: 78, background: prodSim[a.no] != null ? 'var(--asumsi)' : undefined }}
                              onChange={e => { const x = Number(e.target.value); setProdSim(p => ({ ...p, [a.no]: Number.isFinite(x) ? x : 0 })); }} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                  <div className="eyebrow">Hasil berjalan (waktu gudang {jamSim(stat.detikSim)})</div>
                  <table className="sim3d-tabel">
                    <thead><tr><th>Resource</th><th className="num">Unit</th><th className="num">Siklus</th><th className="num">Selesai</th><th className="num">Per jam</th></tr></thead>
                    <tbody>
                      {[...layout.mhe.filter(m => m.jenis !== 'perangkat').map(m => ({ kunci: `tool:${m.nama}`, nama: m.nama, unit: Math.min(m.unit, 40), warna: WARNA_MHE[m.jenis] })),
                        ...layout.orang.filter(o => ['picker', 'checker', 'tkbm', 'inventory'].includes(o.kategori) && Math.round(o.perShift[shift] ?? 0) > 0)
                          .map(o => ({ kunci: `role:${o.nama}`, nama: o.nama, unit: Math.round(o.perShift[shift] ?? 0), warna: WARNA_ORANG[o.kategori] }))].map(r => {
                        const sik = kecepatan.siklus[r.kunci];
                        const selesai = stat.siklus[r.kunci] ?? 0;
                        return (
                          <tr key={r.kunci}>
                            <td><span className="sim3d-titik" style={{ background: r.warna }} />{r.nama}</td>
                            <td className="num">{r.unit}</td>
                            <td className="num small">{sik ? `${angka(sik, 0)} dtk` : 'tanpa prod'}</td>
                            <td className="num">{angka(selesai)}</td>
                            <td className="num small">{stat.detikSim > 0 ? angka(selesai / (stat.detikSim / 3600), 0) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="small muted">Per jam = siklus selesai ÷ waktu gudang berjalan (semua unit). Bandingkan dengan kebutuhan volume per jam di halaman tender.</p>
                </>
              )}

              {tab === 'info' && (
                <>
                  <div>
                    <div className="eyebrow">Ringkasan layout</div>
                    <table className="sim3d-tabel"><tbody>
                      {layout.ringkas.map((r, i) => <tr key={`${r.label}${i}`}><td className="muted">{r.label}</td><td className="num">{r.nilai}</td></tr>)}
                    </tbody></table>
                  </div>
                  <div>
                    <div className="eyebrow">Zona</div>
                    <table className="sim3d-tabel"><tbody>
                      {layout.zona.map(z => <tr key={z.id}><td>{z.label}</td><td className="small muted">{z.ket}</td></tr>)}
                    </tbody></table>
                  </div>
                  <div>
                    <div className="eyebrow">Manpower shift {shift + 1}</div>
                    <table className="sim3d-tabel"><tbody>
                      {layout.orang.filter(o => Math.round(o.perShift[shift] ?? 0) > 0).map(o => (
                        <tr key={`${o.jenis}-${o.nama}`}><td><span className="sim3d-titik" style={{ background: WARNA_ORANG[o.kategori] }} />{o.nama}</td><td className="small muted">{LABEL_KAT[o.kategori]}</td><td className="num">{Math.round(o.perShift[shift] ?? 0)}</td></tr>
                      ))}
                      {!layout.orang.some(o => Math.round(o.perShift[shift] ?? 0) > 0) && <tr><td className="muted small">Tidak ada manpower di shift ini.</td></tr>}
                    </tbody></table>
                  </div>
                  <div>
                    <div className="eyebrow">MHE</div>
                    <table className="sim3d-tabel"><tbody>
                      {layout.mhe.map(m => <tr key={m.nama}><td><span className="sim3d-titik" style={{ background: WARNA_MHE[m.jenis] }} />{m.nama}</td><td className="small muted">{LABEL_MHE[m.jenis]}</td><td className="num">{m.unit}</td></tr>)}
                      {!layout.mhe.length && <tr><td className="muted small">Belum ada MHE di Aktivitas.</td></tr>}
                    </tbody></table>
                  </div>
                </>
              )}

              {(layout.asumsi.length > 0 || data.sumber === 'tersimpan') && (
                <div className="notice small">
                  <b>Catatan & asumsi</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {data.sumber === 'tersimpan' && <li>Master data tidak bisa dimuat → memakai hasil hitung yang terakhir disimpan.</li>}
                    {layout.asumsi.map(a => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}
              <p className="small muted">Rak SPR/DDR disusun standar: baris memanjang dari depan ke belakang, lorong menghadap jalur utama di depan dock. Material 3D dibuat dengan TapNow AI.</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
