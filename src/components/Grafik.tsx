'use client';
// Grafik SVG ringan (tanpa library): pie, donut, column, bar, line & combo — dengan pilihan jenis, legenda,
// tooltip saat kursor di atas grafik, tampilan tabel, dan pop-up perbesar. Satu sumbu (tidak ada dual-axis).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Palet kategori (urutan tetap, divalidasi colorblind-safe). Teks tetap memakai warna tinta, bukan warna seri. */
export const PALET_GRAFIK = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const ABU = '#a3a3a3';
const TINTA = '#1f1f1f', TINTA2 = '#6b6b6b', GARIS_GRID = '#ececec', GARIS_SUMBU = '#cfcfcf';
/** Warna kategori ke-i: 7 pertama berwarna, sisanya abu (dilipat ke "Lainnya" di pie). */
export const warnaKe = (i: number) => (i < 7 ? PALET_GRAFIK[i] : ABU);

export type JenisGrafik = 'pie' | 'donut' | 'kolom' | 'batang' | 'garis' | 'combo';
export const NAMA_JENIS: Record<JenisGrafik, string> = { pie: 'Pie', donut: 'Donut', kolom: 'Column', batang: 'Bar', garis: 'Line', combo: 'Combo' };
export interface SeriGrafik { nama: string; nilai: number[]; /** combo: digambar sebagai garis */ garis?: boolean }

/** Angka ringkas untuk sumbu: 1,2 M · 350 jt · 12 rb */
export function ringkas(v: number, awalan = '') {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  const f = (x: number, d: number) => x.toLocaleString('id-ID', { maximumFractionDigits: d });
  if (a >= 1e12) return `${s}${awalan}${f(a / 1e12, 1)} T`;
  if (a >= 1e9) return `${s}${awalan}${f(a / 1e9, 1)} M`;
  if (a >= 1e6) return `${s}${awalan}${f(a / 1e6, 1)} jt`;
  if (a >= 1e4) return `${s}${awalan}${f(a / 1e3, 0)} rb`;
  return `${s}${awalan}${f(a, a < 10 ? 2 : 0)}`;
}
export const ringkasRp = (v: number) => ringkas(v, 'Rp ');

function skala(min: number, max: number, n = 4) {
  if (!(max > min)) max = min + 1;
  const kasar = (max - min) / n;
  const p = Math.pow(10, Math.floor(Math.log10(kasar)));
  const k = ([1, 2, 2.5, 5, 10].find(m => m * p >= kasar) ?? 10) * p;
  const lo = Math.floor(min / k + 1e-9) * k, hi = Math.ceil(max / k - 1e-9) * k;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + k / 2; v += k) ticks.push(Math.round(v / k) * k);
  return { lo, hi: hi > lo ? hi : lo + k, ticks };
}
const potong = (s: string, px: number, cw = 6.2) => (s.length * cw <= px ? s : s.slice(0, Math.max(1, Math.floor(px / cw) - 1)) + '…');

function batangV(x: number, y0: number, y1: number, w: number, r = 4) {
  const h = Math.abs(y0 - y1); if (h < 0.5 || w <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return y1 < y0
    ? `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`
    : `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}
function batangH(y: number, x0: number, x1: number, h: number, r = 4) {
  const w = Math.abs(x1 - x0); if (w < 0.5 || h <= 0) return '';
  const rr = Math.min(r, w, h / 2);
  return x1 > x0
    ? `M${x0},${y}H${x1 - rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 - rr},${y + h}H${x0}Z`
    : `M${x0},${y}H${x1 + rr}Q${x1},${y} ${x1},${y + rr}V${y + h - rr}Q${x1},${y + h} ${x1 + rr},${y + h}H${x0}Z`;
}
function busur(cx: number, cy: number, r: number, r0: number, a0: number, a1: number) {
  const p = (a: number, rad: number) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  const besar = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r);
  if (r0 <= 0) return `M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${besar} 1 ${x1},${y1}Z`;
  const [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0);
  return `M${x0},${y0}A${r},${r} 0 ${besar} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${besar} 0 ${x3},${y3}Z`;
}

/** Tombol kecil yang tetap bisa diklik di dalam fieldset nonaktif (mode hanya-lihat). */
function Tombol({ on, onKlik, children, judul }: { on?: boolean; onKlik: () => void; children: React.ReactNode; judul?: string }) {
  return <span role="button" tabIndex={0} aria-pressed={on} title={judul} className={`gf-tombol${on ? ' on' : ''}`} onClick={onKlik}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKlik(); } }}>{children}</span>;
}

interface Props {
  judul: string; keterangan?: string;
  kategori: string[]; seri: SeriGrafik[];
  jenis: JenisGrafik; pilihan?: JenisGrafik[];
  fmt?: (v: number) => string; fmtSumbu?: (v: number) => string;
  tinggi?: number;
  /** seri tunggal: tiap kategori punya warna sendiri (sama dengan pie / tabel) */
  warnaPerKategori?: boolean;
  /** pie / donut tanpa daftar legenda (mis. bila angka besar di sampingnya sudah jadi legenda) */
  tanpaLegenda?: boolean;
  /** teks di tengah donut (default: total) */
  tengah?: string;
}

export default function Grafik(p: Props) {
  const [jenis, setJenis] = useState<JenisGrafik>(p.jenis);
  const [tabel, setTabel] = useState(false);
  const [besar, setBesar] = useState(false);
  useEffect(() => {
    if (!besar) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setBesar(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [besar]);
  const alat = (dlmModal: boolean) => <div className="gf-alat">
    {p.pilihan && p.pilihan.length > 1 && <span className="gf-jenis" role="group" aria-label="Jenis grafik">
      {p.pilihan.map(j => <Tombol key={j} on={jenis === j} onKlik={() => setJenis(j)}>{NAMA_JENIS[j]}</Tombol>)}</span>}
    {!dlmModal && <Tombol on={tabel} onKlik={() => setTabel(!tabel)} judul="Tampilkan sebagai tabel">Tabel</Tombol>}
    {!dlmModal ? <Tombol onKlik={() => setBesar(true)} judul="Perbesar">⤢</Tombol> : <Tombol onKlik={() => setBesar(false)} judul="Tutup">✕</Tombol>}
  </div>;
  return <div className="gf">
    <div className="gf-kepala"><div className="gf-judul"><b>{p.judul}</b>{p.keterangan && <span className="small muted">{p.keterangan}</span>}</div>{alat(false)}</div>
    {tabel ? <TabelData {...p} /> : <Kanvas {...p} jenis={jenis} tinggi={p.tinggi ?? 220} />}
    {besar && typeof document !== 'undefined' && createPortal(
      <div className="pb-lapis" onMouseDown={e => { if (e.target === e.currentTarget) setBesar(false); }}>
        <div className="pb-modal" role="dialog" aria-modal="true" aria-label={p.judul}>
          <div className="pb-kepala"><div><div className="small muted">Grafik</div><h2 style={{ margin: 0 }}>{p.judul}</h2></div><span style={{ flex: 1 }} />{alat(true)}</div>
          <Kanvas {...p} jenis={jenis} tinggi={Math.max(320, Math.min(520, Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.55)))} besar />
          <TabelData {...p} />
        </div>
      </div>, document.body)}
  </div>;
}

function TabelData({ kategori, seri, fmt = v => ringkas(v) }: Props) {
  const satu = seri.length === 1;
  const tot = satu ? seri[0].nilai.reduce((a, v) => a + Math.max(0, v), 0) || 1 : 1;
  return <div className="tablewrap gf-tabel"><table>
    <thead><tr><th>{' '}</th>{seri.map(s => <th key={s.nama} className="num">{s.nama}</th>)}{satu && <th className="num">%</th>}</tr></thead>
    <tbody>{kategori.map((k, i) => <tr key={k + i}><td>{k}</td>{seri.map(s => <td key={s.nama} className="num">{fmt(s.nilai[i] ?? 0)}</td>)}
      {satu && <td className="num">{((Math.max(0, seri[0].nilai[i] ?? 0) / tot) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</td>}</tr>)}</tbody>
  </table></div>;
}

function useLebar() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(Math.floor(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(es => { const x = Math.floor(es[0].contentRect.width); setW(o => (Math.abs(o - x) > 1 ? x : o)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Kanvas({ kategori, seri, jenis, fmt = v => ringkas(v), fmtSumbu, tinggi = 220, warnaPerKategori, tanpaLegenda, tengah, judul, besar }: Props & { tinggi: number; besar?: boolean }) {
  const [ref, w] = useLebar();
  const [hover, setHover] = useState<number | null>(null);
  const fs = fmtSumbu ?? (v => ringkas(v));
  const n = kategori.length;
  if (!n || !seri.length) return <div ref={ref} className="gf-kosong small muted">Belum ada data.</div>;

  // ---------- pie / donut
  if (jenis === 'pie' || jenis === 'donut') {
    const nilai = seri[0].nilai.map(v => Math.max(0, v || 0));
    let isi = kategori.map((k, i) => ({ k, v: nilai[i], warna: warnaKe(i), i }));
    isi = isi.filter(x => x.v > 0);
    if (isi.length > 8) {
      const atas = isi.slice(0, 7), sisa = isi.slice(7);
      isi = [...atas, { k: `Lainnya (${sisa.length})`, v: sisa.reduce((a, x) => a + x.v, 0), warna: ABU, i: -1 }];
    }
    const tot = isi.reduce((a, x) => a + x.v, 0);
    const legendaSamping = !tanpaLegenda && w >= 460;
    const d = Math.max(120, Math.min(tinggi, legendaSamping ? w * 0.45 : w - 8));
    const r = d / 2 - 4, r0 = jenis === 'donut' ? r * 0.6 : 0;
    let a = 0;
    const irisan = isi.map(x => { const a0 = a; a += (x.v / (tot || 1)) * Math.PI * 2; return { ...x, a0, a1: a }; });
    const aktif = hover != null ? irisan[hover] : null;
    return <div ref={ref} className={`gf-pie${legendaSamping ? ' samping' : ''}`}>
      <div className="gf-plot" style={{ width: d, height: d }} onMouseLeave={() => setHover(null)}>
        <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} role="img" aria-label={`${judul}: ${isi.map(x => `${x.k} ${Math.round((x.v / (tot || 1)) * 100)}%`).join(', ')}`}>
          {irisan.length === 1
            ? <circle cx={d / 2} cy={d / 2} r={r0 ? (r + r0) / 2 : r} fill={r0 ? 'none' : irisan[0].warna} stroke={r0 ? irisan[0].warna : 'none'} strokeWidth={r0 ? r - r0 : 0} onMouseEnter={() => setHover(0)} />
            : irisan.map((x, j) => <path key={x.k} d={busur(d / 2, d / 2, hover === j ? r + 3 : r, r0, x.a0, x.a1)} fill={x.warna} stroke="#fff" strokeWidth={2} strokeLinejoin="round"
              opacity={hover == null || hover === j ? 1 : 0.55} onMouseEnter={() => setHover(j)} />)}
          {r0 > 0 && <text x={d / 2} y={d / 2 - 2} textAnchor="middle" fontSize={Math.max(12, Math.min(18, r0 / 3.2))} fontWeight={700} fill={TINTA}>
            {aktif ? `${Math.round((aktif.v / (tot || 1)) * 1000) / 10}%` : (tengah ?? fs(tot))}</text>}
          {r0 > 0 && <text x={d / 2} y={d / 2 + 14} textAnchor="middle" fontSize={11} fill={TINTA2}>{aktif ? potong(aktif.k, r0 * 1.6) : 'total'}</text>}
        </svg>
        {aktif && r0 === 0 && <div className="gf-tip" style={{ left: d / 2, top: 6 }}><b>{aktif.k}</b><div>{fmt(aktif.v)} · {(Math.round((aktif.v / (tot || 1)) * 1000) / 10).toLocaleString('id-ID')}%</div></div>}
      </div>
      {!tanpaLegenda && <ul className="gf-legenda-pie">{irisan.map((x, j) => <li key={x.k} className={hover === j ? 'on' : ''} onMouseEnter={() => setHover(j)} onMouseLeave={() => setHover(null)}>
        <i style={{ background: x.warna }} /><span>{x.k}</span><b>{(Math.round((x.v / (tot || 1)) * 1000) / 10).toLocaleString('id-ID')}%</b><em>{fmt(x.v)}</em></li>)}</ul>}
    </div>;
  }

  // ---------- kartesius: kolom, batang, garis, combo
  const lebar = Math.max(240, w || 560);
  const combo = jenis === 'combo';
  const dasarSeri = seri.map((s, i) => ({ ...s, warna: PALET_GRAFIK[i % PALET_GRAFIK.length] }));
  let kolom = jenis === 'garis' ? [] : dasarSeri.filter(s => !(combo && s.garis));
  let garis = jenis === 'garis' ? dasarSeri : combo ? dasarSeri.filter(s => s.garis) : [];
  if (combo && !garis.length && kolom.length === 1) {   // Pareto: kolom + garis kumulatif (satuan sama, satu sumbu)
    let c = 0; garis = [{ nama: 'Kumulatif', nilai: kolom[0].nilai.map(v => (c += v || 0)), warna: '#4a4a4a' }];
  }
  if (combo && !kolom.length) { kolom = garis.slice(0, 1); garis = garis.slice(1); }
  const perKat = !!warnaPerKategori && kolom.length === 1;
  const warnaKolom = (s: typeof kolom[number], i: number) => (perKat ? warnaKe(i) : s.warna);
  const semua = [...kolom, ...garis].flatMap(s => s.nilai.map(v => v || 0));
  const { lo, hi, ticks } = skala(Math.min(0, ...semua), Math.max(0, ...semua));
  const legenda = [...kolom, ...garis].length >= 2 && <div className="gf-legenda">{[...kolom.map(s => ({ ...s, g: false })), ...garis.map(s => ({ ...s, g: true }))].map(s =>
    <span key={s.nama}><i className={s.g ? 'g' : ''} style={s.g ? { borderColor: s.warna } : { background: perKat ? '#8a8a8a' : s.warna }} />{s.nama}</span>)}</div>;
  const tip = (i: number) => <><b>{kategori[i]}</b>{[...kolom.map(s => ({ ...s, warna: warnaKolom(s, i) })), ...garis].map(s => <div key={s.nama}><i style={{ background: s.warna }} />{s.nama}: <b>{fmt(s.nilai[i] ?? 0)}</b></div>)}</>;

  if (jenis === 'batang') {
    const m = kolom.length;
    const tinggiBaris = Math.max(besar ? 30 : 22, m * (besar ? 16 : 12) + 10);
    const labW = Math.min(lebar * 0.38, Math.max(60, Math.max(...kategori.map(k => k.length)) * 6.2 + 10));
    const atas = 4, bawah = 20, kanan = m === 1 ? 64 : 12;
    const h = n * tinggiBaris + atas + bawah;
    const sx = (v: number) => labW + ((v - lo) / (hi - lo)) * (lebar - labW - kanan);
    const x0 = sx(0);
    const tb = Math.min(besar ? 22 : 16, (tinggiBaris - 8 - 2 * (m - 1)) / m);
    return <div ref={ref} className="gf-kart">{legenda}
      <div className="gf-plot" onMouseLeave={() => setHover(null)}>
        <svg width={lebar} height={h} role="img" aria-label={judul}>
          {ticks.map(t => <g key={t}><line x1={sx(t)} x2={sx(t)} y1={atas} y2={h - bawah} stroke={t === 0 ? GARIS_SUMBU : GARIS_GRID} />
            <text x={sx(t)} y={h - 6} fontSize={10.5} textAnchor="middle" fill={TINTA2}>{fs(t)}</text></g>)}
          {kategori.map((k, i) => { const y = atas + i * tinggiBaris; const gy = y + (tinggiBaris - (m * tb + 2 * (m - 1))) / 2;
            return <g key={k + i} onMouseEnter={() => setHover(i)}>
              <rect x={0} y={y} width={lebar} height={tinggiBaris} fill={hover === i ? 'rgba(0,0,0,.04)' : 'transparent'} />
              <text x={labW - 8} y={y + tinggiBaris / 2 + 4} fontSize={11.5} textAnchor="end" fill={TINTA}>{potong(k, labW - 12)}</text>
              {kolom.map((s, j) => <path key={s.nama} d={batangH(gy + j * (tb + 2), x0, sx(s.nilai[i] || 0), tb)} fill={warnaKolom(s, i)} />)}
              {m === 1 && <text x={Math.max(x0, sx(kolom[0].nilai[i] || 0)) + 5} y={y + tinggiBaris / 2 + 4} fontSize={10.5} fill={TINTA2}>{fs(kolom[0].nilai[i] || 0)}</text>}
            </g>; })}
        </svg>
        {hover != null && <div className="gf-tip" style={{ left: Math.min(lebar - 90, Math.max(90, sx(Math.max(...kolom.map(s => s.nilai[hover] || 0))))), top: atas + hover * tinggiBaris + tinggiBaris }}>{tip(hover)}</div>}
      </div></div>;
  }

  const atas = 10, bawah = 26, kiri = Math.max(42, Math.max(...ticks.map(t => fs(t).length)) * 6 + 10), kanan = 10;
  const h = tinggi;
  const pw = lebar - kiri - kanan, ph = h - atas - bawah;
  const band = pw / n;
  const sy = (v: number) => atas + ph - ((v - lo) / (hi - lo)) * ph;
  const y0 = sy(0);
  const m = kolom.length;
  const grupW = Math.min(band * 0.74, m * (besar ? 48 : 36) + 2 * (m - 1));
  const bw = m ? (grupW - 2 * (m - 1)) / m : 0;
  const cx = (i: number) => kiri + band * i + band / 2;
  const langkahLabel = Math.max(1, Math.ceil(56 / band));
  return <div ref={ref} className="gf-kart">{legenda}
    <div className="gf-plot" onMouseLeave={() => setHover(null)}>
      <svg width={lebar} height={h} role="img" aria-label={judul}>
        {ticks.map(t => <g key={t}><line x1={kiri} x2={lebar - kanan} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? GARIS_SUMBU : GARIS_GRID} />
          <text x={kiri - 6} y={sy(t) + 3.5} fontSize={10.5} textAnchor="end" fill={TINTA2}>{fs(t)}</text></g>)}
        {kategori.map((k, i) => <g key={k + i} onMouseEnter={() => setHover(i)}>
          <rect x={kiri + band * i} y={atas} width={band} height={ph} fill={hover === i ? 'rgba(0,0,0,.04)' : 'transparent'} />
          {kolom.map((s, j) => <path key={s.nama} d={batangV(cx(i) - grupW / 2 + j * (bw + 2), y0, sy(s.nilai[i] || 0), bw)} fill={warnaKolom(s, i)} />)}
          {i % langkahLabel === 0 && <text x={cx(i)} y={h - 9} fontSize={10.5} textAnchor="middle" fill={TINTA2}>{potong(k, band * langkahLabel - 6, 5.9)}</text>}
        </g>)}
        {garis.map(s => <g key={s.nama} pointerEvents="none">
          <polyline points={s.nilai.map((v, i) => `${cx(i)},${sy(v || 0)}`).join(' ')} fill="none" stroke={s.warna} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {s.nilai.map((v, i) => <circle key={i} cx={cx(i)} cy={sy(v || 0)} r={hover === i ? 5 : 4} fill={s.warna} stroke="#fff" strokeWidth={2} />)}
        </g>)}
      </svg>
      {hover != null && <div className="gf-tip" style={{ left: Math.min(lebar - 90, Math.max(90, cx(hover))), top: atas }}>{tip(hover)}</div>}
    </div></div>;
}
