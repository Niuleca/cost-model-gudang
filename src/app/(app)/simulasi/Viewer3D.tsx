'use client';
// Viewer 3D gudang (three.js): bangunan, dock & truk, rak SPR/DDR, palet, staging, fasilitas, MHE bergerak, manpower per shift.
import { forwardRef, useEffect, useImperativeHandle, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { LayoutGudang, JenisMhe } from '@/lib/simulasi3d/layout';
import { dindingMiring, poligonLuar } from '@/lib/simulasi3d/editor';
import { WARNA_MHE, WARNA_ORANG } from './warna';

export type Kamera = 'iso' | 'atas' | 'dock' | 'lorong' | 'dekat';
export interface ViewerApi { kamera: (k: Kamera) => void; screenshot: () => string | null; statistik: () => { detikSim: number; siklus: Record<string, number> } }
/** Kecepatan simulasi: faktor percepatan waktu & lama satu siklus (detik waktu nyata gudang) per alat / role, dari productivity. */
export interface Kecepatan { faktor: number; siklus: Record<string, number> }
export interface OpsiViewer { atap: boolean; dinding: boolean; label: boolean; animasi: boolean; truk: boolean; orang: boolean }
/** Lapisan dinamis (mis. Leca Game): dipasang setelah adegan statis dibangun; frame() dipanggil tiap frame dengan dt detik nyata. */
export interface KonteksLapisan { scene: THREE.Scene; grup: THREE.Group; layout: LayoutGudang; kamera: THREE.PerspectiveCamera; kanvas: HTMLCanvasElement; tema: TemaViewer; kontrolKamera: OrbitControls }
export type PasangLapisan = (k: KonteksLapisan) => { frame: (dt: number) => void; buang: () => void };
/** Tema tampilan: standar (material foto TapNow) atau bersih (isometrik, warna solid lembut, atap biru). */
export type TemaViewer = 'standar' | 'bersih';

const WARNA_ZONA: Record<string, string> = {
  stagingIn: '#3b82f6', stagingOut: '#10b981', spr: '#64748b', ddr: '#475569', block: '#a16207', floor: '#b45309', fasilitas: '#8b5cf6', jalur: '#f59e0b', custom: '#0ea5e9',
};
const f1 = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });
/** Posisi x tempat bak truk menempel: tepi luar platform loading dock di depan (bila ada) atau dinding depan (x = 0). */
export function xSandar(layout: LayoutGudang, z: number) {
  const p = (layout.platform ?? []).filter(q => q.x1 <= 0.05 && z >= q.z0 - 0.5 && z <= q.z1 + 0.5);
  return p.length ? Math.min(...p.map(q => q.x0)) : 0;
}
const NAMA_MHE: Record<JenisMhe, string> = { reach: 'RT', forklift: 'FL', stacker: 'ST', hpt: 'HPT', perangkat: '' };

export function label(teks: string, kelas = 'lbl') {
  const d = document.createElement('div'); d.className = `sim3d-${kelas}`; d.textContent = teks;
  return new CSS2DObject(d);
}
/** Tekstur prosedural (canvas, sekali buat & di-cache): upright berlubang & lantai beton — ringan, tanpa unduhan. */
const cacheProsedural = new Map<string, THREE.CanvasTexture>();
type JenisProsedural = 'upright' | 'beton' | 'betonLuar' | 'rumput' | 'shutter' | 'precast';
export function teksProsedural(k: JenisProsedural, ulangX = 1, ulangY = 1) {
  let t = cacheProsedural.get(k);
  if (!t && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); const x = c.getContext('2d')!;
    if (k === 'upright') {
      c.width = 64; c.height = 128;
      const gr = x.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, '#1b4ea8'); gr.addColorStop(0.5, '#2a66cc'); gr.addColorStop(1, '#173f8a');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 128);
      x.fillStyle = '#0b1f45';
      for (let y = 6; y < 128; y += 16) { x.beginPath(); x.roundRect(27, y, 10, 7, 3); x.fill(); x.fillRect(30, y + 7, 4, 3); }   // lubang tetes (teardrop)
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(4, 0, 3, 128);
    } else if (k === 'betonLuar' || k === 'precast') {
      // beton luar (perkerasan halaman, 1 tile = 1 slab 6 m) / panel precast dinding: noda, pori, retak halus, nat
      c.width = 512; c.height = 512; let sd = k === 'precast' ? 11 : 3; const acak = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      x.fillStyle = k === 'precast' ? '#c9c7c1' : '#b9b8b3'; x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(${acak() > 0.55 ? '70,72,74' : '235,233,226'},${0.03 + acak() * 0.05})`; x.beginPath(); x.ellipse(acak() * 512, acak() * 512, 20 + acak() * 110, 10 + acak() * 60, acak() * 3, 0, Math.PI * 2); x.fill(); }
      for (let i = 0; i < 22000; i++) { const v = acak(); x.fillStyle = `rgba(${v > 0.5 ? '40,40,40' : '255,255,255'},${acak() * 0.1})`; x.fillRect(acak() * 512, acak() * 512, 1 + (acak() > 0.97 ? 1 : 0), 1); }
      if (k === 'betonLuar') {
        x.strokeStyle = 'rgba(60,60,60,.35)'; x.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { x.beginPath(); let px = acak() * 512, py = acak() * 512; x.moveTo(px, py); for (let j = 0; j < 8; j++) { px += (acak() - 0.5) * 40; py += (acak() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }   // retak rambut
        for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(30,30,30,${0.04 + acak() * 0.05})`; x.beginPath(); x.ellipse(acak() * 512, acak() * 512, 30 + acak() * 50, 6 + acak() * 14, acak() * 3, 0, Math.PI * 2); x.fill(); }   // bekas oli / ban
        x.strokeStyle = '#55575a'; x.lineWidth = 5; x.strokeRect(0, 0, 512, 512);   // nat sambungan slab (sealant)
      } else {
        x.fillStyle = 'rgba(60,60,60,.5)'; for (const [a, b] of [[128, 96], [384, 96], [128, 416], [384, 416]]) { x.beginPath(); x.arc(a, b, 5, 0, Math.PI * 2); x.fill(); }   // lubang angkur
        x.strokeStyle = '#7d7b76'; x.lineWidth = 4; x.strokeRect(0, 0, 512, 512);
      }
    } else if (k === 'rumput') {
      c.width = 256; c.height = 256; let sd = 5; const acak = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      x.fillStyle = '#6f8a4a'; x.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) { x.fillStyle = ['#5d7a3c', '#7f9a55', '#8aa35f', '#566f37', '#9a9a6a'][Math.floor(acak() * 5)]; x.fillRect(acak() * 256, acak() * 256, 1, 2 + acak() * 3); }
    } else if (k === 'shutter') {
      c.width = 64; c.height = 128; const gr = x.createLinearGradient(0, 0, 0, 8);
      x.fillStyle = '#aeb4ba'; x.fillRect(0, 0, 64, 128);
      for (let y = 0; y < 128; y += 8) { const g2 = x.createLinearGradient(0, y, 0, y + 8); g2.addColorStop(0, '#d5dadf'); g2.addColorStop(0.5, '#9aa1a8'); g2.addColorStop(1, '#6f767d'); x.fillStyle = g2; x.fillRect(0, y, 64, 8); }
      void gr;
    } else {
      c.width = 512; c.height = 512; x.fillStyle = '#e9edf1'; x.fillRect(0, 0, 512, 512);
      let sd = 7; const acak = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 90; i++) { const r = 30 + acak() * 90; const g2 = x.createRadialGradient(acak() * 512, acak() * 512, 0, 0, 0, 0); void g2;
        x.fillStyle = `rgba(${acak() > 0.5 ? '120,128,138' : '255,255,255'},${0.02 + acak() * 0.035})`; x.beginPath(); x.arc(acak() * 512, acak() * 512, r, 0, Math.PI * 2); x.fill(); }
      for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(80,90,100,${acak() * 0.08})`; x.fillRect(acak() * 512, acak() * 512, 1, 1); }
      x.strokeStyle = 'rgba(120,130,140,.25)'; x.lineWidth = 1; x.strokeRect(0.5, 0.5, 511, 511);   // nat potongan beton
    }
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    cacheProsedural.set(k, t);
  }
  if (!t) return null;
  if (ulangX === 1 && ulangY === 1) return t;
  const u = t.clone(); u.repeat.set(ulangX, ulangY); u.needsUpdate = true; return u;
}
export const mat = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0.05, ...o });

/** Material 3D dari TapNow AI (tekstur di /public/sim3d/tekstur). Gagal dimuat → tetap warna polos. */
const TEKSTUR = { lantai: '/sim3d/tekstur/lantai.jpg', muatan: '/sim3d/tekstur/muatan.jpg', palet: '/sim3d/tekstur/palet.jpg', cladding: '/sim3d/tekstur/cladding.jpg', aspal: '/sim3d/tekstur/aspal.jpg', kontainer: '/sim3d/tekstur/kontainer.jpg' } as const;
const muatTeks = new THREE.TextureLoader();
const cacheTeks = new Map<string, { dasar: THREE.Texture; siap: boolean; klon: THREE.Texture[] }>();
export function teks(k: keyof typeof TEKSTUR, ulangX = 1, ulangY = 1) {
  let c = cacheTeks.get(k);
  if (!c) {
    const isi: { dasar: THREE.Texture; siap: boolean; klon: THREE.Texture[] } = { dasar: null as unknown as THREE.Texture, siap: false, klon: [] };
    isi.dasar = muatTeks.load(TEKSTUR[k], () => { isi.siap = true; for (const t of isi.klon) t.needsUpdate = true; }, undefined, () => {});
    isi.dasar.colorSpace = THREE.SRGBColorSpace; isi.dasar.anisotropy = 8;
    cacheTeks.set(k, isi); c = isi;
  }
  if (ulangX === 1 && ulangY === 1) return c.dasar;
  const t = c.dasar.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ulangX, ulangY);
  if (c.siap) t.needsUpdate = true; else c.klon.push(t);
  return t;
}

/** Model MHE sederhana tapi proporsional (panjang × lebar × tinggi dalam meter). */
export function modelMhe(jenis: JenisMhe, tinggiMast: number) {
  const g = new THREE.Group();
  const w = WARNA_MHE[jenis];
  const kotak = (sx: number, sy: number, sz: number, c: string, x: number, y: number, z: number, o?: Partial<THREE.MeshStandardMaterialParameters>) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(c, o)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
  };
  const roda = (x: number, z: number, r = 0.18) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 16), mat('#1f2937')); m.rotation.x = Math.PI / 2; m.position.set(x, r, z); g.add(m); };
  if (jenis === 'hpt') {
    kotak(1.15, 0.08, 0.16, '#374151', 0.2, 0.09, -0.2); kotak(1.15, 0.08, 0.16, '#374151', 0.2, 0.09, 0.2);
    kotak(0.35, 0.35, 0.55, w, -0.5, 0.25, 0); kotak(0.05, 0.9, 0.05, '#111827', -0.72, 0.75, 0);
    return g;
  }
  const panjang = jenis === 'forklift' ? 2.2 : jenis === 'reach' ? 1.8 : 1.3;
  kotak(panjang * 0.55, 1.0, 1.1, w, -panjang * 0.2, 0.75, 0, { metalness: 0.3, roughness: 0.45 });   // bodi
  kotak(0.08, 1.2, 0.08, '#111827', -panjang * 0.05, 1.85, 0.5); kotak(0.08, 1.2, 0.08, '#111827', -panjang * 0.05, 1.85, -0.5); // rangka kabin
  kotak(0.9, 0.06, 1.1, '#111827', -panjang * 0.25, 2.45, 0);                                          // atap kabin
  const mast = Math.max(2.2, tinggiMast);
  kotak(0.12, mast, 0.12, '#4b5563', panjang * 0.15, mast / 2, 0.35, { metalness: 0.6 }); kotak(0.12, mast, 0.12, '#4b5563', panjang * 0.15, mast / 2, -0.35, { metalness: 0.6 });
  const garpu = new THREE.Group(); g.add(garpu); garpu.name = 'garpu';
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.12), mat('#374151', { metalness: 0.6 })); f1.position.set(panjang * 0.15 + 0.62, 0.1, 0.25);
  const f2 = f1.clone(); f2.position.z = -0.25; garpu.add(f1, f2);
  if (jenis === 'reach') { kotak(1.1, 0.25, 0.12, '#374151', panjang * 0.2, 0.15, 0.5); kotak(1.1, 0.25, 0.12, '#374151', panjang * 0.2, 0.15, -0.5); }
  roda(-panjang * 0.4, 0.45); roda(-panjang * 0.4, -0.45); roda(panjang * 0.1, 0.45); roda(panjang * 0.1, -0.45);
  return g;
}

export function modelOrang(c: string) {
  const g = new THREE.Group();
  const badan = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 4, 10), mat(c)); badan.position.y = 0.6 + 0.2; badan.castShadow = true;
  const rompi = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.22, 12), mat('#d9f99d', { emissive: '#3f6212', emissiveIntensity: 0.15 })); rompi.position.y = 1.05;
  const kepala = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), mat('#e0ac69')); kepala.position.y = 1.5; kepala.castShadow = true;
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#fde047', { roughness: 0.4 })); helm.position.y = 1.53;
  g.add(badan, rompi, kepala, helm);
  return g;
}

/** Titik di sepanjang lorong (t = 0 mulut … 1 ujung), digeser tegak lurus sejauh geser meter. */
function titikLorong(lo: { x0: number; z0: number; x1: number; z1: number }, t: number, geser: number) {
  const dx = lo.x1 - lo.x0, dz = lo.z1 - lo.z0, n = Math.hypot(dx, dz) || 1;
  return new THREE.Vector3(lo.x0 + dx * t - (dz / n) * geser, 0, lo.z0 + dz * t + (dx / n) * geser);
}

/** Truk boks 12 m; bak menghadap +X (mundur ke dock di x = 0). */
export function modelTruk(arus: 'inbound' | 'outbound') {
  const truk = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 2.45), mat(arus === 'inbound' ? '#eef4ff' : '#effcf5', { roughness: 0.5, metalness: 0.2, map: teks('kontainer', 4, 1) })); box.position.set(-6.3, 2.55, 0); box.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.45), mat(arus === 'inbound' ? '#1d4ed8' : '#047857', { roughness: 0.4, metalness: 0.4 })); cab.position.set(-13.6, 1.95, 0); cab.castShadow = true;
  const kaca = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 2.2), mat('#0f172a', { roughness: 0.1, metalness: 0.8 })); kaca.position.set(-14.72, 2.5, 0);
  truk.add(box, cab, kaca);
  for (const x of [-2, -3.3, -11, -13.4]) for (const z of [-1.05, 1.05]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 18), mat('#111827')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.5, z); truk.add(w); }
  return truk;
}

interface Gerak { obj: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; kunci: string; siklusAwal: number; fase: number; garpu?: THREE.Object3D; angkat?: number }

/** apiRef: next/dynamic tidak meneruskan ref, jadi halaman memakai prop ini untuk tombol kamera / screenshot. */
const Viewer3D = forwardRef<ViewerApi, { layout: LayoutGudang; shift: number; opsi: OpsiViewer; kecepatan: Kecepatan; lapisan?: PasangLapisan; tema?: TemaViewer; apiRef?: MutableRefObject<ViewerApi | null> }>(function Viewer3D({ layout, shift, opsi, kecepatan, lapisan, tema = 'standar', apiRef }, ref) {
  const temaRef = useRef<TemaViewer>(tema); temaRef.current = tema;
  const lapisanRef = useRef<PasangLapisan | undefined>(lapisan);
  lapisanRef.current = lapisan;
  const wadah = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer?: THREE.WebGLRenderer; lr?: CSS2DRenderer; scene?: THREE.Scene; cam?: THREE.PerspectiveCamera; ctl?: OrbitControls;
    pm?: THREE.PMREMGenerator; envDasar?: THREE.Texture | null; envLangit?: THREE.WebGLRenderTarget; langit?: Sky;
    lap?: ReturnType<PasangLapisan>;
    grup: Record<string, THREE.Group>; kendaraan: { g: THREE.Group; kunci: string }[]; gerak: Gerak[]; gerakOrang: Gerak[]; jalan: boolean; L: number; W: number; H: number; detikSim: number; kec: Kecepatan;
  }>({ grup: {}, kendaraan: [], gerak: [], gerakOrang: [], jalan: true, L: 0, W: 0, H: 0, detikSim: 0, kec: { faktor: 10, siklus: {} } });
  st.current.kec = kecepatan;
  const siklusDari = (g: Gerak) => Math.max(1, st.current.kec.siklus[g.kunci] ?? g.siklusAwal);

  const buatApi = (): ViewerApi => ({
    kamera: (k: Kamera) => aturKamera(k),
    screenshot: () => { const s = st.current; if (!s.renderer || !s.scene || !s.cam) return null; s.renderer.render(s.scene, s.cam); return s.renderer.domElement.toDataURL('image/png'); },
    statistik: () => {
      const s = st.current; const siklus: Record<string, number> = {};
      for (const g of [...s.gerak, ...s.gerakOrang]) { const n = Math.floor(s.detikSim / siklusDari(g) + g.fase) - Math.floor(g.fase); siklus[g.kunci] = (siklus[g.kunci] ?? 0) + n; }
      return { detikSim: s.detikSim, siklus };
    },
  });
  useImperativeHandle(ref, buatApi);
  useEffect(() => { if (!apiRef) return; apiRef.current = buatApi(); return () => { apiRef.current = null; }; });

  function aturKamera(k: Kamera) {
    const s = st.current; if (!s.cam || !s.ctl) return;
    const { L, W, H } = s; const m = Math.max(L, W);
    const target = new THREE.Vector3(L / 2, 0, W / 2);
    if (k === 'iso') s.cam.position.set(-m * 0.35, m * 0.65, W + m * 0.55);
    if (k === 'atas') {
      // pas ke gedung + apron dock sesuai rasio panel
      const t = Math.tan(THREE.MathUtils.degToRad(s.cam.fov / 2)); const cx = L / 2 - 6;
      const jarak = Math.max((W / 2 + 4) / t, (L / 2 + 12) / (t * Math.max(0.2, s.cam.aspect))) * 1.05;
      s.cam.position.set(cx, jarak, W / 2 + 0.01); target.set(cx, 0, W / 2);
    }
    if (k === 'dekat') { const fx = Math.min(L, 36); target.set(fx * 0.12, 0, W * 0.42); s.cam.position.set(target.x - 22 - W * 0.45, 18 + W * 0.45, W + 14 + W * 0.3); }
    if (k === 'dock') { s.cam.position.set(-32, 14, W / 2 + W * 0.35); target.set(4, 2, W / 2); }
    if (k === 'lorong') {
      const lor = layout.lorong[0];
      if (lor) { const dx = lor.x1 - lor.x0, dz = lor.z1 - lor.z0, n = Math.hypot(dx, dz) || 1; s.cam.position.set(lor.x0 - dx / n, 1.7, lor.z0 - dz / n); target.set(lor.x1, 1.5, lor.z1); } else { s.cam.position.set(1, 1.7, W / 2); target.set(L, 1.5, W / 2); }
    }
    void H;
    s.ctl.target.copy(target); s.cam.updateProjectionMatrix(); s.ctl.update();
  }

  // ---------- inisialisasi renderer sekali
  useEffect(() => {
    const el = wadah.current!; const s = st.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);
    const lr = new CSS2DRenderer(); lr.setSize(el.clientWidth, el.clientHeight);
    Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
    el.appendChild(lr.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8eef5'); scene.fog = new THREE.Fog('#e8eef5', 160, 420);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.5;
    const cam = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 5000);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.495;
    Object.assign(s, { renderer, lr, scene, cam, ctl, pm, envDasar: scene.environment });
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h); lr.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
    });
    ro.observe(el);
    const jam = new THREE.Clock(); let id = 0;
    // posisi = bolak-balik a → b → a; satu putaran penuh = satu siklus kerja (mis. 1 palet put-away) dalam waktu gudang
    const pp = (u: number) => { const f = u - Math.floor(u); return f < 0.5 ? f * 2 : 2 - f * 2; };   // ping-pong 0→1→0
    const loop = () => {
      id = requestAnimationFrame(loop);
      const dt = Math.min(0.1, jam.getDelta());
      if (s.jalan) s.detikSim += dt * Math.max(0, s.kec.faktor);
      const t = s.detikSim;
      if (s.jalan) for (const g of [...s.gerak, ...s.gerakOrang]) {
        const sik = siklusDari(g); const u = t / sik + g.fase; const k = pp(u);
        g.obj.position.lerpVectors(g.a, g.b, k);
        const maju = (u - Math.floor(u)) < 0.5;
        const dir = new THREE.Vector3().subVectors(maju ? g.b : g.a, maju ? g.a : g.b);
        g.obj.rotation.y = Math.atan2(-dir.z, dir.x);
        if (g.garpu && g.angkat) { const f = u - Math.floor(u); g.garpu.position.y = (f > 0.42 && f < 0.58 ? Math.sin(((f - 0.42) / 0.16) * Math.PI) : 0) * g.angkat; }
      }
      s.lap?.frame(dt);
      if (!el.clientWidth) return;   // panel 3D disembunyikan (mis. mode 2D): simulasi tetap jalan, render dilewati
      if (s.langit) s.langit.material.uniforms.time.value += dt;   // awan bergerak pelan
      ctl.update(); renderer.render(scene, cam); lr.render(scene, cam);
    };
    loop();
    return () => {
      cancelAnimationFrame(id); ro.disconnect(); ctl.dispose(); s.lap?.buang(); s.lap = undefined;
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
      s.envLangit?.dispose(); pm.dispose(); renderer.dispose(); el.innerHTML = '';
    };
  }, []);

  // ---------- bangun ulang adegan saat layout berubah
  useEffect(() => {
    const s = st.current; const scene = s.scene!; if (!scene) return;
    for (const g of Object.values(s.grup)) { scene.remove(g); g.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); if (o instanceof CSS2DObject) o.element.remove(); }); }
    s.lap?.buang(); s.lap = undefined;
    s.grup = {}; s.gerak = []; s.detikSim = 0;
    const { L, W, H, puncak } = layout; Object.assign(s, { L, W, H });
    const bersih = temaRef.current === 'bersih';
    const latar = bersih ? '#eef3f9' : '#dfe7ef';
    const dockH = Math.max(0, layout.tinggiDock ?? 1.2), y0 = -dockH;   // lantai gudang di y = 0; halaman / jalan truk di y0 (setinggi dock)
    void latar; scene.background = null; scene.fog = new THREE.Fog('#dfe7ef', 320, 1600);   // langit menggantikan latar polos (kedua gaya)
    if (s.renderer) { s.renderer.shadowMap.type = bersih ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; s.renderer.toneMappingExposure = bersih ? 1.0 : 0.95; }
    const G = (n: string) => { const g = new THREE.Group(); g.name = n; scene.add(g); s.grup[n] = g; return g; };
    const gBangunan = G('bangunan'), gAtap = G('atap'), gDinding = G('dinding'), gLabel = G('label'), gRak = G('rak'), gTruk = G('truk'), gMhe = G('mhe');

    // cahaya: matahari pagi menjelang siang + langit (Preetham) sebagai latar & environment map
    const posMatahari = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
    const hemi = new THREE.HemisphereLight('#f5f9ff', '#8d939a', bersih ? 0.7 : 0.55); gBangunan.add(hemi);
    const sun = new THREE.DirectionalLight('#fff1d6', bersih ? 2.4 : 2.9); sun.position.copy(posMatahari).multiplyScalar(140).add(new THREE.Vector3(L / 2, 0, W / 2)); sun.target.position.set(L / 2, 0, W / 2);
    sun.castShadow = true; const r = Math.max(L, W) * 0.75 + 30;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 400 }); sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    gBangunan.add(sun, sun.target);
    const isi = new THREE.AmbientLight('#ffffff', bersih ? 0.25 : 0.18); gBangunan.add(isi);
    if (s.langit) { scene.remove(s.langit); s.langit = undefined; }
    s.envLangit?.dispose(); s.envLangit = undefined;
    if (s.pm) {
      const buatLangit = () => { const k = new Sky(); k.scale.setScalar(3000); const u = k.material.uniforms;
        u.turbidity.value = 2.2; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(posMatahari);
        u.cloudCoverage.value = 0.38; u.cloudDensity.value = 0.45; u.cloudScale.value = 0.00025; u.cloudElevation.value = 0.55; return k; };
      const langit = buatLangit(); langit.position.set(L / 2, 0, W / 2); scene.add(langit); s.langit = langit;
      const sc = new THREE.Scene(); const l2 = buatLangit(); l2.material.uniforms.showSunDisc.value = 0; sc.add(l2);
      s.envLangit = s.pm.fromScene(sc, 0.02); scene.environment = s.envLangit.texture; scene.environmentIntensity = 0.55;
      l2.geometry.dispose(); l2.material.dispose();
    } else if (s.envDasar) { scene.environment = s.envDasar; scene.environmentIntensity = 0.5; }

    // ---------- tanah, halaman beton luar, pondasi & lantai
    const BX0 = -62, BX1 = L + 18, BZ0 = -46, BZ1 = W + 42;   // batas halaman beton (sisi dock lebih luas untuk manuver & antre truk)
    {
      const rumput = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat('#ffffff', { roughness: 1, map: teksProsedural('rumput', 4000 / 6, 4000 / 6) ?? undefined })); rumput.rotation.x = -Math.PI / 2; rumput.position.set(L / 2, y0 - 0.08, W / 2); rumput.receiveShadow = true; gBangunan.add(rumput);
      const sx = BX1 - BX0, sz = BZ1 - BZ0;
      const halaman = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.25, sz), mat('#ffffff', { roughness: 0.92, map: teksProsedural('betonLuar', sx / 6, sz / 6) ?? undefined }));
      halaman.position.set((BX0 + BX1) / 2, y0 - 0.125, (BZ0 + BZ1) / 2); halaman.receiveShadow = true; gBangunan.add(halaman);
      const kerb = mat('#9ca3a8', { roughness: 0.85 });
      for (const [a, b, c, d2] of [[sx, 0.3, (BX0 + BX1) / 2, BZ0], [sx, 0.3, (BX0 + BX1) / 2, BZ1], [0.3, sz, BX0, (BZ0 + BZ1) / 2], [0.3, sz, BX1, (BZ0 + BZ1) / 2]] as const) { const m = new THREE.Mesh(new THREE.BoxGeometry(a, 0.18, b), kerb); m.position.set(c, y0 + 0.09, d2); m.castShadow = true; gBangunan.add(m); }
    }
    // marka halaman: garis parkir dock, jalur truk putus-putus, area antre
    const cat = (sx: number, sz: number, x: number, z: number, c = '#facc15') => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.012, sz), mat(c, { roughness: 0.6 })); m.position.set(x, y0 + 0.006, z); gBangunan.add(m); };
    const xSandarDi = (z: number) => xSandar(layout, z);
    for (const dk of layout.dock) { const xs = xSandarDi(dk.z); cat(15, 0.15, xs - 8, dk.z - 1.75); cat(15, 0.15, xs - 8, dk.z + 1.75); }
    for (let z = -2; z < W + 6; z += 3) cat(0.15, 1.6, Math.min(-18, Math.min(0, ...(layout.platform ?? []).map(p => p.x0)) - 18), z, '#f8fafc');
    if (bersih) { for (let i = 0; i < 6; i++) cat(13, 0.12, -24, -6 - i * 4.2); cat(30, 0.14, -15, -3.5, '#ffffff'); cat(30, 0.14, -15, W + 3.5, '#ffffff'); }
    // pondasi / dinding plinth beton: lantai gudang terangkat setinggi dock dari halaman
    if (dockH > 0.01) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(L + 0.3, dockH, W + 0.3), mat('#ffffff', { roughness: 0.9, map: teksProsedural('precast', (L + 0.3) / 6, 1) ?? undefined }));
      pl.position.set(L / 2, y0 + dockH / 2 - 0.05, W / 2); pl.castShadow = true; pl.receiveShadow = true; gBangunan.add(pl);
    }
    const lantai = new THREE.Mesh(new THREE.BoxGeometry(L, 0.1, W), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: bersih ? 0.42 : 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35,
      map: bersih ? teksProsedural('beton', L / 6, W / 6) : teks('lantai', L / 6, W / 6) }));   // beton floor hardener mengilap   // beton floor hardener mengilap
    lantai.position.set(L / 2, -0.05, W / 2); lantai.receiveShadow = true; gBangunan.add(lantai);
    // zona: warna lantai tipis + garis kuning
    const garis = mat('#facc15', { roughness: 0.6 });
    for (const z of layout.zona) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0, z.z1 - z.z0), new THREE.MeshStandardMaterial({ color: z.warna ?? WARNA_ZONA[z.jenis] ?? '#94a3b8', transparent: true, opacity: z.jenis === 'jalur' ? 0.08 : 0.13, roughness: 0.8 }));
      p.rotation.x = -Math.PI / 2; p.position.set((z.x0 + z.x1) / 2, 0.012, (z.z0 + z.z1) / 2); p.receiveShadow = true; gBangunan.add(p);
      if (z.jenis === 'stagingIn' || z.jenis === 'stagingOut') {
        const b = (sx: number, sz: number, x: number, zz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.015, sz), garis); m.position.set(x, 0.015, zz); gBangunan.add(m); };
        b(z.x1 - z.x0 - 4, 0.12, (z.x0 + 4 + z.x1) / 2, z.z0 + 0.4); b(z.x1 - z.x0 - 4, 0.12, (z.x0 + 4 + z.x1) / 2, z.z1 - 0.4); b(0.12, z.z1 - z.z0 - 0.8, z.x0 + 4, (z.z0 + z.z1) / 2); b(0.12, z.z1 - z.z0 - 0.8, z.x1, (z.z0 + z.z1) / 2);
      }
      const lb = label(`${z.label}`, 'zona'); lb.position.set((z.x0 + z.x1) / 2, z.jenis === 'spr' || z.jenis === 'ddr' ? layout.tinggiRak + 1.2 : 2.2, z.jenis === 'jalur' ? W / 2 : (z.z0 + z.z1) / 2);
      (lb.element as HTMLDivElement).title = z.ket; lb.element.innerHTML = `<b>${z.label}</b><span>${z.ket}</span>`; gLabel.add(lb);
    }
    // garis lorong rak
    for (const lo of layout.lorong) {
      const pj = Math.hypot(lo.x1 - lo.x0, lo.z1 - lo.z0); const m = new THREE.Mesh(new THREE.BoxGeometry(pj, 0.012, 0.1), garis);
      m.position.set((lo.x0 + lo.x1) / 2, 0.016, (lo.z0 + lo.z1) / 2); m.rotation.y = -Math.atan2(lo.z1 - lo.z0, lo.x1 - lo.x0); gBangunan.add(m);
    }
    // kolom struktur (layout editor): baja H-beam + pelindung kolom kuning di kaki
    const mBaja = mat('#5b6573', { metalness: 0.65, roughness: 0.38 }), mPelindung = mat('#facc15', { roughness: 0.45 });
    for (const k of layout.kolom ?? []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(k.w, k.tinggi, k.d), mBaja); m.position.set(k.x + k.w / 2, k.tinggi / 2, k.z + k.d / 2); m.castShadow = true; gBangunan.add(m);
      const pg = new THREE.Mesh(new THREE.BoxGeometry(k.w + 0.16, 1.0, k.d + 0.16), mPelindung); pg.position.set(m.position.x, 0.5, m.position.z); pg.castShadow = true; gBangunan.add(pg);
      for (const yy of [0.25, 0.75]) { const st2 = new THREE.Mesh(new THREE.BoxGeometry(k.w + 0.17, 0.12, k.d + 0.17), mat('#111827')); st2.position.set(m.position.x, yy, m.position.z); gBangunan.add(st2); }
    }

    // ---------- dinding: dado beton precast 2,4 m + cladding metal di atasnya; lubang untuk pintu dock & gate
    const DADO = Math.min(2.4, H * 0.4);
    const mPrecast = mat('#ffffff', { roughness: 0.9, map: teksProsedural('precast', 1, 1) ?? undefined });
    const panel = (sx: number, sy: number, sz: number, x: number, y: number, z: number, padat = false) => {
      const panjang = Math.max(sx, sz);
      const mDinding = bersih
        ? new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: !padat, opacity: padat ? 1 : 0.35, roughness: 0.6, side: THREE.DoubleSide, depthWrite: padat })
        : new THREE.MeshStandardMaterial({ color: '#eef2f6', map: teks('cladding', Math.max(1, panjang / 4), Math.max(1, sy / 4)), transparent: true, opacity: 0.5, roughness: 0.42, metalness: 0.45, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mDinding); m.position.set(x, y, z); m.receiveShadow = padat; m.castShadow = padat; gDinding.add(m);
    };
    const panelBeton = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
      const mt = mPrecast.clone(); mt.map = teksProsedural('precast', Math.max(1, Math.max(sx, sz) / 6), Math.max(1, sy / 2.4)) ?? null;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mt); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; gDinding.add(m);
    };
    type Sisi = 'depan' | 'belakang' | 'kiri' | 'kanan';
    const gates = layout.gate ?? [];
    const pintu = 3.2, tinggiPintu = 4.2;
    const lubangDi = (sisi: Sisi) => [
      ...(sisi === 'depan' ? layout.dock.map(d => ({ c: d.z, w: pintu, h: tinggiPintu })) : []),
      ...gates.filter(g => g.sisi === sisi).map(g => ({ c: g.pos + g.lebar / 2, w: g.lebar, h: g.tinggi })),
    ];
    /** Dinding sepanjang satu sisi, dipotong di tiap lubang (pintu dock / gate). tinggi < H = dinding cutaway (tema bersih). */
    const dindingSisi = (sisi: Sisi, tinggiD: number, padat: boolean, tebal = 0.15) => {
      const sz = sisi === 'depan' || sisi === 'belakang'; const pj = sz ? W : L;
      const tetap = sisi === 'depan' ? 0 : sisi === 'belakang' ? L : sisi === 'kiri' ? 0 : W;
      const seg = (a: number, b: number, ya: number, yb: number) => {
        if (b - a < 0.05 || yb - ya < 0.05) return;
        const bagian = (p: number, q: number, beton: boolean) => { if (q - p < 0.05) return; const c = (a + b) / 2, len = b - a, h = q - p, y = (p + q) / 2;
          const f = beton ? panelBeton : (sx: number, sy: number, szz: number, x: number, yy: number, z: number) => panel(sx, sy, szz, x, yy, z, padat);
          if (sz) f(beton ? 0.2 : tebal, h, len, tetap, y, c); else f(len, h, beton ? 0.2 : tebal, c, y, tetap); };
        if (bersih) bagian(ya, yb, false); else { bagian(ya, Math.min(yb, DADO), true); bagian(Math.max(ya, DADO), yb, false); }
      };
      const ls = lubangDi(sisi).map(l => ({ a: Math.max(0, l.c - l.w / 2), b: Math.min(pj, l.c + l.w / 2), h: Math.min(tinggiD - 0.3, l.h) })).filter(l => l.b > l.a).sort((p, q) => p.a - q.a);
      let prev = 0;
      for (const l of ls) { if (l.a > prev) seg(prev, l.a, 0, tinggiD); seg(Math.max(prev, l.a), l.b, l.h, tinggiD); prev = Math.max(prev, l.b); }
      seg(prev, pj, 0, tinggiD);
    };
    /** Segitiga pelana di dinding ujung (x = 0 & x = L): side height di tepi → center height di tengah lebar. */
    const pelana = (x: number, padat: boolean) => {
      if (puncak - H < 0.05) return;
      const sh = new THREE.Shape(); sh.moveTo(0, H); sh.lineTo(W / 2, puncak); sh.lineTo(W, H); sh.lineTo(0, H);
      const mt = bersih ? new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: !padat, opacity: padat ? 1 : 0.35, side: THREE.DoubleSide, depthWrite: padat })
        : new THREE.MeshStandardMaterial({ color: '#eef2f6', map: teks('cladding', W / 4, (puncak - H) / 4), transparent: true, opacity: 0.5, roughness: 0.42, metalness: 0.45, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mt); m.rotation.y = -Math.PI / 2; m.position.set(x, 0, 0); gDinding.add(m);
    };
    // ---------- gedung trapesium: dinding samping miring + area di luar dinding ditutup perkerasan halaman
    const gTr = layout.trapesium ? { L, W, sideMm: 0, centerMm: 0, trapesium: layout.trapesium } : null;
    const luarTr = gTr ? poligonLuar(gTr) : null, garisTr = luarTr && gTr ? dindingMiring(gTr) : null;
    const sisiMiring = luarTr ? layout.trapesium!.sisi : null;
    if (luarTr) {
      const sh = new THREE.Shape(luarTr.map(p => new THREE.Vector2(p.x, -p.z)));
      const tutup = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat('#c9ced4', { roughness: 0.95 }));
      tutup.rotation.x = -Math.PI / 2; tutup.position.y = 0.03; tutup.receiveShadow = true; gBangunan.add(tutup);
    }
    const dindingMiringDi = (tinggiD: number, padat: boolean) => {
      if (!garisTr) return;
      const dx = garisTr.x1 - garisTr.x0, dz = garisTr.z1 - garisTr.z0, pj = Math.hypot(dx, dz), sudut = -Math.atan2(dz, dx);
      const cx = (garisTr.x0 + garisTr.x1) / 2, cz = (garisTr.z0 + garisTr.z1) / 2;
      const bagian = (ya: number, yb: number, beton: boolean) => {
        if (yb - ya < 0.05) return;
        const m = beton ? (() => { const mt = mPrecast.clone(); mt.map = teksProsedural('precast', Math.max(1, pj / 6), Math.max(1, (yb - ya) / 2.4)) ?? null; return mt; })()
          : bersih ? new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: !padat, opacity: padat ? 1 : 0.35, roughness: 0.6, side: THREE.DoubleSide, depthWrite: padat })
          : new THREE.MeshStandardMaterial({ color: '#eef2f6', map: teks('cladding', Math.max(1, pj / 4), Math.max(1, (yb - ya) / 4)), transparent: true, opacity: 0.5, roughness: 0.42, metalness: 0.45, side: THREE.DoubleSide, depthWrite: false });
        const w = new THREE.Mesh(new THREE.BoxGeometry(pj, yb - ya, beton ? 0.2 : 0.15), m);
        w.position.set(cx, (ya + yb) / 2, cz); w.rotation.y = sudut; w.castShadow = beton || padat; w.receiveShadow = true; gDinding.add(w);
      };
      if (bersih) bagian(0, tinggiD, false); else { bagian(0, Math.min(tinggiD, DADO), true); bagian(Math.max(0, DADO), tinggiD, false); }
    };
    const dindingSisiAsli = dindingSisi;
    const dindingSisiTr = (sisi: Sisi, tinggiD: number, padat: boolean, tebal = 0.15) => (sisi === sisiMiring ? dindingMiringDi(tinggiD, padat) : dindingSisiAsli(sisi, tinggiD, padat, tebal));
    if (bersih) {
      // dinding belakang & ujung padat putih; sisi yang menghadap kamera dipotong rendah (cutaway) supaya isi gudang terlihat
      dindingSisiTr('kiri', H, true, 0.2); dindingSisiTr('belakang', H, true, 0.2); dindingSisiTr('kanan', 1.2, true, 0.2); dindingSisiTr('depan', H, false);
      pelana(L, true);
      const lis = mat('#2563eb', { roughness: 0.4 });
      const sudut: [number, number][] = garisTr
        ? (sisiMiring === 'kanan' ? [[0, 0], [L, 0], [L, garisTr.z1], [0, garisTr.z0]] : [[0, garisTr.z0], [L, garisTr.z1], [L, W], [0, W]])
        : [[0, 0], [L, 0], [L, W], [0, W]];
      for (const [x, z] of sudut) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.35, z === W && x !== 0 && x !== L ? 1.2 : H, 0.35), lis); k.position.set(x, H / 2, z); k.castShadow = true; gDinding.add(k); }
      const tepiAtas = (sx: number, sz: number, x: number, z: number, y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.25, sz), lis); m.position.set(x, y, z); gDinding.add(m); };
      if (sisiMiring !== 'kiri') tepiAtas(L, 0.3, L / 2, 0, H);
      tepiAtas(0.3, W, L, W / 2, H);
      if (sisiMiring !== 'kanan') tepiAtas(L, 0.3, L / 2, W, 1.2);
    } else { for (const sisi of ['depan', 'belakang', 'kiri', 'kanan'] as const) dindingSisiTr(sisi, H, false); pelana(0, false); pelana(L, false); }
    // kolom baja dinding + portal frame (rafter) mengikuti atap pelana
    const mKolom = mat(bersih ? '#2563eb' : '#3f4a57', { metalness: bersih ? 0.1 : 0.65, roughness: 0.38 });
    const langkahKolom = Math.max(6, L / Math.ceil(L / 8));
    const xsKolom: number[] = []; for (let x = 0; x <= L + 0.01; x += langkahKolom) xsKolom.push(x);
    for (const x of xsKolom) for (const z of bersih ? [0] : [0, W]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), mKolom); k.position.set(x, H / 2, z); k.castShadow = true; gDinding.add(k); }
    const miring = Math.hypot(W / 2, puncak - H), sudutAtap = Math.atan2(puncak - H, W / 2);
    {
      const mRafter = mat('#4b5563', { metalness: 0.6, roughness: 0.4 });
      for (const x of xsKolom) for (const sgn of [-1, 1]) {
        const rf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, miring), mRafter);
        rf.position.set(Math.min(L - 0.15, Math.max(0.15, x)), (H + puncak) / 2 - 0.45, W / 2 + (sgn * W) / 4); rf.rotation.x = sgn * sudutAtap; rf.castShadow = true; gAtap.add(rf);
      }
      // gording (purlin) tiap ±1,5 m sepanjang atap
      const nP = Math.max(2, Math.round(miring / 1.5)); const mPurlin = mat('#9ca3af', { metalness: 0.6, roughness: 0.4 });
      for (const sgn of [-1, 1]) for (let i = 0; i <= nP; i++) {
        const f = i / nP; const z = sgn < 0 ? f * W / 2 : W - f * W / 2; const y = H + f * (puncak - H) - 0.2;
        const pu = new THREE.Mesh(new THREE.BoxGeometry(L, 0.15, 0.08), mPurlin); pu.position.set(L / 2, y, z); gAtap.add(pu);
      }
      // lampu high-bay LED (grid ±9 × 8 m) — emissive, menggantung di bawah gording
      const pos: [number, number][] = []; const nx = Math.max(1, Math.round(L / 9)), nz = Math.max(1, Math.round(W / 8));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) pos.push([(i + 0.5) * L / nx, (j + 0.5) * W / nz]);
      const lampu = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.22, 0.14, 18), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff7e6', emissiveIntensity: 2.2, roughness: 0.3 }), pos.length);
      const rumah = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 0.22, 18), mat('#374151', { metalness: 0.6, roughness: 0.35 }), pos.length);
      const tmpL = new THREE.Object3D();
      pos.forEach(([x, z], i) => { const yAtap = H + (1 - Math.abs(z - W / 2) / (W / 2)) * (puncak - H); const y = Math.max(layout.tinggiRak + 0.8, yAtap - 1.6);
        tmpL.position.set(x, y, z); tmpL.updateMatrix(); lampu.setMatrixAt(i, tmpL.matrix); tmpL.position.y = y + 0.18; tmpL.updateMatrix(); rumah.setMatrixAt(i, tmpL.matrix); });
      gAtap.add(lampu, rumah);
    }
    // atap pelana (bubungan sepanjang X) — metal deck bergelombang
    const mAtap = new THREE.MeshStandardMaterial({ color: bersih ? '#3b82f6' : '#dfe4ea', roughness: 0.38, metalness: bersih ? 0.1 : 0.55, side: THREE.DoubleSide, transparent: true, opacity: bersih ? 0.97 : 0.94,
      map: bersih ? null : teks('cladding', (L + 1) / 4, (miring + 0.6) / 4) });
    for (const sgn of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.12, miring + 0.6), mAtap);
      a.position.set(L / 2, (H + puncak) / 2, W / 2 + (sgn * W) / 4); a.rotation.x = sgn * sudutAtap; a.castShadow = true; gAtap.add(a);
    }
    if (!bersih) { const nok = new THREE.Mesh(new THREE.BoxGeometry(L + 1.2, 0.25, 0.7), mat('#cbd2d9', { metalness: 0.6, roughness: 0.35 })); nok.position.set(L / 2, puncak + 0.08, W / 2); gAtap.add(nok); }

    // ---------- loading dock platform beton (palet bisa diturunkan dari truk ke platform)
    const mBetonLuar = (sx: number, sz: number) => mat('#ffffff', { roughness: 0.88, map: teksProsedural('betonLuar', Math.max(1, sx / 6), Math.max(1, sz / 6)) ?? undefined });
    const mKaret = mat('#111111', { roughness: 0.95 }), mKuning = mat('#facc15', { roughness: 0.5 }), mSiku = mat('#6b7280', { metalness: 0.7, roughness: 0.35 });
    const alasP = mat('#ffffff', { roughness: 0.9, map: teks('palet') }), muatP = mat('#ffffff', { roughness: 0.45, map: teks('muatan') });
    for (const p of layout.platform ?? []) {
      const sx = p.x1 - p.x0, sz = p.z1 - p.z0, h = Math.max(0.3, p.tinggi), top = y0 + h;
      const blok = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mBetonLuar(sx, sz)); blok.position.set((p.x0 + p.x1) / 2, y0 + h / 2, (p.z0 + p.z1) / 2); blok.castShadow = blok.receiveShadow = true; gBangunan.add(blok);
      // sisi luar = sisi terjauh dari gedung → tepi kuning, siku baja & bumper karet
      const luarX = p.x1 <= 0.05 ? p.x0 : p.x0 >= L - 0.05 ? p.x1 : null; const luarZ = luarX == null ? (p.z1 <= 0.05 ? p.z0 : p.z1) : null;
      if (luarX != null) {
        const arah = luarX < L / 2 ? 1 : -1;
        const tp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.015, sz), mKuning); tp.position.set(luarX + arah * 0.15, top + 0.008, (p.z0 + p.z1) / 2); gBangunan.add(tp);
        const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, sz), mSiku); sk.position.set(luarX, top - 0.06, (p.z0 + p.z1) / 2); gBangunan.add(sk);
        for (let z = p.z0 + 1.2; z < p.z1 - 0.8; z += 3.6) for (const dz of [0, 2.3]) if (z + dz < p.z1 - 0.3) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.28), mKaret); b.position.set(luarX - arah * 0.07, top - 0.38, z + dz); b.castShadow = true; gBangunan.add(b); }
        // tangga di ujung platform
        const nT = Math.max(2, Math.round(h / 0.18)); for (let i = 0; i < nT; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.2, sx * 0.4), (i + 1) * h / nT, 0.3), mBetonLuar(1, 1)); t.position.set(p.x0 + sx / 2, y0 + (i + 1) * h / nT / 2, p.z1 + 0.15 + (nT - 1 - i) * 0.3); t.castShadow = true; gBangunan.add(t); }
      } else if (luarZ != null) {
        const tp = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.015, 0.25), mKuning); tp.position.set((p.x0 + p.x1) / 2, top + 0.008, luarZ + (luarZ < W / 2 ? 0.15 : -0.15)); gBangunan.add(tp);
      }
      // palet di atas platform (baris rapi, sisakan 1 m dari tepi luar untuk jalur HPT)
      const n = Math.min(240, Math.max(0, p.palet)); if (n) {
        const sepanjang = luarZ != null ? sx : sz, melintang = luarZ != null ? sz : sx;
        const perBaris = Math.max(1, Math.floor((sepanjang - 0.6) / 1.35)), nBaris = Math.max(1, Math.floor((melintang - 1.2) / 1.25));
        const alas = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.14, 1.0), alasP, n), muat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 1.2, 0.96), muatP, n);
        const tmpP = new THREE.Object3D(); let m2 = 0;
        for (let i = 0; i < n && Math.floor(i / perBaris) < nBaris; i++, m2++) {
          const a = 0.3 + (i % perBaris) * 1.35 + 0.6, b = (luarX != null && luarX > L / 2) || (luarZ != null && luarZ > W / 2) ? 0.35 + Math.floor(i / perBaris) * 1.25 + 0.5 : melintang - 0.35 - Math.floor(i / perBaris) * 1.25 - 0.5;
          const [x, z] = luarZ != null ? [p.x0 + a, p.z0 + b] : [p.x0 + b, p.z0 + a];
          tmpP.position.set(x, top + 0.07, z); tmpP.rotation.set(0, luarZ != null ? 0 : Math.PI / 2, 0); tmpP.scale.set(1, 1, 1); tmpP.updateMatrix(); alas.setMatrixAt(m2, tmpP.matrix);
          const sk2 = 0.75 + ((i * 0.618) % 1) * 0.25; tmpP.position.y = top + 0.14 + 0.6 * sk2; tmpP.scale.set(1, sk2, 1); tmpP.updateMatrix(); muat.setMatrixAt(m2, tmpP.matrix);
        }
        alas.count = muat.count = m2; alas.castShadow = muat.castShadow = true; alas.receiveShadow = muat.receiveShadow = true; gRak.add(alas, muat);
      }
      const lb = label(`${p.label} · ${f1(sz > sx ? sz : sx)} × ${f1(sz > sx ? sx : sz)} m`, 'kecil'); lb.position.set((p.x0 + p.x1) / 2, top + 1.8, (p.z0 + p.z1) / 2); gLabel.add(lb);
    }

    // ---------- gate: kusen baja, rolling shutter terbuka (gulungan di atas), ramp beton ke halaman bila tidak ada platform
    const mFrame = mat('#374151', { metalness: 0.6, roughness: 0.4 }), mShutter = mat('#ffffff', { metalness: 0.55, roughness: 0.35, map: teksProsedural('shutter', 1, 1) ?? undefined });
    gates.forEach((g, i) => {
      const sz = g.sisi === 'depan' || g.sisi === 'belakang'; const c = g.pos + g.lebar / 2; const tetap = g.sisi === 'depan' ? 0 : g.sisi === 'belakang' ? L : g.sisi === 'kiri' ? 0 : W;
      const titik = (sepanjang: number, y: number, keluar = 0) => { const o = g.sisi === 'depan' || g.sisi === 'kiri' ? -1 : 1; return sz ? new THREE.Vector3(tetap + o * keluar, y, sepanjang) : new THREE.Vector3(sepanjang, y, tetap + o * keluar); };
      const kotak = (a: number, b: number, h: number, pos: THREE.Vector3, m: THREE.Material) => { const k = new THREE.Mesh(sz ? new THREE.BoxGeometry(a, h, b) : new THREE.BoxGeometry(b, h, a), m); k.position.copy(pos); k.castShadow = true; gDinding.add(k); return k; };
      const h = Math.min(g.tinggi, H - 0.3);
      for (const d of [-1, 1]) kotak(0.3, 0.2, h + 0.3, titik(c + d * (g.lebar / 2 + 0.1), (h + 0.3) / 2), mFrame);   // tiang kusen
      kotak(0.3, g.lebar + 0.4, 0.25, titik(c, h + 0.15), mFrame);                                                 // ambang atas
      const gul = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, g.lebar + 0.2, 20), mat('#9ca3af', { metalness: 0.6, roughness: 0.4 }));
      gul.position.copy(titik(c, h + 0.5, -0.35)); if (sz) gul.rotation.x = Math.PI / 2; else gul.rotation.z = Math.PI / 2; gDinding.add(gul);   // gulungan shutter (sisi dalam)
      const tirai = kotak(0.05, g.lebar, Math.min(0.9, h * 0.2), titik(c, h - Math.min(0.9, h * 0.2) / 2, -0.12), mShutter.clone());
      (tirai.material as THREE.MeshStandardMaterial).map = teksProsedural('shutter', 1, Math.max(1, Math.min(0.9, h * 0.2) / 0.5));
      const adaPlatform = (layout.platform ?? []).some(p => sz ? c >= p.z0 && c <= p.z1 && (g.sisi === 'depan' ? p.x1 <= 0.05 : p.x0 >= L - 0.05) : c >= p.x0 && c <= p.x1 && (g.sisi === 'kiri' ? p.z1 <= 0.05 : p.z0 >= W - 0.05));
      if (dockH > 0.05 && !adaPlatform) {
        const rl = Math.min(12, Math.max(4, dockH * 8));   // kemiringan ±1 : 8 untuk forklift
        const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(rl, 0); sh.lineTo(0, dockH); sh.lineTo(0, 0);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: g.lebar + 0.6, bevelEnabled: false }); geo.translate(0, 0, -(g.lebar + 0.6) / 2);
        const ramp = new THREE.Mesh(geo, mBetonLuar(rl, g.lebar)); ramp.castShadow = ramp.receiveShadow = true;
        ramp.rotation.y = g.sisi === 'depan' ? Math.PI : g.sisi === 'belakang' ? 0 : g.sisi === 'kiri' ? Math.PI / 2 : -Math.PI / 2;
        ramp.position.copy(titik(c, y0, 0)); gBangunan.add(ramp);
        for (const d of [-1, 1]) { const tb = titik(c + d * (g.lebar / 2 + 0.5), y0 + 0.6, rl * 0.25); const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 14), mKuning); bol.position.copy(tb); bol.castShadow = true; gBangunan.add(bol); }
      }
      const tl = label(`${g.label && g.label !== 'Gate' ? g.label : g.arus === 'inbound' ? 'Gate IN' : g.arus === 'outbound' ? 'Gate OUT' : `Gate ${i + 1}`} · ${f1(g.lebar)} × ${f1(h)} m`, 'kecil'); tl.position.copy(titik(c, h + 1.1, 0.6)); gLabel.add(tl);
    });

    // dock leveler + pintu + truk (lantai bak truk ≈ tinggi dock)
    for (const [i, d] of layout.dock.entries()) {
      const xs = xSandarDi(d.z);
      const lv = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 2.4), mat('#4b5563', { metalness: 0.5 })); lv.position.set(xs + 1.2, 0.06, d.z); gBangunan.add(lv);
      const lvTepi = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 2.4), mKuning); lvTepi.position.set(xs + 0.02, 0.125, d.z); gBangunan.add(lvTepi);
      const rangka = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, pintu + 0.3), mat(d.arus === 'inbound' ? '#2563eb' : '#059669')); rangka.position.set(0, tinggiPintu, d.z); gDinding.add(rangka);
      for (const dz of [-1.1, 1.1]) { const bp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.3), mKaret); bp.position.set(xs - 0.13, -0.32, d.z + dz); bp.castShadow = true; gBangunan.add(bp); }
      if (bersih) {
        // kusen pintu biru tebal + seal dock
        const biru = mat('#2563eb', { roughness: 0.4 });
        for (const dz of [-(pintu / 2 + 0.15), pintu / 2 + 0.15]) { const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, tinggiPintu, 0.3), biru); t2.position.set(0, tinggiPintu / 2, d.z + dz); t2.castShadow = true; gDinding.add(t2); }
        const seal = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, pintu + 0.9), mat('#1f2937')); seal.position.set(-0.2, tinggiPintu + 0.1, d.z); gDinding.add(seal);
      } else {
        // dock shelter (tirai karet) & gulungan shutter
        const shelter = mat('#1f2937', { roughness: 0.95 });
        for (const dz of [-(pintu / 2 + 0.2), pintu / 2 + 0.2]) { const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, tinggiPintu - 0.4, 0.35), shelter); t2.position.set(-0.3, (tinggiPintu - 0.4) / 2 + 0.2, d.z + dz); t2.castShadow = true; gDinding.add(t2); }
        const atasS = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, pintu + 0.75), shelter); atasS.position.set(-0.3, tinggiPintu - 0.1, d.z); gDinding.add(atasS);
        const gul = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, pintu + 0.2, 20), mat('#9ca3af', { metalness: 0.6, roughness: 0.4 })); gul.rotation.x = Math.PI / 2; gul.position.set(0.35, tinggiPintu + 0.35, d.z); gDinding.add(gul);
      }
      const tl = label(`${d.arus === 'inbound' ? 'IN' : 'OUT'} ${i + 1}`, 'kecil'); tl.position.set(-0.5, tinggiPintu + 0.6, d.z); gLabel.add(tl);
      if (lapisanRef.current) continue;   // mode game: truk digambar lapisan sesuai jadwal
      const truk = modelTruk(d.arus);
      truk.position.set(xs - 0.4, y0, d.z); gTruk.add(truk);
    }

    // fasilitas (ruangan kaca)
    for (const f of layout.fasilitas) {
      const tinggi = f.tinggi && f.tinggi > 0 ? f.tinggi : 3, sx = f.x1 - f.x0, sz = f.z1 - f.z0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx - 0.2, tinggi, sz - 0.2), new THREE.MeshStandardMaterial({ color: '#ede9fe', transparent: true, opacity: 0.55, roughness: 0.3 }));
      m.position.set((f.x0 + f.x1) / 2, tinggi / 2, (f.z0 + f.z1) / 2); m.castShadow = true; gBangunan.add(m);
      const tepi = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: '#6d28d9' })); tepi.position.copy(m.position); gBangunan.add(tepi);
      const lb = label(f.nama, 'kecil'); lb.position.set(m.position.x, tinggi + 0.4, m.position.z); gLabel.add(lb);
    }

    // ---------- rak (instanced)
    const nTiang = layout.rak.reduce((s2, r2) => s2 + (r2.nBay + 1) * 2, 0);
    const nBeam = layout.rak.reduce((s2, r2) => s2 + r2.nBay * (r2.level - 1) * 2, 0);
    const tiang = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, layout.tinggiRak, 0.07), mat('#ffffff', { metalness: 0.35, roughness: 0.5, map: teksProsedural('upright', 1, layout.tinggiRak / 0.4) ?? undefined }), Math.max(1, nTiang));
    const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.13, 1), mat('#f26a1b', { metalness: 0.3, roughness: 0.42 }), Math.max(1, nBeam));
    // bracing frame: horizontal + diagonal zig-zag yang mengikat upright depan & belakang (segitiga di sisi frame)
    const PITCH = 1.0;
    const nSilang = layout.rak.reduce((s2, r2) => s2 + (r2.nBay + 1) * (Math.ceil((r2.tinggi ?? layout.tinggiRak) / PITCH) + 2), 0);
    const silang = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 1, 0.025), mat('#2a5fc0', { metalness: 0.35, roughness: 0.5 }), Math.max(1, nSilang));
    const kaki = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 0.14), mat('#334155', { metalness: 0.4, roughness: 0.5 }), Math.max(1, nTiang));
    const tmp = new THREE.Object3D(); let it = 0, ib = 0, is = 0, ik = 0;
    // baris rak: tiang di tiap batas bay (muka lorong & muka belakang), beam sejajar arah baris; arah 'z' = baris memanjang di Z
    for (const rr of layout.rak) {
      const ly = rr.levelY ?? layout.levelY; const tg = rr.tinggi ?? layout.tinggiRak; const zArah = rr.arah === 'z';
      const titik = (sepanjang: number, melintang: number, y: number) => zArah ? tmp.position.set(rr.x0 + melintang, y, rr.z0 + sepanjang) : tmp.position.set(rr.x0 + sepanjang, y, rr.z0 + melintang);
      for (let b = 0; b <= rr.nBay; b++) for (const dz of [0.05, rr.depth - 0.05]) {
        titik(b * rr.bayW, dz, tg / 2); tmp.scale.set(1, tg / layout.tinggiRak, 1); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); tiang.setMatrixAt(it++, tmp.matrix);
        titik(b * rr.bayW, dz, 0.01); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); kaki.setMatrixAt(ik++, tmp.matrix);
      }
      // bracing di bidang frame (melintang baris): batang datar bawah & atas + diagonal bolak-balik tiap ±1 m
      const lebarF = Math.max(0.2, rr.depth - 0.1), nSeg = Math.max(1, Math.ceil((tg - 0.35) / PITCH)), pitch = (tg - 0.35) / nSeg;
      const panjangD = Math.hypot(lebarF, pitch), sudut = Math.atan2(lebarF, pitch);
      for (let b = 0; b <= rr.nBay; b++) {
        const sp = b * rr.bayW;
        for (const yH of [0.2, tg - 0.15]) {
          titik(sp, rr.depth / 2, yH); tmp.scale.set(1, lebarF, 1); tmp.rotation.set(zArah ? 0 : Math.PI / 2, 0, zArah ? Math.PI / 2 : 0); tmp.updateMatrix(); silang.setMatrixAt(is++, tmp.matrix);
        }
        for (let i = 0; i < nSeg; i++) {
          const arah = i % 2 ? 1 : -1; titik(sp, rr.depth / 2, 0.2 + (i + 0.5) * pitch); tmp.scale.set(1, panjangD, 1);
          if (zArah) tmp.rotation.set(0, 0, arah * sudut); else tmp.rotation.set(arah * sudut, 0, 0);
          tmp.updateMatrix(); silang.setMatrixAt(is++, tmp.matrix);
        }
      }
      for (let b = 0; b < rr.nBay; b++) for (let l = 1; l < rr.level; l++) for (const dz of [0.05, rr.depth - 0.05]) {
        titik((b + 0.5) * rr.bayW, dz, (ly[l] ?? 0) - 0.06); tmp.scale.set(1, 1, rr.bayW - 0.09); tmp.rotation.set(0, zArah ? 0 : Math.PI / 2, 0); tmp.updateMatrix(); beam.setMatrixAt(ib++, tmp.matrix);
      }
    }
    tiang.count = it; beam.count = ib; silang.count = is; kaki.count = ik;
    tiang.castShadow = beam.castShadow = true; tiang.receiveShadow = beam.receiveShadow = silang.receiveShadow = true;
    gRak.add(tiang, beam, silang, kaki);
    // palet: alas kayu + muatan (warna karton bervariasi, stretch film)
    const n = Math.max(1, layout.palet.length);
    const alas = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.14, 1.0), mat('#ffffff', { roughness: 0.9, map: teks('palet') }), n);
    const tinggiMuat = Math.max(0.3, layout.tinggiPalet - 0.22);
    const muat = new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, tinggiMuat, 0.96), mat('#ffffff', { roughness: 0.4, map: teks('muatan') }), n);
    const warna = ['#ffffff', '#f4efe6', '#ebe3d4', '#fbf7f0', '#e6edf3', '#f1e9dc'].map(c => new THREE.Color(c));   // variasi halus di atas tekstur karton
    const rnd = (i: number) => { const x2 = Math.sin(i * 12.9898) * 43758.5453; return x2 - Math.floor(x2); };
    layout.palet.forEach((p, i) => {
      tmp.position.set(p.x, p.y + 0.07, p.z); tmp.scale.set(1, 1, 1); tmp.rotation.set(0, p.rot ? Math.PI / 2 : 0, 0); tmp.updateMatrix(); alas.setMatrixAt(i, tmp.matrix);
      const sk = 0.85 + rnd(i) * 0.15;
      tmp.position.set(p.x, p.y + 0.14 + (tinggiMuat * sk) / 2, p.z); tmp.scale.set(1, sk, 1); tmp.updateMatrix(); muat.setMatrixAt(i, tmp.matrix);
      muat.setColorAt(i, warna[Math.floor(rnd(i + 7) * warna.length)]);
    });
    alas.count = muat.count = layout.palet.length; alas.castShadow = muat.castShadow = layout.palet.length <= 4000;   // gudang besar: bayangan palet dimatikan supaya tetap lancar
    alas.receiveShadow = muat.receiveShadow = true;
    if (lapisanRef.current) { alas.count = muat.count = 0; } else gRak.add(alas, muat);

    // ---------- MHE
    s.kendaraan = [];
    let iLor = 0, iFl = 0, iHp = 0;
    const lorRak = layout.lorong.filter(l => l.zona === 'spr' || l.zona === 'ddr');
    for (const u of lapisanRef.current ? [] : layout.mhe) {
      if (u.jenis === 'perangkat') continue;
      for (let k = 0; k < Math.min(u.unit, 40); k++) {
        const g = modelMhe(u.jenis, u.jenis === 'reach' ? Math.min(layout.tinggiRak, layout.H - 0.4) * 0.45 : 2.4);
        const lb = label(`${NAMA_MHE[u.jenis]} ${k + 1}`, 'mhe'); lb.position.set(0, 3.1, 0); (lb.element as HTMLDivElement).title = u.nama; g.add(lb);
        let a: THREE.Vector3, b: THREE.Vector3;
        if ((u.jenis === 'reach' || u.jenis === 'stacker') && lorRak.length) {
          // reach truck: mulut lorong (jalur utama) ↔ bay tujuan di dalam lorong
          const lo = lorRak[iLor++ % lorRak.length];
          a = new THREE.Vector3(lo.x0, 0, lo.z0); b = titikLorong(lo, 0.15 + ((k * 0.37 + iLor * 0.23 + 0.2) % 1) * 0.8, 0);
        } else if (u.jenis === 'hpt') {
          const r2 = iHp++ % 2 === 0 ? layout.stagingIn : layout.stagingOut; const x = r2.x0 + 2.5 + (iHp % 3) * 1.6; a = new THREE.Vector3(x, 0, r2.z0 + 1); b = new THREE.Vector3(x, 0, r2.z1 - 1);
        } else {
          const r2 = iFl % 2 === 0 ? layout.stagingIn : layout.stagingOut; const dk = layout.dock.filter(d => (iFl % 2 === 0 ? d.arus === 'inbound' : d.arus === 'outbound'));
          const z = dk.length ? dk[Math.floor(iFl / 2) % dk.length].z : (r2.z0 + r2.z1) / 2; iFl++;
          a = new THREE.Vector3(xSandar(layout, z) + 1.5, 0, z); b = new THREE.Vector3(r2.x1 + (lorRak.length ? 2 : -1), 0, z + (k % 2 ? 1.5 : -1.5));
        }
        const kunci = u.jenis === 'reach' || u.jenis === 'stacker' ? 'reach' : u.jenis === 'forklift' ? 'forklift' : '';
        if (kunci) s.kendaraan.push({ g, kunci });
        g.position.copy(a); gMhe.add(g);
        s.gerak.push({ obj: g, a, b, kunci: `tool:${u.nama}`, siklusAwal: 120, fase: (k * 0.37 + u.unit * 0.11) % 1, garpu: g.getObjectByName('garpu') ?? undefined,
          angkat: u.jenis === 'reach' || u.jenis === 'stacker' ? Math.max(0.5, layout.levelY[Math.min(layout.levelY.length - 1, 1 + (k % Math.max(1, layout.levelY.length - 1)))] ?? 1) : 1.2 });
      }
    }
    terapkanOpsi(); bangunOrang(); aturKamera(bersih ? 'dekat' : 'iso');
    pasangLapisan();
  }, [layout, tema]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Pasang ulang lapisan dinamis (dipanggil saat layout atau lapisan berubah). */
  function pasangLapisan() {
    const s = st.current; const scene = s.scene; if (!scene || !s.cam) return;
    s.lap?.buang(); s.lap = undefined;
    const lama = s.grup.game; if (lama) { scene.remove(lama); lama.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); }); }
    if (!lapisanRef.current) return;
    const g = new THREE.Group(); g.name = 'game'; scene.add(g); s.grup.game = g;
    s.lap = lapisanRef.current({ scene, grup: g, layout, kamera: s.cam, kanvas: s.renderer!.domElement, tema: temaRef.current, kontrolKamera: s.ctl! });
    terapkanOpsi();
  }

  // ---------- manpower per shift
  function bangunOrang() {
    const s = st.current; const scene = s.scene; if (!scene) return;
    const lama = s.grup.orang; if (lama) { scene.remove(lama); lama.traverse(o => { if (o instanceof CSS2DObject) o.element.remove(); }); }
    const g = new THREE.Group(); scene.add(g); s.grup.orang = g; s.gerakOrang = [];
    if (lapisanRef.current) return;   // mode game: orang digambar lapisan
    const L = layout; const W = L.W;
    const kantor = L.fasilitas.find(f => /office|kantor|admin|control/i.test(f.nama)) ?? L.fasilitas[0];
    const acakTitik = (x0: number, x1: number, z0: number, z1: number, i: number) => new THREE.Vector3(x0 + ((i * 0.618) % 1) * (x1 - x0), 0, z0 + ((i * 0.377 + 0.13) % 1) * (z1 - z0));
    const lorRak = L.lorong.filter(l => l.zona === 'spr' || l.zona === 'ddr');
    let iChk = 0, iPick = 0, iLain = 0;
    // operator duduk di MHE (sebanyak unit); sisanya berdiri di jalur utama
    for (const k of s.kendaraan) { const lama2 = k.g.getObjectByName('op'); if (lama2) k.g.remove(lama2); }
    const sisaOp: Record<string, number> = { reach: 0, forklift: 0 };
    for (const o of L.orang) if (o.kategori === 'operator') { const k = /reach|\bRT\b/i.test(o.nama) ? 'reach' : 'forklift'; sisaOp[k] += Math.round(o.perShift[shift] ?? 0); }
    for (const k of s.kendaraan) if (sisaOp[k.kunci] > 0) { sisaOp[k.kunci]--; const op = modelOrang(WARNA_ORANG.operator); op.name = 'op'; op.scale.setScalar(0.85); op.position.set(-0.45, 0.35, 0); k.g.add(op); }
    for (const o of L.orang) {
      let jml = Math.round(o.perShift[shift] ?? 0);
      if (o.kategori === 'operator') { const k = /reach|\bRT\b/i.test(o.nama) ? 'reach' : 'forklift'; const tampil = Math.min(jml, sisaOp[k]); sisaOp[k] -= tampil; jml = tampil; }
      if (jml <= 0) continue;
      const pos: THREE.Vector3[] = []; const jalanLorong: Gerak[] = [];
      for (let i = 0; i < Math.min(jml, 60); i++) {
        let p: THREE.Vector3;
        switch (o.kategori) {
          case 'admin': p = kantor ? acakTitik(kantor.x0 + 0.6, kantor.x1 - 0.6, kantor.z0 + 0.6, kantor.z1 - 0.6, i + 1) : acakTitik(5, 7, 0.8, 3, i); break;
          case 'checker': {
            const r = /\bIB\b|inbound|receiv/i.test(o.nama) ? L.stagingIn : /\bOB\b|outbound|dispatch/i.test(o.nama) ? L.stagingOut : iChk++ % 2 === 0 ? L.stagingIn : L.stagingOut;
            p = acakTitik(r.x0 + 4.5, r.x1 - 1, r.z0 + 1, r.z1 - 1, i + 3);
            jalanLorong.push({ obj: new THREE.Object3D(), a: p, b: new THREE.Vector3(p.x, 0, Math.min(r.z1 - 0.8, p.z + 2.5)), kunci: `role:${o.nama}`, siklusAwal: 60, fase: (i * 0.41) % 1 }); break;
          }
          case 'tkbm': { const d = L.dock[i % Math.max(1, L.dock.length)]; p = new THREE.Vector3(xSandar(L, d?.z ?? W / 2) + 2.6 + (i % 3) * 0.8, 0, (d?.z ?? W / 2) + ((i % 2) ? 1.6 : -1.6));
            jalanLorong.push({ obj: new THREE.Object3D(), a: p, b: new THREE.Vector3(xSandar(L, d?.z ?? W / 2) - 2, 0.05, d?.z ?? W / 2), kunci: `role:${o.nama}`, siklusAwal: 60, fase: (i * 0.33) % 1 }); break; }
          case 'supervisor': p = new THREE.Vector3(L.stagingIn.x1 + 1.5 + i * 1.2, 0, W / 2 + (i % 2 ? 1 : -1)); break;
          case 'security': p = new THREE.Vector3(-3 - i, -(L.tinggiDock ?? 1.2), W + 2.5); break;
          case 'inventory': {
            const lo = lorRak[(i * 3 + 1) % Math.max(1, lorRak.length)];
            if (lo) { p = titikLorong(lo, 0.97, 0.5); jalanLorong.push({ obj: new THREE.Object3D(), a: p, b: titikLorong(lo, 0.08, 0.5), kunci: `role:${o.nama}`, siklusAwal: 300, fase: (i * 0.27) % 1 }); }
            else p = new THREE.Vector3(L.stagingIn.x1 + 2, 0, 2 + i);
            break;
          }
          case 'picker': {
            const lo = lorRak[iPick++ % Math.max(1, lorRak.length)];
            if (lo) { const a = titikLorong(lo, 0.03, 0.6); const b = titikLorong(lo, 0.15 + ((i * 0.53 + 0.3) % 1) * 0.8, 0.6); p = a; jalanLorong.push({ obj: new THREE.Object3D(), a, b, kunci: `role:${o.nama}`, siklusAwal: 30, fase: (i * 0.29) % 1 }); }
            else p = acakTitik(L.stagingOut.x0 + 4.5, L.stagingOut.x1 - 1, L.stagingOut.z0 + 1, L.stagingOut.z1 - 1, i + 5);
            break;
          }
          default: p = acakTitik(L.stagingIn.x1 + 0.5, L.stagingIn.x1 + 3.5, 1, W - 1, ++iLain + 9);
        }
        const fig = modelOrang(WARNA_ORANG[o.kategori]); fig.position.copy(p); fig.rotation.y = (i * 1.3) % (Math.PI * 2); g.add(fig); pos.push(p);
        const jl = jalanLorong.find(j => j.a === p); if (jl) { jl.obj = fig; s.gerakOrang.push(jl); }
      }
      const pusat = pos.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / pos.length);
      const lb = label(`${o.nama} ×${jml}`, 'orang'); (lb.element as HTMLDivElement).style.borderColor = WARNA_ORANG[o.kategori];
      lb.position.set(pusat.x, 2.4, pusat.z); g.add(lb);
    }
    terapkanOpsi();
  }

  function terapkanOpsi() {
    const s = st.current; const gr = s.grup;
    if (gr.atap) gr.atap.visible = opsi.atap;
    if (gr.dinding) gr.dinding.visible = opsi.dinding;
    if (gr.truk) gr.truk.visible = opsi.truk;
    if (gr.orang) gr.orang.visible = opsi.orang;
    if (gr.game) { const o = gr.game.getObjectByName('orang'); if (o) o.visible = opsi.orang; const t = gr.game.getObjectByName('truk'); if (t) t.visible = opsi.truk; }
    s.jalan = opsi.animasi;
    const tampilLabel = (g?: THREE.Group, v = true) => g?.traverse(o => { if (o instanceof CSS2DObject) o.visible = v; });
    for (const g of Object.values(gr)) tampilLabel(g, opsi.label);
    if (gr.orang && !opsi.orang) tampilLabel(gr.orang, false);
    if (gr.truk && !opsi.truk) tampilLabel(gr.truk, false);
  }

  useEffect(() => { pasangLapisan(); }, [lapisan]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bangunOrang(); }, [shift]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { terapkanOpsi(); }, [opsi]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={wadah} className="sim3d-wadah" />;
});

export default Viewer3D;
