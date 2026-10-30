'use client';
// View potongan 2D (gaya elevasi CLASS): bidang potong tegak di Z tetap (samping kiri / kanan) atau X tetap (depan).
// Yang terpotong digambar detail (tiang, beam, palet per level, lebar lorong, tinggi level); yang di belakang bidang
// potong (searah pandangan) digambar sebagai siluet abu-abu. Satuan meter, Y ke atas.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { dimRak, nBay, tinggiRak, uraiKomponen, type Komponen, type LayoutEdit } from '@/lib/simulasi3d/editor';

export type ArahPotong = 'kiri' | 'kanan' | 'depan';
export interface PotonganApi { svgEkspor: () => string }

const f2 = (v: number) => (Math.round(v * 100) / 100).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Posisi potong awal: tengah baris rak terpanjang (supaya langsung memotong rak). */
export function potongAwal(e: LayoutEdit, arah: ArahPotong): number {
  const rak = uraiKomponen(e.komponen, e).filter(k => k.rak).sort((a, b) => b.w * b.d - a.w * a.d)[0];
  if (!rak) return arah === 'depan' ? e.gedung.L / 2 : e.gedung.W / 2;
  return Math.round((arah === 'depan' ? rak.x + rak.w / 2 : rak.z + rak.d / 2) * 100) / 100;
}

const Potongan = forwardRef<PotonganApi, { edit: LayoutEdit; arah: ArahPotong; nilai: number }>(function Potongan({ edit, arah, nilai }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  useImperativeHandle(ref, () => ({ svgEkspor: () => {
    const s = svg.current; if (!s) return '';
    const c = s.cloneNode(true) as SVGSVGElement; const [, , w, h] = (s.getAttribute('viewBox') ?? '0 0 100 50').split(' ').map(Number);
    const k = Math.min(30, 3600 / Math.max(w, 1)); c.setAttribute('width', String(Math.round(w * k))); c.setAttribute('height', String(Math.round(h * k)));
    return new XMLSerializer().serializeToString(c);
  } }));
  const g = edit.gedung; const H = g.sideMm / 1000, P = Math.max(g.sideMm, g.centerMm) / 1000; const tp = edit.tinggiPalet || 1.4;
  const samping = arah !== 'depan';
  const panjang = samping ? g.L : g.W;
  // sumbu horizontal gambar (u) dari koordinat gudang
  const keU = (x0: number, x1: number): [number, number] => (arah === 'kiri' ? [g.L - x1, g.L - x0] : [x0, x1]);
  const rentangU = (k: Komponen) => (samping ? keU(k.x, k.x + k.w) : [k.z, k.z + k.d] as [number, number]);
  const rentangPotong = (k: Komponen): [number, number] => (samping ? [k.z, k.z + k.d] : [k.x, k.x + k.w]);
  const ks = uraiKomponen(edit.komponen, edit).filter(k => k.jenis !== 'dock' && k.jenis !== 'zona');
  const kena = ks.filter(k => { const [a, b] = rentangPotong(k); return nilai >= a - 1e-6 && nilai <= b + 1e-6; });
  const belakang = ks.filter(k => { const [a, b] = rentangPotong(k); return arah === 'kanan' ? b < nilai - 1e-6 : a > nilai + 1e-6; })
    .sort((p, q) => { const jp = Math.abs(rentangPotong(p)[0] - nilai), jq = Math.abs(rentangPotong(q)[0] - nilai); return jq - jp; });
  const tinggiK = (k: Komponen) => (k.rak ? tinggiRak(k.rak) : k.jenis === 'block' ? Math.max(1, k.tumpuk ?? 1) * tp : k.jenis === 'stagingIn' || k.jenis === 'stagingOut' ? Math.max(1, k.tumpuk ?? 1) * tp : k.jenis === 'jalur' ? 0 : k.tinggi);

  // tinggi atap di bidang potong (bubungan memanjang sumbu X, miring ke arah Z)
  const atapDi = (z: number) => H + (P - H) * Math.max(0, 1 - Math.abs(z - g.W / 2) / (g.W / 2 || 1));
  const tinggiMaks = Math.max(P, ...kena.map(tinggiK), 1);
  const fs = Math.max(panjang, tinggiMaks * 2.2) / 70;
  const pad = fs * 6;
  const vb = { x: -pad * 1.4, y: -(tinggiMaks + pad * 1.2), w: panjang + pad * 2.6, h: tinggiMaks + pad * 2.6 };

  const el: React.ReactNode[] = [];
  const Y = (y: number) => -y;
  const kotak = (key: string, u0: number, u1: number, y0: number, y1: number, isi: string, garis: string, lebarGaris = fs * 0.05, ops = 1) =>
    <rect key={key} x={u0} y={Y(y1)} width={Math.max(0, u1 - u0)} height={Math.max(0, y1 - y0)} fill={isi} stroke={garis} strokeWidth={lebarGaris} opacity={ops} />;
  const palet = (key: string, u0: number, u1: number, y0: number) => {
    const t = Math.min(tp, 2.5);
    return (
      <g key={key}>
        <rect x={u0} y={Y(y0 + 0.15)} width={u1 - u0} height={0.15} fill="#334155" />
        <rect x={u0 + 0.02} y={Y(y0 + t)} width={u1 - u0 - 0.04} height={t - 0.15} fill="#fdf4e3" stroke="#a16207" strokeWidth={fs * 0.04} />
        <path d={`M${u0 + 0.02} ${Y(y0 + t)}L${u1 - 0.02} ${Y(y0 + 0.15)}M${u1 - 0.02} ${Y(y0 + t)}L${u0 + 0.02} ${Y(y0 + 0.15)}`} stroke="#d6b98a" strokeWidth={fs * 0.03} />
      </g>
    );
  };
  const ukur = (key: string, u0: number, u1: number, y: number, teks: string, warna = '#1e3a8a') => (
    <g key={key}>
      <line x1={u0} y1={Y(y)} x2={u1} y2={Y(y)} stroke={warna} strokeWidth={fs * 0.06} markerStart="url(#pp)" markerEnd="url(#pp)" />
      <line x1={u0} y1={Y(y - fs * 0.4)} x2={u0} y2={Y(y + fs * 0.4)} stroke={warna} strokeWidth={fs * 0.04} />
      <line x1={u1} y1={Y(y - fs * 0.4)} x2={u1} y2={Y(y + fs * 0.4)} stroke={warna} strokeWidth={fs * 0.04} />
      <text x={(u0 + u1) / 2} y={Y(y) - fs * 0.3} fontSize={fs * 0.8} textAnchor="middle" fill={warna} fontWeight={600} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: fs * 0.2 }}>{teks}</text>
    </g>
  );

  // ---------- siluet di belakang bidang potong
  for (const k of belakang) {
    const [u0, u1] = rentangU(k); const t = tinggiK(k); if (t <= 0) continue;
    el.push(kotak(`b${k.id}`, u0, u1, 0, t, '#e2e8f0', '#cbd5e1', fs * 0.04, 0.8));
  }

  // ---------- gedung
  if (samping) {
    const hc = atapDi(nilai);
    el.push(<path key="gd" d={`M0 ${Y(0)}L0 ${Y(hc)}L${panjang} ${Y(hc)}L${panjang} ${Y(0)}`} fill="none" stroke="#0f172a" strokeWidth={fs * 0.18} />);
    el.push(<line key="sh" x1={0} y1={Y(H)} x2={panjang} y2={Y(H)} stroke="#94a3b8" strokeWidth={fs * 0.05} strokeDasharray={`${fs * 0.5} ${fs * 0.3}`} />);
    const uDock = arah === 'kiri' ? panjang : 0;
    el.push(<text key="dock" x={uDock + (arah === 'kiri' ? fs * 0.6 : -fs * 0.6)} y={Y(fs * 1.2)} fontSize={fs * 0.85} textAnchor={arah === 'kiri' ? 'start' : 'end'} fill="#2563eb" fontWeight={700}>Dock</text>);
    el.push(<text key="hc" x={panjang + fs * 0.6} y={Y(hc) + fs * 0.3} fontSize={fs * 0.75} fill="#334155">atap {f2(hc)} m</text>);
  } else {
    el.push(<path key="gd" d={`M0 ${Y(0)}L0 ${Y(H)}L${g.W / 2} ${Y(P)}L${g.W} ${Y(H)}L${g.W} ${Y(0)}`} fill="none" stroke="#0f172a" strokeWidth={fs * 0.18} />);
    el.push(<text key="hc" x={g.W / 2} y={Y(P) - fs * 0.5} fontSize={fs * 0.75} textAnchor="middle" fill="#334155">center height {f2(P)} m</text>);
  }
  el.push(<text key="sht" x={-fs * 0.5} y={Y(H)} fontSize={fs * 0.75} textAnchor="end" fill="#334155">side {f2(H)} m</text>);
  el.push(<line key="lantai" x1={-pad * 0.6} y1={0} x2={panjang + pad * 0.6} y2={0} stroke="#0f172a" strokeWidth={fs * 0.12} />);

  // ---------- yang terpotong
  const potongRak: [number, number][] = [];   // rentang u baris rak yang terpotong melintang (untuk ukuran lorong)
  let ukurLevel: { u: number; s: NonNullable<Komponen['rak']> } | null = null;
  for (const k of kena) {
    const [u0, u1] = rentangU(k); const t = tinggiK(k);
    if (k.rak) {
      const s = k.rak; const tinggi = tinggiRak(s);
      const sepanjangGambar = samping ? s.arah === 'x' : s.arah === 'z';
      const beamY = (l: number) => (s.level1Mm + (l - 1) * s.levelNMm) / 1000;   // bawah beam level l (l ≥ 1)
      const dasarLevel = (l: number) => (l === 0 ? 0 : beamY(l) + s.beamMm / 1000);
      if (sepanjangGambar) {
        // elevasi muka rak: tiang per bay, beam per level, palet
        const nb = nBay(k);
        for (let b = 0; b < nb; b++) {
          const ub = arah === 'kiri' ? u1 - (b + 1) * s.bayW : u0 + b * s.bayW;
          for (let l = 0; l < s.level; l++) for (let j = 0; j < s.ppl; j++) {
            const lebar = (s.bayW - 0.1) / s.ppl; const a = ub + 0.05 + j * lebar + 0.04;
            el.push(palet(`${k.id}p${b}-${l}-${j}`, a, a + lebar - 0.08, dasarLevel(l)));
          }
          for (let l = 1; l < s.level; l++) el.push(kotak(`${k.id}bm${b}-${l}`, ub, ub + s.bayW, beamY(l), beamY(l) + s.beamMm / 1000, '#f97316', '#c2410c', fs * 0.03));
        }
        for (let b = 0; b <= nb; b++) { const ub = u0 + b * s.bayW; el.push(kotak(`${k.id}t${b}`, ub - 0.05, ub + 0.05, 0, tinggi, '#1d4ed8', '#1e3a8a', fs * 0.03)); }
      } else {
        // potongan melintang: rangka depan & belakang, bracing, palet per deep
        const dalam = dimRak(k).dalam;
        potongRak.push([u0, u1]);
        el.push(<path key={`${k.id}br`} d={Array.from({ length: Math.max(1, Math.ceil(tinggi / 1.2)) }, (_, i) => `M${u0 + 0.05} ${Y(i * 1.2)}L${u1 - 0.05} ${Y(Math.min(tinggi, (i + 1) * 1.2))}`).join('')} stroke="#93c5fd" strokeWidth={fs * 0.04} fill="none" />);
        for (let l = 0; l < s.level; l++) for (let q = 0; q < s.deep; q++) {
          const lebar = dalam / s.deep; const a = u0 + q * lebar;
          el.push(palet(`${k.id}p${l}-${q}`, a + 0.06, a + lebar - 0.06, dasarLevel(l)));
        }
        for (let l = 1; l < s.level; l++) for (const uu of [u0, u1 - 0.12]) el.push(kotak(`${k.id}bm${l}-${uu}`, uu, uu + 0.12, beamY(l), beamY(l) + s.beamMm / 1000, '#f97316', '#c2410c', fs * 0.03));
        el.push(kotak(`${k.id}t0`, u0, u0 + 0.1, 0, tinggi, '#1d4ed8', '#1e3a8a', fs * 0.03), kotak(`${k.id}t1`, u1 - 0.1, u1, 0, tinggi, '#1d4ed8', '#1e3a8a', fs * 0.03));
      }
      if (!ukurLevel || u0 < ukurLevel.u) ukurLevel = { u: u0, s };
    } else if (k.jenis === 'block' || k.jenis === 'stagingIn' || k.jenis === 'stagingOut') {
      const uk = samping ? 1.3 : 1.1; const n = Math.max(0, Math.floor((u1 - u0) / uk + 1e-6)); const tumpuk = Math.max(1, k.tumpuk ?? 1);
      const isi = k.jenis === 'block' ? n : Math.min(n, Math.ceil((k.palet ?? 0) / tumpuk / Math.max(1, Math.floor((samping ? k.d : k.w) / 1.1))));
      for (let i = 0; i < isi; i++) for (let u = 0; u < tumpuk; u++) el.push(palet(`${k.id}p${i}-${u}`, u0 + i * uk + 0.05, u0 + (i + 1) * uk - 0.05, u * tp));
      el.push(<text key={`${k.id}l`} x={(u0 + u1) / 2} y={Y(t) - fs * 0.5} fontSize={fs * 0.75} textAnchor="middle" fill="#7c2d12">{k.label}</text>);
    } else if (k.jenis === 'fasilitas' || k.jenis === 'kolom') {
      el.push(kotak(`${k.id}`, u0, u1, 0, t, k.jenis === 'kolom' ? '#475569' : '#ede9fe', k.jenis === 'kolom' ? '#1e293b' : '#6d28d9', fs * 0.06));
      if (k.jenis === 'fasilitas') el.push(<text key={`${k.id}l`} x={(u0 + u1) / 2} y={Y(t / 2)} fontSize={fs * 0.75} textAnchor="middle" fill="#4c1d95">{k.label}</text>);
    } else if (k.jenis === 'jalur') {
      el.push(<rect key={`${k.id}`} x={u0} y={0} width={u1 - u0} height={fs * 0.35} fill="url(#arsirP)" />);
      el.push(<text key={`${k.id}l`} x={(u0 + u1) / 2} y={fs * 1.35} fontSize={fs * 0.7} textAnchor="middle" fill="#92400e">{k.label}</text>);
    }
  }

  // ---------- ukuran: lebar lorong antar baris rak yang terpotong melintang + ke dinding
  potongRak.sort((a, b) => a[0] - b[0]);
  const yUkur = -fs * 2.2;
  for (let i = 1; i < potongRak.length; i++) {
    const a = potongRak[i - 1][1], b = potongRak[i][0];
    if (b - a > 0.4) el.push(ukur(`lr${i}`, a, b, yUkur, `${f2(b - a)} m`, '#be123c'));
  }
  if (potongRak.length) {
    const a = potongRak[0][0], b = potongRak[potongRak.length - 1][1];
    if (a > 0.2) el.push(ukur('lr0', 0, a, yUkur, `${f2(a)} m`, '#64748b'));
    if (panjang - b > 0.2) el.push(ukur('lrN', b, panjang, yUkur, `${f2(panjang - b)} m`, '#64748b'));
  }
  el.push(ukur('total', 0, panjang, -fs * 4.2, `${f2(panjang)} m`, '#334155'));
  // ---------- tinggi level (di kiri rak pertama)
  if (ukurLevel) {
    const s = ukurLevel.s; const u = ukurLevel.u - fs * 0.8;
    const tinggiL = [0]; for (let l = 1; l < s.level; l++) tinggiL.push((s.level1Mm + (l - 1) * s.levelNMm + s.beamMm) / 1000);
    tinggiL.push(tinggiRak(s));
    el.push(<line key="lvg" x1={u} y1={Y(0)} x2={u} y2={Y(tinggiRak(s))} stroke="#1e3a8a" strokeWidth={fs * 0.05} />);
    tinggiL.forEach((h, i) => el.push(
      <g key={`lv${i}`}>
        <line x1={u - fs * 0.3} y1={Y(h)} x2={u + fs * 0.3} y2={Y(h)} stroke="#1e3a8a" strokeWidth={fs * 0.05} />
        <text x={u - fs * 0.45} y={Y(h) + fs * 0.28} fontSize={fs * 0.68} textAnchor="end" fill="#1e3a8a" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: fs * 0.18 }}>{i === tinggiL.length - 1 ? `top ${f2(h)} m` : `${f2(h)} m`}</text>
      </g>));
  }

  const judul = arah === 'depan' ? `Potongan melintang X = ${f2(nilai)} m (dilihat dari dock)` : `Potongan samping ${arah} Z = ${f2(nilai)} m (dilihat dari dinding ${arah})`;
  return (
    <svg ref={svg} className="sim2d-potongan" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: 'Noto Sans, Arial, sans-serif', background: '#fff' }}>
      <defs>
        <marker id="pp" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" /></marker>
        <pattern id="arsirP" width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.6" height="0.6" fill="#fef9c3" /><line x1="0" y1="0" x2="0" y2="0.6" stroke="#facc15" strokeWidth="0.2" /></pattern>
      </defs>
      <text x={vb.x + fs} y={vb.y + fs * 1.6} fontSize={fs * 1.05} fontWeight={700} fill="#0f172a">{judul}</text>
      <text x={vb.x + fs} y={vb.y + fs * 2.9} fontSize={fs * 0.72} fill="#64748b">Biru = tiang · oranye = beam · kotak = posisi palet · merah = lebar lorong · abu-abu = di belakang bidang potong</text>
      {el}
    </svg>
  );
});

export default Potongan;
