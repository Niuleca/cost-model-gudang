// Leca Game · lapisan 3D: menggambar keadaan mesin simulasi (Dunia) di atas gudang 3D.
// Palet = stok nyata per lokasi; truk = di dock / antre; MHE & pekerja bergerak sesuai tugas yang sedang berjalan
// (durasi tugas = productivity, dibagi fase: jalan ke ambil → ambil → bawa → taruh).
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ARMADA, bertugas, jalankanSampai, jenisTrukDari, type Dunia, type JenisTruk, type JenisTugas, type Kemampuan, type Lpn, type Tugas } from '@/lib/game';
import type { LayoutGudang, Lorong } from '@/lib/simulasi3d/layout';
import { kategoriOrang } from '@/lib/simulasi3d/layout';
import { label, mat, modelMhe, modelOrang, modelTruk, teks, type PasangLapisan } from '../Viewer3D';
import { forkliftBersih, orangBersih, pakaiModelMeshy, pakaiPekerjaMeshy, pinBersih, trukBersih, WARNA_BERSIH, type Animator } from '../model3d';
import { WARNA_ORANG } from '../warna';
import { ELEMEN, LABEL_AKSI, MODE_PEMAIN, studiAwal, type ModePemain, type SiklusStudi, type StudiPemain } from './pemain';

export type Pilihan = { jenis: 'palet' | 'mhe' | 'pekerja' | 'truk' | 'order'; id: string };
/** Data observasi untuk panel mode jelajah (ditulis lapisan, dibaca UI). */
export interface Amatan {
  id: string; jenis: 'pekerja' | 'mhe'; nama: string; jarak: number;
  role?: string; ket?: string;
  tugas: { id: string; jenis: JenisTugas; fase: string; langkah: number; langkahList: string[]; f: number; durasiStd: number; berjalan: number; jarakJalur: number; kecepatan: number; bantu?: boolean; porsiJalan: number } | null;
}
/** Kecepatan gerak tersirat per jenis tugas = jarak jalur layout ÷ porsi waktu jalan dari durasi productivity. */
export interface StatGerak { n: number; kecTotal: number; kecMaks: number; jarakTotal: number; olehOrang: number }
/** Posisi aktor untuk tampilan 2D (ditulis lapisan tiap frame). */
export interface Aktor2D { id: string; jenis: 'mhe' | 'pekerja'; x: number; z: number; rot: number; sibuk: boolean; bawa: 'palet' | 'karton' | null; kemampuan?: string; mhe?: string; tugas?: JenisTugas }
export interface KontrolGame {
  jalan: boolean; kecepatan: number; batas: number; pilih: Pilihan | null;
  jelajah: boolean; tombol: { maju: boolean; mundur: boolean; kiri: boolean; kanan: boolean; lari: boolean };
  amatan: Amatan | null; statGerak: Partial<Record<JenisTugas, StatGerak>>;
  aktor2d?: Aktor2D[];
  /** mode kerja pemain (motion study) */
  pemain?: StudiPemain;
  teleport?: { x: number; z: number; rot?: number };
}
export const LANGKAH_TUGAS = ['Jalan ke titik ambil', 'Ambil / angkat', 'Bawa ke tujuan', 'Taruh / turunkan'];
export const LANGKAH_DIAM = ['Jalan ke lokasi kerja', 'Mengerjakan (cek / admin / packing)'];
/** Urutan langkah kerja tiap jenis tugas (untuk observasi / motion study). */
export const LANGKAH: Record<JenisTugas, string[]> = {
  admin_in: ['Jalan ke dock / sopir', 'Terima surat jalan & ASN', 'Kembali ke meja inbound', 'Input & konfirmasi GR'],
  admin_out: ['Jalan ke staging outbound', 'Cocokkan order & palet', 'Bawa dokumen ke dock', 'Serahkan DO ke sopir'],
  bongkar: ['Jalan ke truk', 'Ambil palet dari truk', 'Bawa ke staging inbound', 'Turunkan di staging'],
  cek_in: ['Jalan ke palet di staging', 'Cek qty / lot / kondisi'],
  putaway: ['Jalan ke staging inbound', 'Angkat palet', 'Bawa ke lokasi rak', 'Taruh di rak'],
  pick_palet: ['Jalan ke lokasi rak', 'Turunkan palet dari rak', 'Bawa ke staging outbound', 'Taruh di staging'],
  pick_karton: ['Jalan ke lokasi pick', 'Ambil karton', 'Bawa ke staging outbound', 'Susun di palet order'],
  pack: ['Jalan ke palet order', 'Packing / wrapping'],
  cek_out: ['Jalan ke palet order', 'Cek qty / label order'],
  muat: ['Jalan ke staging outbound', 'Angkat palet', 'Bawa ke truk', 'Taruh di truk'],
};

type V = THREE.Vector3;
const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
const KEC_JALAN = 1.3, KEC_MHE = 2.5;   // m/detik game saat kembali ke posisi siaga

/** Titik lorong untuk menjangkau slot rak (lorong terdekat yang melintasi slot). */
function lorongSlot(lorong: Lorong[], x: number, z: number) {
  let best: { lo: Lorong; d: number } | null = null;
  for (const lo of lorong) {
    const horiz = Math.abs(lo.z1 - lo.z0) < 1e-6;
    if (horiz) { if (x < Math.min(lo.x0, lo.x1) - 0.5 || x > Math.max(lo.x0, lo.x1) + 0.5) continue; const d = Math.abs(z - lo.z0); if (d < 4 && (!best || d < best.d)) best = { lo, d }; }
    else { if (z < Math.min(lo.z0, lo.z1) - 0.5 || z > Math.max(lo.z0, lo.z1) + 0.5) continue; const d = Math.abs(x - lo.x0); if (d < 4 && (!best || d < best.d)) best = { lo, d }; }
  }
  return best?.lo ?? null;
}

interface Titik { p: V; lo: Lorong | null; y: number }

/** Jalur lewat jalan utama: keluar lorong asal → mulut lorong tujuan → masuk ke titik slot. */
function jalur(a: Titik, b: Titik): V[] {
  const pts: V[] = [a.p.clone()];
  let c = a.p.clone();
  if (a.lo) { const h = Math.abs(a.lo.z1 - a.lo.z0) < 1e-6; c = h ? v(a.lo.x0, a.p.z) : v(a.p.x, a.lo.z0); pts.push(c); }
  if (b.lo) {
    const h = Math.abs(b.lo.z1 - b.lo.z0) < 1e-6;
    if (h) { pts.push(v(b.lo.x0, c.z), v(b.lo.x0, b.lo.z0), v(b.p.x, b.lo.z0)); }
    else { pts.push(v(c.x, b.lo.z0), v(b.lo.x0, b.lo.z0), v(b.lo.x0, b.p.z)); }
  }
  pts.push(b.p.clone());
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.05);
}
function titikPada(pts: V[], f: number, out: V) {
  if (pts.length === 1) return out.copy(pts[0]);
  let total = 0; for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1]);
  let s = Math.max(0, Math.min(1, f)) * total;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].distanceTo(pts[i - 1]);
    if (s <= d || i === pts.length - 1) return out.lerpVectors(pts[i - 1], pts[i], d > 0 ? Math.min(1, s / d) : 1);
    s -= d;
  }
  return out.copy(pts[pts.length - 1]);
}

interface Rencana { jarak: number; awal: V[]; bawa: V[]; angkatA: number; angkatB: number; bawaPalet: boolean; bawaKarton: boolean; diam: boolean; akhir: V }
interface Aktor { patroli?: V[]; anim?: Animator; sebelum?: V; naik?: string; obj: THREE.Group; pos: V; rumah: V; tugas: string | null; rencana: Rencana | null; garpu?: THREE.Object3D; op?: THREE.Object3D; karton?: THREE.Object3D; lbl?: CSS2DObject }

export function buatLapisanGame(d: Dunia, layout: LayoutGudang, kontrol: { current: KontrolGame }, onBerhenti: () => void, onPilih: (p: Pilihan | null) => void): PasangLapisan {
  return ({ grup, kamera, kanvas, tema, kontrolKamera }) => {
    const bersih = tema === 'bersih';
    const L = layout;
    const gPalet = new THREE.Group(), gTruk = new THREE.Group(), gOrang = new THREE.Group(), gMhe = new THREE.Group();
    gTruk.name = 'truk'; gOrang.name = 'orang';
    grup.add(gPalet, gTruk, gOrang, gMhe);
    const tinggiPalet = L.tinggiPalet;

    // ---------- geometri bantu
    const lorongRak = L.lorong;
    const lokasi = [...d.lokasi.values()];
    const lokSimpan = lokasi.filter(l => l.tipe === 'rak' || l.tipe === 'lantai');
    const stgIn = lokasi.find(l => l.tipe === 'staging_in')!, stgOut = lokasi.find(l => l.tipe === 'staging_out')!;
    const gridStaging = (r: { x0: number; x1: number; z0: number; z1: number }) => {
      const xs: number[] = [], zs: number[] = [];
      for (let x = r.x1 - 0.9; x >= r.x0 + 3.2; x -= 1.3) xs.push(x);
      for (let z = r.z0 + 0.9; z <= r.z1 - 0.9; z += 1.2) zs.push(z);
      if (!xs.length) xs.push((r.x0 + r.x1) / 2); if (!zs.length) zs.push((r.z0 + r.z1) / 2);
      return (i: number) => { const n = xs.length * zs.length; const lap = Math.floor(i / n), k = i % n; return v(xs[k % xs.length], zs[Math.floor(k / xs.length)], lap * tinggiPalet); };
    };
    const slotIn = gridStaging(L.stagingIn), slotOut = gridStaging(L.stagingOut);
    const dockPos = new Map<string, V>();
    const dIn = L.dock.filter(x => x.arus === 'inbound'), dOut = L.dock.filter(x => x.arus === 'outbound');
    for (const dk of d.dock) {
      const arr = dk.arus === 'inbound' ? dIn : dOut; const i = Number(dk.id.slice(2)) - 1;
      const z = arr[i % Math.max(1, arr.length)]?.z ?? (dk.arus === 'inbound' ? L.stagingIn.z0 + 3 : L.stagingOut.z1 - 3);
      dockPos.set(dk.id, v(1.6, z));
    }
    const kantor = L.fasilitas.find(f => /office|kantor|admin|control/i.test(f.nama)) ?? L.fasilitas[0];
    const titikKantor = kantor ? v((kantor.x0 + kantor.x1) / 2, (kantor.z0 + kantor.z1) / 2) : v(L.stagingIn.x1 + 2, 1.5);

    /** Posisi palet (LPN) di dunia 3D. */
    const posLpn = (l: Lpn): Titik => {
      const lok = d.lokasi.get(l.lokasi)!;
      if (lok.tipe === 'staging_in' || lok.tipe === 'staging_out') { const p = (lok.tipe === 'staging_in' ? slotIn : slotOut)(Math.max(0, lok.lpn.indexOf(l.id))); return { p: v(p.x, p.z), lo: null, y: p.y }; }
      return titikLokasi(lok.id);
    };
    const titikLokasi = (id: string): Titik => {
      const lok = d.lokasi.get(id)!;
      if (lok.tipe === 'staging_in') return { p: v(slotIn(lok.lpn.length).x, slotIn(lok.lpn.length).z), lo: null, y: 0 };
      if (lok.tipe === 'staging_out') return { p: v(slotOut(lok.lpn.length).x, slotOut(lok.lpn.length).z), lo: null, y: 0 };
      const lo = lok.tipe === 'rak' ? lorongSlot(lorongRak, lok.x, lok.z) : null;
      if (lo) { const h = Math.abs(lo.z1 - lo.z0) < 1e-6; return { p: h ? v(lok.x, lo.z0) : v(lo.x0, lok.z), lo, y: lok.y }; }
      // block / lantai: berhenti 1,4 m di depan tumpukan (sisi staging)
      return { p: v(lok.x - 1.4, lok.z), lo: null, y: lok.y };
    };
    const tt = (p: V): Titik => ({ p, lo: null, y: 0 });

    // ---------- palet (instanced): stok di lokasi + staging + yang sedang dibawa
    const kap = lokSimpan.length + 1200;
    const alas = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.14, 1.0), bersih ? mat(WARNA_BERSIH.kayu, { roughness: 0.8 }) : mat('#ffffff', { roughness: 0.9, map: teks('palet') }), kap);
    const tinggiMuat = Math.max(0.3, tinggiPalet - 0.22);
    // gaya bersih: palet = kotak bertekstur hasil "foto" 5 sisi model Meshy (palet + karton ber-stretch film) → 12 segitiga per palet
    const tinggiImpostor = Math.max(0.6, tinggiPalet - 0.05);
    const muatImpostor = () => {
      const tl = new THREE.TextureLoader();
      const sisi = (k: string) => { const t = tl.load(`/sim3d/tekstur/palet3d_${k}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, alphaTest: 0.5, transparent: false }); };
      const bawah = new THREE.MeshStandardMaterial({ color: WARNA_BERSIH.kayu, roughness: 0.9 });
      return [sisi('px'), sisi('nx'), sisi('py'), bawah, sisi('pz'), sisi('nz')];   // urutan sisi BoxGeometry: +X −X +Y −Y +Z −Z
    };
    const muat = bersih
      ? new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, tinggiImpostor, 1.0), muatImpostor(), kap)
      : new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, tinggiMuat, 0.96), mat('#ffffff', { roughness: 0.4, map: teks('muatan') }), kap);
    alas.castShadow = muat.castShadow = lokSimpan.length <= 4000; alas.receiveShadow = muat.receiveShadow = true;
    alas.frustumCulled = muat.frustumCulled = false;
    gPalet.add(alas, muat);
    const warnaSku = new Map<string, THREE.Color>();
    const palet = bersih ? ['#ffffff', '#f7f1e8', '#f0e6d6', '#fbf7f0', '#f2ede4', '#f6efe2', '#eee4d2', '#faf4ea', '#f3eadb', '#f8f2e6']
      : ['#ffffff', '#f4efe6', '#ebe3d4', '#fbf7f0', '#e6edf3', '#f1e9dc', '#fde9d9', '#e3f1e6', '#e8e4f5', '#f5f0d8'];
    [...d.sku.keys()].forEach((s, i) => warnaSku.set(s, new THREE.Color(palet[i % palet.length])));
    const tmp = new THREE.Object3D();
    let n = 0;
    const idxLpn: (string | null)[] = []; const posPalet = new Map<string, V>();
    /** Tinggi palet yang tergambar (palet + karton, mengecil saat isinya tinggal sebagian). */
    const tinggiVisual = (isi: number) => { const sk = Math.max(0.15, Math.min(1, isi)); return bersih ? tinggiImpostor * (0.3 + 0.7 * sk) : 0.14 + tinggiMuat * sk; };
    const taruhPalet = (x: number, y: number, z: number, rot: number, sku: string, isi = 1, lpn: string | null = null) => {
      if (n >= kap) return;
      idxLpn[n] = lpn; if (lpn) posPalet.set(lpn, v(x, z, y + tinggiPalet));
      tmp.position.set(x, y + 0.07, z); tmp.rotation.set(0, rot, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); if (!bersih) alas.setMatrixAt(n, tmp.matrix);
      const sk = Math.max(0.15, Math.min(1, isi));
      if (bersih) { const h = tinggiImpostor * (0.3 + 0.7 * sk); tmp.position.set(x, y + h / 2, z); tmp.scale.set(1, h / tinggiImpostor, 1); }
      else { tmp.position.set(x, y + 0.14 + (tinggiMuat * sk) / 2, z); tmp.scale.set(1, sk, 1); }
      tmp.updateMatrix(); muat.setMatrixAt(n, tmp.matrix);
      muat.setColorAt(n, warnaSku.get(sku) ?? new THREE.Color('#ffffff'));
      n++;
    };
    let kunciPalet = '';
    // ---------- palet yang dipindah pemain (mode kerja): disembunyikan dari lokasi asal & digambar di posisi baru
    const pindahP = new Map<string, { x: number; y: number; z: number; rot: number; lokAsal: string; lokTaruh: string | null }>();
    let angkatP: string | null = null; let verPemain = 0;
    /** Palet yang tergambar (untuk dicari pemain): id LPN, posisi dasar, tinggi, lokasi. */
    let instPalet: { id: string; x: number; y: number; z: number; h: number; lok: string | null }[] = [];
    const lepasPindah = (id: string) => { const o = pindahP.get(id); if (o?.lokTaruh) { const lk = d.lokasi.get(o.lokTaruh); if (lk) lk.dipesan = Math.max(0, lk.dipesan - 1); } pindahP.delete(id); };
    const gambarPalet = (dibawa: { pos: V; rot: number; sku: string; lpn: string | null }[]) => {
      // tugas yang memindahkan palet: palet sumber disembunyikan selama dibawa
      const sembunyi = new Set<string>();
      for (const p of d.pekerja) { const tg = p.sibuk ? d.tugas.get(p.sibuk) : undefined; if (tg?.lpn && (tg.jenis === 'putaway' || tg.jenis === 'pick_palet')) sembunyi.add(tg.lpn); }
      const kunci = `${d.seq}|${verPemain}|${dibawa.length}|${dibawa.map(b => `${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}`).join(';')}`;
      if (kunci === kunciPalet) return; kunciPalet = kunci;
      n = 0; posPalet.clear(); instPalet = [];
      // palet pindahan pemain: dibatalkan bila sistem sudah memindahkan LPN itu
      for (const [id, o] of pindahP) { const l = d.lpn.get(id); if (!l || l.lokasi !== o.lokAsal) lepasPindah(id); }
      if (angkatP && !d.lpn.has(angkatP)) angkatP = null;
      const lewati = (id: string) => sembunyi.has(id) || id === angkatP || pindahP.has(id);
      // palet di lantai (block stack) & staging bertumpuk: diletakkan dari bawah menurut tinggi nyata palet di bawahnya,
      // jadi tidak ada palet melayang saat palet bawah sudah diambil atau isinya tinggal sebagian
      const tumpuk: { x: number; y: number; z: number; sku: string; isi: number; id: string; urut: number }[] = [];
      for (const lok of lokSimpan) for (const id of lok.lpn) {
        if (lewati(id)) continue; const l = d.lpn.get(id)!; const isi = l.karton / (d.sku.get(l.sku)?.kartonPerPalet ?? l.karton);
        if (lok.tipe === 'rak') { taruhPalet(lok.x, lok.y, lok.z, Math.PI / 2, l.sku, isi, id); instPalet.push({ id, x: lok.x, y: lok.y, z: lok.z, h: tinggiVisual(isi), lok: lok.id }); }
        else tumpuk.push({ x: lok.x, y: lok.y, z: lok.z, sku: l.sku, isi, id, urut: lok.y });
      }
      for (const [lok, slot] of [[stgIn, slotIn], [stgOut, slotOut]] as const) lok.lpn.forEach((id, i) => {
        if (lewati(id)) return; const l = d.lpn.get(id)!; const p = slot(i);
        tumpuk.push({ x: p.x, y: p.y, z: p.z, sku: l.sku, isi: l.karton / (d.sku.get(l.sku)?.kartonPerPalet ?? l.karton), id, urut: p.y + i * 1e-6 });
      });
      const puncak = new Map<string, number>();
      for (const t of tumpuk.sort((a, b) => a.urut - b.urut)) {
        const k = `${Math.round(t.x * 10)},${Math.round(t.z * 10)}`; const y = puncak.get(k) ?? 0;
        puncak.set(k, y + tinggiVisual(t.isi) + 0.01);
        taruhPalet(t.x, y, t.z, 0, t.sku, t.isi, t.id); instPalet.push({ id: t.id, x: t.x, y, z: t.z, h: tinggiVisual(t.isi), lok: null });
      }
      for (const [id, o] of pindahP) {
        const l = d.lpn.get(id)!; const isi = l.karton / (d.sku.get(l.sku)?.kartonPerPalet ?? l.karton);
        taruhPalet(o.x, o.y, o.z, o.rot, l.sku, isi, id); instPalet.push({ id, x: o.x, y: o.y, z: o.z, h: tinggiVisual(isi), lok: o.lokTaruh });
      }
      for (const b of dibawa) taruhPalet(b.pos.x, b.pos.y, b.pos.z, b.rot, b.sku, 1, b.lpn);
      muat.count = n; alas.count = bersih ? 0 : n;
      alas.instanceMatrix.needsUpdate = muat.instanceMatrix.needsUpdate = true;
      alas.boundingSphere = muat.boundingSphere = null;   // supaya klik (raycast) memakai posisi palet terbaru
      if (muat.instanceColor) muat.instanceColor.needsUpdate = true;
    };

    // ---------- truk: satu per dock + antrean di halaman
    interface ObjTruk { g: THREE.Group; lbl: CSS2DObject; truk: string | null; mulai: number; arus: 'inbound' | 'outbound'; jenis: JenisTruk | null; badan: THREE.Group | null }
    const trukDock = new Map<string, ObjTruk>();
    const PANJANG_TRUK: Record<JenisTruk, number> = { cde: 5.0, cdd: 6.6, fuso: 7.6, tronton: 10.5, container20: 10.5, container: 16.5 };
    const buatObjTruk = (arus: 'inbound' | 'outbound') => {
      const g = new THREE.Group(); g.visible = false; gTruk.add(g);
      const lbl = label('', 'kecil'); lbl.position.set(-7, 4.4, 0); g.add(lbl);
      const o: ObjTruk = { g, lbl, truk: null, mulai: 0, arus, jenis: null, badan: null }; g.userData.objTruk = o; return o;
    };
    /** Badan truk sesuai jenis (CDE/Fuso/Tronton/container); model kode dulu, lalu diganti model Meshy saat termuat. */
    const aturJenis = (o: ObjTruk, trukId: string) => {
      const tr = d.truk.get(trukId);
      const jenis = tr?.jenis ?? jenisTrukDari(tr?.arus === 'inbound' ? tr.palet.length : 20);
      if (o.jenis === jenis && o.badan) return;
      if (o.badan) o.g.remove(o.badan);
      const badan = new THREE.Group();
      const kode = bersih ? trukBersih(o.arus) : modelTruk(o.arus);
      kode.scale.x = (PANJANG_TRUK[jenis] + 0.5) / 14.7; badan.add(kode);
      if (bersih) pakaiModelMeshy(badan, jenis);
      o.g.add(badan); o.badan = badan; o.jenis = jenis;
      o.lbl.position.set(-0.5 - PANJANG_TRUK[jenis] / 2, 4.6, 0);
    };
    for (const dk of d.dock) trukDock.set(dk.id, buatObjTruk(dk.arus));
    const antre = { inbound: Array.from({ length: 8 }, () => buatObjTruk('inbound')), outbound: Array.from({ length: 8 }, () => buatObjTruk('outbound')) };
    let detikNyata = 0;
    const isiTeks = (o: ObjTruk, s: string) => { if (o.lbl.element.textContent !== s) o.lbl.element.textContent = s; };
    const ketTruk = (id: string) => {
      const tr = d.truk.get(id); if (!tr) return id;
      const j = tr.jenis ? `${ARMADA[tr.jenis].nama} · ` : '';
      if (tr.arus === 'inbound') return `${j}${tr.id} · ${tr.palet.length} plt${tr.sisaTugas > 0 ? ` · sisa ${tr.sisaTugas}` : ''}`;
      return `${j}${tr.id} · ${tr.order.length} order`;
    };
    const perbaruiTruk = () => {
      for (const dk of d.dock) {
        const o = trukDock.get(dk.id)!; const p = dockPos.get(dk.id)!;
        if (dk.truk !== o.truk) { o.truk = dk.truk; o.mulai = detikNyata; }
        o.g.visible = !!dk.truk; o.g.userData.pilih = dk.truk ? { jenis: 'truk', id: dk.truk } : null;
        if (dk.truk) { aturJenis(o, dk.truk); const f = Math.min(1, (detikNyata - o.mulai) / 1.2); o.g.position.set(-0.4 - (1 - f) * (1 - f) * 25, 0, p.z); isiTeks(o, ketTruk(dk.truk)); }
      }
      for (const arus of ['inbound', 'outbound'] as const) {
        const ids = d.antreDock[arus]; const pool = antre[arus];
        pool.forEach((o, i) => {
          const id = ids[i]; o.g.visible = !!id; o.g.userData.pilih = id ? { jenis: 'truk', id } : null;
          if (id) { aturJenis(o, id); o.g.rotation.y = Math.PI / 2; o.g.position.set(-24 - (i % 4) * 4, 0, arus === 'inbound' ? -24 - Math.floor(i / 4) * 19 : L.W + 18 + Math.floor(i / 4) * 12); isiTeks(o, `antre · ${ketTruk(id)}`); }
        });
      }
    };

    // ---------- MHE & pekerja
    const parkir = (i: number) => v(Math.min(L.stagingIn.x1 + 1.6, L.L - 1), Math.min(L.W - 1, 1.6 + i * 2.6));
    const animator: Animator[] = [];
    const mhe = new Map<string, Aktor>();
    d.mhe.forEach((m, i) => {
      const g = (bersih ? forkliftBersih : modelMhe)(m.jenis, m.jenis === 'reach' ? Math.min(L.tinggiRak, L.H - 0.4) * 0.45 : 2.4);
      g.userData.pilih = { jenis: 'mhe', id: m.id } satisfies Pilihan;
      if (bersih) pakaiModelMeshy(g, m.jenis === 'hpt' ? 'hpt' : m.jenis === 'forklift' ? 'forklift' : 'reach');
      const op = (bersih ? orangBersih : modelOrang)(WARNA_ORANG.operator); op.scale.setScalar(0.85); op.position.set(-0.45, 0.35, 0); op.visible = false; g.add(op);
      if (bersih) {
        // operator beranimasi: duduk di forklift, berdiri menyamping di reach truck / stacker / HPT
        const duduk = m.jenis === 'forklift';
        if (duduk) op.position.set(-0.35, 0.55, 0); else if (m.jenis === 'hpt') op.position.set(-1.05, 0, 0); else op.position.set(-0.55, 0.2, 0);
        op.scale.setScalar(1);
        pakaiPekerjaMeshy(op, duduk ? 'duduk' : 'diam', an => animator.push(an));
      }
      const lbl = label(m.nama.replace(/^(.{0,14}).*?(\d+)$/, '$1 $2'), 'mhe'); lbl.position.set(0, 3.1, 0); g.add(lbl);
      const p = parkir(i); g.position.copy(p); gMhe.add(g);
      mhe.set(m.id, { obj: g, pos: p.clone(), rumah: p.clone(), tugas: null, rencana: null, garpu: g.getObjectByName('garpu') ?? undefined, op, lbl });
    });
    const rumahOrang = (k: Kemampuan | null, i: number): V => {
      const j = (a: number) => ((i * 0.618 + a) % 1);
      switch (k) {
        // meja admin di depan (dekat dock & staging): inbound di sisi staging inbound, outbound di sisi staging outbound
        case 'admin': { const ar = d.pekerja[i]?.arus; const xm = Math.min(L.stagingIn.x1 + 0.9, L.L - 1);
          return ar === 'in' ? v(xm, L.stagingIn.z0 + 1.2 + j(0.1) * 1.5) : ar === 'out' ? v(xm, L.stagingOut.z1 - 1.2 - j(0.1) * 1.5) : v(xm, (L.stagingIn.z1 + L.stagingOut.z0) / 2 + j(0.4) * 2 - 1); }
        case 'checker': return v(L.stagingIn.x1 - 1.2, L.stagingIn.z1 - 1 - j(0.2) * 3);
        case 'picker': return v(L.stagingOut.x1 - 1.2, L.stagingOut.z0 + 1 + j(0.3) * 3);
        case 'tkbm': return v(3.2 + j(0.5) * 1.5, (dIn[i % Math.max(1, dIn.length)]?.z ?? 3) + (i % 2 ? 1.8 : -1.8));
        case 'operator': return v(Math.min(L.stagingIn.x1 + 3, L.L - 1), Math.min(L.W - 1, 1.2 + j(0.7) * 4));
        default: return v(L.stagingIn.x1 + 1, L.W / 2 + j(0.9) * 4 - 2);
      }
    };
    const orang = new Map<string, Aktor>();
    // supervisor & security: tidak mengambil tugas, tapi berpatroli selama shift (supervisor menyusuri staging → jalur utama → lorong;
    // security menyusuri apron dock di luar gedung)
    const jalurPatroli = (kat: string, i: number): V[] => {
      const xj = Math.min(L.stagingIn.x1 + 1.6, L.L - 1), zA = 1.2, zB = L.W - 1.2;
      if (kat === 'security') return [v(-7, zA), v(-7, zB), v(-3.5, zB), v(-3.5, zA)];
      const lo = L.lorong[(i * 3) % Math.max(1, L.lorong.length)];
      const masuk: V[] = lo ? (Math.abs(lo.z1 - lo.z0) < 1e-6 ? [v(xj, lo.z0), v(Math.min(lo.x1, lo.x0 + 18), lo.z0), v(xj, lo.z0)] : []) : [];
      return [v(xj, zA), ...masuk, v(xj, zB), v(L.stagingOut.x1 - 1, zB), v(L.stagingIn.x1 - 1, zA)];
    };
    d.pekerja.forEach((p, i) => {
      if (!p.kemampuan) {
        const kat = kategoriOrang(p.role); if (kat !== 'supervisor' && kat !== 'security') return;
        const g = (bersih ? orangBersih : modelOrang)(WARNA_ORANG[kat]); g.userData.pilih = { jenis: 'pekerja', id: p.id } satisfies Pilihan;
        const rute = jalurPatroli(kat, i); g.position.copy(rute[0]); gOrang.add(g);
        const ak: Aktor = { obj: g, pos: rute[0].clone(), rumah: rute[0].clone(), tugas: null, rencana: null, patroli: rute };
        orang.set(p.id, ak);
        if (bersih) pakaiPekerjaMeshy(g, 'diam', an => { ak.anim = an; animator.push(an); });
        return;
      }
      const warna = WARNA_ORANG[p.kemampuan] ?? '#64748b';
      const g = (bersih ? orangBersih : modelOrang)(warna); g.userData.pilih = { jenis: 'pekerja', id: p.id } satisfies Pilihan;
      const karton = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.38), bersih ? mat(WARNA_BERSIH.karton) : mat('#c8a26b', { map: teks('muatan') })); karton.position.set(0.32, 1.0, 0); karton.visible = false; g.add(karton);
      const r = rumahOrang(p.kemampuan, i); g.position.copy(r); gOrang.add(g);
      const ak: Aktor = { obj: g, pos: r.clone(), rumah: r.clone(), tugas: null, rencana: null, karton };
      orang.set(p.id, ak);
      if (bersih) pakaiPekerjaMeshy(g, 'diam', an => { ak.anim = an; animator.push(an); });
    });

    /** Rencana gerak satu tugas (dibuat sekali saat tugas mulai). */
    const rencanaTugas = (tg: Tugas, dari: V): Rencana => {
      const tr = tg.truk ? d.truk.get(tg.truk) : undefined; const o = tg.order ? d.order.get(tg.order) : undefined;
      const lpn = tg.lpn ? d.lpn.get(tg.lpn) : undefined;
      const lpnOrder = () => { const id = o ? stgOut.lpn.find(x => d.lpn.get(x)?.order === o.id) : undefined; return id ? posLpn(d.lpn.get(id)!) : tt(slotOut(0)); };
      let A: Titik, B: Titik; let bawaPalet = false, bawaKarton = false, diam = false;
      switch (tg.jenis) {
        case 'bongkar': A = tt(dockPos.get(tr?.dock ?? '')?.clone() ?? v(1.6, L.stagingIn.z0 + 2)); B = titikLokasi(stgIn.id); bawaPalet = !!tg.mhe; bawaKarton = !tg.mhe; break;
        case 'cek_in': A = lpn ? posLpn(lpn) : tt(slotIn(0)); A = { ...A, p: A.p.clone().add(v(0, 0.9)) }; B = A; diam = true; break;
        case 'putaway': A = lpn ? posLpn(lpn) : tt(slotIn(0)); B = tg.ke ? titikLokasi(tg.ke) : A; bawaPalet = true; break;
        case 'pick_palet': A = lpn ? posLpn(lpn) : tt(slotOut(0)); B = titikLokasi(stgOut.id); bawaPalet = true; break;
        case 'pick_karton': A = lpn ? posLpn(lpn) : tt(slotOut(0)); B = titikLokasi(stgOut.id); bawaKarton = true; break;
        case 'pack': case 'cek_out': A = lpnOrder(); A = { ...A, p: A.p.clone().add(v(0, 0.9)) }; B = A; diam = true; break;
        case 'muat': A = lpnOrder(); B = tt(dockPos.get(tr?.dock ?? '')?.clone() ?? v(1.6, L.stagingOut.z1 - 2)); bawaPalet = !!tg.mhe; bawaKarton = !tg.mhe; break;
        // admin: ke sopir di dock lalu kembali ke meja (inbound) / ke palet order lalu ke dock (outbound)
        case 'admin_in': A = tt((dockPos.get(tr?.dock ?? '')?.clone() ?? v(1.6, L.stagingIn.z0 + 2)).add(v(1.2, 0))); B = tt(dari.clone()); break;
        case 'admin_out': { A = lpnOrder(); A = { ...A, p: A.p.clone().add(v(0, 0.9)) }; const trk = o?.truk ? d.truk.get(o.truk) : undefined; B = tt((dockPos.get(trk?.dock ?? '')?.clone() ?? v(1.6, L.stagingOut.z1 - 2)).add(v(1.2, 0))); break; }
        default: A = tt(titikKantor.clone().add(v(((Number(tg.id.slice(1)) * 0.37) % 1) * 2 - 1, 0))); B = A; diam = true;
      }
      const awal = jalur({ p: dari.clone(), lo: lorongSlot(lorongRak, dari.x, dari.z), y: 0 }, A);
      const bawa = diam ? [A.p.clone()] : jalur(A, B);
      const panjang = (pts: V[]) => pts.reduce((a, q, i) => (i ? a + q.distanceTo(pts[i - 1]) : 0), 0);
      const jarak = panjang(awal) + panjang(bawa);
      // kecepatan tersirat: jalan = 78% durasi (tugas bawa) atau 15% (tugas di tempat)
      if (tg.durasi && jarak > 0.5) {
        const kec = jarak / (tg.durasi * (diam ? 0.15 : 0.78));
        const sg = (kontrol.current.statGerak[tg.jenis] ??= { n: 0, kecTotal: 0, kecMaks: 0, jarakTotal: 0, olehOrang: 0 });
        sg.n++; sg.kecTotal += kec; sg.kecMaks = Math.max(sg.kecMaks, kec); sg.jarakTotal += jarak; if (!tg.mhe) sg.olehOrang++;
      }
      return { jarak, awal, bawa, angkatA: A.y, angkatB: B.y, bawaPalet, bawaKarton, diam, akhir: (diam ? A.p : B.p).clone() };
    };

    const arah = new THREE.Vector3(), baru = new THREE.Vector3();
    const gerakkan = (a: Aktor, ke: V) => {
      arah.subVectors(ke, a.pos); arah.y = 0;
      if (arah.lengthSq() > 1e-6) a.obj.rotation.y = Math.atan2(-arah.z, arah.x);
      a.pos.copy(ke); a.obj.position.set(ke.x, 0, ke.z);
    };
    const menujuRumah = (a: Aktor, dtGame: number, kec: number) => {
      const jarak = a.pos.distanceTo(a.rumah); if (jarak < 0.05) return;
      baru.copy(a.pos).lerp(a.rumah, Math.min(1, (kec * dtGame) / jarak)); gerakkan(a, baru);
    };
    /** Posisi aktor pada progres f tugas: 0–22% jalan ke titik ambil, 22–32% ambil, 32–88% bawa, 88–100% taruh. */
    const posisiTugas = (r: Rencana, f: number, out: V) => {
      if (r.diam) return titikPada(r.awal, Math.min(1, f / 0.15), out);
      if (f < 0.22) return titikPada(r.awal, f / 0.22, out);
      if (f < 0.32) return titikPada(r.bawa, 0, out);
      if (f < 0.88) return titikPada(r.bawa, (f - 0.32) / 0.56, out);
      return titikPada(r.bawa, 1, out);
    };
    const angkatGarpu = (r: Rencana, f: number) => {
      const naik = (u: number, h: number) => Math.sin(Math.max(0, Math.min(1, u)) * Math.PI) * h;
      if (f >= 0.22 && f < 0.32) return Math.max(0.12, naik((f - 0.22) / 0.1, r.angkatA + 0.15));
      if (f >= 0.88) return Math.max(0.12, naik((f - 0.88) / 0.12, r.angkatB + 0.15));
      return r.bawaPalet && f >= 0.32 ? 0.12 : 0.05;
    };

    // ---------- mode jelajah: 1 karakter yang dikendalikan pemain
    const pemain = (bersih ? orangBersih : modelOrang)('#0ea5e9'); pemain.name = 'pemain'; pemain.visible = false; grup.add(pemain);
    const lblPemain = label('Anda', 'mhe'); lblPemain.position.set(0, 2.2, 0); pemain.add(lblPemain);
    const tandaPemain = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.65, 32), new THREE.MeshBasicMaterial({ color: '#0ea5e9', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    tandaPemain.rotation.x = -Math.PI / 2; tandaPemain.position.y = 0.03; pemain.add(tandaPemain);
    let animPemain: Animator | null = null;
    if (bersih) pakaiPekerjaMeshy(pemain, 'diam', an => { animPemain = an; });
    const posPemain = v(Math.min(L.stagingIn.x1 + 2.5, L.L - 1), L.W / 2);
    pemain.position.copy(posPemain);
    // rintangan: tapak rak & fasilitas (diperlebar 0,25 m)
    const rintangan: { x0: number; x1: number; z0: number; z1: number }[] = [
      ...L.rak.map(r => { const pj = r.nBay * r.bayW; return r.arah === 'z' ? { x0: r.x0, x1: r.x0 + r.depth, z0: r.z0, z1: r.z0 + pj } : { x0: r.x0, x1: r.x0 + pj, z0: r.z0, z1: r.z0 + r.depth }; }),
      ...L.fasilitas.map(fa => ({ x0: fa.x0, x1: fa.x1, z0: fa.z0, z1: fa.z1 })),
    ].map(b => ({ x0: b.x0 - 0.25, x1: b.x1 + 0.25, z0: b.z0 - 0.25, z1: b.z1 + 0.25 }));
    const bebas = (x: number, z: number) => {
      if (x < -30 || x > L.L - 0.3 || z < -12 || z > L.W + 12) return false;
      if (x > 0.25) { if (z < 0.3 || z > L.W - 0.3) return false; return !rintangan.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1); }
      if (x > -0.25) return L.dock.some(dk => Math.abs(z - dk.z) < 1.5);   // dinding depan: hanya lewat pintu dock
      return true;
    };
    const keyTombol = (e: KeyboardEvent, nilai: boolean) => {
      const k2 = kontrol.current; if (!k2.jelajah) return;
      const tg = e.target as HTMLElement; if (tg && ['INPUT', 'SELECT', 'TEXTAREA'].includes(tg.tagName)) return;
      const peta: Record<string, keyof KontrolGame['tombol']> = { w: 'maju', arrowup: 'maju', s: 'mundur', arrowdown: 'mundur', a: 'kiri', arrowleft: 'kiri', d: 'kanan', arrowright: 'kanan', shift: 'lari' };
      const kunci = e.key.toLowerCase();
      if (nilai && !e.repeat && k2.pemain) {
        // tombol sekali tekan mode kerja: E = aksi, R / F = naik / turun level garpu
        if (kunci === 'e') { k2.pemain.minta++; e.preventDefault(); return; }
        if (kunci === 'r') { k2.pemain.level = Math.min(L.levelY.length - 1, k2.pemain.level + 1); e.preventDefault(); return; }
        if (kunci === 'f') { k2.pemain.level = Math.max(0, k2.pemain.level - 1); e.preventDefault(); return; }
      }
      const t2 = peta[kunci]; if (!t2) return;
      k2.tombol[t2] = nilai; e.preventDefault();
    };
    const keyTurun = (e: KeyboardEvent) => keyTombol(e, true), keyNaik = (e: KeyboardEvent) => keyTombol(e, false);
    window.addEventListener('keydown', keyTurun); window.addEventListener('keyup', keyNaik);
    let jelajahLalu = false;
    const maju = new THREE.Vector3(), kanan = new THREE.Vector3(), langkahV = new THREE.Vector3();
    // ---------- mode kerja pemain (motion study): kendaraan, aksi ambil/taruh/cek/dokumen & pengukuran elemen
    let modeLalu: ModePemain = 'bebas';
    const wadahK = new THREE.Group(); wadahK.name = 'kendaraan'; pemain.add(wadahK);
    const kendaraanP = new Map<string, { g: THREE.Group; garpu?: THREE.Object3D; op: THREE.Object3D }>();
    const kartonP = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.38), bersih ? mat(WARNA_BERSIH.karton) : mat('#c8a26b', { map: teks('muatan') }));
    kartonP.position.set(0.35, 1.0, 0); kartonP.visible = false; pemain.add(kartonP);
    const dokP = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.22), mat('#ffffff')); dokP.position.set(0.3, 1.05, 0.12); dokP.visible = false; pemain.add(dokP);
    const gKartonP = new THREE.Group(); grup.add(gKartonP);
    const kartonTaruh = new Map<string, number>();
    const gCekP = new THREE.Group(); grup.add(gCekP);
    const mejaAdmin = v(Math.min(L.stagingIn.x1 + 0.9, L.L - 1), L.stagingIn.z1);
    const meja = new THREE.Group();
    meja.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), mat('#94a3b8'))); meja.children[0].position.y = 0.75;
    const layar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.5), mat('#1e293b')); layar.position.set(-0.3, 0.98, 0); meja.add(layar);
    for (const [x, z] of [[-0.62, -0.3], [0.62, -0.3], [-0.62, 0.3], [0.62, 0.3]]) { const kaki = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), mat('#475569')); kaki.position.set(x, 0.375, z); meja.add(kaki); }
    meja.position.set(mejaAdmin.x + 0.9, 0, mejaAdmin.z); meja.visible = false; grup.add(meja);
    let garpuP = 0.15;                       // tinggi garpu pemain (m)
    let bawaP: { lpn: string; sku: string } | null = null;
    let aksiP: { nama: string; mulai: number; durasi: number; garpu?: (f: number) => number; lekat?: number; saatLekat?: () => void; selesai: () => void; lekatSudah?: boolean } | null = null;
    let jamP = 0, mintaLalu = 0, kartonDari: string | null = null, dokumenDari = '';
    const arahP = () => ({ x: Math.cos(pemain.rotation.y), z: -Math.sin(pemain.rotation.y) });
    const depanP = (jarak: number) => { const a = arahP(); return { x: posPemain.x + a.x * jarak, z: posPemain.z + a.z * jarak }; };
    const ambilKendaraan = (mode: ModePemain) => {
      let o = kendaraanP.get(mode); if (o) return o;
      const jenis = mode === 'cbt' ? 'forklift' : mode === 'reach' ? 'reach' : 'hpt';
      const g = (bersih ? forkliftBersih : modelMhe)(jenis, jenis === 'reach' ? Math.min(L.tinggiRak, L.H - 0.4) * 0.45 : 2.4);
      if (bersih) pakaiModelMeshy(g, jenis);
      const op = (bersih ? orangBersih : modelOrang)('#0ea5e9'); op.scale.setScalar(0.85);
      if (jenis === 'forklift') op.position.set(-0.35, 0.55, 0); else if (jenis === 'hpt') op.position.set(-1.05, 0, 0); else op.position.set(-0.55, 0.2, 0);
      g.add(op); if (bersih) pakaiPekerjaMeshy(op, jenis === 'forklift' ? 'duduk' : 'diam', an => animator.push(an));
      o = { g, garpu: g.getObjectByName('garpu') ?? undefined, op }; kendaraanP.set(mode, o); return o;
    };
    const lepasBawaan = () => { if (bawaP) { angkatP = null; bawaP = null; verPemain++; } kartonP.visible = false; dokP.visible = false; kartonDari = null; dokumenDari = ''; };
    const gantiMode = (sp: StudiPemain, lalu: ModePemain) => {
      void lalu; aksiP = null; sp.aksi = null; lepasBawaan(); sp.bawa = null; sp.berjalan = null; garpuP = 0.15;
      modeLalu = sp.mode;
      wadahK.clear(); const kendaraan = sp.mode === 'cbt' || sp.mode === 'reach' || sp.mode === 'hpt';
      if (kendaraan) wadahK.add(ambilKendaraan(sp.mode).g);
      for (const c of pemain.children) if (c !== wadahK && c !== lblPemain && c !== tandaPemain && c !== kartonP && c !== dokP) c.visible = !kendaraan;
      meja.visible = sp.mode === 'admin';
      sp.level = 0;
    };
    /** Kandidat palet di depan pemain (dalam jangkauan), diurutkan menurut kedekatan ke level target. */
    const paletDepan = (jarakDepan: number, maksY: number, sp: StudiPemain, kecuali?: string) => {
      const f = depanP(jarakDepan); const ty = L.levelY[sp.level] ?? 0;
      return instPalet.filter(p => p.id !== kecuali && p.y <= maksY && Math.hypot(p.x - f.x, p.z - f.z) < 1.15)
        .sort((a, b) => Math.abs(a.y - ty) - Math.abs(b.y - ty) || Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z));
    };
    /** Tujuan taruh palet: slot rak / lantai kosong di depan (level target), atau lantai bebas. */
    const tujuanTaruh = (jarakDepan: number, sp: StudiPemain, lantaiSaja: boolean) => {
      const f = depanP(jarakDepan); const ty = L.levelY[sp.level] ?? 0;
      const terpakai = new Set([...pindahP.values()].map(o => o.lokTaruh));
      if (!lantaiSaja) {
        const lok = lokSimpan.filter(l => !l.lpn.length && !l.dipesan && !terpakai.has(l.id) && Math.hypot(l.x - f.x, l.z - f.z) < 1.15)
          .sort((a, b) => Math.abs(a.y - ty) - Math.abs(b.y - ty) || Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z))[0];
        if (lok && (sp.level > 0 || lok.y < 0.1)) return { x: lok.x, y: lok.y, z: lok.z, lok: lok.id, rot: lok.tipe === 'rak' ? Math.PI / 2 : 0, ket: lok.tipe === 'rak' ? `rak level ${levelDari(lok.y) + 1}` : 'lokasi lantai' };
      }
      if (sp.level === 0 && bebas(f.x, f.z) && !instPalet.some(p => p.y < 0.1 && Math.hypot(p.x - f.x, p.z - f.z) < 1.0)) return { x: f.x, y: 0, z: f.z, lok: null, rot: pemain.rotation.y + Math.PI / 2, ket: 'lantai' };
      return null;
    };
    const levelDari = (y: number) => L.levelY.reduce((b, ly, i) => (Math.abs(ly - y) < Math.abs(L.levelY[b] - y) ? i : b), 0);
    const dekatDock = () => L.dock.some(dk => Math.abs(posPemain.z - dk.z) < 2.2 && posPemain.x < 3.2);
    const dekatMeja = () => Math.hypot(posPemain.x - (mejaAdmin.x + 0.9), posPemain.z - mejaAdmin.z) < 1.8;
    /** Profil tinggi garpu: [posisi] → naik/turun ke h1 → [masuk/letak] ke h2 → kembali ke tinggi jalan. */
    const profilGarpu = (h0: number, h1: number, h2: number, t1: number, t2: number, t3: number, t4: number) => {
      const T = t1 + t2 + t3 + t4; const lerp = (a: number, b: number, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
      return { T, f: (f: number) => { const tt = f * T; return tt < t1 ? h0 : tt < t1 + t2 ? lerp(h0, h1, (tt - t1) / Math.max(1e-6, t2)) : tt < t1 + t2 + t3 ? lerp(h1, h2, (tt - t1 - t2) / Math.max(1e-6, t3)) : lerp(h2, 0.15, (tt - t1 - t2 - t3) / Math.max(1e-6, t4)); }, lekat: (t1 + t2 + t3 * 0.5) / T };
    };
    const selesaiSiklus = (sp: StudiPemain, jenis: JenisTugas, ket: string, qty: number, satuan: SiklusStudi['satuan'], tinggi: number) => {
      const b = sp.berjalan; if (!b) return;
      const totalAksi = Object.values(b.aksi).reduce((a, x) => a + x, 0);
      sp.siklus.push({ no: sp.siklus.length + 1, mode: sp.mode, jenis, ket, qty, satuan, jalan: { ...b.jalan }, bawa: { ...b.bawa }, aksi: { ...b.aksi }, diam: b.diam, total: b.jalan.s + b.bawa.s + totalAksi + b.diam, tinggi });
      sp.berjalan = null;
    };
    const mulaiAksiP = (sp: StudiPemain) => {
      const m = sp.mode; const kendaraan = m === 'cbt' || m === 'reach';
      if (m === 'cbt' || m === 'reach' || m === 'hpt') {
        const jd = m === 'hpt' ? 1.0 : 1.6;
        if (!bawaP) {
          const p = paletDepan(jd, m === 'hpt' ? 0.1 : 99, sp)[0]; if (!p) return;
          const l = d.lpn.get(p.id)!;
          const dariRak = !!p.lok && d.lokasi.get(p.lok)?.tipe === 'rak' && p.y > 0.1;
          const pr = kendaraan ? profilGarpu(garpuP, p.y + 0.05, p.y + 0.15, ELEMEN.posisi, Math.abs(p.y + 0.05 - garpuP) / ELEMEN.naik[m], ELEMEN.masukAngkat, (p.y + 0.15 - 0.15) / ELEMEN.turun[m]) : null;
          aksiP = { nama: 'ambil', mulai: jamP, durasi: pr ? pr.T : ELEMEN.hptAmbil, garpu: pr?.f, lekat: pr ? pr.lekat : 0.7,
            saatLekat: () => { if (pindahP.has(p.id)) lepasPindah(p.id); angkatP = p.id; bawaP = { lpn: p.id, sku: l.sku }; sp.bawa = 'palet'; verPemain++; kartonDari = dariRak ? 'rak' : 'lantai'; tinggiSiklus = Math.max(tinggiSiklus, p.y); },
            selesai: () => { garpuP = m === 'hpt' ? 0.08 : 0.15; } };
        } else {
          const tj = tujuanTaruh(jd, sp, m === 'hpt'); if (!tj) return;
          const pr = kendaraan ? profilGarpu(garpuP, tj.y + 0.15, tj.y + 0.02, ELEMEN.posisi, Math.abs(tj.y + 0.15 - garpuP) / ELEMEN.naikBeban[m], ELEMEN.letakMundur, (tj.y + 0.02 - 0.15) / ELEMEN.turun[m]) : null;
          const asal = d.lpn.get(bawaP.lpn)!; const lokAsal = asal.lokasi;
          aksiP = { nama: 'taruh', mulai: jamP, durasi: pr ? pr.T : ELEMEN.hptTaruh, garpu: pr?.f, lekat: pr ? pr.lekat : 0.5,
            saatLekat: () => {
              const id = bawaP!.lpn; angkatP = null; bawaP = null; sp.bawa = null;
              if (tj.lok) { const lk = d.lokasi.get(tj.lok); if (lk) lk.dipesan++; }
              pindahP.set(id, { x: tj.x, y: tj.y, z: tj.z, rot: tj.rot, lokAsal, lokTaruh: tj.lok }); verPemain++;
              tinggiSiklus = Math.max(tinggiSiklus, tj.y);
              const keRak = !!tj.lok && d.lokasi.get(tj.lok)?.tipe === 'rak';
              const jenis: JenisTugas = keRak ? 'putaway' : kartonDari === 'rak' ? 'pick_palet' : 'bongkar';
              catatTaruh = () => selesaiSiklus(sp, jenis, keRak ? (kartonDari === 'rak' ? `relokasi rak → ${tj.ket}` : `putaway ke ${tj.ket}`) : kartonDari === 'rak' ? 'rak → lantai / staging' : 'pindah palet di lantai', 1, 'palet', tinggiSiklus);
            },
            // siklus ditutup setelah garpu turun / ditarik keluar (seluruh waktu taruh terhitung)
            selesai: () => { garpuP = m === 'hpt' ? 0.08 : 0.15; catatTaruh?.(); catatTaruh = null; tinggiSiklus = 0; } };
        }
      } else if (m === 'picker') {
        if (!kartonP.visible) {
          const p = paletDepan(0.8, 1.8, { ...sp, level: 0 })[0]; if (!p) return;
          const jangkau = p.y > 1.0 || p.y + p.h > 1.6 ? ELEMEN.kartonJangkau : 0;
          aksiP = { nama: 'karton_ambil', mulai: jamP, durasi: ELEMEN.kartonAmbil + jangkau, selesai: () => { kartonP.visible = true; sp.bawa = 'karton'; kartonDari = p.id; tinggiSiklus = p.y; } };
        } else {
          const p = paletDepan(0.8, 1.8, { ...sp, level: 0 }, kartonDari ?? undefined)[0]; if (!p) return;
          aksiP = { nama: 'karton_taruh', mulai: jamP, durasi: ELEMEN.kartonTaruh, selesai: () => {
            kartonP.visible = false; sp.bawa = null;
            const i = kartonTaruh.get(p.id) ?? 0; kartonTaruh.set(p.id, i + 1);
            if (gKartonP.children.length < 300) {
              const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.36), bersih ? mat(WARNA_BERSIH.karton) : mat('#c8a26b', { map: teks('muatan') }));
              const lap = Math.floor(i / 6), j = i % 6; kb.position.set(p.x - 0.33 + (j % 3) * 0.33, p.y + p.h + 0.16 + lap * 0.31, p.z - 0.2 + Math.floor(j / 3) * 0.4); gKartonP.add(kb);
            }
            selesaiSiklus(sp, 'pick_karton', 'ambil karton → palet tujuan', 1, 'karton', tinggiSiklus);
          } };
        }
      } else if (m === 'checker') {
        const p = paletDepan(0.9, 2.6, { ...sp, level: 0 })[0]; if (!p) return;
        aksiP = { nama: 'scan', mulai: jamP, durasi: ELEMEN.scan, selesai: () => {
          if (gCekP.children.length < 300) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), new THREE.MeshBasicMaterial({ color: '#16a34a' })); c.rotation.x = Math.PI / 2; c.position.set(p.x, p.y + p.h + 0.08, p.z); gCekP.add(c); }
          selesaiSiklus(sp, 'cek_in', 'scan & cek 1 palet', 1, 'palet', p.y);
        } };
      } else if (m === 'admin') {
        if (!dokP.visible) {
          if (!dekatDock()) return;
          aksiP = { nama: 'dok_terima', mulai: jamP, durasi: ELEMEN.dokTerima, selesai: () => { dokP.visible = true; sp.bawa = 'dokumen'; dokumenDari = 'dock'; } };
        } else {
          if (!dekatMeja()) return;
          aksiP = { nama: 'dok_input', mulai: jamP, durasi: ELEMEN.dokInput, selesai: () => { dokP.visible = false; sp.bawa = null; selesaiSiklus(sp, 'admin_in', `dokumen dari ${dokumenDari} → input di meja`, 1, 'dokumen', 0); } };
        }
      }
      if (aksiP && !sp.berjalan) sp.berjalan = { mulai: jamP, jalan: { s: 0, m: 0 }, bawa: { s: 0, m: 0 }, aksi: {}, diam: 0 };
    };
    let tinggiSiklus = 0; let catatTaruh: (() => void) | null = null;
    /** Petunjuk kontekstual (apa yang terjadi bila E ditekan). */
    const petunjukP = (sp: StudiPemain): string => {
      const m = sp.mode; const f1 = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
      if (m === 'bebas') return 'Jalan bebas — dekati pekerja / MHE untuk mengamati.';
      if (aksiP) return `${LABEL_AKSI[aksiP.nama] ?? aksiP.nama}…`;
      if (m === 'cbt' || m === 'reach' || m === 'hpt') {
        const jd = m === 'hpt' ? 1.0 : 1.6;
        if (!bawaP) { const p = paletDepan(jd, m === 'hpt' ? 0.1 : 99, sp)[0]; return p ? `E = ambil palet (tinggi ${f1(p.y)} m)` : m === 'hpt' ? 'Arahkan garpu ke palet di lantai' : `Arahkan garpu ke palet — target level ${sp.level + 1} (R/F ganti level)`; }
        const tj = tujuanTaruh(jd, sp, m === 'hpt'); return tj ? `E = taruh di ${tj.ket} (tinggi ${f1(tj.y)} m)` : sp.level > 0 ? `Cari slot rak kosong level ${sp.level + 1} (R/F ganti level)` : 'Cari lantai kosong / slot kosong';
      }
      if (m === 'picker') { const p = paletDepan(0.8, 1.8, { ...sp, level: 0 }, kartonP.visible ? kartonDari ?? undefined : undefined)[0]; return kartonP.visible ? (p ? 'E = taruh karton di palet ini' : 'Bawa karton ke palet tujuan') : p ? 'E = ambil 1 karton' : 'Dekati palet (≤ 1,8 m tinggi)'; }
      if (m === 'checker') return paletDepan(0.9, 2.6, { ...sp, level: 0 })[0] ? 'E = scan & cek palet' : 'Dekati palet untuk dicek';
      if (m === 'admin') return dokP.visible ? (dekatMeja() ? 'E = input & konfirmasi dokumen' : 'Bawa dokumen ke meja admin (dekat staging)') : dekatDock() ? 'E = terima dokumen dari sopir' : 'Jalan ke pintu dock untuk menerima dokumen';
      return '';
    };
    /** Jalankan aksi berjalan, ukur elemen siklus, posisi garpu & palet yang dibawa. */
    const kerjaPemain = (sp: StudiPemain, dt: number, dGerak: number) => {
      jamP += dt;
      if (sp.minta !== mintaLalu) { mintaLalu = sp.minta; if (!aksiP && sp.mode !== 'bebas') mulaiAksiP(sp); }
      if (aksiP) {
        const f = Math.min(1, (jamP - aksiP.mulai) / Math.max(0.01, aksiP.durasi));
        if (aksiP.garpu) garpuP = aksiP.garpu(f);
        if (aksiP.lekat != null && !aksiP.lekatSudah && f >= aksiP.lekat) { aksiP.lekatSudah = true; aksiP.saatLekat?.(); }
        sp.aksi = { nama: aksiP.nama, f, sisa: Math.max(0, aksiP.durasi - (jamP - aksiP.mulai)) };
        if (sp.berjalan) sp.berjalan.aksi[aksiP.nama] = (sp.berjalan.aksi[aksiP.nama] ?? 0) + dt;
        if (f >= 1) { const a = aksiP; aksiP = null; sp.aksi = null; if (a.lekat != null && !a.lekatSudah) a.saatLekat?.(); a.selesai(); }
      } else if (sp.mode !== 'bebas') {
        if (!sp.berjalan && dGerak > 0.0005) sp.berjalan = { mulai: jamP, jalan: { s: 0, m: 0 }, bawa: { s: 0, m: 0 }, aksi: {}, diam: 0 };
        const b = sp.berjalan;
        if (b) { if (dGerak > 0.0005) { const e = sp.bawa ? b.bawa : b.jalan; e.s += dt; e.m += dGerak; } else b.diam += dt; }
      }
      sp.petunjuk = petunjukP(sp);
      const kd = kendaraanP.get(sp.mode);
      if (kd?.garpu) { kd.garpu.position.y = garpuP; if (kd.garpu.userData.angkatSaja) kd.garpu.visible = garpuP > 0.3; }
      if (bawaP) { const a = arahP(); bawaPemain = { pos: v(posPemain.x + a.x * 1.0, posPemain.z + a.z * 1.0, Math.max(0.02, garpuP + 0.02)), rot: pemain.rotation.y + Math.PI / 2, sku: bawaP.sku, lpn: bawaP.lpn }; }
      else bawaPemain = null;
    };
    let bawaPemain: { pos: V; rot: number; sku: string; lpn: string | null } | null = null;
    const FASE = (r: Rencana, f: number) => (r.diam ? (f < 0.15 ? 0 : 1) : f < 0.22 ? 0 : f < 0.32 ? 1 : f < 0.88 ? 2 : 3);
    const updateJelajah = (dt: number) => {
      const k = kontrol.current;
      pemain.visible = k.jelajah;
      if (!k.jelajah) {
        if (jelajahLalu) { kontrolKamera.minDistance = 0; aksiP = null; lepasBawaan(); if (k.pemain) { k.pemain.aksi = null; k.pemain.bawa = null; k.pemain.berjalan = null; } }
        jelajahLalu = false; k.amatan = null; return;
      }
      if (!jelajahLalu) {
        // masuk mode jelajah: kamera orang-ketiga di belakang pemain
        kontrolKamera.target.set(posPemain.x, 1.5, posPemain.z);
        kamera.position.set(posPemain.x - 7, 4.5, posPemain.z + 5); kontrolKamera.minDistance = 2.5;
        jelajahLalu = true;
      }
      const t = k.tombol; const sp = (k.pemain ??= studiAwal());
      if (k.teleport) {   // pindah posisi tanpa diukur (siklus berjalan dibatalkan)
        const tp = k.teleport; k.teleport = undefined; const gs = v(tp.x - posPemain.x, tp.z - posPemain.z);
        posPemain.set(tp.x, 0, tp.z); pemain.rotation.y = tp.rot ?? pemain.rotation.y; kamera.position.add(gs); kontrolKamera.target.add(gs); sp.berjalan = null;
      }
      if (sp.mode !== modeLalu) gantiMode(sp, modeLalu);
      const naikKendaraan = sp.mode === 'cbt' || sp.mode === 'reach' || sp.mode === 'hpt';
      const gx = (t.kanan ? 1 : 0) - (t.kiri ? 1 : 0), gz = (t.maju ? 1 : 0) - (t.mundur ? 1 : 0);
      const lama = posPemain.clone();
      const mk = MODE_PEMAIN[sp.mode]; const kec = sp.mode === 'bebas' && t.lari ? 4.5 : sp.bawa ? mk.kec.bawa : mk.kec.kosong;
      if ((gx || gz) && !aksiP) {
        maju.subVectors(kontrolKamera.target, kamera.position); maju.y = 0; maju.normalize();
        kanan.set(-maju.z, 0, maju.x);
        langkahV.copy(maju).multiplyScalar(gz).addScaledVector(kanan, gx).normalize().multiplyScalar(kec * Math.min(0.1, dt));
        const nx = posPemain.x + langkahV.x, nz = posPemain.z + langkahV.z;
        const ux = langkahV.x / Math.max(1e-6, langkahV.length()), uz = langkahV.z / Math.max(1e-6, langkahV.length());
        const lolos = (x: number, z: number) => bebas(x, z) && (!naikKendaraan || bebas(x + ux * 0.9, z + uz * 0.9));
        if (lolos(nx, posPemain.z)) posPemain.x = nx;
        if (lolos(posPemain.x, nz)) posPemain.z = nz;
        pemain.rotation.y = Math.atan2(-langkahV.z, langkahV.x);
      }
      const geser = posPemain.clone().sub(lama);
      pemain.position.set(posPemain.x, 0, posPemain.z);
      kamera.position.add(geser); kontrolKamera.target.add(geser);
      const dGerak = Math.hypot(geser.x, geser.z);
      sp.kecepatan = dt > 0 ? dGerak / Math.min(0.1, dt) : 0;
      sp.posisi = { x: posPemain.x, z: posPemain.z };
      animPemain?.main(naikKendaraan ? 'duduk' : aksiP ? 'kerja' : gx || gz ? (t.lari && sp.mode === 'bebas' ? 'lari' : 'jalan') : 'diam');
      animPemain?.mixer.update(Math.min(0.1, dt));
      kerjaPemain(sp, Math.min(0.1, dt), dGerak);
      // observasi: pekerja / MHE terdekat dalam 8 m
      let terbaik: Amatan | null = null; let dMin = 8;
      for (const p of d.pekerja) {
        const a = orang.get(p.id); if (!a) continue;
        const tg = p.sibuk ? d.tugas.get(p.sibuk) : undefined;
        const posA = tg?.mhe ? mhe.get(tg.mhe)?.obj.position : a.obj.visible ? a.obj.position : undefined;
        if (!posA) continue;
        const jarak = Math.hypot(posA.x - posPemain.x, posA.z - posPemain.z); if (jarak > dMin) continue;
        dMin = jarak;
        let tugas: Amatan['tugas'] = null;
        if (tg && a.rencana && tg.mulai != null && tg.durasi) {
          const f = Math.max(0, Math.min(1, (d.t - tg.mulai) / tg.durasi)); const ix = FASE(a.rencana, f);
          const ll = LANGKAH[tg.jenis].length === (a.rencana.diam ? 2 : 4) ? LANGKAH[tg.jenis] : a.rencana.diam ? LANGKAH_DIAM : LANGKAH_TUGAS;
          tugas = { id: tg.id, jenis: tg.jenis, fase: ll[ix], langkah: ix, langkahList: ll, f, durasiStd: tg.durasi, berjalan: d.t - tg.mulai, jarakJalur: a.rencana.jarak,
            kecepatan: a.rencana.jarak / (tg.durasi * (a.rencana.diam ? 0.15 : 0.78)), bantu: tg.bantu, porsiJalan: a.rencana.diam ? 0.15 : 0.78 };
        }
        const ket = a.patroli ? (kategoriOrang(p.role) === 'security' ? 'Patroli keamanan di area dock' : 'Supervisi & patroli area kerja') : undefined;
        terbaik = tg?.mhe ? { id: tg.mhe, jenis: 'mhe', nama: `${d.mhe.find(m => m.id === tg.mhe)?.nama ?? tg.mhe} · ${p.nama}`, role: p.role, jarak, tugas } : { id: p.id, jenis: 'pekerja', nama: p.nama, role: p.role, ket, jarak, tugas };
      }
      k.amatan = terbaik;
    };

    let tLalu = d.t, tPatroli = 0;
    const panjangRute = (r: V[]) => [...r, r[0]].reduce((a, q, i, arr) => (i ? a + q.distanceTo(arr[i - 1]) : 0), 0);
    const frame = (dt: number) => {
      updateJelajah(dt);
      detikNyata += dt;
      const k = kontrol.current;
      if (k.jalan && d.t < k.batas) {
        jalankanSampai(d, Math.min(k.batas, d.t + dt * k.kecepatan));
        if (d.t >= k.batas) { k.jalan = false; onBerhenti(); }
      }
      const dtGame = Math.max(0, d.t - tLalu); tLalu = d.t;
      const dibawa: { pos: V; rot: number; sku: string; lpn: string | null }[] = [];
      const pakaiMhe = new Set<string>();
      if (bawaPemain && kontrol.current.jelajah) dibawa.push(bawaPemain);

      if (k.jalan) tPatroli += Math.min(0.1, dt) * Math.min(3, Math.max(1, Math.log10(k.kecepatan + 1)));
      for (const p of d.pekerja) {
        const a = orang.get(p.id); if (!a) continue;
        if (a.patroli) {
          a.obj.visible = !p.absen && bertugas(d, p.shift, d.t);
          if (a.obj.visible) { titikPada([...a.patroli, a.patroli[0]], ((tPatroli * 1.1 + p.id.length * 7.3) % panjangRute(a.patroli)) / panjangRute(a.patroli), baru); gerakkan(a, baru); }
          continue;
        }
        const tg = p.sibuk ? d.tugas.get(p.sibuk) : undefined;
        const tampak = !p.absen && (!!tg || bertugas(d, p.shift, d.t));
        // tugas berganti → posisi awal = titik akhir tugas sebelumnya
        if (a.tugas !== (tg?.id ?? null)) {
          if (a.rencana) { const ma = a.rencana; const ak = a.tugas ? d.tugas.get(a.tugas) : undefined; const m2 = ak?.mhe ? mhe.get(ak.mhe) : undefined; if (m2) { m2.pos.copy(ma.akhir); } a.pos.copy(ma.akhir); }
          a.tugas = tg?.id ?? null; a.rencana = null;
          if (tg) { const m2 = tg.mhe ? mhe.get(tg.mhe) : undefined; a.rencana = rencanaTugas(tg, m2 ? m2.pos : a.pos); }
        }
        if (tg && a.rencana && tg.mulai != null && tg.durasi) {
          const f = Math.max(0, Math.min(1, (d.t - tg.mulai) / tg.durasi));
          posisiTugas(a.rencana, f, baru);
          const m2 = tg.mhe ? mhe.get(tg.mhe) : undefined;
          const bawa = f >= 0.32 && f < 0.92;
          if (m2) {
            pakaiMhe.add(m2.obj.uuid); a.obj.visible = false; a.naik = tg.mhe;
            gerakkan(m2, baru); a.pos.copy(baru);
            if (m2.op) m2.op.visible = true;
            const hg = angkatGarpu(a.rencana, f); if (m2.garpu) { m2.garpu.position.y = hg; if (m2.garpu.userData.angkatSaja) m2.garpu.visible = hg > 0.3; }
            if (a.rencana.bawaPalet && bawa) {
              const sku = tg.lpn ? d.lpn.get(tg.lpn)?.sku ?? '' : tg.barisAsn?.sku ?? '';
              const rot = m2.obj.rotation.y;
              dibawa.push({ pos: v(baru.x + Math.cos(rot) * 1.0, baru.z - Math.sin(rot) * 1.0, hg + 0.02), rot: rot + Math.PI / 2, sku, lpn: tg.jenis === 'putaway' || tg.jenis === 'pick_palet' ? tg.lpn ?? null : null });
            }
          } else {
            a.obj.visible = tampak; gerakkan(a, baru);
            if (a.karton) a.karton.visible = (a.rencana.bawaKarton || a.rencana.bawaPalet) && bawa;
            // pekerja diam (cek/admin/pack) sedikit bergoyang supaya terlihat bekerja
            if (a.rencana.diam) a.obj.rotation.y += Math.sin(detikNyata * 3) * 0.02;
          }
        } else if (a.naik) {
          // operator tetap di atas MHE sampai MHE kembali ke parkir, lalu turun
          const m2 = mhe.get(a.naik)!; const dipakaiLain = d.mhe.find(x => x.id === a.naik)?.sibuk;
          if (dipakaiLain || m2.pos.distanceTo(m2.rumah) < 0.05) { a.naik = undefined; a.pos.copy(m2.rumah).add(v(0, 1.3)); a.obj.position.copy(a.pos); a.obj.visible = tampak; }
          else { a.obj.visible = false; menujuRumah(m2, dtGame, KEC_MHE); pakaiMhe.add(m2.obj.uuid); if (m2.op) m2.op.visible = true; if (m2.garpu) { m2.garpu.position.y = 0.05; if (m2.garpu.userData.angkatSaja) m2.garpu.visible = false; } }
        } else {
          a.obj.visible = tampak; if (a.karton) a.karton.visible = false;
          menujuRumah(a, dtGame, KEC_JALAN);
        }
      }
      for (const m of mhe.values()) {
        if (pakaiMhe.has(m.obj.uuid)) continue;
        if (m.op) m.op.visible = false; if (m.garpu) { m.garpu.position.y = 0.05; if (m.garpu.userData.angkatSaja) m.garpu.visible = false; }
        menujuRumah(m, dtGame, KEC_MHE);
      }
      gambarPalet(dibawa);
      // snapshot posisi untuk tampilan 2D
      const a2: Aktor2D[] = [];
      const mheSibuk = new Map<string, { bawa: Aktor2D['bawa']; tugas: JenisTugas }>();
      for (const p of d.pekerja) {
        const a = orang.get(p.id); if (!a) continue;
        const tg = p.sibuk ? d.tugas.get(p.sibuk) : undefined;
        const f = tg && tg.mulai != null && tg.durasi ? (d.t - tg.mulai) / tg.durasi : 0;
        const bawa: Aktor2D['bawa'] = tg && a.rencana && f >= 0.32 && f < 0.92 ? (a.rencana.bawaPalet ? 'palet' : a.rencana.bawaKarton ? 'karton' : null) : null;
        if (tg?.mhe) mheSibuk.set(tg.mhe, { bawa, tugas: tg.jenis });
        if (!a.obj.visible) continue;
        a2.push({ id: p.id, jenis: 'pekerja', x: a.obj.position.x, z: a.obj.position.z, rot: a.obj.rotation.y, sibuk: !!tg || !!a.patroli, bawa, kemampuan: p.kemampuan ?? kategoriOrang(p.role), tugas: tg?.jenis });
      }
      for (const [id, m] of mhe) { const s = mheSibuk.get(id); a2.push({ id, jenis: 'mhe', x: m.obj.position.x, z: m.obj.position.z, rot: m.obj.rotation.y, sibuk: !!s || !!d.mhe.find(x => x.id === id)?.sibuk, bawa: s?.bawa ?? null, mhe: d.mhe.find(x => x.id === id)?.jenis, tugas: s?.tugas }); }
      k.aktor2d = a2;
      perbaruiTruk();
      perbaruiPin();
      // animasi pekerja: jalan saat berpindah, gerakan kerja saat cek/admin/packing, selain itu berdiri siaga
      for (const [pid, a] of orang) {
        if (!a.anim || !a.obj.visible) continue;
        const gerak = a.sebelum ? a.sebelum.distanceTo(a.obj.position) > 0.002 : false;
        (a.sebelum ??= new THREE.Vector3()).copy(a.obj.position);
        const p = d.pekerja.find(x => x.id === pid); const tg = p?.sibuk ? d.tugas.get(p.sibuk) : undefined;
        a.anim.main(gerak && k.jalan ? (k.kecepatan >= 300 ? 'lari' : 'jalan') : tg ? 'kerja' : 'diam');
      }
      const dtAnim = k.jalan ? Math.min(0.1, dt) * Math.min(3, Math.max(1, Math.log10(k.kecepatan + 1))) : dt * 0.6;
      for (const an of animator) an.mixer.update(dtAnim);
    };

    // ---------- pin penanda objek terpilih
    const pin = pinBersih(); pin.visible = false; grup.add(pin);
    const cincin = pin.getObjectByName('cincin')!;
    const posPilihan = (p: Pilihan): V | null => {
      switch (p.jenis) {
        case 'palet': return posPalet.get(p.id)?.clone() ?? null;
        case 'mhe': { const a = mhe.get(p.id); return a ? v(a.obj.position.x, a.obj.position.z, 2.5) : null; }
        case 'pekerja': { const a = orang.get(p.id); return a && a.obj.visible ? v(a.obj.position.x, a.obj.position.z, 1.9) : null; }
        case 'truk': {
          for (const o of [...trukDock.values(), ...antre.inbound, ...antre.outbound]) if (o.g.visible && o.g.userData.pilih?.id === p.id) { const w = new THREE.Vector3(-6, 0, 0); o.g.localToWorld(w); return v(w.x, w.z, 4.2); }
          return null;
        }
        case 'order': {
          const id = stgOut.lpn.find(x => d.lpn.get(x)?.order === p.id); if (id) return posPalet.get(id)?.clone() ?? null;
          const o = d.order.get(p.id); return o?.truk ? posPilihan({ jenis: 'truk', id: o.truk }) : null;
        }
      }
    };
    const perbaruiPin = () => {
      const p = kontrol.current.pilih; const pos = p ? posPilihan(p) : null;
      pin.visible = !!pos; if (!pos) return;
      const naik = Math.sin(detikNyata * 3) * 0.12;
      pin.position.set(pos.x, pos.y + 0.3 + naik, pos.z); cincin.position.y = -(pos.y + 0.3 + naik) + 0.03;
      pin.rotation.y = detikNyata * 0.8;
      const sk = Math.max(0.8, Math.min(2.2, kamera.position.distanceTo(pin.position) / 30)); pin.scale.setScalar(sk);
    };

    // ---------- klik untuk memilih (bedakan dari drag kamera)
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    let turun: { x: number; y: number } | null = null;
    const saatTurun = (e: PointerEvent) => { turun = { x: e.clientX, y: e.clientY }; };
    const saatNaik = (e: PointerEvent) => {
      if (!turun || Math.hypot(e.clientX - turun.x, e.clientY - turun.y) > 5) { turun = null; return; }
      turun = null;
      const r = kanvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, kamera);
      const kena = ray.intersectObjects([muat, alas, gMhe, gOrang, gTruk], true);
      for (const k of kena) {
        if (!k.object.visible) continue;
        if ((k.object === muat || k.object === alas) && k.instanceId != null) { const id = idxLpn[k.instanceId]; if (id) { onPilih({ jenis: 'palet', id }); return; } continue; }
        let o: THREE.Object3D | null = k.object;
        while (o && !o.userData.pilih) o = o.parent;
        if (o?.userData.pilih) { onPilih(o.userData.pilih as Pilihan); return; }
      }
      onPilih(null);
    };
    kanvas.addEventListener('pointerdown', saatTurun); kanvas.addEventListener('pointerup', saatNaik);

    return {
      frame,
      buang: () => {
        kanvas.removeEventListener('pointerdown', saatTurun); kanvas.removeEventListener('pointerup', saatNaik);
        window.removeEventListener('keydown', keyTurun); window.removeEventListener('keyup', keyNaik);
        grup.remove(pin, pemain); lblPemain.element.remove();
        grup.remove(gPalet, gTruk, gOrang, gMhe);
        grup.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
        for (const g of [gPalet, gTruk, gOrang, gMhe]) g.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
      },
    };
  };
}
