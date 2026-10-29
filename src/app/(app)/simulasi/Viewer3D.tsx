'use client';
// Viewer 3D gudang (three.js): bangunan, dock & truk, rak SPR/DDR, palet, staging, fasilitas, MHE bergerak, manpower per shift.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { LayoutGudang, JenisMhe } from '@/lib/simulasi3d/layout';
import { WARNA_MHE, WARNA_ORANG } from './warna';

export type Kamera = 'iso' | 'atas' | 'dock' | 'lorong' | 'dekat';
export interface ViewerApi { kamera: (k: Kamera) => void; screenshot: () => string | null; statistik: () => { detikSim: number; siklus: Record<string, number> } }
/** Kecepatan simulasi: faktor percepatan waktu & lama satu siklus (detik waktu nyata gudang) per alat / role, dari productivity. */
export interface Kecepatan { faktor: number; siklus: Record<string, number> }
export interface OpsiViewer { atap: boolean; dinding: boolean; label: boolean; animasi: boolean; truk: boolean; orang: boolean }
/** Lapisan dinamis (mis. Leca Game): dipasang setelah adegan statis dibangun; frame() dipanggil tiap frame dengan dt detik nyata. */
export interface KonteksLapisan { scene: THREE.Scene; grup: THREE.Group; layout: LayoutGudang; kamera: THREE.PerspectiveCamera; kanvas: HTMLCanvasElement; tema: TemaViewer }
export type PasangLapisan = (k: KonteksLapisan) => { frame: (dt: number) => void; buang: () => void };
/** Tema tampilan: standar (material foto TapNow) atau bersih (isometrik, warna solid lembut, atap biru). */
export type TemaViewer = 'standar' | 'bersih';

const WARNA_ZONA: Record<string, string> = {
  stagingIn: '#3b82f6', stagingOut: '#10b981', spr: '#64748b', ddr: '#475569', block: '#a16207', floor: '#b45309', fasilitas: '#8b5cf6', jalur: '#f59e0b', custom: '#0ea5e9',
};
const NAMA_MHE: Record<JenisMhe, string> = { reach: 'RT', forklift: 'FL', stacker: 'ST', hpt: 'HPT', perangkat: '' };

export function label(teks: string, kelas = 'lbl') {
  const d = document.createElement('div'); d.className = `sim3d-${kelas}`; d.textContent = teks;
  return new CSS2DObject(d);
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

const Viewer3D = forwardRef<ViewerApi, { layout: LayoutGudang; shift: number; opsi: OpsiViewer; kecepatan: Kecepatan; lapisan?: PasangLapisan; tema?: TemaViewer }>(function Viewer3D({ layout, shift, opsi, kecepatan, lapisan, tema = 'standar' }, ref) {
  const temaRef = useRef<TemaViewer>(tema); temaRef.current = tema;
  const lapisanRef = useRef<PasangLapisan | undefined>(lapisan);
  lapisanRef.current = lapisan;
  const wadah = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer?: THREE.WebGLRenderer; lr?: CSS2DRenderer; scene?: THREE.Scene; cam?: THREE.PerspectiveCamera; ctl?: OrbitControls;
    lap?: ReturnType<PasangLapisan>;
    grup: Record<string, THREE.Group>; kendaraan: { g: THREE.Group; kunci: string }[]; gerak: Gerak[]; gerakOrang: Gerak[]; jalan: boolean; L: number; W: number; H: number; detikSim: number; kec: Kecepatan;
  }>({ grup: {}, kendaraan: [], gerak: [], gerakOrang: [], jalan: true, L: 0, W: 0, H: 0, detikSim: 0, kec: { faktor: 10, siklus: {} } });
  st.current.kec = kecepatan;
  const siklusDari = (g: Gerak) => Math.max(1, st.current.kec.siklus[g.kunci] ?? g.siklusAwal);

  useImperativeHandle(ref, () => ({
    kamera: (k: Kamera) => aturKamera(k),
    screenshot: () => { const s = st.current; if (!s.renderer || !s.scene || !s.cam) return null; s.renderer.render(s.scene, s.cam); return s.renderer.domElement.toDataURL('image/png'); },
    statistik: () => {
      const s = st.current; const siklus: Record<string, number> = {};
      for (const g of [...s.gerak, ...s.gerakOrang]) { const n = Math.floor(s.detikSim / siklusDari(g) + g.fase) - Math.floor(g.fase); siklus[g.kunci] = (siklus[g.kunci] ?? 0) + n; }
      return { detikSim: s.detikSim, siklus };
    },
  }));

  function aturKamera(k: Kamera) {
    const s = st.current; if (!s.cam || !s.ctl) return;
    const { L, W, H } = s; const m = Math.max(L, W);
    const target = new THREE.Vector3(L / 2, 0, W / 2);
    if (k === 'iso') s.cam.position.set(-m * 0.35, m * 0.65, W + m * 0.55);
    if (k === 'atas') { s.cam.position.set(L / 2, m * 1.25, W / 2 + 0.01); }
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
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
    const cam = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 1500);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.495;
    Object.assign(s, { renderer, lr, scene, cam, ctl });
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
      ctl.update(); renderer.render(scene, cam); lr.render(scene, cam);
    };
    loop();
    return () => {
      cancelAnimationFrame(id); ro.disconnect(); ctl.dispose(); s.lap?.buang(); s.lap = undefined;
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
      pm.dispose(); renderer.dispose(); el.innerHTML = '';
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
    const latar = bersih ? '#eef3f9' : '#e8eef5';
    scene.background = new THREE.Color(latar); scene.fog = new THREE.Fog(latar, bersih ? 220 : 160, bersih ? 520 : 420);
    if (s.renderer) { s.renderer.shadowMap.type = bersih ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; s.renderer.toneMappingExposure = bersih ? 1.12 : 1.05; }
    const G = (n: string) => { const g = new THREE.Group(); g.name = n; scene.add(g); s.grup[n] = g; return g; };
    const gBangunan = G('bangunan'), gAtap = G('atap'), gDinding = G('dinding'), gLabel = G('label'), gRak = G('rak'), gTruk = G('truk'), gMhe = G('mhe');

    // cahaya
    const hemi = new THREE.HemisphereLight('#f5f9ff', '#8d939a', 0.9); gBangunan.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4); sun.position.set(L * 0.3 - 40, 80, W + 60); sun.target.position.set(L / 2, 0, W / 2);
    sun.castShadow = true; const r = Math.max(L, W) * 0.75 + 20;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 300 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    gBangunan.add(sun, sun.target);
    const isi = new THREE.AmbientLight('#ffffff', 0.35); gBangunan.add(isi);

    // tanah & lantai
    const tanah = new THREE.Mesh(new THREE.PlaneGeometry(L + 160, W + 160), mat(bersih ? '#e6ebf1' : '#b9c0c5', { roughness: 0.95 })); tanah.rotation.x = -Math.PI / 2; tanah.position.set(L / 2 - 20, -0.02, W / 2); tanah.receiveShadow = true; gBangunan.add(tanah);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(30, W + 10), bersih ? mat('#d9e0e8', { roughness: 0.9 }) : mat('#ffffff', { roughness: 0.9, map: teks('aspal', 30 / 6, (W + 10) / 6) })); apron.rotation.x = -Math.PI / 2; apron.position.set(-15, -0.01, W / 2); apron.receiveShadow = true; gBangunan.add(apron);
    const lantai = new THREE.Mesh(new THREE.BoxGeometry(L, 0.1, W), bersih ? mat('#f5f7fa', { roughness: 0.35 }) : mat('#ffffff', { roughness: 0.45, metalness: 0.0, map: teks('lantai', L / 6, W / 6) }));
    if (bersih) {
      // halaman truk: garis parkir kuning & garis jalur putus-putus
      const cat = (sx: number, sz: number, x: number, z: number, c = '#facc15') => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.012, sz), mat(c, { roughness: 0.6 })); m.position.set(x, 0.006, z); gBangunan.add(m); };
      for (const dk of layout.dock) { cat(14, 0.12, -7.5, dk.z - 1.6); cat(14, 0.12, -7.5, dk.z + 1.6); }
      for (let z = -2; z < W + 6; z += 3) cat(0.14, 1.6, -17, z, '#ffffff');
      for (let i = 0; i < 6; i++) { const z0 = -6 - i * 4.2; cat(13, 0.12, -24, z0); }
      cat(30, 0.14, -15, -3.5, '#ffffff'); cat(30, 0.14, -15, W + 3.5, '#ffffff');
    } lantai.position.set(L / 2, -0.05, W / 2); lantai.receiveShadow = true; gBangunan.add(lantai);
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
    // kolom struktur (layout editor)
    for (const k of layout.kolom ?? []) { const m = new THREE.Mesh(new THREE.BoxGeometry(k.w, k.tinggi, k.d), mat('#475569', { metalness: 0.5, roughness: 0.4 })); m.position.set(k.x + k.w / 2, k.tinggi / 2, k.z + k.d / 2); m.castShadow = true; gBangunan.add(m); }

    // dinding (panel cladding transparan) + kolom baja
    const panel = (sx: number, sy: number, sz: number, x: number, y: number, z: number, padat = false) => {
      const panjang = Math.max(sx, sz);
      const mDinding = bersih
        ? new THREE.MeshStandardMaterial({ color: '#f8fafc', transparent: !padat, opacity: padat ? 1 : 0.35, roughness: 0.6, side: THREE.DoubleSide, depthWrite: padat })
        : new THREE.MeshStandardMaterial({ color: '#ffffff', map: teks('cladding', Math.max(1, panjang / 4), Math.max(1, sy / 4)), transparent: true, opacity: 0.45, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mDinding); m.position.set(x, y, z); m.receiveShadow = padat; m.castShadow = padat; gDinding.add(m);
    };
    if (bersih) {
      // dinding belakang & ujung padat putih; sisi yang menghadap kamera dipotong rendah (cutaway) supaya isi gudang terlihat
      panel(L, H, 0.2, L / 2, H / 2, 0, true); panel(0.2, H, W, L, H / 2, W / 2, true); panel(L, 1.2, 0.2, L / 2, 0.6, W, true);
      const lis = mat('#2563eb', { roughness: 0.4 });
      for (const [x, z] of [[0, 0], [L, 0], [L, W], [0, W]] as const) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.35, z === W && x !== 0 && x !== L ? 1.2 : H, 0.35), lis); k.position.set(x, H / 2, z); k.castShadow = true; gDinding.add(k); }
      const tepiAtas = (sx: number, sz: number, x: number, z: number, y: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.25, sz), lis); m.position.set(x, y, z); gDinding.add(m); };
      tepiAtas(L, 0.3, L / 2, 0, H); tepiAtas(0.3, W, L, W / 2, H); tepiAtas(L, 0.3, L / 2, W, 1.2);
    } else { panel(L, H, 0.15, L / 2, H / 2, 0); panel(L, H, 0.15, L / 2, H / 2, W); panel(0.15, H, W, L, H / 2, W / 2); }
    // dinding depan berlubang di pintu dock
    const pintu = 3.2, tinggiPintu = 4.2;
    const zs = [...layout.dock.map(d => d.z)].sort((a, b) => a - b);
    let zPrev = 0;
    for (const zc of zs) { if (zc - pintu / 2 - zPrev > 0.05) panel(0.15, H, zc - pintu / 2 - zPrev, 0, H / 2, (zPrev + zc - pintu / 2) / 2); panel(0.15, H - tinggiPintu, pintu, 0, tinggiPintu + (H - tinggiPintu) / 2, zc); zPrev = zc + pintu / 2; }
    if (W - zPrev > 0.05) panel(0.15, H, W - zPrev, 0, H / 2, (zPrev + W) / 2);
    const mKolom = mat(bersih ? '#2563eb' : '#334155', { metalness: bersih ? 0.1 : 0.6, roughness: 0.4 });
    for (let x = 0; x <= L + 0.01; x += Math.max(6, L / Math.ceil(L / 8))) for (const z of bersih ? [0] : [0, W]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), mKolom); k.position.set(x, H / 2, z); k.castShadow = true; gDinding.add(k); }
    // atap pelana (bubungan sepanjang X)
    const miring = Math.hypot(W / 2, puncak - H);
    const mAtap = new THREE.MeshStandardMaterial({ color: bersih ? '#3b82f6' : '#cbd5e1', roughness: 0.5, metalness: bersih ? 0.1 : 0.4, side: THREE.DoubleSide, transparent: true, opacity: bersih ? 0.97 : 0.92 });
    for (const sgn of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.12, miring + 0.6), mAtap);
      a.position.set(L / 2, (H + puncak) / 2, W / 2 + (sgn * W) / 4); a.rotation.x = sgn * Math.atan2(puncak - H, W / 2); a.castShadow = true; gAtap.add(a);
    }

    // dock leveler + pintu + truk
    for (const [i, d] of layout.dock.entries()) {
      const lv = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 2.4), mat('#4b5563', { metalness: 0.5 })); lv.position.set(1.2, 0.06, d.z); gBangunan.add(lv);
      const rangka = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, pintu + 0.3), mat(d.arus === 'inbound' ? '#2563eb' : '#059669')); rangka.position.set(0, tinggiPintu, d.z); gDinding.add(rangka);
      if (bersih) {
        // kusen pintu biru tebal + seal dock + bumper
        const biru = mat('#2563eb', { roughness: 0.4 });
        for (const dz of [-(pintu / 2 + 0.15), pintu / 2 + 0.15]) { const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, tinggiPintu, 0.3), biru); t2.position.set(0, tinggiPintu / 2, d.z + dz); t2.castShadow = true; gDinding.add(t2); }
        const seal = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, pintu + 0.9), mat('#1f2937')); seal.position.set(-0.2, tinggiPintu + 0.1, d.z); gDinding.add(seal);
        for (const dz of [-1.1, 1.1]) { const bp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.3), mat('#111827')); bp.position.set(-0.15, 1.1, d.z + dz); gBangunan.add(bp); }
      }
      const tl = label(`${d.arus === 'inbound' ? 'IN' : 'OUT'} ${i + 1}`, 'kecil'); tl.position.set(-0.5, tinggiPintu + 0.6, d.z); gLabel.add(tl);
      if (lapisanRef.current) continue;   // mode game: truk digambar lapisan sesuai jadwal
      const truk = modelTruk(d.arus);
      truk.position.set(-0.4, 0, d.z); gTruk.add(truk);
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
    const tiang = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, layout.tinggiRak, 0.09), mat('#1e56a0', { metalness: 0.5, roughness: 0.45 }), Math.max(1, nTiang));
    const beam = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.12, 1), mat('#f97316', { metalness: 0.4, roughness: 0.4 }), Math.max(1, nBeam));
    const tmp = new THREE.Object3D(); let it = 0, ib = 0;
    // baris rak: tiang di tiap batas bay (muka lorong & muka belakang), beam sejajar arah baris; arah 'z' = baris memanjang di Z
    for (const rr of layout.rak) {
      const ly = rr.levelY ?? layout.levelY; const tg = rr.tinggi ?? layout.tinggiRak; const zArah = rr.arah === 'z';
      const titik = (sepanjang: number, melintang: number, y: number) => zArah ? tmp.position.set(rr.x0 + melintang, y, rr.z0 + sepanjang) : tmp.position.set(rr.x0 + sepanjang, y, rr.z0 + melintang);
      for (let b = 0; b <= rr.nBay; b++) for (const dz of [0.05, rr.depth - 0.05]) {
        titik(b * rr.bayW, dz, tg / 2); tmp.scale.set(1, tg / layout.tinggiRak, 1); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); tiang.setMatrixAt(it++, tmp.matrix);
      }
      for (let b = 0; b < rr.nBay; b++) for (let l = 1; l < rr.level; l++) for (const dz of [0.05, rr.depth - 0.05]) {
        titik((b + 0.5) * rr.bayW, dz, (ly[l] ?? 0) - 0.06); tmp.scale.set(1, 1, rr.bayW - 0.09); tmp.rotation.set(0, zArah ? 0 : Math.PI / 2, 0); tmp.updateMatrix(); beam.setMatrixAt(ib++, tmp.matrix);
      }
    }
    tiang.count = it; beam.count = ib; tiang.castShadow = beam.castShadow = true; tiang.receiveShadow = beam.receiveShadow = true;
    gRak.add(tiang, beam);
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
          a = new THREE.Vector3(1.5, 0, z); b = new THREE.Vector3(r2.x1 + (lorRak.length ? 2 : -1), 0, z + (k % 2 ? 1.5 : -1.5));
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
    s.lap = lapisanRef.current({ scene, grup: g, layout, kamera: s.cam, kanvas: s.renderer!.domElement, tema: temaRef.current });
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
          case 'tkbm': { const d = L.dock[i % Math.max(1, L.dock.length)]; p = new THREE.Vector3(2.6 + (i % 3) * 0.8, 0, (d?.z ?? W / 2) + ((i % 2) ? 1.6 : -1.6));
            jalanLorong.push({ obj: new THREE.Object3D(), a: p, b: new THREE.Vector3(-2, 1.25, d?.z ?? W / 2), kunci: `role:${o.nama}`, siklusAwal: 60, fase: (i * 0.33) % 1 }); break; }
          case 'supervisor': p = new THREE.Vector3(L.stagingIn.x1 + 1.5 + i * 1.2, 0, W / 2 + (i % 2 ? 1 : -1)); break;
          case 'security': p = new THREE.Vector3(-3 - i, 0, W + 2.5); break;
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
