'use client';
// Leca Game · tampilan 2D tampak atas (gaya simulasi CLASS): denah, okupansi rak, palet staging, truk di dock dengan
// bar isi, antrean truk, bar lampu lalu lintas (staging / dock), MHE & pekerja bergerak, dan peta alur (flow) opsional.
// Membaca keadaan Dunia + posisi aktor yang ditulis lapisan 3D tiap frame (kontrol.aktor2d), jadi 2D & 3D selalu sinkron.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ARMADA, jenisTrukDari, type Dunia } from '@/lib/game';
import type { LayoutGudang } from '@/lib/simulasi3d/layout';
import { WARNA_ORANG } from '../warna';
import type { Aktor2D, KontrolGame, Pilihan } from './lapisan3d';
import { LABEL_TUGAS } from './panel';

const PANJANG_TRUK: Record<string, number> = { cde: 5.0, cdd: 6.6, fuso: 7.6, tronton: 10.5, container20: 10.5, container: 16.5 };
const lampu = (r: number) => (r >= 0.85 ? '#dc2626' : r >= 0.6 ? '#f59e0b' : '#16a34a');
type Kotak = { x0: number; x1: number; z0: number; z1: number };
interface GrupSlot { x: number; z: number; ids: string[]; kap: number; w: number; d: number }

export interface Opsi2D { alur: boolean; okupansi: boolean; label: boolean }
/** Grid tapak palet di area staging (sama dengan susunan palet di 3D): kolom 1,3 m, baris 1,2 m. */
export function gridStaging(a: Kotak) {
  const xs: number[] = [], zs: number[] = [];
  for (let x = a.x1 - 0.9; x >= a.x0 + 3.2; x -= 1.3) xs.push(x);
  for (let z = a.z0 + 0.9; z <= a.z1 - 0.9; z += 1.2) zs.push(z);
  if (!xs.length) xs.push((a.x0 + a.x1) / 2); if (!zs.length) zs.push((a.z0 + a.z1) / 2);
  return { xs, zs, kap: xs.length * zs.length };
}

export default function Sim2D({ dunia: d, layout: L, kontrol, pilih, onPilih, opsi }: {
  dunia: Dunia; layout: LayoutGudang; kontrol: { current: KontrolGame }; pilih: Pilihan | null; onPilih: (p: Pilihan | null) => void; opsi: Opsi2D;
}) {
  const wadah = useRef<HTMLDivElement>(null);
  const kanvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ s: 8, ox: 40, oy: 40 });
  const seret = useRef<{ x: number; y: number; ox: number; oy: number; gerak: boolean } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; teks: string } | null>(null);
  const [skala, setSkala] = useState(8);
  const opsiRef = useRef(opsi); opsiRef.current = opsi;
  const pilihRef = useRef(pilih); pilihRef.current = pilih;

  // ---------- data statis per dunia / layout
  const statis = useMemo(() => {
    // slot simpan dikelompokkan per titik tampak atas (level ditumpuk)
    const grup = new Map<string, GrupSlot>();
    for (const l of d.lokasi.values()) {
      if (l.tipe !== 'rak' && l.tipe !== 'lantai') continue;
      const k = `${l.x.toFixed(2)}|${l.z.toFixed(2)}`;
      const g = grup.get(k) ?? { x: l.x, z: l.z, ids: [], kap: 0, w: 1.0, d: 1.0 };
      g.ids.push(l.id); g.kap += l.kapasitas; grup.set(k, g);
    }
    // ukuran tapak palet mengikuti baris rak tempat slot berada
    for (const g of grup.values()) {
      const r = L.rak.find(r0 => { const pj = r0.nBay * r0.bayW; return r0.arah === 'z' ? g.x >= r0.x0 - 0.01 && g.x <= r0.x0 + r0.depth + 0.01 && g.z >= r0.z0 - 0.01 && g.z <= r0.z0 + pj + 0.01 : g.x >= r0.x0 - 0.01 && g.x <= r0.x0 + pj + 0.01 && g.z >= r0.z0 - 0.01 && g.z <= r0.z0 + r0.depth + 0.01; });
      if (r) { const sep = (r.bayW / r.ppl) * 0.82, mel = (r.depth / r.deep) * 0.82; if (r.arah === 'z') { g.w = mel; g.d = sep; } else { g.w = sep; g.d = mel; } }
      else { g.w = 1.15; g.d = 0.95; }
    }
    const dIn = L.dock.filter(x => x.arus === 'inbound'), dOut = L.dock.filter(x => x.arus === 'outbound');
    const zDock = new Map<string, number>();
    for (const dk of d.dock) { const arr = dk.arus === 'inbound' ? dIn : dOut; const i = Number(dk.id.slice(2)) - 1; zDock.set(dk.id, arr[i % Math.max(1, arr.length)]?.z ?? (dk.arus === 'inbound' ? L.stagingIn.z0 + 3 : L.stagingOut.z1 - 3)); }
    // area simpan untuk peta alur: zona rak / block
    const area = L.zona.filter(z => z.jenis === 'spr' || z.jenis === 'ddr' || z.jenis === 'block' || z.jenis === 'floor');
    const stgIn = [...d.lokasi.values()].find(l => l.tipe === 'staging_in')!, stgOut = [...d.lokasi.values()].find(l => l.tipe === 'staging_out')!;
    return { grup: [...grup.values()], zDock, area, stgIn, stgOut };
  }, [d, L]);

  // ---------- peta alur (dihitung ulang paling sering tiap 1 detik)
  const alurRef = useRef<{ t: number; seq: number; per: { a: Kotak; label: string; n: number }[]; masuk: number; keluar: number } | null>(null);
  const hitungAlur = () => {
    const now = performance.now(); const a = alurRef.current;
    if (a && (a.seq === d.seq || now - a.t < 1000)) return a;
    // kelompokkan area rak per zona induk (zona rak editor = 1 baris; gabungkan yang bertumpuk dalam kolom yang sama)
    const per = new Map<string, { a: Kotak; label: string; n: number }>();
    let masuk = 0, keluar = 0;
    for (const t of d.tugas.values()) {
      if (t.status !== 'selesai') continue;
      if (t.jenis === 'bongkar') masuk += t.qty;
      if (t.jenis === 'muat') keluar += t.qty;
      if (t.jenis !== 'putaway' || !t.ke) continue;
      const lok = d.lokasi.get(t.ke); if (!lok) continue;
      const z = statis.area.find(zz => lok.x >= zz.x0 - 0.05 && lok.x <= zz.x1 + 0.05 && lok.z >= zz.z0 - 0.05 && lok.z <= zz.z1 + 0.05);
      const kunci = z ? `${z.jenis}|${Math.round(z.x0)}|${Math.round(z.x1)}` : 'lain';
      const e = per.get(kunci) ?? { a: z ? { x0: z.x0, x1: z.x1, z0: z.z0, z1: z.z1 } : { x0: lok.x, x1: lok.x, z0: lok.z, z1: lok.z }, label: z?.label ?? 'Simpan', n: 0 };
      if (z) { e.a.z0 = Math.min(e.a.z0, z.z0); e.a.z1 = Math.max(e.a.z1, z.z1); }
      e.n++; per.set(kunci, e);
    }
    alurRef.current = { t: now, seq: d.seq, per: [...per.values()], masuk, keluar };
    return alurRef.current;
  };

  const pasLayar = () => {
    const el = wadah.current; if (!el || !el.clientWidth || !el.clientHeight) return;
    const x0 = -30, x1 = L.L + 3, z0 = -12, z1 = L.W + 12;
    const s = Math.min(el.clientWidth / (x1 - x0), el.clientHeight / (z1 - z0));
    view.current = { s, ox: (el.clientWidth - (x1 - x0) * s) / 2 - x0 * s, oy: (el.clientHeight - (z1 - z0) * s) / 2 - z0 * s };
    setSkala(s);
  };

  // ---------- loop gambar
  useEffect(() => {
    const el = wadah.current!, cv = kanvas.current!;
    const ukur = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = el.clientWidth * dpr; cv.height = el.clientHeight * dpr; cv.style.width = `${el.clientWidth}px`; cv.style.height = `${el.clientHeight}px`; };
    const ro = new ResizeObserver(() => { const awal = !cv.width; ukur(); if (awal) pasLayar(); }); ro.observe(el); ukur(); pasLayar();
    let id = 0;
    const g = cv.getContext('2d')!;
    const loop = () => {
      id = requestAnimationFrame(loop);
      if (!el.clientWidth) return;
      const dpr = cv.width / Math.max(1, el.clientWidth);
      const { s, ox, oy } = view.current; const o = opsiRef.current;
      const X = (x: number) => ox + x * s, Y = (z: number) => oy + z * s;
      const rect = (x0: number, z0: number, w: number, h: number) => g.rect(X(x0), Y(z0), w * s, h * s);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#eef2f6'; g.fillRect(0, 0, el.clientWidth, el.clientHeight);
      const fs = (m: number, min = 9, max = 15) => Math.max(min, Math.min(max, m * s));
      const teks = (t: string, x: number, z: number, ukuran: number, warna = '#0f172a', rata: CanvasTextAlign = 'center', tebal = 600) => {
        g.font = `${tebal} ${ukuran}px "Noto Sans", Arial, sans-serif`; g.textAlign = rata; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(t, X(x), Y(z)); g.fillStyle = warna; g.fillText(t, X(x), Y(z));
      };
      // halaman & apron
      g.fillStyle = '#dfe3e8'; g.fillRect(X(-28), Y(-11), 28 * s, (L.W + 22) * s);
      g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, 0.12 * s); g.setLineDash([0.8 * s, 0.6 * s]);
      g.beginPath(); g.moveTo(X(-17), Y(-10)); g.lineTo(X(-17), Y(L.W + 10)); g.stroke(); g.setLineDash([]);
      // lantai gudang
      g.fillStyle = '#ffffff'; g.fillRect(X(0), Y(0), L.L * s, L.W * s);
      // zona
      for (const z of L.zona) {
        if (z.jenis === 'spr' || z.jenis === 'ddr') continue;
        const warna = z.jenis === 'stagingIn' ? ['#dbeafe', '#2563eb'] : z.jenis === 'stagingOut' ? ['#d1fae5', '#059669'] : z.jenis === 'jalur' ? ['#fef9c3', '#eab308'] : z.jenis === 'block' || z.jenis === 'floor' ? ['#faf3e6', '#a16207'] : [z.warna ?? '#e0f2fe', '#0284c7'];
        g.fillStyle = warna[0]; g.globalAlpha = z.jenis === 'custom' ? 0.5 : 1; g.fillRect(X(z.x0), Y(z.z0), (z.x1 - z.x0) * s, (z.z1 - z.z0) * s); g.globalAlpha = 1;
        // arsir diagonal (gaya CLASS)
        if (z.jenis === 'stagingIn' || z.jenis === 'stagingOut' || z.jenis === 'jalur') {
          g.save(); g.beginPath(); rect(z.x0, z.z0, z.x1 - z.x0, z.z1 - z.z0); g.clip();
          g.strokeStyle = warna[1]; g.globalAlpha = 0.25; g.lineWidth = 1; g.beginPath();
          const lang = 1.2 * s; for (let t = X(z.x0) - (z.z1 - z.z0) * s; t < X(z.x1); t += lang) { g.moveTo(t, Y(z.z1)); g.lineTo(t + (z.z1 - z.z0) * s, Y(z.z0)); }
          g.stroke(); g.restore(); g.globalAlpha = 1;
        }
        g.strokeStyle = warna[1]; g.lineWidth = 1.2; g.strokeRect(X(z.x0), Y(z.z0), (z.x1 - z.x0) * s, (z.z1 - z.z0) * s);
      }
      // fasilitas
      for (const f of L.fasilitas) { g.fillStyle = '#f3f0ff'; g.strokeStyle = '#6d28d9'; g.lineWidth = 1.2; g.fillRect(X(f.x0), Y(f.z0), (f.x1 - f.x0) * s, (f.z1 - f.z0) * s); g.strokeRect(X(f.x0), Y(f.z0), (f.x1 - f.x0) * s, (f.z1 - f.z0) * s); }
      for (const k of L.kolom ?? []) { g.fillStyle = '#475569'; g.fillRect(X(k.x), Y(k.z), Math.max(2, k.w * s), Math.max(2, k.d * s)); }
      // rak
      for (const r of L.rak) {
        const pj = r.nBay * r.bayW; const w = r.arah === 'z' ? r.depth : pj, h = r.arah === 'z' ? pj : r.depth;
        g.fillStyle = r.jenis === 'ddr' ? '#e3ebf7' : '#edf3fb'; g.fillRect(X(r.x0), Y(r.z0), w * s, h * s);
        g.strokeStyle = '#1e56a0'; g.lineWidth = 1; g.strokeRect(X(r.x0), Y(r.z0), w * s, h * s);
        if (s > 3) { g.beginPath(); for (let b = 1; b < r.nBay; b++) { if (r.arah === 'z') { g.moveTo(X(r.x0), Y(r.z0 + b * r.bayW)); g.lineTo(X(r.x0 + r.depth), Y(r.z0 + b * r.bayW)); } else { g.moveTo(X(r.x0 + b * r.bayW), Y(r.z0)); g.lineTo(X(r.x0 + b * r.bayW), Y(r.z0 + r.depth)); } } g.strokeStyle = 'rgba(30,86,160,.45)'; g.stroke(); }
        // muka lorong (beam) oranye
        g.strokeStyle = '#f97316'; g.lineWidth = Math.max(1.5, 0.12 * s); g.beginPath();
        if (r.arah === 'z') { const xm = r.hadap === 1 ? r.x0 + r.depth : r.x0; g.moveTo(X(xm), Y(r.z0)); g.lineTo(X(xm), Y(r.z0 + pj)); }
        else { const zm = r.hadap === 1 ? r.z0 + r.depth : r.z0; g.moveTo(X(r.x0), Y(zm)); g.lineTo(X(r.x0 + pj), Y(zm)); }
        g.stroke();
      }
      // okupansi slot simpan (warna makin gelap = makin banyak level terisi)
      if (o.okupansi) for (const gr of statis.grup) {
        let isi = 0; for (const lid of gr.ids) isi += d.lokasi.get(lid)!.lpn.length;
        if (!isi) continue; const r = Math.min(1, isi / Math.max(1, gr.kap));
        g.fillStyle = `rgba(180, 120, 40, ${0.25 + 0.65 * r})`;
        g.fillRect(X(gr.x - gr.w / 2), Y(gr.z - gr.d / 2), gr.w * s, gr.d * s);
      }
      // label zona simpan
      if (o.label) for (const z of L.zona) if ((z.jenis === 'spr' || z.jenis === 'ddr' || z.jenis === 'block' || z.jenis === 'floor') && (z.x1 - z.x0) * s > 60 && z.z1 - z.z0 > 3) teks(z.label, (z.x0 + z.x1) / 2, z.z0 - 0.0 + Math.min(1.2, (z.z1 - z.z0) / 2), fs(0.9, 10, 13), '#1e3a8a');
      // palet staging + bar lampu lalu lintas
      for (const [lok, a, nama] of [[statis.stgIn, L.stagingIn, 'Staging inbound'], [statis.stgOut, L.stagingOut, 'Staging outbound']] as const) {
        const { xs, zs, kap: nTapak } = gridStaging(a);
        for (let i = 0; i < Math.min(lok.lpn.length, nTapak); i++) {
          const tum = Math.floor(lok.lpn.length / nTapak) + (i < lok.lpn.length % nTapak ? 1 : 0);
          const x = xs[i % xs.length], z = zs[Math.floor(i / xs.length)];
          g.fillStyle = tum > 1 ? '#92400e' : '#c08a4a'; g.fillRect(X(x - 0.5), Y(z - 0.45), s, 0.9 * s);
        }
        const r = lok.lpn.length / Math.max(1, nTapak);
        const bx = a.x0 + 0.4, bz = a.z0 + 0.35, bw = Math.max(1, a.x1 - a.x0 - 0.8);
        g.fillStyle = '#e5e7eb'; g.fillRect(X(bx), Y(bz), bw * s, Math.max(3, 0.35 * s));
        g.fillStyle = lampu(r); g.fillRect(X(bx), Y(bz), Math.min(1, r) * bw * s, Math.max(3, 0.35 * s));
        if (o.label) teks(`${nama} ${lok.lpn.length}/${nTapak} tapak`, (a.x0 + a.x1) / 2, a.z1 - 0.7, fs(0.8, 9, 12), r >= 0.85 ? '#b91c1c' : '#0f172a');
      }
      // dinding + pintu dock
      g.strokeStyle = '#0f172a'; g.lineWidth = Math.max(2, 0.25 * s); g.strokeRect(X(0), Y(0), L.L * s, L.W * s);
      let nIn = 0, nOut = 0;
      for (const dk of L.dock) {
        g.fillStyle = '#ffffff'; g.fillRect(X(-0.3), Y(dk.z - 1.6), 0.6 * s, 3.2 * s);
        g.strokeStyle = dk.arus === 'inbound' ? '#2563eb' : '#059669'; g.lineWidth = Math.max(2, 0.2 * s); g.strokeRect(X(-0.3), Y(dk.z - 1.6), 0.6 * s, 3.2 * s);
        teks(dk.arus === 'inbound' ? `IN ${++nIn}` : `OUT ${++nOut}`, 1.4, dk.z, fs(0.7, 8, 11), dk.arus === 'inbound' ? '#1d4ed8' : '#047857', 'left');
      }
      // truk di dock: kotak muatan dengan bar isi (biru tua = muatan di truk)
      const trukKotak: { id: string; k: Kotak }[] = [];
      const gambarTruk = (id: string, xKepala: number, z: number, vertikal: boolean) => {
        const tr = d.truk.get(id); if (!tr) return;
        const jenis = tr.jenis ?? jenisTrukDari(tr.arus === 'inbound' ? tr.palet.length : 20); const pj = PANJANG_TRUK[jenis] ?? 8;
        let isi = 0;
        if (tr.arus === 'inbound') isi = tr.palet.length ? tr.sisaTugas / tr.palet.length : 0;
        else { const o2 = tr.order.map(x => d.order.get(x)); isi = o2.length ? o2.filter(x => x && (x.status === 'dimuat' || x.status === 'terkirim')).length / o2.length : 0; }
        const warna = tr.arus === 'inbound' ? '#1e3a8a' : '#065f46';
        const lebar = 2.4;
        const k: Kotak = vertikal ? { x0: xKepala - lebar / 2, x1: xKepala + lebar / 2, z0: z - pj - 1.8, z1: z } : { x0: xKepala - pj - 1.8, x1: xKepala, z0: z - lebar / 2, z1: z + lebar / 2 };
        trukKotak.push({ id, k });
        // kabin
        g.fillStyle = warna;
        if (vertikal) g.fillRect(X(k.x0), Y(k.z0), lebar * s, 1.6 * s); else g.fillRect(X(k.x0), Y(k.z0), 1.6 * s, lebar * s);
        // bak
        const bx0 = vertikal ? k.x0 : k.x0 + 1.8, bz0 = vertikal ? k.z0 + 1.8 : k.z0, bw = vertikal ? lebar : pj, bh = vertikal ? pj : lebar;
        g.fillStyle = '#ffffff'; g.fillRect(X(bx0), Y(bz0), bw * s, bh * s);
        g.fillStyle = warna; g.globalAlpha = 0.85;
        if (vertikal) g.fillRect(X(bx0), Y(bz0), bw * s, bh * isi * s); else g.fillRect(X(bx0), Y(bz0), bw * isi * s, bh * s);
        g.globalAlpha = 1; g.strokeStyle = warna; g.lineWidth = 1.2; g.strokeRect(X(bx0), Y(bz0), bw * s, bh * s);
        if (pilihRef.current?.jenis === 'truk' && pilihRef.current.id === id) { g.strokeStyle = '#f97316'; g.lineWidth = 3; g.strokeRect(X(k.x0) - 3, Y(k.z0) - 3, (k.x1 - k.x0) * s + 6, (k.z1 - k.z0) * s + 6); }
        if (o.label && s > 5 && !vertikal) teks(`${ARMADA[jenis].nama} ${tr.arus === 'inbound' ? `${tr.palet.length} plt` : `${tr.order.length} order`}`, k.x0 + (k.x1 - k.x0) / 2 + 0.9, z + lebar / 2 + 0.7, fs(0.65, 8, 11), warna);
      };
      for (const dk of d.dock) if (dk.truk) gambarTruk(dk.truk, -0.5, statis.zDock.get(dk.id) ?? 0, false);
      d.antreDock.inbound.slice(0, 10).forEach((id, i) => gambarTruk(id, -26 + i * 3.1, -1.2, true));
      d.antreDock.outbound.slice(0, 10).forEach((id, i) => gambarTruk(id, -26 + i * 3.1, L.W + 10.8, true));
      if (d.antreDock.inbound.length) teks(`Antre inbound: ${d.antreDock.inbound.length} truk`, -27.5, -10.4, fs(0.75, 9, 12), '#1e3a8a', 'left');
      if (d.antreDock.outbound.length) teks(`Antre outbound: ${d.antreDock.outbound.length} truk`, -27.5, L.W + 11.4, fs(0.75, 9, 12), '#065f46', 'left');
      // peta alur (CLASS "Animate": hubungan alur dengan area layout)
      if (o.alur) {
        const al = hitungAlur(); const maks = Math.max(1, ...al.per.map(p => p.n));
        const garis = (x0: number, z0: number, x1: number, z1: number, warna: string, tebal: number, lbl?: string) => {
          g.strokeStyle = warna; g.lineWidth = tebal; g.globalAlpha = 0.65; g.beginPath(); g.moveTo(X(x0), Y(z0));
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2 - Math.abs(x1 - x0) * 0.12;
          g.quadraticCurveTo(X(mx), Y(mz), X(x1), Y(z1)); g.stroke(); g.globalAlpha = 1;
          if (lbl) teks(lbl, mx, (z0 + z1) / 2 - Math.abs(x1 - x0) * 0.06, fs(0.7, 9, 12), warna);
        };
        const si = L.stagingIn, so = L.stagingOut;
        const ci = { x: (si.x0 + si.x1) / 2, z: (si.z0 + si.z1) / 2 }, co = { x: (so.x0 + so.x1) / 2, z: (so.z0 + so.z1) / 2 };
        for (const dk of L.dock) garis(-0.3, dk.z, dk.arus === 'inbound' ? ci.x : co.x, dk.arus === 'inbound' ? ci.z : co.z, dk.arus === 'inbound' ? '#2563eb' : '#059669', 1.5);
        for (const p of al.per) {
          const cx = (p.a.x0 + p.a.x1) / 2, cz = (p.a.z0 + p.a.z1) / 2; const t = 1.5 + 6 * (p.n / maks);
          garis(ci.x, ci.z, cx, cz, '#16a34a', t, `${p.n} plt putaway`);
          garis(cx, cz, co.x, co.z, '#0891b2', Math.max(1.5, t * 0.6));
        }
        teks(`Masuk ${al.masuk} plt · Muat ${al.keluar} plt`, ci.x, si.z0 - 0.9, fs(0.75, 9, 12), '#1e3a8a');
      }
      // aktor: MHE (glyph forklift) & pekerja (lingkaran warna peran)
      const aktor = kontrol.current.aktor2d ?? [];
      const pl = pilihRef.current;
      for (const a of aktor) {
        if (a.jenis !== 'mhe') continue;
        const ux = Math.cos(a.rot), uz = -Math.sin(a.rot);   // arah hadap di bidang (x, z)
        const px = -uz, pz = ux;
        const titik = (f: number, l: number) => [X(a.x + ux * f + px * l), Y(a.z + uz * f + pz * l)] as const;
        const badan = [titik(-0.9, -0.55), titik(0.5, -0.55), titik(0.5, 0.55), titik(-0.9, 0.55)];
        g.beginPath(); badan.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
        g.fillStyle = a.sibuk ? '#dc2626' : '#94a3b8'; g.fill(); g.strokeStyle = '#7f1d1d'; g.lineWidth = 1; g.stroke();
        g.strokeStyle = '#334155'; g.lineWidth = Math.max(1, 0.12 * s); g.beginPath();
        for (const l of [-0.3, 0.3]) { const [x1, y1] = titik(0.5, l), [x2, y2] = titik(1.6, l); g.moveTo(x1, y1); g.lineTo(x2, y2); }
        g.stroke();
        if (a.bawa) { const c = titik(1.1, 0); g.fillStyle = a.bawa === 'palet' ? '#b7791f' : '#d6a35c'; g.fillRect(c[0] - 0.5 * s, c[1] - 0.5 * s, s, s); }
        if (pl?.jenis === 'mhe' && pl.id === a.id) { g.strokeStyle = '#f97316'; g.lineWidth = 3; g.beginPath(); g.arc(X(a.x), Y(a.z), 1.8 * s, 0, Math.PI * 2); g.stroke(); }
      }
      for (const a of aktor) {
        if (a.jenis !== 'pekerja') continue;
        const r = Math.max(3, 0.38 * s);
        g.beginPath(); g.arc(X(a.x), Y(a.z), r, 0, Math.PI * 2);
        g.fillStyle = WARNA_ORANG[(a.kemampuan ?? 'lain') as keyof typeof WARNA_ORANG] ?? '#64748b'; g.fill();
        g.strokeStyle = a.sibuk ? '#0f172a' : '#ffffff'; g.lineWidth = 1.5; g.stroke();
        if (a.bawa) { g.fillStyle = '#d6a35c'; g.fillRect(X(a.x) + r * 0.6, Y(a.z) - r * 0.6, r * 1.1, r * 1.1); }
        if (pl?.jenis === 'pekerja' && pl.id === a.id) { g.strokeStyle = '#f97316'; g.lineWidth = 3; g.beginPath(); g.arc(X(a.x), Y(a.z), r + 5, 0, Math.PI * 2); g.stroke(); }
      }
      // palet terpilih
      if (pl?.jenis === 'palet') { const l = d.lpn.get(pl.id); const lok = l ? d.lokasi.get(l.lokasi) : null; if (lok && (lok.tipe === 'rak' || lok.tipe === 'lantai')) { g.strokeStyle = '#f97316'; g.lineWidth = 3; g.strokeRect(X(lok.x - 0.7), Y(lok.z - 0.7), 1.4 * s, 1.4 * s); } }
      // skala
      const m = s > 20 ? 5 : s > 6 ? 10 : 20;
      const sx = el.clientWidth - 16 - m * s;
      g.fillStyle = '#0f172a'; g.fillRect(sx, el.clientHeight - 16, m * s, 3);
      g.font = '600 11px "Noto Sans", Arial, sans-serif'; g.textAlign = 'left'; g.fillText(`${m} m`, sx, el.clientHeight - 24);
      (cv as HTMLCanvasElement & { _truk?: typeof trukKotak })._truk = trukKotak;
    };
    loop();
    return () => { cancelAnimationFrame(id); ro.disconnect(); };
  }, [d, L, statis]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- interaksi: pan (seret), zoom (roda), klik pilih, hover info
  const keDunia = (cx: number, cy: number) => { const r = kanvas.current!.getBoundingClientRect(); const { s, ox, oy } = view.current; return { x: (cx - r.left - ox) / s, z: (cy - r.top - oy) / s }; };
  const cari = (x: number, z: number): { p: Pilihan; teks: string } | null => {
    let best: { a: Aktor2D; jarak: number } | null = null;
    for (const a of kontrol.current.aktor2d ?? []) { const j = Math.hypot(a.x - x, a.z - z); if (j < (a.jenis === 'mhe' ? 1.6 : 0.9) && (!best || j < best.jarak)) best = { a, jarak: j }; }
    if (best) {
      const a = best.a; const tugas = a.tugas ? LABEL_TUGAS[a.tugas] : 'siaga';
      if (a.jenis === 'mhe') return { p: { jenis: 'mhe', id: a.id }, teks: `${d.mhe.find(m => m.id === a.id)?.nama ?? a.id} · ${tugas}` };
      return { p: { jenis: 'pekerja', id: a.id }, teks: `${d.pekerja.find(p => p.id === a.id)?.nama ?? a.id} · ${tugas}` };
    }
    for (const t of (kanvas.current as HTMLCanvasElement & { _truk?: { id: string; k: Kotak }[] })._truk ?? []) {
      if (x >= t.k.x0 && x <= t.k.x1 && z >= t.k.z0 && z <= t.k.z1) { const tr = d.truk.get(t.id); return { p: { jenis: 'truk', id: t.id }, teks: `${t.id} · ${tr?.arus === 'inbound' ? `${tr.palet.length} palet, sisa bongkar ${tr.sisaTugas}` : `${tr?.order.length ?? 0} order`}` }; }
    }
    for (const gr of statis.grup) {
      if (Math.abs(gr.x - x) > gr.w / 2 + 0.1 || Math.abs(gr.z - z) > gr.d / 2 + 0.1) continue;
      const ids = gr.ids.flatMap(lid => d.lokasi.get(lid)!.lpn); const lok = d.lokasi.get(gr.ids[0])!;
      return ids.length ? { p: { jenis: 'palet', id: ids[ids.length - 1] }, teks: `${lok.kode} · ${ids.length}/${gr.kap} palet terisi` } : null;
    }
    return null;
  };
  const turun = (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); seret.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy, gerak: false }; };
  const gerak = (e: React.PointerEvent) => {
    const sr = seret.current;
    if (sr) {
      if (Math.hypot(e.clientX - sr.x, e.clientY - sr.y) > 4) sr.gerak = true;
      if (sr.gerak) { view.current.ox = sr.ox + e.clientX - sr.x; view.current.oy = sr.oy + e.clientY - sr.y; setHover(null); return; }
    }
    const p = keDunia(e.clientX, e.clientY); const h = cari(p.x, p.z); const r = kanvas.current!.getBoundingClientRect();
    setHover(h ? { x: e.clientX - r.left, y: e.clientY - r.top, teks: h.teks } : null);
  };
  const naik = (e: React.PointerEvent) => {
    const sr = seret.current; seret.current = null; if (!sr || sr.gerak) return;
    const p = keDunia(e.clientX, e.clientY); onPilih(cari(p.x, p.z)?.p ?? null);
  };
  useEffect(() => {
    const cv = kanvas.current!;
    const roda = (e: WheelEvent) => {
      e.preventDefault(); const r = cv.getBoundingClientRect(); const cx = e.clientX - r.left, cy = e.clientY - r.top;
      const v0 = view.current; const s = Math.max(1.5, Math.min(80, v0.s * Math.exp(-e.deltaY * 0.0015)));
      view.current = { s, ox: cx - ((cx - v0.ox) * s) / v0.s, oy: cy - ((cy - v0.oy) * s) / v0.s }; setSkala(s);
    };
    cv.addEventListener('wheel', roda, { passive: false });
    return () => cv.removeEventListener('wheel', roda);
  }, []);

  return (
    <div ref={wadah} className="gm-2d">
      <canvas ref={kanvas} onPointerDown={turun} onPointerMove={gerak} onPointerUp={naik} onPointerLeave={() => setHover(null)} style={{ cursor: hover ? 'pointer' : 'grab', touchAction: 'none' }} />
      {hover && <div className="gm-2d-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>{hover.teks}</div>}
      <div className="gm-2d-legenda small">
        <span><i className="mhe" />MHE sibuk</span><span><i className="mhe idle" />MHE siaga</span>
        <span><i className="org" style={{ background: WARNA_ORANG.operator }} />operator</span><span><i className="org" style={{ background: WARNA_ORANG.checker }} />checker</span><span><i className="org" style={{ background: WARNA_ORANG.picker }} />picker</span><span><i className="org" style={{ background: WARNA_ORANG.tkbm }} />TKBM</span>
        <span><i className="lampu" style={{ background: '#16a34a' }} /><i className="lampu" style={{ background: '#f59e0b' }} /><i className="lampu" style={{ background: '#dc2626' }} />isi staging &lt;60 · &lt;85 · ≥85%</span>
        <span><i className="slot" />rak terisi (makin gelap = makin penuh)</span>
      </div>
      <button type="button" className="ghost gm-2d-pas" onClick={pasLayar}>Pas layar · {skala.toFixed(1)} px/m</button>
    </div>
  );
}
