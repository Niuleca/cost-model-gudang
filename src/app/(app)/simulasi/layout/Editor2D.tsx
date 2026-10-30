'use client';
// Editor denah 2D (SVG): tampak atas, X = panjang gudang (dock di kiri), Z = lebar gudang (ke bawah).
// Pilih, geser (drag), ubah ukuran (handle), ukur jarak, garis ukur otomatis ke rintangan / dinding, latar denah gambar / DXF.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { celahArea, dimRak, jarakBebas, nBay, ringkasArea, uraiArea, type Komponen, type LayoutEdit } from '@/lib/simulasi3d/editor';

export type Mode = 'pilih' | 'ukur' | 'geser';
export interface Editor2DApi { pasFit: () => void; svgEkspor: () => string; pusatLayar: () => { x: number; z: number } }

export const WARNA_KOMP: Record<string, { isi: string; garis: string }> = {
  spr: { isi: '#dbe7f7', garis: '#1e56a0' }, areaRak: { isi: '#f1f6fd', garis: '#1e56a0' }, ddr: { isi: '#cbd8ee', garis: '#173f78' }, block: { isi: '#f3e3c8', garis: '#a16207' },
  stagingIn: { isi: '#dbeafe', garis: '#2563eb' }, stagingOut: { isi: '#d1fae5', garis: '#059669' }, fasilitas: { isi: '#ede9fe', garis: '#6d28d9' },
  dock: { isi: '#1f2937', garis: '#111827' }, kolom: { isi: '#475569', garis: '#1e293b' }, jalur: { isi: '#fef3c7', garis: '#d97706' }, zona: { isi: '#e0f2fe', garis: '#0284c7' },
};
const f1 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('id-ID');

type Seret =
  | { jenis: 'geser'; id: string; ax: number; az: number; x0: number; z0: number }
  | { jenis: 'ukuran'; id: string; h: string; ax: number; az: number; k0: Komponen }
  | { jenis: 'pan'; sx: number; sy: number; v0: { x: number; z: number; w: number } }
  | null;

interface Props {
  edit: LayoutEdit; pilih: string | null; setPilih: (id: string | null) => void;
  mulaiAksi: () => void; ubah: (f: (e: LayoutEdit) => LayoutEdit) => void;
  mode: Mode; grid: number; snapTepi: boolean;
  /** Garis potong untuk view potongan (sumbu tetap & nilainya, m). */
  potong?: { sumbu: 'x' | 'z'; nilai: number } | null;
}

const Editor2D = forwardRef<Editor2DApi, Props>(function Editor2D({ edit, pilih, setPilih, mulaiAksi, ubah, mode, grid, snapTepi, potong }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: -5, z: -5, w: 100 });     // viewBox: kiri, atas, lebar (m)
  const [ukuran, setUkuran] = useState({ w: 800, h: 500 });
  const seret = useRef<Seret>(null);
  const [ukurA, setUkurA] = useState<{ x: number; z: number } | null>(null);
  const [kursor, setKursor] = useState<{ x: number; z: number } | null>(null);
  const g = edit.gedung;
  const tinggiView = view.w * (ukuran.h / Math.max(1, ukuran.w));
  const fs = view.w / 70;                                           // ukuran huruf tetap di layar

  const pasFit = () => {
    const pad = 6; const lebar = g.L + 2 * pad + 16, tinggi = g.W + 2 * pad;
    const w = Math.max(lebar, tinggi * (ukuran.w / Math.max(1, ukuran.h)));
    setView({ x: -pad - 16 - (w - lebar) / 2, z: -pad - (w * (ukuran.h / Math.max(1, ukuran.w)) - tinggi) / 2, w });
  };
  useEffect(() => {
    const el = svg.current?.parentElement; if (!el) return;
    const ro = new ResizeObserver(() => setUkuran({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setUkuran({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  useEffect(() => { pasFit(); }, [g.L, g.W, ukuran.w, ukuran.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    pasFit,
    pusatLayar: () => ({ x: view.x + view.w / 2, z: view.z + tinggiView / 2 }),
    svgEkspor: () => {
      const s = svg.current; if (!s) return '';
      const c = s.cloneNode(true) as SVGSVGElement;
      const pad = 3;
      c.setAttribute('viewBox', `${-pad - 14} ${-pad} ${g.L + 2 * pad + 14} ${g.W + 2 * pad + 4}`);
      c.setAttribute('width', String(Math.round((g.L + 2 * pad + 14) * 20))); c.setAttribute('height', String(Math.round((g.W + 2 * pad + 4) * 20)));
      c.querySelectorAll('[data-ekspor="tidak"]').forEach(n => n.remove());
      return new XMLSerializer().serializeToString(c);
    },
  }));

  const keDunia = (cx: number, cy: number) => {
    const s = svg.current!; const pt = s.createSVGPoint(); pt.x = cx; pt.y = cy;
    const m = s.getScreenCTM(); if (!m) return { x: 0, z: 0 };
    const p = pt.matrixTransform(m.inverse()); return { x: p.x, z: p.y };
  };
  const snap = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : v);
  /** Tempel ke tepi komponen lain / dinding bila dalam 0,3 m. */
  const tempel = (k: Komponen, x: number, z: number) => {
    if (!snapTepi) return { x, z };
    const tepiX = [0, g.L], tepiZ = [0, g.W];
    for (const o of edit.komponen) if (o.id !== k.id) { tepiX.push(o.x, o.x + o.w); tepiZ.push(o.z, o.z + o.d); }
    let bx = x, bz = z, dx = 0.3, dz = 0.3;
    for (const t of tepiX) for (const cand of [t, t - k.w]) if (Math.abs(x - cand) < dx) { dx = Math.abs(x - cand); bx = cand; }
    for (const t of tepiZ) for (const cand of [t, t - k.d]) if (Math.abs(z - cand) < dz) { dz = Math.abs(z - cand); bz = cand; }
    return { x: bx, z: bz };
  };

  function turun(e: React.PointerEvent, id?: string, h?: string) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = keDunia(e.clientX, e.clientY);
    if (mode === 'ukur') {
      const q = { x: snap(p.x), z: snap(p.z) };
      if (!ukurA) setUkurA(q);
      else { mulaiAksi(); ubah(ed => ({ ...ed, ukur: [...ed.ukur, { id: Math.random().toString(36).slice(2, 9), ax: ukurA.x, az: ukurA.z, bx: q.x, bz: q.z }] })); setUkurA(null); }
      return;
    }
    if (mode === 'geser' || e.button === 1 || (!id && !h)) {
      if (!id && !h && mode === 'pilih' && e.button === 0) setPilih(null);
      seret.current = { jenis: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...view } }; return;
    }
    const k = edit.komponen.find(c => c.id === id); if (!k) return;
    setPilih(k.id); mulaiAksi();
    seret.current = h ? { jenis: 'ukuran', id: k.id, h, ax: p.x, az: p.z, k0: { ...k } } : { jenis: 'geser', id: k.id, ax: p.x, az: p.z, x0: k.x, z0: k.z };
  }
  function gerak(e: React.PointerEvent) {
    const p = keDunia(e.clientX, e.clientY); setKursor(p);
    const s = seret.current; if (!s) return;
    if (s.jenis === 'pan') { const skala = s.v0.w / Math.max(1, ukuran.w); setView({ ...s.v0, x: s.v0.x - (e.clientX - s.sx) * skala, z: s.v0.z - (e.clientY - s.sy) * skala }); return; }
    ubah(ed => ({ ...ed, komponen: ed.komponen.map(k => {
      if (k.id !== s.id) return k;
      if (s.jenis === 'geser') {
        let x = snap(s.x0 + p.x - s.ax), z = snap(s.z0 + p.z - s.az);
        if (k.jenis === 'dock') x = 0;
        ({ x, z } = tempel(k, x, z));
        return { ...k, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
      }
      const k0 = s.k0; let { x, z, w, d } = k0; const dx = p.x - s.ax, dz = p.z - s.az;
      if (s.h.includes('e')) w = snap(k0.w + dx); if (s.h.includes('w')) { w = snap(k0.w - dx); x = k0.x + k0.w - w; }
      if (s.h.includes('s')) d = snap(k0.d + dz); if (s.h.includes('n')) { d = snap(k0.d - dz); z = k0.z + k0.d - d; }
      // rak: panjang mengikuti kelipatan bay, kedalaman tetap (ubah di panel)
      if (k0.rak) {
        const bw = k0.rak.bayW;
        if (k0.rak.arah === 'x') { const nw = Math.max(bw, Math.round(w / bw) * bw); if (s.h.includes('w')) x = k0.x + k0.w - nw; w = nw; d = k0.d; z = k0.z; }
        else { const nd = Math.max(bw, Math.round(d / bw) * bw); if (s.h.includes('n')) z = k0.z + k0.d - nd; d = nd; w = k0.w; x = k0.x; }
      }
      const r = (v: number) => Math.round(v * 100) / 100;
      return { ...k, x: r(x), z: r(z), w: r(Math.max(0.2, w)), d: r(Math.max(0.2, d)) };
    }) }));
  }
  function naik() { seret.current = null; }
  function roda(e: React.WheelEvent) {
    const p = keDunia(e.clientX, e.clientY);
    const f = Math.exp(e.deltaY * 0.0012); const w = Math.min(2000, Math.max(4, view.w * f));
    setView({ x: p.x - (p.x - view.x) * (w / view.w), z: p.z - (p.z - view.z) * (w / view.w), w });
  }
  useEffect(() => {
    const el = svg.current; if (!el) return;
    const cegah = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', cegah, { passive: false });
    return () => el.removeEventListener('wheel', cegah);
  }, []);

  const terpilih = edit.komponen.find(k => k.id === pilih) ?? null;
  const garisUkur = (ax: number, az: number, bx: number, bz: number, teks: string, warna = '#0f172a', key?: string, ekspor = true) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2; const tegak = Math.abs(bx - ax) < Math.abs(bz - az);
    return (
      <g key={key} data-ekspor={ekspor ? undefined : 'tidak'}>
        <line x1={ax} y1={az} x2={bx} y2={bz} stroke={warna} strokeWidth={fs * 0.08} markerStart="url(#panah)" markerEnd="url(#panah)" />
        <text x={mx + (tegak ? fs * 0.4 : 0)} y={mz - (tegak ? 0 : fs * 0.35)} fontSize={fs * 0.85} fill={warna} textAnchor={tegak ? 'start' : 'middle'} fontWeight={600}
          style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: fs * 0.25 }}>{teks}</text>
      </g>
    );
  };

  /** Bay & muka lorong satu baris rak. */
  const gambarRak = (k: Komponen, garis: string, kunci: string) => {
    const el: React.ReactNode[] = []; if (!k.rak) return el;
    const n = nBay(k); const { dalam } = dimRak(k);
    for (let b = 1; b < n; b++) el.push(k.rak.arah === 'x'
      ? <line key={`${kunci}b${b}`} x1={k.x + b * k.rak.bayW} y1={k.z} x2={k.x + b * k.rak.bayW} y2={k.z + dalam} stroke={garis} strokeWidth={fs * 0.04} />
      : <line key={`${kunci}b${b}`} x1={k.x} y1={k.z + b * k.rak.bayW} x2={k.x + dalam} y2={k.z + b * k.rak.bayW} stroke={garis} strokeWidth={fs * 0.04} />);
    // muka lorong: garis oranye (beam) di sisi hadap
    const muka = k.rak.arah === 'x' ? (k.rak.hadap === 1 ? [k.x, k.z + k.d, k.x + k.w, k.z + k.d] : [k.x, k.z, k.x + k.w, k.z]) : (k.rak.hadap === 1 ? [k.x + k.w, k.z, k.x + k.w, k.z + k.d] : [k.x, k.z, k.x, k.z + k.d]);
    el.push(<line key={`${kunci}muka`} x1={muka[0]} y1={muka[1]} x2={muka[2]} y2={muka[3]} stroke="#f97316" strokeWidth={fs * 0.2} />);
    return el;
  };

  const gambarKomp = (k: Komponen) => {
    const w = WARNA_KOMP[k.jenis] ?? WARNA_KOMP.zona; const dipilih = k.id === pilih;
    const isi = k.warna ?? w.isi;
    const el: React.ReactNode[] = [];
    el.push(<rect key="r" x={k.x} y={k.z} width={k.w} height={k.d} fill={k.jenis === 'jalur' ? 'url(#arsir)' : isi} fillOpacity={k.jenis === 'zona' ? 0.5 : k.jenis === 'areaRak' ? 0.45 : 1}
      stroke={dipilih ? '#f97316' : w.garis} strokeWidth={dipilih ? fs * 0.18 : fs * 0.07} strokeDasharray={k.jenis === 'jalur' || k.jenis === 'zona' || k.jenis === 'areaRak' ? `${fs * 0.4} ${fs * 0.25}` : undefined} />);
    el.push(...gambarRak(k, w.garis, ''));
    if (k.area) {
      const sub = WARNA_KOMP[k.area.jenisRak];
      for (const r of uraiArea(k, edit)) {
        el.push(<rect key={`${r.id}r`} x={r.x} y={r.z} width={r.w} height={r.d} fill={sub.isi} stroke={sub.garis} strokeWidth={fs * 0.06} />);
        el.push(...gambarRak(r, sub.garis, r.id));
      }
    }
    if (k.jenis === 'dock') el.push(<path key="p" d={`M ${k.x + k.w} ${k.z + k.d / 2} l ${fs * 0.9} ${-fs * 0.5} l 0 ${fs} z`} fill={k.arus === 'outbound' ? '#059669' : '#2563eb'} />);
    const ra = k.area ? ringkasArea(k, edit) : null;
    const label = ra ? `${k.label} · ${ra.baris} baris · ${ra.bay} bay × ${k.area!.rak.level} lv · ${ra.posisi.toLocaleString('id-ID')} posisi` : k.rak ? `${k.label} · ${nBay(k)} bay × ${k.rak.level} lv` : k.jenis === 'block' ? `${k.label} · tumpuk ${k.tumpuk ?? 1}` : k.jenis === 'dock' ? (k.arus === 'outbound' ? 'OUT' : 'IN') : k.label;
    const muat = Math.max(k.w, k.d) > label.length * fs * 0.45 || dipilih;
    if (muat && k.jenis !== 'kolom') {
      const tegak = k.d > k.w * 1.6 && k.jenis !== 'dock' && !k.area;
      const cx = k.jenis === 'dock' ? k.x - fs * 0.4 : k.x + k.w / 2, cz = k.area ? k.z - fs * 0.55 : k.z + k.d / 2;
      el.push(<text key="t" x={cx} y={cz} fontSize={fs * 0.8} textAnchor={k.jenis === 'dock' ? 'end' : 'middle'} dominantBaseline="middle" fill="#0f172a"
        transform={tegak ? `rotate(-90 ${cx} ${cz})` : undefined} style={{ paintOrder: 'stroke', stroke: '#ffffffcc', strokeWidth: fs * 0.2, pointerEvents: 'none' }}>{label}</text>);
    }
    return <g key={k.id} onPointerDown={e => { e.stopPropagation(); turun(e, k.id); }} style={{ cursor: mode === 'pilih' ? 'move' : undefined }}>{el}</g>;
  };

  const handle = (k: Komponen) => {
    const s = fs * 0.45; const pts: [string, number, number][] = [['nw', k.x, k.z], ['n', k.x + k.w / 2, k.z], ['ne', k.x + k.w, k.z], ['e', k.x + k.w, k.z + k.d / 2], ['se', k.x + k.w, k.z + k.d], ['s', k.x + k.w / 2, k.z + k.d], ['sw', k.x, k.z + k.d], ['w', k.x, k.z + k.d / 2]];
    return pts.map(([h, x, z]) => <rect key={h} data-ekspor="tidak" x={x - s / 2} y={z - s / 2} width={s} height={s} fill="#fff" stroke="#f97316" strokeWidth={fs * 0.08}
      style={{ cursor: `${h}-resize` }} onPointerDown={e => { e.stopPropagation(); turun(e, k.id, h); }} />);
  };

  const jb = terpilih && terpilih.jenis !== 'dock' ? jarakBebas(edit, terpilih) : null;
  return (
    <svg ref={svg} className="sim2d-svg" viewBox={`${view.x} ${view.z} ${view.w} ${tinggiView}`} preserveAspectRatio="xMinYMin meet"
      onPointerDown={e => turun(e)} onPointerMove={gerak} onPointerUp={naik} onPointerLeave={() => setKursor(null)} onWheel={roda}
      style={{ cursor: mode === 'geser' ? 'grab' : mode === 'ukur' ? 'crosshair' : 'default', fontFamily: 'Noto Sans, Arial, sans-serif' }}>
      <defs>
        <marker id="panah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" /></marker>
        <pattern id="arsir" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="1" fill="#fef9c3" /><line x1="0" y1="0" x2="0" y2="1" stroke="#facc15" strokeWidth="0.25" /></pattern>
        <pattern id="kisi1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth="0.03" /></pattern>
        <pattern id="kisi5" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#kisi1)" /><path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd5e1" strokeWidth="0.06" /></pattern>
      </defs>
      <rect x={view.x} y={view.z} width={view.w} height={tinggiView} fill="#f8fafc" data-ekspor="tidak" />
      {/* apron dock */}
      <rect x={-14} y={-2} width={14} height={g.W + 4} fill="#d4d7db" />
      <text x={-7} y={g.W + 3.2} fontSize={fs * 0.8} textAnchor="middle" fill="#475569">Apron / dock</text>
      {/* lantai gudang + kisi */}
      <rect x={0} y={0} width={g.L} height={g.W} fill="#ffffff" />
      <rect x={0} y={0} width={g.L} height={g.W} fill="url(#kisi5)" data-ekspor="tidak" />
      {/* latar denah */}
      {edit.latar?.jenis === 'gambar' && edit.latar.url && <image href={edit.latar.url} x={edit.latar.x} y={edit.latar.z} width={edit.latar.w} height={edit.latar.d} opacity={edit.latar.opasitas} preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />}
      {edit.latar?.jenis === 'dxf' && edit.latar.garis && (
        <g opacity={edit.latar.opasitas} style={{ pointerEvents: 'none' }} transform={`translate(${edit.latar.x} ${edit.latar.z}) scale(${edit.latar.w})`}>
          <path d={edit.latar.garis.map(([a, b, c, d]) => `M${a} ${b}L${c} ${d}`).join('')} stroke="#334155" strokeWidth={0.04 / Math.max(0.001, edit.latar.w)} fill="none" />
        </g>
      )}
      {edit.komponen.filter(k => k.jenis === 'areaRak').map(gambarKomp)}
      {edit.komponen.filter(k => k.jenis === 'jalur' || k.jenis === 'zona').map(gambarKomp)}
      {edit.komponen.filter(k => k.jenis !== 'jalur' && k.jenis !== 'zona' && k.jenis !== 'areaRak').map(gambarKomp)}
      {/* dinding */}
      <rect x={0} y={0} width={g.L} height={g.W} fill="none" stroke="#0f172a" strokeWidth={fs * 0.22} style={{ pointerEvents: 'none' }} />
      {/* dimensi gedung */}
      {garisUkur(0, -fs * 1.6, g.L, -fs * 1.6, `${f1(g.L)} m`, '#334155', 'dimL')}
      {garisUkur(g.L + fs * 1.4, 0, g.L + fs * 1.4, g.W, `${f1(g.W)} m`, '#334155', 'dimW')}
      {/* ukuran tersimpan */}
      {edit.ukur.map(u => garisUkur(u.ax, u.az, u.bx, u.bz, `${f1(Math.hypot(u.bx - u.ax, u.bz - u.az))} m`, '#be123c', u.id))}
      {/* ukur sementara */}
      {mode === 'ukur' && ukurA && kursor && garisUkur(ukurA.x, ukurA.z, snap(kursor.x), snap(kursor.z), `${f1(Math.hypot(snap(kursor.x) - ukurA.x, snap(kursor.z) - ukurA.z))} m`, '#be123c', 'tmp', false)}
      {/* terpilih: handle + jarak bebas ke rintangan / dinding */}
      {terpilih && jb && (
        <g data-ekspor="tidak">
          {jb.kiri.jarak > 0.01 && garisUkur(terpilih.x + terpilih.w / 2, terpilih.z - jb.kiri.jarak, terpilih.x + terpilih.w / 2, terpilih.z, `${f1(jb.kiri.jarak)} m`, '#ea580c', 'jk')}
          {jb.kanan.jarak > 0.01 && garisUkur(terpilih.x + terpilih.w / 2, terpilih.z + terpilih.d, terpilih.x + terpilih.w / 2, terpilih.z + terpilih.d + jb.kanan.jarak, `${f1(jb.kanan.jarak)} m`, '#ea580c', 'jn')}
          {jb.depan.jarak > 0.01 && garisUkur(terpilih.x - jb.depan.jarak, terpilih.z + terpilih.d / 2, terpilih.x, terpilih.z + terpilih.d / 2, `${f1(jb.depan.jarak)} m`, '#ea580c', 'jd')}
          {jb.belakang.jarak > 0.01 && garisUkur(terpilih.x + terpilih.w, terpilih.z + terpilih.d / 2, terpilih.x + terpilih.w + jb.belakang.jarak, terpilih.z + terpilih.d / 2, `${f1(jb.belakang.jarak)} m`, '#ea580c', 'jb')}
        </g>
      )}
      {terpilih && mode === 'pilih' && handle(terpilih)}
      {/* area rak terpilih: lebar cross aisle aktual (awal / tengah / akhir) */}
      {terpilih?.area && (() => {
        const k = terpilih; const c = celahArea(k, edit); if (!c) return null;
        const ax = k.area!.rak.arah === 'x'; const A0 = c.a0; const m = ax ? k.z + k.d / 2 : k.x + k.w / 2; const bw = k.area!.rak.bayW;
        const celah: [number, number][] = []; let p = A0;
        celah.push([p, p + c.awal]); p += c.awal;
        c.bay.forEach((nb, i) => { p += nb * bw; if (i < c.bay.length - 1) { celah.push([p, p + c.tengah]); p += c.tengah; } });
        celah.push([p, p + c.akhir]);
        return <g data-ekspor="tidak">{celah.filter(([a, b]) => b - a > 0.05).map(([a, b], i) => (ax
          ? garisUkur(a, m, b, m, `${f1(b - a)} m`, '#7c3aed', `ca${i}`)
          : garisUkur(m, a, m, b, `${f1(b - a)} m`, '#7c3aed', `ca${i}`)))}</g>;
      })()}
      {/* garis potong (view potongan) */}
      {potong && (() => {
        const [x1, z1, x2, z2] = potong.sumbu === 'z' ? [-1, potong.nilai, g.L + 1, potong.nilai] : [potong.nilai, -1, potong.nilai, g.W + 1];
        return (
          <g data-ekspor="tidak" style={{ pointerEvents: 'none' }}>
            <line x1={x1} y1={z1} x2={x2} y2={z2} stroke="#dc2626" strokeWidth={fs * 0.12} strokeDasharray={`${fs * 0.8} ${fs * 0.3} ${fs * 0.15} ${fs * 0.3}`} />
            <text x={x1 + (potong.sumbu === 'z' ? fs * 0.3 : fs * 0.3)} y={z1 + (potong.sumbu === 'z' ? -fs * 0.35 : fs * 1.2)} fontSize={fs * 0.8} fill="#dc2626" fontWeight={700}>Potongan {potong.sumbu === 'z' ? `Z = ${f1(potong.nilai)} m` : `X = ${f1(potong.nilai)} m`}</text>
          </g>
        );
      })()}
      {kursor && <text data-ekspor="tidak" x={view.x + fs * 0.5} y={view.z + tinggiView - fs * 0.6} fontSize={fs * 0.75} fill="#64748b">x {f1(kursor.x)} m · z {f1(kursor.z)} m</text>}
    </svg>
  );
});

export default Editor2D;
