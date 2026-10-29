// Model 3D gaya "bersih" (isometrik, sudut membulat, warna solid lembut) — dibuat dalam kode supaya ringan & bisa dianimasikan.
// Ukuran dalam meter, depan kendaraan = +X.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
  const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = bayang; mesh.receiveShadow = true; g.add(mesh); return mesh;
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
  bak.position.set(-6.3, 2.65, 0); bak.castShadow = true; bak.receiveShadow = true; g.add(bak);
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
