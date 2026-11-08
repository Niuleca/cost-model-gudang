'use client';
// Editor denah 2D (SVG): tampak atas, X = panjang gudang (dock di kiri), Z = lebar gudang (ke bawah).
// Pilih, geser (drag), ubah ukuran (handle), ukur jarak, garis ukur otomatis ke rintangan / dinding, latar denah gambar / DXF.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BLOK_DEFAULT, aturSisiGate, dindingMiring, poligonLuar, rentangZ, celahArea, dimRak, jarakBebas, lorongArea, nBay, ringkasArea, uraiArea, uraiBlok, uraiGridKolom, denganKolom, asGridKolom, type Komponen, type LayoutEdit } from '@/lib/simulasi3d/editor';

export type Mode = 'pilih' | 'blok' | 'ukur' | 'geser' | 'kolom';
export interface Editor2DApi { pasFit: () => void; svgEkspor: () => string; pusatLayar: () => { x: number; z: number } }

export const WARNA_KOMP: Record<string, { isi: string; garis: string }> = {
  spr: { isi: '#dbe7f7', garis: '#1e56a0' }, areaKolom: { isi: '#475569', garis: '#0f766e' }, areaRak: { isi: '#f1f6fd', garis: '#1e56a0' }, ddr: { isi: '#cbd8ee', garis: '#173f78' }, block: { isi: '#f3e3c8', garis: '#a16207' },
  stagingIn: { isi: '#dbeafe', garis: '#2563eb' }, stagingOut: { isi: '#d1fae5', garis: '#059669' }, fasilitas: { isi: '#ede9fe', garis: '#6d28d9' },
  dock: { isi: '#1f2937', garis: '#111827' }, kolom: { isi: '#475569', garis: '#1e293b' }, jalur: { isi: '#fef3c7', garis: '#d97706' }, zona: { isi: '#e0f2fe', garis: '#0284c7' },
  gate: { isi: '#facc15', garis: '#a16207' }, platform: { isi: '#d6d3d1', garis: '#57534e' },
};
/** Warna gate menurut fungsi: IN hijau, OUT oranye, IN & OUT kuning. */
export const WARNA_GATE = { inbound: { isi: '#86efac', garis: '#15803d' }, outbound: { isi: '#fdba74', garis: '#c2410c' } } as const;

type SisiG = 'depan' | 'belakang' | 'kiri' | 'kanan';
/** Gate diseret: menempel ke dinding terdekat dari kursor, posisi sepanjang dinding mengikuti kursor. */
function seretGate(k: Komponen, px: number, pz: number, g: { L: number; W: number }, snap: (v: number) => number): Komponen {
  const jarak: [SisiG, number][] = [['depan', Math.abs(px)], ['belakang', Math.abs(px - g.L)], ['kiri', Math.abs(pz)], ['kanan', Math.abs(pz - g.W)]];
  const sisi = jarak.sort((a, b) => a[1] - b[1])[0][0];
  const lebar = (k.sisi ?? 'depan') === 'depan' || k.sisi === 'belakang' ? k.d : k.w;
  const sejajarZ = sisi === 'depan' || sisi === 'belakang';
  const pos = snap((sejajarZ ? pz : px) - lebar / 2);
  return aturSisiGate({ ...k, sisi, ...(sejajarZ ? { z: pos, d: lebar } : { x: pos, w: lebar }) }, sisi, g);
}
const f1 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('id-ID');

type Seret =
  | { jenis: 'geser'; id: string; ax: number; az: number; x0: number; z0: number }
  | { jenis: 'ukuran'; id: string; h: string; ax: number; az: number; k0: Komponen }
  | { jenis: 'pan'; sx: number; sy: number; v0: { x: number; z: number; w: number } }
  | { jenis: 'grup'; ax: number; az: number; awal: Record<string, { x: number; z: number }> }
  | { jenis: 'kotak'; ax: number; az: number; tambah: boolean; id?: string }
  | null;

interface Props {
  edit: LayoutEdit; pilih: string | null; setPilih: (id: string | null) => void;
  /** Seleksi banyak (≥ 2 komponen). Kosong = seleksi tunggal lewat `pilih`. */
  multi: string[]; setMulti: (ids: string[]) => void;
  mulaiAksi: () => void; ubah: (f: (e: LayoutEdit) => LayoutEdit) => void;
  mode: Mode; grid: number; snapTepi: boolean;
  /** Garis potong untuk view potongan (sumbu tetap & nilainya, m). */
  potong?: { sumbu: 'x' | 'z'; nilai: number } | null;
  /** Mode kolom: klik di denah → kolom baru (pusat x, z). Ukuran sisi kolom (m) untuk pratinjau. */
  taruhKolom?: (x: number, z: number) => void; ukuranKolom?: number | { w: number; d: number };
}

const Editor2D = forwardRef<Editor2DApi, Props>(function Editor2D({ edit, pilih, setPilih, multi, setMulti, mulaiAksi, ubah, mode, grid, snapTepi, potong, taruhKolom, ukuranKolom: ukKolomProp = 0.5 }, ref) {
  const ukKolom = typeof ukKolomProp === 'number' ? { w: ukKolomProp, d: ukKolomProp } : ukKolomProp;
  const ukuranKolom = Math.max(ukKolom.w, ukKolom.d);
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: -5, z: -5, w: 100 });     // viewBox: kiri, atas, lebar (m)
  const [ukuran, setUkuran] = useState({ w: 800, h: 500 });
  const seret = useRef<Seret>(null);
  const [ukurA, setUkurA] = useState<{ x: number; z: number } | null>(null);
  const [kursor, setKursor] = useState<{ x: number; z: number } | null>(null);
  const [kotak, setKotak] = useState<{ ax: number; az: number; bx: number; bz: number } | null>(null);
  const setMultiSet = new Set(multi);
  const seleksi = () => (multi.length ? multi : pilih ? [pilih] : []);
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

  /** Titik kolom baru: sejajar (as) dengan kolom terdekat bila dalam 0,6 m, selain itu ikut snap grid; tetap di dalam gedung. */
  const titikKolom = (p: { x: number; z: number }) => {
    const as = denganKolom(edit.komponen, g).filter(k => k.jenis === 'kolom').map(k => ({ x: k.x + k.w / 2, z: k.z + k.d / 2 }));
    let x = snap(p.x), z = snap(p.z), sejajarX: number | null = null, sejajarZ: number | null = null, dx = 0.6, dz = 0.6;
    for (const a of as) { if (Math.abs(p.x - a.x) < dx) { dx = Math.abs(p.x - a.x); x = a.x; sejajarX = a.x; } if (Math.abs(p.z - a.z) < dz) { dz = Math.abs(p.z - a.z); z = a.z; sejajarZ = a.z; } }
    const hx = ukKolom.w / 2, hz = ukKolom.d / 2;
    x = Math.min(g.L - hx, Math.max(hx, x)); z = Math.min(g.W - hz, Math.max(hz, z));
    // jarak as-ke-as ke kolom terdekat sebaris / sekolom (untuk label pratinjau)
    const kiri = as.filter(a => sejajarZ != null && Math.abs(a.z - z) < 0.01 && a.x < x).sort((a, b) => b.x - a.x)[0];
    const atas = as.filter(a => sejajarX != null && Math.abs(a.x - x) < 0.01 && a.z < z).sort((a, b) => b.z - a.z)[0];
    return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, sejajarX, sejajarZ, kiri, atas };
  };

  function turun(e: React.PointerEvent, id?: string, h?: string) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = keDunia(e.clientX, e.clientY);
    if (mode === 'kolom' && e.button === 0 && !h) { const t = titikKolom(p); taruhKolom?.(t.x, t.z); return; }
    if (mode === 'ukur') {
      const q = { x: snap(p.x), z: snap(p.z) };
      if (!ukurA) setUkurA(q);
      else { mulaiAksi(); ubah(ed => ({ ...ed, ukur: [...ed.ukur, { id: Math.random().toString(36).slice(2, 9), ax: ukurA.x, az: ukurA.z, bx: q.x, bz: q.z }] })); setUkurA(null); }
      return;
    }
    const ubahSel = e.shiftKey || e.ctrlKey || e.metaKey;
    // seleksi blok: mode Blok, atau Shift + seret di area kosong
    // (di mode Blok, mulai di atas komponen pun tetap menarik kotak — area rak adaptif menutupi seluruh lantai)
    if (!h && e.button === 0 && ((mode === 'blok') || (!id && mode === 'pilih' && ubahSel))) {
      seret.current = { jenis: 'kotak', ax: p.x, az: p.z, tambah: ubahSel, id };
      setKotak({ ax: p.x, az: p.z, bx: p.x, bz: p.z }); return;
    }
    if (mode === 'geser' || e.button === 1 || (!id && !h)) {
      if (!id && !h && mode === 'pilih' && e.button === 0) setPilih(null);
      seret.current = { jenis: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...view } }; return;
    }
    const k = edit.komponen.find(c => c.id === id); if (!k) return;
    // Shift / Ctrl + klik: tambah / buang dari seleksi
    if (!h && ubahSel) {
      const cur = seleksi(); setMulti(cur.includes(k.id) ? cur.filter(i => i !== k.id) : [...cur, k.id]); return;
    }
    // seret salah satu anggota seleksi banyak → geser semua
    if (!h && setMultiSet.has(k.id)) {
      mulaiAksi(); const awal: Record<string, { x: number; z: number }> = {};
      for (const c of edit.komponen) if (setMultiSet.has(c.id)) awal[c.id] = { x: c.x, z: c.z };
      seret.current = { jenis: 'grup', ax: p.x, az: p.z, awal }; return;
    }
    setPilih(k.id); mulaiAksi();
    seret.current = h ? { jenis: 'ukuran', id: k.id, h, ax: p.x, az: p.z, k0: { ...k } } : { jenis: 'geser', id: k.id, ax: p.x, az: p.z, x0: k.x, z0: k.z };
  }
  function gerak(e: React.PointerEvent) {
    const p = keDunia(e.clientX, e.clientY); setKursor(p);
    const s = seret.current; if (!s) return;
    if (s.jenis === 'pan') { const skala = s.v0.w / Math.max(1, ukuran.w); setView({ ...s.v0, x: s.v0.x - (e.clientX - s.sx) * skala, z: s.v0.z - (e.clientY - s.sy) * skala }); return; }
    if (s.jenis === 'kotak') { setKotak({ ax: s.ax, az: s.az, bx: p.x, bz: p.z }); return; }
    if (s.jenis === 'grup') {
      const dx = snap(p.x - s.ax), dz = snap(p.z - s.az); const r = (v: number) => Math.round(v * 100) / 100;
      ubah(ed => ({ ...ed, komponen: ed.komponen.map(k => { const a = s.awal[k.id]; if (!a) return k; return { ...k, x: k.jenis === 'dock' ? a.x : r(a.x + dx), z: r(a.z + dz) }; }) }));
      return;
    }
    ubah(ed => ({ ...ed, komponen: ed.komponen.map(k => {
      if (k.id !== s.id) return k;
      if (s.jenis === 'geser') {
        let x = snap(s.x0 + p.x - s.ax), z = snap(s.z0 + p.z - s.az);
        if (k.jenis === 'dock') x = 0;
        if (k.jenis === 'gate') return seretGate(k, p.x, p.z, ed.gedung, snap);
        if (k.jenis === 'kolom') {   // kolom: as sejajar dengan kolom lain (≤ 0,6 m), ukuran tidak berubah
          let cx = s.x0 + p.x - s.ax + k.w / 2, cz = s.z0 + p.z - s.az + k.d / 2, bx = 0.6, bz = 0.6, kenaX = false, kenaZ = false;
          for (const o of denganKolom(ed.komponen, ed.gedung)) if (o.jenis === 'kolom' && o.id !== k.id) {
            const ox = o.x + o.w / 2, oz = o.z + o.d / 2;
            if (Math.abs(cx - ox) < bx) { bx = Math.abs(cx - ox); cx = ox; kenaX = true; }
            if (Math.abs(cz - oz) < bz) { bz = Math.abs(cz - oz); cz = oz; kenaZ = true; }
          }
          x = kenaX ? cx - k.w / 2 : snap(cx - k.w / 2); z = kenaZ ? cz - k.d / 2 : snap(cz - k.d / 2);
          x = Math.min(ed.gedung.L - k.w, Math.max(0, x)); z = Math.min(ed.gedung.W - k.d, Math.max(0, z));
          return { ...k, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
        }
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
      if (k0.jenis === 'gate') { const sz = (k0.sisi ?? 'depan') === 'depan' || k0.sisi === 'belakang'; return aturSisiGate({ ...k, ...(sz ? { z: r(z), d: r(Math.max(0.5, d)) } : { x: r(x), w: r(Math.max(0.5, w)) }) }, k0.sisi ?? 'depan', ed.gedung); }
      return { ...k, x: r(x), z: r(z), w: r(Math.max(0.2, w)), d: r(Math.max(0.2, d)) };
    }) }));
  }
  function naik() {
    const s = seret.current; seret.current = null;
    if (s?.jenis === 'kotak' && kotak) {
      const x0 = Math.min(kotak.ax, kotak.bx), x1 = Math.max(kotak.ax, kotak.bx), z0 = Math.min(kotak.az, kotak.bz), z1 = Math.max(kotak.az, kotak.bz);
      // seret ke kanan = komponen yang masuk penuh ke kotak; seret ke kiri = yang tersentuh kotak (seperti CAD)
      const silang = kotak.bx < kotak.ax;
      const klik = (x1 - x0) < view.w / 300 && (z1 - z0) < view.w / 300;
      if (klik) {   // klik tanpa seret di mode Blok: tambah / buang komponen itu
        const cur = seleksi(); setKotak(null);
        if (s.id) setMulti(cur.includes(s.id) ? cur.filter(i => i !== s.id) : [...cur, s.id]); else if (!s.tambah) setMulti([]);
        return;
      }
      const kena = edit.komponen.filter(k => silang
        ? k.x < x1 && k.x + k.w > x0 && k.z < z1 && k.z + k.d > z0
        : k.x >= x0 && k.x + k.w <= x1 && k.z >= z0 && k.z + k.d <= z1).map(k => k.id);
      const dasar = s.tambah ? seleksi() : [];
      setMulti([...new Set([...dasar, ...kena])]);
      setKotak(null);
    }
  }
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
    const w = (k.jenis === 'gate' && k.arus ? WARNA_GATE[k.arus] : WARNA_KOMP[k.jenis]) ?? WARNA_KOMP.zona; const dipilih = k.id === pilih || setMultiSet.has(k.id);
    const isi = k.warna ?? w.isi;
    const el: React.ReactNode[] = [];
    if (k.gridKolom) {
      // area kolom: garis putus-putus (bisa dipegang di tepinya) + kolom hasil grid; klik kolom mana pun = pilih area
      const { xs, zs } = asGridKolom(k); const kol = uraiGridKolom(k, g);
      el.push(<rect key="hit" data-ekspor="tidak" x={k.x} y={k.z} width={k.w} height={k.d} fill="none" stroke="transparent" strokeWidth={fs * 0.6} style={{ pointerEvents: 'stroke' }} />);
      el.push(<rect key="r" x={k.x} y={k.z} width={k.w} height={k.d} fill={dipilih ? 'rgba(15,118,110,0.06)' : 'none'} stroke={dipilih ? '#f97316' : w.garis} strokeWidth={dipilih ? fs * 0.14 : fs * 0.06}
        strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} style={{ pointerEvents: 'none' }} />);
      if (dipilih) {
        xs.forEach((x, i) => el.push(<line key={`gx${i}`} x1={x} y1={k.z} x2={x} y2={k.z + k.d} stroke="#0f766e" strokeWidth={fs * 0.03} strokeDasharray={`${fs * 0.3} ${fs * 0.2}`} style={{ pointerEvents: 'none' }} />));
        zs.forEach((z, i) => el.push(<line key={`gz${i}`} x1={k.x} y1={z} x2={k.x + k.w} y2={z} stroke="#0f766e" strokeWidth={fs * 0.03} strokeDasharray={`${fs * 0.3} ${fs * 0.2}`} style={{ pointerEvents: 'none' }} />));
      }
      for (const c of kol) el.push(<g key={c.id}><rect x={c.x - fs * 0.22} y={c.z - fs * 0.22} width={c.w + fs * 0.44} height={c.d + fs * 0.44} fill="transparent" data-ekspor="tidak" />
        <rect x={c.x} y={c.z} width={c.w} height={c.d} fill={w.isi} stroke={dipilih ? '#f97316' : '#1e293b'} strokeWidth={fs * 0.05} /></g>);
      el.push(<text key="t" x={k.x + fs * 0.3} y={k.z - fs * 0.45} fontSize={fs * 0.75} fill="#0f766e" style={{ paintOrder: 'stroke', stroke: '#ffffffcc', strokeWidth: fs * 0.2, pointerEvents: 'none' }}>
        {k.label} · {xs.length} × {zs.length} as · {kol.length} kolom</text>);
      return <g key={k.id} onPointerDown={e => { e.stopPropagation(); turun(e, k.id); }} style={{ cursor: mode === 'pilih' || setMultiSet.has(k.id) ? 'move' : undefined }}>{el}</g>;
    }
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
    if (k.jenis === 'block' && k.blok) {
      // baris palet (row deep) + garis antar palet + lorong forklift berlabel lebarnya
      const b = { ...BLOK_DEFAULT, ...k.blok }; const ub = uraiBlok(k); const ax = b.arah === 'x';
      ub.lorong.forEach((l, i) => {
        el.push(<rect key={`bl${i}`} x={l.x} y={l.z} width={l.w} height={l.d} fill="#fef9c3" fillOpacity={0.7} stroke="none" />);
        const cx = l.x + l.w / 2, cz = l.z + l.d / 2;
        el.push(<text key={`blt${i}`} x={cx} y={cz} fontSize={fs * 0.7} textAnchor="middle" dominantBaseline="middle" fill="#a16207" transform={ax ? undefined : `rotate(-90 ${cx} ${cz})`}
          style={{ pointerEvents: 'none' }}>lorong {l.lebar.toLocaleString('id-ID')} m</text>);
      });
      ub.gangway.forEach((g0, i) => {
        el.push(<rect key={`bg${i}`} x={g0.x} y={g0.z} width={g0.w} height={g0.d} fill="url(#arsir)" fillOpacity={0.9} stroke="#ca8a04" strokeWidth={fs * 0.04} strokeDasharray={`${fs * 0.3} ${fs * 0.2}`} />);
        const cx = g0.x + g0.w / 2, cz = g0.z + g0.d / 2;
        el.push(<text key={`bgt${i}`} x={cx} y={cz} fontSize={fs * 0.7} textAnchor="middle" dominantBaseline="middle" fill="#854d0e" transform={ax ? `rotate(-90 ${cx} ${cz})` : undefined}
          style={{ paintOrder: 'stroke', stroke: '#fffbeb', strokeWidth: fs * 0.2, pointerEvents: 'none' }}>gangway {g0.lebar.toLocaleString('id-ID')} m</text>);
      });
      ub.baris.forEach((r, i) => {
        el.push(<rect key={`br${i}`} x={r.x} y={r.z} width={r.w} height={r.d} fill="#fde68a" stroke="#b45309" strokeWidth={fs * 0.05} />);
        const step = b.paletL + b.celahPalet;
        if (r.nPalet <= 400) for (let a = 1; a < r.nPalet; a++) {
          const p0 = (ax ? r.x : r.z) + a * step - b.celahPalet / 2;
          el.push(ax ? <line key={`bp${i}-${a}`} x1={p0} y1={r.z} x2={p0} y2={r.z + r.d} stroke="#b45309" strokeWidth={fs * 0.025} strokeOpacity={0.6} />
            : <line key={`bp${i}-${a}`} x1={r.x} y1={p0} x2={r.x + r.w} y2={p0} stroke="#b45309" strokeWidth={fs * 0.025} strokeOpacity={0.6} />);
        }
        for (let q = 1; q < r.deep; q++) {
          const d0 = (ax ? r.z : r.x) + q * b.paletP;
          el.push(ax ? <line key={`bd${i}-${q}`} x1={r.x} y1={d0} x2={r.x + r.w} y2={d0} stroke="#b45309" strokeWidth={fs * 0.02} strokeOpacity={0.35} />
            : <line key={`bd${i}-${q}`} x1={d0} y1={r.z} x2={d0} y2={r.z + r.d} stroke="#b45309" strokeWidth={fs * 0.02} strokeOpacity={0.35} />);
        }
        // muka baris (sisi lorong): garis oranye tebal
        if (r.hadap) {
          const m = ax ? (r.hadap === 1 ? [r.x, r.z + r.d, r.x + r.w, r.z + r.d] : [r.x, r.z, r.x + r.w, r.z]) : (r.hadap === 1 ? [r.x + r.w, r.z, r.x + r.w, r.z + r.d] : [r.x, r.z, r.x, r.z + r.d]);
          el.push(<line key={`bm${i}`} x1={m[0]} y1={m[1]} x2={m[2]} y2={m[3]} stroke="#f97316" strokeWidth={fs * 0.15} />);
        }
      });
    }
    if (k.jenis === 'gate') {
      const sz = (k.sisi ?? 'depan') === 'depan' || k.sisi === 'belakang';
      for (let i = 0; i < 6; i++) el.push(sz ? <line key={`gh${i}`} x1={k.x} y1={k.z + (i + 0.5) * k.d / 6} x2={k.x + k.w} y2={k.z + (i + 0.5) * k.d / 6} stroke="#111827" strokeWidth={fs * 0.06} />
        : <line key={`gh${i}`} x1={k.x + (i + 0.5) * k.w / 6} y1={k.z} x2={k.x + (i + 0.5) * k.w / 6} y2={k.z + k.d} stroke="#111827" strokeWidth={fs * 0.06} />);
    }
    if (k.jenis === 'platform') {
      const t = fs * 0.12;
      el.push(<line key="pt" x1={k.x + t} y1={k.z} x2={k.x + t} y2={k.z + k.d} stroke="#facc15" strokeWidth={t * 2} />);
      for (let i = 0; i < Math.min(60, k.palet ?? 0); i++) { const kol = Math.max(1, Math.floor((k.w - 0.6) / 1.3)); const a = i % kol, b2 = Math.floor(i / kol); const z0 = k.z + 0.4 + b2 * 1.15; if (z0 + 1 > k.z + k.d) break;
        el.push(<rect key={`pp${i}`} x={k.x + k.w - 0.3 - (a + 1) * 1.3} y={z0} width={1.2} height={1} fill="#d4a373" stroke="#92400e" strokeWidth={fs * 0.03} />); }
    }
    if (k.jenis === 'dock') el.push(<path key="p" d={`M ${k.x + k.w} ${k.z + k.d / 2} l ${fs * 0.9} ${-fs * 0.5} l 0 ${fs} z`} fill={k.arus === 'outbound' ? '#059669' : '#2563eb'} />);
    const ra = k.area ? ringkasArea(k, edit) : null;
    const label = ra ? `${k.label} · ${ra.baris} baris · ${ra.bay} bay × ${k.area!.rak.level} lv · ${ra.posisi.toLocaleString('id-ID')} posisi` : k.rak ? `${k.label} · ${nBay(k)} bay × ${k.rak.level} lv` : k.jenis === 'block' ? (k.blok ? (() => { const ub = uraiBlok(k); return `${k.label} · ${ub.nBaris} baris × ${ub.nPaletBaris} plt × ${k.blok.deep} deep × ${k.tumpuk ?? 1} tumpuk = ${(ub.tapak * (k.tumpuk ?? 1)).toLocaleString('id-ID')} posisi`; })() : `${k.label} · tumpuk ${k.tumpuk ?? 1}`) : k.jenis === 'dock' ? (k.arus === 'outbound' ? 'OUT' : 'IN') : k.jenis === 'gate' ? `${k.label} ${f1((k.sisi ?? 'depan') === 'depan' || k.sisi === 'belakang' ? k.d : k.w)} m` : k.jenis === 'platform' ? `${k.label} ${f1(k.d)} × ${f1(k.w)} m · ${f1(k.tinggi)} m` : k.label;
    const muat = Math.max(k.w, k.d) > label.length * fs * 0.45 || dipilih;
    if (muat && k.jenis !== 'kolom') {
      const tegak = k.d > k.w * 1.6 && k.jenis !== 'dock' && !k.area && !k.blok;
      const cx = k.jenis === 'dock' ? k.x - fs * 0.4 : k.x + k.w / 2, cz = k.area || k.blok ? k.z - fs * 0.55 : k.z + k.d / 2;
      el.push(<text key="t" x={cx} y={cz} fontSize={fs * 0.8} textAnchor={k.jenis === 'dock' ? 'end' : 'middle'} dominantBaseline="middle" fill="#0f172a"
        transform={tegak ? `rotate(-90 ${cx} ${cz})` : undefined} style={{ paintOrder: 'stroke', stroke: '#ffffffcc', strokeWidth: fs * 0.2, pointerEvents: 'none' }}>{label}</text>);
    }
    // kolom kecil: area pegang transparan lebih besar supaya mudah diseret
    if (k.jenis === 'kolom') { const pad = fs * 0.22; el.unshift(<rect key="hit" data-ekspor="tidak" x={k.x - pad} y={k.z - pad} width={k.w + 2 * pad} height={k.d + 2 * pad} fill="transparent" />); }
    return <g key={k.id} onPointerDown={e => { e.stopPropagation(); turun(e, k.id); }} style={{ cursor: mode === 'pilih' || setMultiSet.has(k.id) ? 'move' : undefined }}>{el}</g>;
  };

  /** Handle ubah ukuran. Komponen kecil (mis. kolom 0,5 m) → handle di LUAR bentuk supaya bagian tengah tetap bisa diseret tanpa mengubah ukuran. */
  const handle = (k: Komponen) => {
    const s = fs * 0.45; const kecil = Math.min(k.w, k.d) < s * 3; const o = kecil ? s * 1.2 : 0;
    const semua: [string, number, number][] = [['nw', k.x - o, k.z - o], ['n', k.x + k.w / 2, k.z - o], ['ne', k.x + k.w + o, k.z - o], ['e', k.x + k.w + o, k.z + k.d / 2], ['se', k.x + k.w + o, k.z + k.d + o], ['s', k.x + k.w / 2, k.z + k.d + o], ['sw', k.x - o, k.z + k.d + o], ['w', k.x - o, k.z + k.d / 2]];
    const pts = kecil ? semua.filter(([h]) => h.length === 2) : semua;   // kecil: cukup 4 sudut
    return pts.map(([h, x, z]) => <rect key={h} data-ekspor="tidak" x={x - s / 2} y={z - s / 2} width={s} height={s} fill="#fff" stroke="#f97316" strokeWidth={fs * 0.08}
      style={{ cursor: `${h}-resize` }} onPointerDown={e => { e.stopPropagation(); turun(e, k.id, h); }} />);
  };

  const jb = terpilih && !['dock', 'gate', 'platform'].includes(terpilih.jenis) ? jarakBebas(edit, terpilih) : null;
  const luar = poligonLuar(g), miring = dindingMiring(g);
  return (
    <svg ref={svg} className="sim2d-svg" viewBox={`${view.x} ${view.z} ${view.w} ${tinggiView}`} preserveAspectRatio="xMinYMin meet"
      onPointerDown={e => turun(e)} onPointerMove={gerak} onPointerUp={naik} onPointerLeave={() => setKursor(null)} onWheel={roda}
      style={{ cursor: mode === 'geser' ? 'grab' : mode === 'ukur' || mode === 'blok' || mode === 'kolom' ? 'crosshair' : 'default', fontFamily: 'Noto Sans, Arial, sans-serif' }}>
      <defs>
        <marker id="panah" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" /></marker>
        <pattern id="arsir" width="1" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="1" fill="#fef9c3" /><line x1="0" y1="0" x2="0" y2="1" stroke="#facc15" strokeWidth="0.25" /></pattern>
        <pattern id="kisi1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e2e8f0" strokeWidth="0.03" /></pattern>
        <pattern id="luarGedung" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.2" height="1.2" fill="#e2e8f0" /><line x1="0" y1="0" x2="0" y2="1.2" stroke="#94a3b8" strokeWidth="0.18" /></pattern>
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
      {edit.komponen.filter(k => !['jalur', 'zona', 'areaRak', 'gate'].includes(k.jenis)).map(gambarKomp)}
      {edit.komponen.filter(k => k.jenis === 'gate').map(gambarKomp)}
      {/* gedung trapesium: area di luar dinding miring diarsir abu-abu (tidak bisa dipakai) */}
      {luar && <polygon points={luar.map(p => `${p.x},${p.z}`).join(' ')} fill="url(#luarGedung)" stroke="none" style={{ pointerEvents: 'none' }} />}
      {/* dinding */}
      {luar && miring
        ? <polygon points={[[0, rentangZ(g, 0)[0]], [g.L, rentangZ(g, g.L)[0]], [g.L, rentangZ(g, g.L)[1]], [0, rentangZ(g, 0)[1]]].map(([x, z]) => `${x},${z}`).join(' ')} fill="none" stroke="#0f172a" strokeWidth={fs * 0.22} style={{ pointerEvents: 'none' }} />
        : <rect x={0} y={0} width={g.L} height={g.W} fill="none" stroke="#0f172a" strokeWidth={fs * 0.22} style={{ pointerEvents: 'none' }} />}
      {/* dimensi gedung */}
      {garisUkur(0, -fs * 1.6, g.L, -fs * 1.6, `${f1(g.L)} m`, '#334155', 'dimL')}
      {g.trapesium
        ? <>{garisUkur(-fs * 1.4 - 14, rentangZ(g, 0)[0], -fs * 1.4 - 14, rentangZ(g, 0)[1], `depan ${f1(g.trapesium.lebarDepan)} m`, '#334155', 'dimWd')}
            {garisUkur(g.L + fs * 1.4, rentangZ(g, g.L)[0], g.L + fs * 1.4, rentangZ(g, g.L)[1], `belakang ${f1(g.trapesium.lebarBelakang)} m`, '#334155', 'dimWb')}</>
        : garisUkur(g.L + fs * 1.4, 0, g.L + fs * 1.4, g.W, `${f1(g.W)} m`, '#334155', 'dimW')}
      {/* grid pilar: as & rantai dimensi as-ke-as per bentang */}
      {(() => {
        const kol = denganKolom(edit.komponen, g).filter(k => k.jenis === 'kolom'); if (kol.length < 2) return null;
        const unik = (a: number[]) => a.map(v => Math.round(v * 100) / 100).sort((p, q) => p - q).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 0.05);
        // as pilar tepi yang menempel dinding dianggap di garis dinding (as grid = as dinding)
        const asX = (k: Komponen) => (k.x <= 0.05 ? 0 : k.x + k.w >= g.L - 0.05 ? g.L : k.x + k.w / 2), asZ = (k: Komponen) => (k.z <= 0.05 ? 0 : k.z + k.d >= g.W - 0.05 ? g.W : k.z + k.d / 2);
        const xs = unik(kol.map(asX)), zs = unik(kol.map(asZ));
        if (xs.length > 80 || zs.length > 80) return null;
        const yX = -fs * 3.4, xZ = g.L + fs * 3.2; const el: JSX.Element[] = [];
        xs.forEach((x, i) => el.push(<line key={`ax${i}`} x1={x} y1={yX} x2={x} y2={g.W} stroke="#94a3b8" strokeWidth={fs * 0.03} strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} style={{ pointerEvents: 'none' }} />));
        zs.forEach((z, i) => el.push(<line key={`az${i}`} x1={0} y1={z} x2={xZ} y2={z} stroke="#94a3b8" strokeWidth={fs * 0.03} strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} style={{ pointerEvents: 'none' }} />));
        xs.slice(1).forEach((x, i) => el.push(garisUkur(xs[i], yX, x, yX, f1(x - xs[i]), '#0f766e', `bx${i}`)));
        zs.slice(1).forEach((z, i) => el.push(garisUkur(xZ, zs[i], xZ, z, f1(z - zs[i]), '#0f766e', `bz${i}`)));
        // sisa ke dinding (bukan bentang pilar) — abu-abu
        if (xs[0] > 0.05) el.push(garisUkur(0, yX, xs[0], yX, f1(xs[0]), '#94a3b8', 'bx0s'));
        if (g.L - xs[xs.length - 1] > 0.05) el.push(garisUkur(xs[xs.length - 1], yX, g.L, yX, f1(g.L - xs[xs.length - 1]), '#94a3b8', 'bx1s'));
        if (zs[0] > 0.05) el.push(garisUkur(xZ, 0, xZ, zs[0], f1(zs[0]), '#94a3b8', 'bz0s'));
        if (g.W - zs[zs.length - 1] > 0.05) el.push(garisUkur(xZ, zs[zs.length - 1], xZ, g.W, f1(g.W - zs[zs.length - 1]), '#94a3b8', 'bz1s'));
        return <g>{el}</g>;
      })()}
      {/* ukuran tersimpan */}
      {edit.ukur.map(u => garisUkur(u.ax, u.az, u.bx, u.bz, `${f1(Math.hypot(u.bx - u.ax, u.bz - u.az))} m`, '#be123c', u.id))}
      {/* kotak seleksi blok: biru = masuk penuh (seret ke kanan), hijau putus-putus = tersentuh (seret ke kiri) */}
      {kotak && (() => { const silang = kotak.bx < kotak.ax; return (
        <rect data-ekspor="tidak" x={Math.min(kotak.ax, kotak.bx)} y={Math.min(kotak.az, kotak.bz)} width={Math.abs(kotak.bx - kotak.ax)} height={Math.abs(kotak.bz - kotak.az)}
          fill={silang ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)'} stroke={silang ? '#16a34a' : '#2563eb'} strokeWidth={fs * 0.08}
          strokeDasharray={silang ? `${fs * 0.4} ${fs * 0.25}` : undefined} style={{ pointerEvents: 'none' }} />); })()}
      {/* pratinjau kolom (mode kolom): kotak bayangan + garis bantu sejajar + jarak as ke as */}
      {mode === 'kolom' && kursor && (() => {
        const t = titikKolom(kursor), u = ukuranKolom;
        return (
          <g data-ekspor="tidak" style={{ pointerEvents: 'none' }}>
            {t.sejajarX != null && <line x1={t.x} y1={0} x2={t.x} y2={g.W} stroke="#2563eb" strokeWidth={fs * 0.05} strokeDasharray={`${fs * 0.3} ${fs * 0.2}`} />}
            {t.sejajarZ != null && <line x1={0} y1={t.z} x2={g.L} y2={t.z} stroke="#2563eb" strokeWidth={fs * 0.05} strokeDasharray={`${fs * 0.3} ${fs * 0.2}`} />}
            <rect x={t.x - ukKolom.w / 2} y={t.z - ukKolom.d / 2} width={ukKolom.w} height={ukKolom.d} fill="rgba(71,85,105,0.55)" stroke="#0f172a" strokeWidth={fs * 0.06} />
            {t.kiri && garisUkur(t.kiri.x, t.z - u, t.x, t.z - u, `${f1(t.x - t.kiri.x)} m`, '#2563eb', 'kolomX', false)}
            {t.atas && garisUkur(t.x + u, t.atas.z, t.x + u, t.z, `${f1(t.z - t.atas.z)} m`, '#2563eb', 'kolomZ', false)}
            <text x={t.x + u} y={t.z + u * 2 + fs * 0.6} fontSize={fs * 0.7} fill="#0f172a">klik = taruh kolom {f1(ukKolom.w)} × {f1(ukKolom.d)} m ({f1(t.x)}; {f1(t.z)})</text>
          </g>);
      })()}
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
      {/* lebar lorong aktual tiap area rak (ikut ekspor); row spacer hanya saat area dipilih */}
      {edit.komponen.filter(k => k.area).map(k => {
        const ax = k.area!.rak.arah === 'x'; const dipilih = k.id === pilih;
        return <g key={`lor${k.id}`} style={{ pointerEvents: 'none' }}>{lorongArea(k, edit).filter(l => l.jenis === 'lorong' || dipilih).map((l, i) => {
          const w = l.jenis === 'lorong' ? '#7c3aed' : '#64748b'; const t = `${f1(l.lebar)}${l.jenis === 'lorong' ? ' m' : ''}`;
          return ax ? garisUkur(l.a, l.b0, l.a, l.b1, t, w, `l${i}`, l.jenis === 'lorong') : garisUkur(l.b0, l.a, l.b1, l.a, t, w, `l${i}`, l.jenis === 'lorong');
        })}</g>;
      })}
      {terpilih?.area && terpilih.area.mode !== 'adaptif' && (() => {
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
