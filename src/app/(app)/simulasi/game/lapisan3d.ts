// Leca Game · lapisan 3D: menggambar keadaan mesin simulasi (Dunia) di atas gudang 3D.
// Palet = stok nyata per lokasi; truk = di dock / antre; MHE & pekerja bergerak sesuai tugas yang sedang berjalan
// (durasi tugas = productivity, dibagi fase: jalan ke ambil → ambil → bawa → taruh).
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { bertugas, jalankanSampai, type Dunia, type Kemampuan, type Lpn, type Tugas } from '@/lib/game';
import type { LayoutGudang, Lorong } from '@/lib/simulasi3d/layout';
import { label, mat, modelMhe, modelOrang, modelTruk, teks, type PasangLapisan } from '../Viewer3D';
import { forkliftBersih, orangBersih, pinBersih, trukBersih, WARNA_BERSIH } from '../model3d';
import { WARNA_ORANG } from '../warna';

export type Pilihan = { jenis: 'palet' | 'mhe' | 'pekerja' | 'truk' | 'order'; id: string };
export interface KontrolGame { jalan: boolean; kecepatan: number; batas: number; pilih: Pilihan | null }

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

interface Rencana { awal: V[]; bawa: V[]; angkatA: number; angkatB: number; bawaPalet: boolean; bawaKarton: boolean; diam: boolean; akhir: V }
interface Aktor { naik?: string; obj: THREE.Group; pos: V; rumah: V; tugas: string | null; rencana: Rencana | null; garpu?: THREE.Object3D; op?: THREE.Object3D; karton?: THREE.Object3D; lbl?: CSS2DObject }

export function buatLapisanGame(d: Dunia, layout: LayoutGudang, kontrol: { current: KontrolGame }, onBerhenti: () => void, onPilih: (p: Pilihan | null) => void): PasangLapisan {
  return ({ grup, kamera, kanvas, tema }) => {
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
    const muat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, tinggiMuat, 0.96), bersih ? mat('#ffffff', { roughness: 0.6 }) : mat('#ffffff', { roughness: 0.4, map: teks('muatan') }), kap);
    alas.castShadow = muat.castShadow = lokSimpan.length <= 4000; alas.receiveShadow = muat.receiveShadow = true;
    alas.frustumCulled = muat.frustumCulled = false;
    gPalet.add(alas, muat);
    const warnaSku = new Map<string, THREE.Color>();
    const palet = bersih ? ['#d8b07a', '#e2bf8c', '#cfa36c', '#e9cda0', '#d4a874', '#ddb784', '#c99c62', '#e5c596', '#d1aa78', '#dcb27c']
      : ['#ffffff', '#f4efe6', '#ebe3d4', '#fbf7f0', '#e6edf3', '#f1e9dc', '#fde9d9', '#e3f1e6', '#e8e4f5', '#f5f0d8'];
    [...d.sku.keys()].forEach((s, i) => warnaSku.set(s, new THREE.Color(palet[i % palet.length])));
    const tmp = new THREE.Object3D();
    let n = 0;
    const idxLpn: (string | null)[] = []; const posPalet = new Map<string, V>();
    const taruhPalet = (x: number, y: number, z: number, rot: number, sku: string, isi = 1, lpn: string | null = null) => {
      if (n >= kap) return;
      idxLpn[n] = lpn; if (lpn) posPalet.set(lpn, v(x, z, y + tinggiPalet));
      tmp.position.set(x, y + 0.07, z); tmp.rotation.set(0, rot, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); alas.setMatrixAt(n, tmp.matrix);
      const sk = Math.max(0.15, Math.min(1, isi));
      tmp.position.set(x, y + 0.14 + (tinggiMuat * sk) / 2, z); tmp.scale.set(1, sk, 1); tmp.updateMatrix(); muat.setMatrixAt(n, tmp.matrix);
      muat.setColorAt(n, warnaSku.get(sku) ?? new THREE.Color('#ffffff'));
      n++;
    };
    let kunciPalet = '';
    const gambarPalet = (dibawa: { pos: V; rot: number; sku: string; lpn: string | null }[]) => {
      // tugas yang memindahkan palet: palet sumber disembunyikan selama dibawa
      const sembunyi = new Set<string>();
      for (const p of d.pekerja) { const tg = p.sibuk ? d.tugas.get(p.sibuk) : undefined; if (tg?.lpn && (tg.jenis === 'putaway' || tg.jenis === 'pick_palet')) sembunyi.add(tg.lpn); }
      const kunci = `${d.seq}|${dibawa.length}|${dibawa.map(b => `${b.pos.x.toFixed(2)},${b.pos.y.toFixed(2)},${b.pos.z.toFixed(2)}`).join(';')}`;
      if (kunci === kunciPalet) return; kunciPalet = kunci;
      n = 0; posPalet.clear();
      for (const lok of lokSimpan) for (const id of lok.lpn) {
        if (sembunyi.has(id)) continue; const l = d.lpn.get(id)!;
        taruhPalet(lok.x, lok.y, lok.z, lok.tipe === 'rak' ? Math.PI / 2 : 0, l.sku, l.karton / (d.sku.get(l.sku)?.kartonPerPalet ?? l.karton), id);
      }
      for (const [lok, slot] of [[stgIn, slotIn], [stgOut, slotOut]] as const) lok.lpn.forEach((id, i) => {
        if (sembunyi.has(id)) return; const l = d.lpn.get(id)!; const p = slot(i);
        taruhPalet(p.x, p.y, p.z, 0, l.sku, l.karton / (d.sku.get(l.sku)?.kartonPerPalet ?? l.karton), id);
      });
      for (const b of dibawa) taruhPalet(b.pos.x, b.pos.y, b.pos.z, b.rot, b.sku, 1, b.lpn);
      alas.count = muat.count = n;
      alas.instanceMatrix.needsUpdate = muat.instanceMatrix.needsUpdate = true;
      alas.boundingSphere = muat.boundingSphere = null;   // supaya klik (raycast) memakai posisi palet terbaru
      if (muat.instanceColor) muat.instanceColor.needsUpdate = true;
    };

    // ---------- truk: satu per dock + antrean di halaman
    interface ObjTruk { g: THREE.Group; lbl: CSS2DObject; truk: string | null; mulai: number }
    const trukDock = new Map<string, ObjTruk>();
    const buatObjTruk = (arus: 'inbound' | 'outbound') => {
      const g = bersih ? trukBersih(arus) : modelTruk(arus); g.visible = false; gTruk.add(g);
      const lbl = label('', 'kecil'); lbl.position.set(-7, 4.4, 0); g.add(lbl);
      const o = { g, lbl, truk: null, mulai: 0 } as ObjTruk; g.userData.objTruk = o; return o;
    };
    for (const dk of d.dock) trukDock.set(dk.id, buatObjTruk(dk.arus));
    const antre = { inbound: Array.from({ length: 8 }, () => buatObjTruk('inbound')), outbound: Array.from({ length: 8 }, () => buatObjTruk('outbound')) };
    let detikNyata = 0;
    const isiTeks = (o: ObjTruk, s: string) => { if (o.lbl.element.textContent !== s) o.lbl.element.textContent = s; };
    const ketTruk = (id: string) => {
      const tr = d.truk.get(id); if (!tr) return id;
      if (tr.arus === 'inbound') return `${tr.id} · ${tr.palet.length} plt${tr.sisaTugas > 0 ? ` · sisa ${tr.sisaTugas}` : ''}`;
      return `${tr.id} · ${tr.order.length} order`;
    };
    const perbaruiTruk = () => {
      for (const dk of d.dock) {
        const o = trukDock.get(dk.id)!; const p = dockPos.get(dk.id)!;
        if (dk.truk !== o.truk) { o.truk = dk.truk; o.mulai = detikNyata; }
        o.g.visible = !!dk.truk; o.g.userData.pilih = dk.truk ? { jenis: 'truk', id: dk.truk } : null;
        if (dk.truk) { const f = Math.min(1, (detikNyata - o.mulai) / 1.2); o.g.position.set(-0.4 - (1 - f) * (1 - f) * 25, 0, p.z); isiTeks(o, ketTruk(dk.truk)); }
      }
      for (const arus of ['inbound', 'outbound'] as const) {
        const ids = d.antreDock[arus]; const pool = antre[arus];
        pool.forEach((o, i) => {
          const id = ids[i]; o.g.visible = !!id; o.g.userData.pilih = id ? { jenis: 'truk', id } : null;
          if (id) { o.g.rotation.y = Math.PI / 2; o.g.position.set(-24 - (i % 4) * 4, 0, arus === 'inbound' ? -6 - Math.floor(i / 4) * 16 : L.W + 18 + Math.floor(i / 4) * 16); isiTeks(o, `antre · ${ketTruk(id)}`); }
        });
      }
    };

    // ---------- MHE & pekerja
    const parkir = (i: number) => v(Math.min(L.stagingIn.x1 + 1.6, L.L - 1), Math.min(L.W - 1, 1.6 + i * 2.6));
    const mhe = new Map<string, Aktor>();
    d.mhe.forEach((m, i) => {
      const g = (bersih ? forkliftBersih : modelMhe)(m.jenis, m.jenis === 'reach' ? Math.min(L.tinggiRak, L.H - 0.4) * 0.45 : 2.4);
      g.userData.pilih = { jenis: 'mhe', id: m.id } satisfies Pilihan;
      const op = (bersih ? orangBersih : modelOrang)(WARNA_ORANG.operator); op.scale.setScalar(0.85); op.position.set(-0.45, 0.35, 0); op.visible = false; g.add(op);
      const lbl = label(m.nama.replace(/^(.{0,14}).*?(\d+)$/, '$1 $2'), 'mhe'); lbl.position.set(0, 3.1, 0); g.add(lbl);
      const p = parkir(i); g.position.copy(p); gMhe.add(g);
      mhe.set(m.id, { obj: g, pos: p.clone(), rumah: p.clone(), tugas: null, rencana: null, garpu: g.getObjectByName('garpu') ?? undefined, op, lbl });
    });
    const rumahOrang = (k: Kemampuan | null, i: number): V => {
      const j = (a: number) => ((i * 0.618 + a) % 1);
      switch (k) {
        case 'admin': return kantor ? v(kantor.x0 + 0.6 + j(0.1) * (kantor.x1 - kantor.x0 - 1.2), kantor.z0 + 0.6 + j(0.4) * (kantor.z1 - kantor.z0 - 1.2)) : v(5, 1.5 + i);
        case 'checker': return v(L.stagingIn.x1 - 1.2, L.stagingIn.z1 - 1 - j(0.2) * 3);
        case 'picker': return v(L.stagingOut.x1 - 1.2, L.stagingOut.z0 + 1 + j(0.3) * 3);
        case 'tkbm': return v(3.2 + j(0.5) * 1.5, (dIn[i % Math.max(1, dIn.length)]?.z ?? 3) + (i % 2 ? 1.8 : -1.8));
        case 'operator': return v(Math.min(L.stagingIn.x1 + 3, L.L - 1), Math.min(L.W - 1, 1.2 + j(0.7) * 4));
        default: return v(L.stagingIn.x1 + 1, L.W / 2 + j(0.9) * 4 - 2);
      }
    };
    const orang = new Map<string, Aktor>();
    d.pekerja.forEach((p, i) => {
      if (!p.kemampuan) return;   // supervisor/security: tidak mengerjakan tugas lantai
      const warna = WARNA_ORANG[p.kemampuan] ?? '#64748b';
      const g = (bersih ? orangBersih : modelOrang)(warna); g.userData.pilih = { jenis: 'pekerja', id: p.id } satisfies Pilihan;
      const karton = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.38), bersih ? mat(WARNA_BERSIH.karton) : mat('#c8a26b', { map: teks('muatan') })); karton.position.set(0.32, 1.0, 0); karton.visible = false; g.add(karton);
      const r = rumahOrang(p.kemampuan, i); g.position.copy(r); gOrang.add(g);
      orang.set(p.id, { obj: g, pos: r.clone(), rumah: r.clone(), tugas: null, rencana: null, karton });
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
        default: A = tt(titikKantor.clone().add(v(((Number(tg.id.slice(1)) * 0.37) % 1) * 2 - 1, 0))); B = A; diam = true;
      }
      const awal = jalur({ p: dari.clone(), lo: lorongSlot(lorongRak, dari.x, dari.z), y: 0 }, A);
      return { awal, bawa: diam ? [A.p.clone()] : jalur(A, B), angkatA: A.y, angkatB: B.y, bawaPalet, bawaKarton, diam, akhir: (diam ? A.p : B.p).clone() };
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

    let tLalu = d.t;
    const frame = (dt: number) => {
      detikNyata += dt;
      const k = kontrol.current;
      if (k.jalan && d.t < k.batas) {
        jalankanSampai(d, Math.min(k.batas, d.t + dt * k.kecepatan));
        if (d.t >= k.batas) { k.jalan = false; onBerhenti(); }
      }
      const dtGame = Math.max(0, d.t - tLalu); tLalu = d.t;
      const dibawa: { pos: V; rot: number; sku: string; lpn: string | null }[] = [];
      const pakaiMhe = new Set<string>();

      for (const p of d.pekerja) {
        const a = orang.get(p.id); if (!a) continue;
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
            const hg = angkatGarpu(a.rencana, f); if (m2.garpu) m2.garpu.position.y = hg;
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
          else { a.obj.visible = false; menujuRumah(m2, dtGame, KEC_MHE); pakaiMhe.add(m2.obj.uuid); if (m2.op) m2.op.visible = true; if (m2.garpu) m2.garpu.position.y = 0.05; }
        } else {
          a.obj.visible = tampak; if (a.karton) a.karton.visible = false;
          menujuRumah(a, dtGame, KEC_JALAN);
        }
      }
      for (const m of mhe.values()) {
        if (pakaiMhe.has(m.obj.uuid)) continue;
        if (m.op) m.op.visible = false; if (m.garpu) m.garpu.position.y = 0.05;
        menujuRumah(m, dtGame, KEC_MHE);
      }
      gambarPalet(dibawa);
      perbaruiTruk();
      perbaruiPin();
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
        grup.remove(pin);
        grup.remove(gPalet, gTruk, gOrang, gMhe);
        grup.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); });
        for (const g of [gPalet, gTruk, gOrang, gMhe]) g.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
      },
    };
  };
}
