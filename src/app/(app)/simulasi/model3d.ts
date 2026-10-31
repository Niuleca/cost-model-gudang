// Model 3D gaya "bersih" (isometrik, sudut membulat, warna solid lembut) — dibuat dalam kode supaya ringan & bisa dianimasikan.
// Ukuran dalam meter, depan kendaraan = +X.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { JenisMhe } from '@/lib/simulasi3d/layout';

export const WARNA_BERSIH = {
  biru: '#2563eb', biruTua: '#1e3a8a', biruMuda: '#dbeafe', kuning: '#fbbf24', kuningTua: '#f59e0b', oranye: '#f97316',
  hitam: '#1f2937', abu: '#94a3b8', putih: '#ffffff', karton: '#d8b07a', kartonTua: '#b98a52', kayu: '#c89b63',
};
const cacheMat = new Map<string, THREE.MeshStandardMaterial>();
export function matB(c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const k = `${c}|${JSON.stringify(o)}`;
  let m = cacheMat.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o }); cacheMat.set(k, m); }
  return m;
}
const rb = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
function pasang(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, bayang = true) {
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = bayang; mesh.receiveShadow = true; mesh.userData.kode = true; g.add(mesh); return mesh;
}
function roda(g: THREE.Object3D, x: number, z: number, r: number, lebar = 0.18) {
  const w = pasang(g, new THREE.CylinderGeometry(r, r, lebar, 20), matB(WARNA_BERSIH.hitam, { roughness: 0.8 }), x, r, z); w.rotation.x = Math.PI / 2;
  const hub = pasang(g, new THREE.CylinderGeometry(r * 0.45, r * 0.45, lebar + 0.01, 14), matB('#cbd5e1', { metalness: 0.4 }), x, r, z, false); hub.rotation.x = Math.PI / 2;
}

/** Forklift / reach truck / stacker / hand pallet gaya bersih. Anak bernama 'garpu' bisa dinaikkan (posisi y). */
export function forkliftBersih(jenis: JenisMhe, tinggiMast: number) {
  const g = new THREE.Group();
  const kuning = matB(WARNA_BERSIH.kuning, { roughness: 0.45 }), kuningTua = matB(WARNA_BERSIH.kuningTua, { roughness: 0.45 });
  const navy = matB(WARNA_BERSIH.biruTua, { roughness: 0.5 }), hitam = matB(WARNA_BERSIH.hitam, { roughness: 0.6 }), baja = matB('#475569', { metalness: 0.5, roughness: 0.35 });
  const garpu = new THREE.Group(); garpu.name = 'garpu';
  const buatGarpu = (x: number, lebar = 0.62) => {
    garpu.position.set(x, 0.06, 0);
    pasang(garpu, rb(0.06, 0.9, 1.0, 0.02), hitam, 0, 0.45, 0);                       // sandaran beban
    for (const z of [-0.26, 0.26]) pasang(garpu, rb(1.1, 0.05, 0.12, 0.02), baja, 0.55, 0.02, z * (lebar / 0.62));
    g.add(garpu);
  };
  if (jenis === 'hpt') {
    pasang(g, rb(0.45, 0.42, 0.7, 0.1), matB(WARNA_BERSIH.biru), -0.45, 0.3, 0);
    const tg = pasang(g, new THREE.CylinderGeometry(0.025, 0.025, 1.05, 8), hitam, -0.7, 0.85, 0); tg.rotation.z = 0.35;
    pasang(g, rb(0.08, 0.06, 0.45, 0.03), hitam, -0.88, 1.33, 0);
    roda(g, -0.45, 0, 0.11, 0.12);
    buatGarpu(-0.15); return g;
  }
  const panjang = jenis === 'forklift' ? 2.2 : jenis === 'reach' ? 1.9 : 1.4;
  const lebar = jenis === 'forklift' ? 1.1 : 1.0;
  pasang(g, rb(panjang * 0.75, 0.42, lebar, 0.08), navy, -panjang * 0.12, 0.36, 0);               // sasis
  pasang(g, rb(panjang * 0.48, 0.62, lebar * 0.92, 0.16), kuning, -panjang * 0.2, 0.88, 0);       // bodi
  pasang(g, rb(0.42, 0.78, lebar, 0.14), kuningTua, -panjang * 0.48, 0.82, 0);                    // pemberat
  pasang(g, rb(0.36, 0.12, 0.5, 0.05), hitam, -panjang * 0.24, 1.25, 0);                          // jok
  pasang(g, rb(0.08, 0.6, 0.42, 0.04), hitam, -panjang * 0.38, 1.5, 0);                           // sandaran jok
  // pelindung atas
  const tinggiAtap = 2.15;
  for (const [x, z] of [[-panjang * 0.42, 0.42], [-panjang * 0.42, -0.42], [-panjang * 0.02, 0.42], [-panjang * 0.02, -0.42]] as const)
    pasang(g, new THREE.CylinderGeometry(0.035, 0.035, tinggiAtap - 1.1, 8), hitam, x, (tinggiAtap + 1.1) / 2, z);
  pasang(g, rb(panjang * 0.5, 0.07, 0.95, 0.03), hitam, -panjang * 0.22, tinggiAtap, 0);
  // tiang mast
  const mast = Math.max(2.2, tinggiMast);
  for (const z of [-0.32, 0.32]) pasang(g, rb(0.1, mast, 0.1, 0.03), baja, panjang * 0.16, mast / 2, z);
  pasang(g, rb(0.1, 0.08, 0.74, 0.03), baja, panjang * 0.16, mast, 0);
  if (jenis === 'reach' || jenis === 'stacker') for (const z of [-0.42, 0.42]) pasang(g, rb(1.0, 0.16, 0.14, 0.04), navy, panjang * 0.32, 0.1, z);
  // lampu peringatan
  pasang(g, new THREE.SphereGeometry(0.06, 10, 8), matB(WARNA_BERSIH.oranye, { emissive: WARNA_BERSIH.oranye, emissiveIntensity: 0.6 }), -panjang * 0.3, tinggiAtap + 0.07, 0, false);
  roda(g, -panjang * 0.38, lebar / 2 - 0.08, 0.2); roda(g, -panjang * 0.38, -lebar / 2 + 0.08, 0.2);
  roda(g, panjang * 0.05, lebar / 2 - 0.08, 0.26); roda(g, panjang * 0.05, -lebar / 2 + 0.08, 0.26);
  buatGarpu(panjang * 0.21);
  return g;
}

/** Pekerja: badan warna peran, rompi reflektif, helm putih. */
export function orangBersih(warna: string) {
  const g = new THREE.Group();
  pasang(g, new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), matB('#334155'), 0, 0.33, 0);              // celana
  pasang(g, new THREE.CapsuleGeometry(0.2, 0.42, 4, 12), matB(warna), 0, 0.98, 0);                   // badan
  pasang(g, new THREE.CylinderGeometry(0.212, 0.212, 0.07, 14), matB('#e2e8f0', { emissive: '#ffffff', emissiveIntensity: 0.25 }), 0, 1.0, 0, false);  // strip reflektif
  pasang(g, new THREE.SphereGeometry(0.14, 16, 12), matB('#e0ac69'), 0, 1.45, 0);
  const helm = pasang(g, new THREE.SphereGeometry(0.155, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), matB('#f8fafc', { roughness: 0.3 }), 0, 1.48, 0); helm.scale.set(1, 0.9, 1);
  return g;
}

/** Tekstur tulisan "Leca" + garis biru untuk sisi bak truk. */
let teksTruk: THREE.CanvasTexture | null = null;
function teksturTruk() {
  if (teksTruk || typeof document === 'undefined') return teksTruk;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 256);
  x.fillStyle = WARNA_BERSIH.biru; x.beginPath(); x.moveTo(0, 256); x.lineTo(1024, 256); x.lineTo(1024, 196); x.lineTo(380, 196); x.lineTo(300, 150); x.lineTo(0, 150); x.closePath(); x.fill();
  x.fillStyle = WARNA_BERSIH.biruTua; x.font = '700 92px system-ui, sans-serif'; x.textBaseline = 'middle'; x.fillText('Leca', 520, 96);
  x.fillStyle = '#64748b'; x.font = '500 34px system-ui, sans-serif'; x.fillText('Logistics', 525, 158);
  teksTruk = new THREE.CanvasTexture(c); teksTruk.colorSpace = THREE.SRGBColorSpace; teksTruk.anisotropy = 4;
  return teksTruk;
}

/** Truk boks gaya bersih; bak menghadap +X (mundur ke dock di x = 0). */
export function trukBersih(arus: 'inbound' | 'outbound') {
  const g = new THREE.Group();
  const biru = matB(arus === 'inbound' ? WARNA_BERSIH.biru : '#0f766e', { roughness: 0.4 });
  const t = teksturTruk();
  const sisi = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, map: t ?? undefined });
  const polos = matB('#ffffff', { roughness: 0.45 });
  const bak = new THREE.Mesh(rb(11.6, 2.7, 2.45, 0.12), [polos, polos, polos, polos, sisi, sisi]);
  bak.position.set(-6.3, 2.65, 0); bak.castShadow = true; bak.receiveShadow = true; bak.userData.kode = true; g.add(bak);
  pasang(g, rb(11.8, 0.25, 2.3, 0.05), matB('#334155'), -6.3, 1.18, 0);                          // rangka
  pasang(g, rb(2.3, 2.3, 2.4, 0.35), biru, -13.4, 2.05, 0);                                       // kabin
  pasang(g, rb(1.0, 1.2, 2.4, 0.2), biru, -14.3, 1.45, 0);                                        // moncong
  pasang(g, rb(0.06, 0.85, 2.0, 0.03), matB('#0f172a', { roughness: 0.1, metalness: 0.6 }), -14.56, 2.55, 0, false);   // kaca depan
  for (const z of [-1.21, 1.21]) pasang(g, rb(1.0, 0.7, 0.04, 0.02), matB('#0f172a', { roughness: 0.1, metalness: 0.6 }), -13.3, 2.55, z, false);
  for (const x of [-2.2, -3.5, -11.0, -13.6]) for (const z of [-1.0, 1.0]) roda(g, x, z, 0.5, 0.36);
  return g;
}

/** Penanda pin (tetesan) — melayang di atas objek terpilih. */
export function pinBersih(warna = WARNA_BERSIH.biru) {
  const g = new THREE.Group();
  const m = matB(warna, { roughness: 0.35, emissive: warna, emissiveIntensity: 0.15 });
  const kepala = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 18), m); kepala.position.y = 1.35; g.add(kepala);
  const ujung = new THREE.Mesh(new THREE.ConeGeometry(0.47, 1.0, 24), m); ujung.rotation.x = Math.PI; ujung.position.y = 0.72; g.add(ujung);
  const titik = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), matB('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.4 })); titik.position.set(0, 1.38, 0); titik.scale.set(1, 1, 0.6); g.add(titik);
  // titik lain menghadap kamera dari sisi berlawanan
  const titik2 = titik.clone(); g.add(titik2);
  titik.position.z = 0.42; titik2.position.z = -0.42;
  const cincin = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 32), new THREE.MeshBasicMaterial({ color: warna, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  cincin.rotation.x = -Math.PI / 2; cincin.position.y = 0.02; cincin.name = 'cincin'; g.add(cincin);
  return g;
}


// ---------- model detail dari Meshy AI (public/sim3d/model/*.glb, tekstur webp 1024)
// Model Meshy dinormalisasi: panjang di sumbu X (ternormal ±0,95), atas = +Y. Depan model Meshy = −X → diputar π
// supaya depan = +X seperti model kode. Skala tidak seragam supaya panjang/lebar/tinggi sesuai ukuran nyata.
export type JenisModel = 'forklift' | 'reach' | 'hpt' | 'truk' | 'container' | 'container20' | 'cde' | 'cdd' | 'fuso' | 'tronton';
/** sumbu = sumbu panjang model asli ('x' bawaan Meshy text-to-3d, 'z' untuk sebagian model unggahan). */
interface Spek { panjang: number; lebar: number; tinggi: number; putar: number; pusatX: number; berkas: string; cadangan?: string; sumbu?: 'x' | 'z' }
const truk = (panjang: number, lebar: number, tinggi: number, berkas: string, cadangan?: string): Spek => ({ panjang, lebar, tinggi, putar: 0, pusatX: -0.5 - panjang / 2, berkas, cadangan });   // ujung belakang di x = −0,5 (menempel dock)
const SPEK: Record<JenisModel, Spek> = {
  forklift: { panjang: 3.4, lebar: 1.2, tinggi: 2.25, putar: Math.PI, pusatX: 0.05, berkas: 'forklift' },          // forklift counterbalance (model Meshy dari user)
  reach: { panjang: 2.6, lebar: 1.15, tinggi: 3.2, putar: -Math.PI / 2, pusatX: 0.1, berkas: 'reach', sumbu: 'z' }, // reach truck (model Meshy dari user, panjang di sumbu Z, garpu di −Z)
  hpt: { panjang: 1.6, lebar: 0.56, tinggi: 1.25, putar: Math.PI, pusatX: 0.1, berkas: 'hpt' },
  truk: truk(9.2, 2.5, 3.6, 'truk'),
  // armada: file model sendiri bila ada (cde.glb / fuso.glb / tronton.glb), kalau belum → truk boks diskalakan ke ukuran jenisnya
  cde: truk(5.0, 1.9, 2.8, 'cde', 'truk'),
  cdd: truk(6.6, 2.2, 3.1, 'cdd', 'truk'),
  fuso: truk(7.6, 2.3, 3.3, 'fuso', 'truk'),
  tronton: truk(10.5, 2.5, 3.7, 'tronton', 'truk'),
  container: truk(16.5, 2.5, 4.0, 'container'),   // kepala truk + trailer + container 40 HC
  container20: truk(10.5, 2.5, 3.9, 'container20', 'container'),   // kepala truk + trailer + container 20 ft
};
const pemuat = new GLTFLoader();
const cacheBerkas = new Map<string, Promise<THREE.Object3D | null>>();
const muatBerkas = (b: string) => {
  let p = cacheBerkas.get(b);
  if (!p) { p = pemuat.loadAsync(`/sim3d/model/${b}.glb`).then(g => g.scene as THREE.Object3D).catch(() => null); cacheBerkas.set(b, p); }
  return p;
};
const cacheModel = new Map<JenisModel, Promise<{ model: THREE.Object3D; berkas: string } | null>>();
function muatModel(j: JenisModel) {
  let p = cacheModel.get(j);
  if (!p) {
    const sp = SPEK[j];
    p = muatBerkas(sp.berkas).then(async m => {
      let berkas = sp.berkas;
      if (!m && sp.cadangan) { m = await muatBerkas(sp.cadangan); berkas = sp.cadangan; }
      if (!m) return null;
      const akar = m.clone(true); akar.updateMatrixWorld(true);   // skala/rotasi simpul (mis. FBX ×100) ikut dihitung
      const box = new THREE.Box3().setFromObject(akar); const ukuran = box.getSize(new THREE.Vector3()); const pusat = box.getCenter(new THREE.Vector3());
      const wadah = new THREE.Group(); const isi = new THREE.Group(); wadah.add(isi); isi.add(akar);
      akar.position.x -= pusat.x; akar.position.y -= box.min.y; akar.position.z -= pusat.z;
      if (sp.sumbu === 'z') isi.scale.set(sp.lebar / ukuran.x, sp.tinggi / ukuran.y, sp.panjang / ukuran.z);
      else isi.scale.set(sp.panjang / ukuran.x, sp.tinggi / ukuran.y, sp.lebar / ukuran.z);
      isi.rotation.y = sp.putar; isi.position.x = sp.pusatX;
      akar.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; } });
      return { model: wadah, berkas };
    });
    cacheModel.set(j, p);
  }
  return p;
}
/** Ganti badan model kode dengan model Meshy begitu file selesai dimuat (gagal → tetap model kode). */
export function pakaiModelMeshy(g: THREE.Group, j: JenisModel) {
  void muatModel(j).then(h => {
    if (!h || g.children.some(c => c.name === 'meshy')) return;   // anak langsung saja (operator di dalamnya punya 'meshy' sendiri)
    const salin = h.model.clone(true); salin.name = 'meshy';
    g.traverse(o => { if (o.userData.kode && !o.parent?.userData.operator && o.parent?.name !== 'operator') o.visible = false; });
    // garpu kode hanya tampil saat diangkat (garpu model Meshy menempel di lantai)
    const garpu = g.getObjectByName('garpu'); if (garpu) { garpu.userData.angkatSaja = true; garpu.traverse(o => { o.visible = true; }); garpu.visible = false; }
    if (h.berkas === 'truk') {
      // tulisan Leca di kedua sisi bak truk boks
      const t = teksturTruk(); const sp = SPEK[j];
      if (t) for (const z of [-1, 1]) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(sp.panjang * 0.56, sp.tinggi * 0.36), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5 }));
        pl.position.set(-0.5 - sp.panjang * 0.39, sp.tinggi * 0.64, z * (sp.lebar / 2 + 0.03)); pl.rotation.y = z > 0 ? 0 : Math.PI; salin.add(pl);
      }
    }
    g.add(salin);
  });
}

// ---------- pekerja beranimasi (model Meshy dari user: rig 24 tulang + 10 klip)
export type AksiPekerja = 'jalan' | 'lari' | 'kerja' | 'diam' | 'duduk' | 'berdiri';
const KLIP: Record<AksiPekerja, string> = { jalan: 'Walking', lari: 'Running', kerja: 'Checkout_Gesture', diam: 'Stand_and_Chat', duduk: 'Chair_Sit_Idle_M', berdiri: 'Listening_Gesture' };
export interface Animator { mixer: THREE.AnimationMixer; main: (a: AksiPekerja) => void; aksi: AksiPekerja | null }
let cachePekerja: Promise<{ akar: THREE.Object3D; klip: THREE.AnimationClip[]; koreksi: Map<string, number> } | null> | null = null;
/** Arah hadap klip (dari rotasi pinggul frame pertama) — tiap klip Meshy menghadap arah berbeda (jalan vs duduk ±90°). */
const arahKlip = (c: THREE.AnimationClip) => {
  const tr = c.tracks.find(t => /Hips\.quaternion$/.test(t.name)); if (!tr) return 0;
  const v = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion().fromArray(tr.values, 0));
  return Math.atan2(-v.z, v.x);
};
const muatPekerja = () => (cachePekerja ??= pemuat.loadAsync('/sim3d/model/pekerja.glb').then(g => {
  // klip dibuat "di tempat": pergeseran pinggul (x/z) frame pertama dihapus supaya tubuh tetap di titik akarnya
  for (const c of g.animations) {
    const tr = c.tracks.find(t => /Hips\.position$/.test(t.name)); if (!tr) continue;
    const x0 = tr.values[0], z0 = tr.values[2];
    for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] -= x0; tr.values[i + 2] -= z0; }
  }
  const jalan = g.animations.find(c => c.name === KLIP.jalan); const aJalan = jalan ? arahKlip(jalan) : 0;
  const koreksi = new Map(g.animations.map(c => [c.name, aJalan - arahKlip(c)]));
  return { akar: g.scene, klip: g.animations, koreksi };
}).catch(() => null));
/** Ganti figur kode dengan pekerja beranimasi. Tinggi dinormalkan ke 1,72 m, menghadap +X (sama dengan model kode). */
export function pakaiPekerjaMeshy(g: THREE.Group, awal: AksiPekerja, siap: (a: Animator) => void) {
  void Promise.all([muatPekerja(), import('three/examples/jsm/utils/SkeletonUtils.js')]).then(([h, SU]) => {
    if (!h || g.children.some(c => c.name === 'meshy')) return;
    const akar = SU.clone(h.akar); akar.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(akar, true); const tinggi = box.max.y - box.min.y || 1;
    const wadah = new THREE.Group(); wadah.name = 'meshy';
    const k = 1.72 / tinggi; akar.scale.multiplyScalar(k); akar.position.y -= box.min.y * k;
    akar.position.x -= ((box.min.x + box.max.x) / 2) * k; akar.position.z -= ((box.min.z + box.max.z) / 2) * k;
    wadah.rotation.y = Math.PI / 2;   // model menghadap +Z → putar supaya menghadap +X
    wadah.add(akar);
    akar.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; } });
    for (const c of g.children) if (c.userData.kode) c.visible = false;   // figur kode milik orang ini saja
    g.add(wadah);
    const mixer = new THREE.AnimationMixer(akar);
    const aksiKlip = new Map<AksiPekerja, THREE.AnimationAction>();
    for (const [a, n] of Object.entries(KLIP) as [AksiPekerja, string][]) { const c = h.klip.find(x => x.name === n); if (c) aksiKlip.set(a, mixer.clipAction(c)); }
    const an: Animator = {
      mixer, aksi: null,
      main(a) {
        if (an.aksi === a) return;
        const baru = aksiKlip.get(a) ?? aksiKlip.get('diam'); if (!baru) return;
        const lama = an.aksi ? aksiKlip.get(an.aksi) : undefined;
        baru.reset().setEffectiveWeight(1).play(); baru.time = Math.random() * baru.getClip().duration;
        wadah.rotation.y = Math.PI / 2 + (h.koreksi.get(baru.getClip().name) ?? 0);   // semua klip menghadap +X
        if (lama && lama !== baru) lama.crossFadeTo(baru, 0.25, false);
        an.aksi = a;
      },
    };
    an.main(awal); siap(an);
  });
}

// ---------- operator di MHE: duduk di jok forklift, berdiri di reach truck, berjalan memegang tangkai hand pallet
export type JenisKendaraan = 'forklift' | 'reach' | 'hpt';
/** Titik pinggul (duduk) / telapak kaki (berdiri, jalan) operator di koordinat kendaraan (+X = arah garpu). */
export const POSISI_OPERATOR: Record<JenisKendaraan, { x: number; y: number; z: number; pose: AksiPekerja; putar: number }> = {
  forklift: { x: -0.6, y: 1.12, z: 0, pose: 'duduk', putar: 0 },
  reach: { x: -0.72, y: 0.18, z: 0, pose: 'berdiri', putar: 0 },
  hpt: { x: -1.08, y: 0, z: 0, pose: 'jalan', putar: 0 },
};
export function pasangOperator(kendaraan: THREE.Group, jenis: JenisKendaraan, warna: string, siap?: (a: Animator, op: THREE.Group) => void) {
  const s = POSISI_OPERATOR[jenis];
  const op = orangBersih(warna); op.name = 'operator'; op.scale.setScalar(0.94); op.position.set(s.x, s.pose === 'duduk' ? s.y - 0.55 : s.y, s.z); op.rotation.y = s.putar;
  kendaraan.add(op);
  pakaiPekerjaMeshy(op, s.pose, an => {
    if (s.pose === 'duduk') {
      // pinggul tepat di atas jok (tinggi pinggul klip duduk berbeda-beda) — diukur dari tulang Hips
      an.mixer.update(0); op.updateWorldMatrix(true, true);
      const hips = op.getObjectByName('Hips');
      if (hips) { const p = kendaraan.worldToLocal(hips.getWorldPosition(new THREE.Vector3())); op.position.x += s.x - p.x; op.position.y += s.y - p.y; op.position.z += s.z - p.z; }
    }
    siap?.(an, op);
  });
  return op;
}

// ---------- IK lengan: kedua tangan memegang barang (tidak ada klip "membawa" di model) — dijalankan tiap frame setelah mixer
function putarTulang(b: THREE.Object3D, dari: THREE.Vector3, ke: THREE.Vector3) {
  if (dari.lengthSq() < 1e-8 || ke.lengthSq() < 1e-8 || !b.parent) return;
  const qBaru = new THREE.Quaternion().setFromUnitVectors(dari.clone().normalize(), ke.clone().normalize()).multiply(b.getWorldQuaternion(new THREE.Quaternion()));
  b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(qBaru));
  b.updateWorldMatrix(false, true);
}
/** Tangan `sisi` ke titik dunia `target`; siku condong ke arah `kutub` (vektor dunia). */
export function ikLengan(akar: THREE.Object3D, sisi: 'Left' | 'Right', target: THREE.Vector3, kutub: THREE.Vector3) {
  const lengan = akar.getObjectByName(`${sisi}Arm`), bawah = akar.getObjectByName(`${sisi}ForeArm`), tangan = akar.getObjectByName(`${sisi}Hand`);
  if (!lengan || !bawah || !tangan) return;
  lengan.updateWorldMatrix(true, true);
  const S = lengan.getWorldPosition(new THREE.Vector3()), E = bawah.getWorldPosition(new THREE.Vector3()), H = tangan.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E), l2 = E.distanceTo(H); if (l1 < 1e-4 || l2 < 1e-4) return;
  const ke = target.clone().sub(S); const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(ke.length(), (l1 + l2) * 0.995)); const arah = ke.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pol = kutub.clone().sub(arah.clone().multiplyScalar(kutub.dot(arah))); if (pol.lengthSq() < 1e-6) pol.set(0, -1, 0); pol.normalize();
  const sikuBaru = S.clone().addScaledVector(arah, a).addScaledVector(pol, h);
  putarTulang(lengan, E.clone().sub(S), sikuBaru.clone().sub(S));
  const E2 = bawah.getWorldPosition(new THREE.Vector3()), H2 = tangan.getWorldPosition(new THREE.Vector3());
  putarTulang(bawah, H2.clone().sub(E2), S.clone().addScaledVector(arah, d).sub(E2));
}
/** Pose membawa karton di depan dada: karton (anak `orang`) di lokal (x, y, 0); tangan memegang kedua sisinya. */
export function pegangKarton(orang: THREE.Object3D, karton: THREE.Object3D) {
  const akar = orang.children.find(c => c.name === 'meshy'); if (!akar) return;
  orang.updateWorldMatrix(true, false);
  const w = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(orang.matrixWorld);
  const dir = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(orang.matrixWorld);
  const k = karton.position;
  ikLengan(akar, 'Left', w(k.x - 0.02, k.y - 0.02, -0.23), dir(-0.4, -1, -0.8));
  ikLengan(akar, 'Right', w(k.x - 0.02, k.y - 0.02, 0.23), dir(-0.4, -1, 0.8));
}
