'use client';
// Simulasi rute 3D (UAT D4): peta Indonesia (pulau, pantai, laut dangkal, gunung), kota / pelabuhan / bandara,
// jalur per moda (jalan, rel, alur pelayaran, rute udara) dan armada model 3D Meshy yang bergerak:
// truk (darat; jenis mengikuti armada), kapal kontainer (laut), pesawat kargo (udara), kereta kontainer (kereta).
// Waktu simulasi dalam hari; durasi tiap leg = lead time (bila diisi) atau perkiraan dari jarak.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { cariLokasi, jarakLurusKm, FAKTOR_JALUR, type Lokasi } from '@/lib/lokasiIndonesia';
import type { Moda } from '@/lib/transport';

export interface Leg { moda: Moda; dari: string; ke: string; hari?: number | null; label?: string; armada?: string }
export interface RuteSim { nama: string; legs: Leg[] }

/** Kecepatan efektif (km/hari) termasuk bongkar muat / transit — untuk perkiraan bila lead time kosong. */
const KM_HARI: Record<Moda, number> = { darat: 450, laut: 420, udara: 2500, kereta: 500 };
const WARNA: Record<Moda, string> = { darat: '#f59e0b', laut: '#0ea5e9', udara: '#a855f7', kereta: '#10b981' };
const LABEL_MODA: Record<Moda, string> = { darat: 'Truk', laut: 'Kapal', udara: 'Pesawat', kereta: 'Kereta' };

// Garis pantai pulau utama (lon, lat) — disederhanakan, hanya untuk orientasi.
const PULAU: [number, number][][] = [
  [[95.3, 5.6], [97.5, 5.2], [98.7, 3.8], [100.4, 2.2], [101.4, 1.7], [103.5, 0.5], [104.5, -1.0], [106.0, -2.9], [106.0, -4.0], [105.8, -5.8], [104.5, -5.9], [103.0, -4.9], [101.6, -3.5], [100.3, -1.0], [99.0, 0.5], [97.6, 2.0], [96.0, 3.8]],
  [[105.2, -6.8], [106.0, -5.9], [107.0, -5.9], [108.3, -6.3], [110.4, -6.9], [111.5, -6.6], [112.6, -6.9], [114.4, -7.7], [114.5, -8.7], [112.0, -8.4], [110.0, -8.1], [108.0, -7.8], [106.4, -7.4], [105.4, -6.9]],
  [[114.4, -8.1], [115.7, -8.4], [115.2, -8.85], [114.6, -8.4]],
  [[116.0, -8.3], [117.5, -8.2], [119.0, -8.3], [119.0, -8.8], [117.0, -9.0], [116.0, -8.9]],
  [[119.8, -8.4], [122.9, -8.1], [122.9, -8.6], [119.9, -8.8]],
  [[123.5, -10.3], [124.5, -9.3], [127.2, -8.4], [126.8, -8.9], [124.5, -10.0]],
  [[119.0, -9.4], [120.8, -9.6], [120.6, -10.2], [119.2, -9.8]],
  [[108.9, 1.5], [109.6, 1.9], [111.0, 1.6], [113.0, 3.1], [114.0, 4.5], [115.4, 5.0], [116.8, 6.9], [117.7, 6.4], [119.2, 5.2], [118.0, 4.3], [117.6, 3.2], [118.0, 1.0], [117.4, 0.0], [116.6, -1.3], [116.4, -3.0], [115.9, -3.8], [114.6, -4.1], [113.3, -3.0], [111.8, -3.5], [110.2, -3.0], [110.0, -1.6], [109.0, -0.5], [109.0, 0.6]],
  [[119.4, -5.6], [120.4, -5.6], [120.5, -3.0], [121.3, -4.6], [122.8, -5.5], [123.2, -4.4], [121.6, -3.0], [122.3, -1.8], [123.3, -0.9], [121.0, -1.0], [120.5, 0.5], [122.5, 1.0], [124.5, 0.4], [125.2, 1.5], [124.6, 1.0], [123.0, 0.6], [120.8, 0.9], [120.0, 0.1], [119.7, -1.2], [118.8, -2.6], [119.4, -3.5]],
  [[131.0, -1.0], [132.5, -0.4], [134.0, -0.9], [135.4, -3.3], [137.8, -1.5], [141.0, -2.6], [141.0, -9.1], [139.0, -8.1], [137.6, -5.2], [135.0, -4.5], [133.4, -3.9], [132.2, -2.9], [131.3, -1.5]],
  [[127.5, 2.2], [128.2, 1.4], [128.6, 0.5], [128.0, -0.8], [127.4, -0.3], [127.6, 1.0]],
  [[127.9, -3.0], [130.8, -3.2], [130.5, -3.7], [128.2, -3.6]],
  [[105.1, -1.6], [106.3, -1.9], [106.8, -3.0], [105.8, -2.9]],
  [[100.2, 6.5], [103.5, 4.0], [104.2, 1.4], [103.4, 1.3], [101.3, 2.8], [100.3, 5.0]],
];
// Gunung / gunung api utama (lon, lat, tinggi relatif) — memberi relief pada pulau.
const GUNUNG: [number, number, number][] = [
  [101.26, -1.7, 1.6], [98.39, 3.17, 1.1], [100.47, -0.38, 1.1], [104.25, -4.03, 1.0], [106.98, -6.79, 1.1], [107.6, -7.16, 1.0], [108.4, -7.3, 1.0],
  [110.44, -7.54, 1.2], [109.21, -7.24, 1.3], [111.19, -7.62, 1.1], [112.92, -8.1, 1.4], [112.95, -7.94, 1.0], [114.04, -8.06, 1.2], [115.51, -8.34, 1.3],
  [116.46, -8.41, 1.5], [118.0, -8.25, 1.2], [121.0, -8.7, 1.0], [120.27, -3.4, 1.1], [124.79, 1.36, 1.0], [137.16, -4.08, 2.2], [139.0, -4.4, 1.8], [114.5, 0.3, 1.0], [116.0, 2.5, 1.1],
];
const K = 4;   // unit per derajat
const TANAH = 0.4;  // tinggi permukaan pulau
const ke3 = (lon: number, lat: number, y = 0) => new THREE.Vector3((lon - 118) * K, y, -(lat + 2) * K);

interface LegHitung { moda: Moda; a: Lokasi; b: Lokasi; km: number; hari: number; perkiraan: boolean; label?: string; armada?: string; titik: THREE.Vector3[] }

function hitungLeg(l: Leg): LegHitung | null {
  const a = cariLokasi(l.dari), b = cariLokasi(l.ke);
  if (!a || !b) return null;
  const km = Math.round(jarakLurusKm(a, b) * FAKTOR_JALUR[l.moda]);
  const hari = l.hari && l.hari > 0 ? l.hari : Math.max(l.moda === 'udara' ? 1 : 0.25, km / KM_HARI[l.moda]);
  const y0 = l.moda === 'laut' ? 0.02 : TANAH + 0.05;
  const p0 = ke3(a.lon, a.lat, y0), p1 = ke3(b.lon, b.lat, y0);
  const n = 60, titik: THREE.Vector3[] = [];
  const pj = p0.distanceTo(p1);
  const tinggi = l.moda === 'udara' ? Math.max(3, pj * 0.22) : 0;
  // laut: lengkung ke arah utara (jalur pelayaran di utara pulau-pulau besar), bukan memotong daratan; udara: busur tinggi
  const tegak = new THREE.Vector3(-(p1.z - p0.z), 0, p1.x - p0.x).normalize();
  if (tegak.z > 0) tegak.negate();
  tegak.multiplyScalar(l.moda === 'laut' ? pj * 0.1 : 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n, s = Math.sin(Math.PI * u);
    titik.push(new THREE.Vector3().lerpVectors(p0, p1, u).addScaledVector(tegak, s).setY(y0 + tinggi * s));
  }
  return { moda: l.moda, a, b, km, hari, perkiraan: !(l.hari && l.hari > 0), label: l.label, armada: l.armada, titik };
}

// ---------------- Model armada (GLB Meshy, fallback model kotak) ----------------
type JenisArmada = 'truk' | 'cdd' | 'cde' | 'container' | 'container20' | 'kapal' | 'pesawat' | 'kereta';
const PANJANG: Record<JenisArmada, number> = { truk: 1.7, cdd: 1.4, cde: 1.2, container: 2.3, container20: 1.9, kapal: 4.2, pesawat: 3.2, kereta: 3.4 };
export function jenisArmada(moda: Moda, armada?: string): JenisArmada {
  if (moda === 'laut') return 'kapal'; if (moda === 'udara') return 'pesawat'; if (moda === 'kereta') return 'kereta';
  const a = (armada ?? '').toLowerCase();
  if (/(trailer|container).*40|40.*(trailer|container)/.test(a)) return 'container';
  if (/trailer|container|20 ?ft/.test(a)) return 'container20';
  if (/cde|engkel|pick ?up|blind van/.test(a)) return 'cde';
  if (/cdd/.test(a)) return 'cdd';
  return 'truk';
}
const pemuat = new GLTFLoader();
const cacheGlb = new Map<JenisArmada, Promise<THREE.Object3D | null>>();
/** Muat & normalisasi: panjang di sumbu X = PANJANG, alas di y = 0, depan menghadap +X (model Meshy menghadap −X → diputar π). */
function muatArmada(j: JenisArmada) {
  let p = cacheGlb.get(j);
  if (!p) {
    p = pemuat.loadAsync(`/sim3d/model/${j}.glb`).then(g => {
      const akar = g.scene; akar.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(akar), uk = box.getSize(new THREE.Vector3()), pusat = box.getCenter(new THREE.Vector3());
      const wadah = new THREE.Group(), isi = new THREE.Group(); wadah.add(isi); isi.add(akar);
      akar.position.set(-pusat.x, -box.min.y, -pusat.z);
      isi.scale.setScalar(PANJANG[j] / Math.max(1e-6, uk.x)); isi.rotation.y = Math.PI;
      wadah.traverse(o => { o.userData.bersama = true; });
      return wadah as THREE.Object3D;
    }).catch(() => null);
    cacheGlb.set(j, p);
  }
  return p;
}
function modelKotak(m: Moda) {
  const g = new THREE.Group();
  const mt = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const kotak = (sx: number, sy: number, sz: number, c: string, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mt(c)); k.position.set(x, y, z); g.add(k); return k; };
  if (m === 'darat') { kotak(1.1, 0.5, 0.45, '#f8fafc', -0.15, 0.35, 0); kotak(0.35, 0.42, 0.44, WARNA.darat, 0.6, 0.28, 0); }
  else if (m === 'kereta') { kotak(1.0, 0.4, 0.4, WARNA.kereta, 1.0, 0.25, 0); kotak(1.0, 0.45, 0.4, '#e5e7eb', -0.1, 0.28, 0); kotak(1.0, 0.45, 0.4, '#e5e7eb', -1.2, 0.28, 0); }
  else if (m === 'laut') { kotak(3.4, 0.4, 0.7, '#1e3a8a', 0, 0.2, 0); kotak(0.45, 0.7, 0.6, '#f8fafc', -1.2, 0.7, 0); kotak(2.0, 0.4, 0.6, '#f97316', 0.4, 0.6, 0); }
  else { kotak(2.6, 0.3, 0.3, '#f8fafc', 0, 0.2, 0); kotak(0.5, 0.05, 2.6, '#e2e8f0', 0.1, 0.2, 0); kotak(0.3, 0.5, 0.05, '#e2e8f0', -1.15, 0.45, 0); }
  return g;
}

// ---------------- Tekstur prosedural ----------------
function acak(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const hashTeks = (t: string) => Array.from(t).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function teksturLaut() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
  x.fillStyle = '#2a73b2'; x.fillRect(0, 0, 256, 256);
  const r = acak(11);
  for (let i = 0; i < 520; i++) {
    const px = r() * 256, py = r() * 256, w = 6 + r() * 22;
    x.strokeStyle = r() < 0.6 ? `rgba(120,190,235,${0.18 + r() * 0.22})` : `rgba(15,60,110,${0.15 + r() * 0.2})`;
    x.lineWidth = 1 + r() * 1.5; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + w / 2, py - 2 - r() * 3, px + w, py); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 18); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function teksturDarat() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
  x.fillStyle = '#5f9a4c'; x.fillRect(0, 0, 256, 256);
  const r = acak(5);
  const warna = ['#4d8a3e', '#6fab55', '#7cb35e', '#3f7a35', '#8fae5a', '#a39b62', '#5b8f45'];
  for (let i = 0; i < 900; i++) {
    x.fillStyle = warna[Math.floor(r() * warna.length)]; x.globalAlpha = 0.25 + r() * 0.45;
    x.beginPath(); x.arc(r() * 256, r() * 256, 2 + r() * 9, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.09, 0.09); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Tekstur RGBA (dipakai sebagai map transparan): bayangan bulat pesawat & buih V di belakang kapal. */
function teksturBayang() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(15,23,42,0.9)'); g.addColorStop(1, 'rgba(15,23,42,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function teksturBuih() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')!;
  // ujung kanan (u = 1) = buritan kapal; buih melebar & memudar ke kiri
  const r = acak(3);
  for (let i = 0; i < 1400; i++) {
    const u = r(), sebar = 6 + (1 - u) * 56, tepi = r() < 0.75;
    const y = 64 + (tepi ? (r() < 0.5 ? -1 : 1) * sebar * (0.8 + r() * 0.25) : (r() - 0.5) * sebar * 0.6);
    x.fillStyle = `rgba(255,255,255,${(0.15 + u * 0.75) * (tepi ? 0.9 : 0.45)})`;
    x.beginPath(); x.arc(u * 256, y, 1 + r() * 2.2, 0, Math.PI * 2); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

/** Bentuk pulau diperbesar dari titik beratnya (untuk pantai & laut dangkal). */
function bentuk(p: [number, number][], tambah = 0) {
  const cx = p.reduce((t, q) => t + q[0], 0) / p.length, cy = p.reduce((t, q) => t + q[1], 0) / p.length;
  return new THREE.Shape(p.map(([lon, lat]) => {
    const dx = lon - cx, dy = lat - cy, d = Math.hypot(dx, dy) || 1, f = (d + tambah) / d;
    return new THREE.Vector2((cx + dx * f - 118) * K, (cy + dy * f + 2) * K);
  }));
}

/** Pita datar (jalan / rel) mengikuti titik. */
function pita(titik: THREE.Vector3[], lebar: number, y: number, warna: string) {
  const pos: number[] = [], idx: number[] = [];
  titik.forEach((p, i) => {
    const q = titik[Math.min(titik.length - 1, i + 1)], o = titik[Math.max(0, i - 1)];
    const arah = new THREE.Vector3().subVectors(q, o).setY(0).normalize();
    const n = new THREE.Vector3(-arah.z, 0, arah.x).multiplyScalar(lebar / 2);
    pos.push(p.x + n.x, y, p.z + n.z, p.x - n.x, y, p.z - n.z);
    if (i < titik.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: warna, roughness: 0.9, side: THREE.DoubleSide }));
}
/** Titik digeser tegak lurus arah jalur sejauh d (untuk dua batang rel). */
function geser(titik: THREE.Vector3[], d: number) {
  return titik.map((p, i) => {
    const q = titik[Math.min(titik.length - 1, i + 1)], o = titik[Math.max(0, i - 1)];
    const arah = new THREE.Vector3().subVectors(q, o).setY(0).normalize();
    return new THREE.Vector3(p.x - arah.z * d, p.y, p.z + arah.x * d);
  });
}
/** Garis putus-putus (instanced) untuk alur pelayaran & rute udara. */
function putus(kurva: THREE.Curve<THREE.Vector3>, warna: string, panjang = 0.5, jarak = 1.0, tebal = 0.09) {
  const total = kurva.getLength(), n = Math.max(2, Math.floor(total / jarak));
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(panjang, 0.03, tebal), new THREE.MeshBasicMaterial({ color: warna, transparent: true, opacity: 0.9 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = kurva.getPointAt(u), t = kurva.getTangentAt(u);
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), t.normalize()); m.compose(p, q, s); im.setMatrixAt(i, m);
  }
  return im;
}

/** Kota: gugus gedung; pelabuhan: crane & tumpukan container; bandara: landasan. */
function ornamen(l: Lokasi) {
  const g = new THREE.Group(); const r = acak(hashTeks(l.nama));
  const mt = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  if (l.jenis === 'kota') {
    const warna = ['#e5e7eb', '#cbd5e1', '#f1f5f9', '#d6d3d1', '#94a3b8'];
    for (let i = 0; i < 9; i++) {
      const h = 0.25 + r() * (i < 2 ? 1.3 : 0.6), w = 0.18 + r() * 0.2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mt(warna[Math.floor(r() * warna.length)]));
      b.position.set((r() - 0.5) * 1.3, TANAH + h / 2, (r() - 0.5) * 1.3); g.add(b);
    }
  } else if (l.jenis === 'pelabuhan') {
    const kaki = mt('#f97316'), balok = mt('#ea580c');
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.2, 0.2]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.06), kaki); k.position.set(dx, TANAH + 0.55, dz); g.add(k); }
    const atas = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.5), balok); atas.position.set(0, TANAH + 1.1, 0); g.add(atas);
    const lengan = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), balok); lengan.position.set(0, TANAH + 1.15, -0.6); g.add(lengan);
    const wc = ['#dc2626', '#2563eb', '#16a34a', '#eab308', '#64748b'];
    for (let i = 0; i < 10; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.12), mt(wc[i % wc.length])); c.position.set(0.8 + (i % 2) * 0.33, TANAH + 0.06 + Math.floor(i / 4) * 0.12, -0.3 + (i % 4) * 0.15); g.add(c); }
  } else {
    const ld = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.02, 0.32), mt('#374151')); ld.position.set(0, TANAH + 0.01, 0); g.add(ld);
    const gs = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.025, 0.03), new THREE.MeshBasicMaterial({ color: '#f8fafc' })); gs.position.set(0, TANAH + 0.02, 0); g.add(gs);
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.3), mt('#e2e8f0')); tm.position.set(0.3, TANAH + 0.13, 0.5); g.add(tm);
    const mn = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.8, 8), mt('#f1f5f9')); mn.position.set(-0.4, TANAH + 0.4, 0.55); g.add(mn);
    g.rotation.y = r() * Math.PI;
  }
  return g;
}

export default function Rute3D({ rute, tinggi = 480 }: { rute: RuteSim[]; tinggi?: number }) {
  const wadah = useRef<HTMLDivElement>(null);
  const [jalan, setJalan] = useState(true);
  const [kec, setKec] = useState(1);        // hari simulasi per detik
  const [hari, setHari] = useState(0);
  const [ikuti, setIkuti] = useState(false);
  const [muat, setMuat] = useState(true);
  const kontrol = useRef({ jalan: true, kec: 1, t: 0, ikuti: false });
  kontrol.current.jalan = jalan; kontrol.current.kec = kec; kontrol.current.ikuti = ikuti;
  const data = useMemo(() => rute.map(r => {
    const legs = r.legs.map(hitungLeg);
    const ok = legs.filter((x): x is LegHitung => !!x);
    return { nama: r.nama, legs: ok, gagal: r.legs.filter((_, i) => !legs[i]).map(l => `${l.dari || '?'} → ${l.ke || '?'}`), total: ok.reduce((t, x) => t + x.hari, 0), km: ok.reduce((t, x) => t + x.km, 0) };
  }), [rute]);
  const maksHari = Math.max(0.5, ...data.map(d => d.total));
  const kunci = JSON.stringify(rute);

  useEffect(() => {
    const el = wadah.current; if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; el.appendChild(renderer.domElement);
    const lr = new CSS2DRenderer(); lr.setSize(el.clientWidth, el.clientHeight);
    Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' }); el.appendChild(lr.domElement);
    const scene = new THREE.Scene(); const langit = new THREE.Color('#bcdcf4'); scene.background = langit;
    const cam = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 3000);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.47; ctl.minDistance = 4; ctl.maxDistance = 420;
    scene.add(new THREE.HemisphereLight('#f0f9ff', '#4a6b3a', 0.9));
    const sun = new THREE.DirectionalLight('#fff7e6', 2.2); sun.position.set(-60, 120, 50); scene.add(sun);
    // laut dalam (bertekstur ombak, digeser pelan)
    const tLaut = teksturLaut();
    const laut = new THREE.Mesh(new THREE.PlaneGeometry(330, 150), new THREE.MeshStandardMaterial({ map: tLaut, roughness: 0.32, metalness: 0.15 }));
    laut.rotation.x = -Math.PI / 2; laut.position.set(ke3(118, -2).x, 0, ke3(118, -2).z); scene.add(laut);
    // pulau: laut dangkal → pantai → daratan bertekstur (ekstrusi dengan bevel)
    const mDangkal = new THREE.MeshStandardMaterial({ color: '#5cb8d6', roughness: 0.4, transparent: true, opacity: 0.85 });
    const mPantai = new THREE.MeshStandardMaterial({ color: '#e6d6a3', roughness: 0.95 });
    const mDarat = new THREE.MeshStandardMaterial({ map: teksturDarat(), roughness: 0.95 });
    for (const p of PULAU) {
      const dangkal = new THREE.Mesh(new THREE.ShapeGeometry(bentuk(p, 0.22)), mDangkal); dangkal.rotation.x = -Math.PI / 2; dangkal.position.y = 0.012; scene.add(dangkal);
      const pantai = new THREE.Mesh(new THREE.ExtrudeGeometry(bentuk(p, 0.05), { depth: 0.12, bevelEnabled: false }), mPantai); pantai.rotation.x = -Math.PI / 2; scene.add(pantai);
      const darat = new THREE.Mesh(new THREE.ExtrudeGeometry(bentuk(p, -0.02), { depth: TANAH - 0.08, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 }), mDarat);
      darat.rotation.x = -Math.PI / 2; scene.add(darat);
    }
    // gunung (kerucut bergradasi hijau → coklat, salju di puncak tinggi)
    for (const [lon, lat, h] of GUNUNG) {
      const geo = new THREE.ConeGeometry(0.55 * h + 0.4, h, 20, 4);
      const warna: number[] = []; const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const f = (pos.getY(i) + h / 2) / h;
        const c = new THREE.Color('#4f7f3a').lerp(new THREE.Color('#7a6248'), Math.min(1, f * 1.4));
        if (h > 1.8 && f > 0.82) c.set('#f8fafc');
        warna.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(warna, 3));
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
      m.position.copy(ke3(lon, lat, TANAH + h / 2 - 0.02)); scene.add(m);
    }
    const label = (teks: string, kelas: string) => { const d = document.createElement('div'); d.className = `rute3d-label ${kelas}`; d.textContent = teks; return new CSS2DObject(d); };
    // lokasi yang dipakai rute: ornamen + penanda + label
    const dipakai = new Map<string, Lokasi>();
    for (const r of data) for (const l of r.legs) { dipakai.set(l.a.nama, l.a); dipakai.set(l.b.nama, l.b); }
    for (const l of dipakai.values()) {
      const o = ornamen(l); o.position.copy(ke3(l.lon, l.lat, 0)); scene.add(o);
      const warna = l.jenis === 'pelabuhan' ? '#1d4ed8' : l.jenis === 'bandara' ? '#7c3aed' : '#dc2626';
      const tiang = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), new THREE.MeshStandardMaterial({ color: '#334155' })); tiang.position.copy(ke3(l.lon, l.lat, TANAH + 0.8)); scene.add(tiang);
      const bola = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: warna, emissive: warna, emissiveIntensity: 0.25 })); bola.position.copy(ke3(l.lon, l.lat, TANAH + 1.65)); scene.add(bola);
      const lb = label(l.nama, l.jenis); lb.position.copy(ke3(l.lon, l.lat, TANAH + 2.4)); scene.add(lb);
    }
    // jalur per moda: jalan (aspal + marka), rel (bantalan + rel), alur laut & rute udara (putus-putus)
    const armada: { obj: THREE.Group; bayang: THREE.Mesh; r: (typeof data)[number] }[] = [];
    const tBayang = teksturBayang(), tBuih = teksturBuih();
    for (const r of data) {
      for (const l of r.legs) {
        const kurva = new THREE.CatmullRomCurve3(l.titik);
        if (l.moda === 'darat') {
          scene.add(pita(l.titik, 0.34, TANAH + 0.015, '#3f4650'));
          scene.add(new THREE.Mesh(new THREE.TubeGeometry(kurva, 80, 0.035, 5), new THREE.MeshBasicMaterial({ color: WARNA.darat })));
        } else if (l.moda === 'kereta') {
          scene.add(pita(l.titik, 0.3, TANAH + 0.015, '#6b5440'));
          for (const d of [-0.07, 0.07]) scene.add(pita(geser(l.titik, d), 0.025, TANAH + 0.03, '#cbd5e1'));
          scene.add(new THREE.Mesh(new THREE.TubeGeometry(kurva, 80, 0.03, 5), new THREE.MeshBasicMaterial({ color: WARNA.kereta })));
        } else if (l.moda === 'laut') {
          scene.add(putus(kurva, '#e0f2fe', 0.55, 1.1, 0.1));
        } else {
          scene.add(putus(kurva, WARNA.udara, 0.45, 0.9, 0.07));
        }
      }
      const obj = new THREE.Group(); scene.add(obj);
      const bayang = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tBayang, transparent: true, opacity: 0.45, depthWrite: false }));
      bayang.rotation.x = -Math.PI / 2; bayang.visible = false; scene.add(bayang);
      armada.push({ obj, bayang, r });
    }
    // kamera: muat semua titik
    const box = new THREE.Box3();
    for (const r of data) for (const l of r.legs) for (const p of l.titik) box.expandByPoint(p);
    if (box.isEmpty()) box.setFromCenterAndSize(ke3(113, -5), new THREE.Vector3(60, 1, 30));
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const jarak = Math.max(22, Math.max(s.x, s.z) * 1.1);
    ctl.target.copy(c).setY(0); cam.position.set(c.x - jarak * 0.12, jarak * 0.72, c.z + jarak * 0.8); ctl.update();
    scene.fog = new THREE.Fog(langit, jarak * 1.6, jarak * 4.5);
    const skala = Math.min(3.2, Math.max(0.6, jarak / 36));   // armada tetap terlihat saat peta di-zoom jauh
    for (const a of armada) { a.obj.scale.setScalar(skala); a.bayang.scale.setScalar(skala); }
    // model GLB
    const siap = new Map<JenisArmada, THREE.Object3D>();
    const perlu = new Set<JenisArmada>(); for (const r of data) for (const l of r.legs) perlu.add(jenisArmada(l.moda, l.armada));
    let batal = false;
    Promise.all([...perlu].map(j => muatArmada(j).then(m => { if (m && !batal) siap.set(j, m); }))).finally(() => { if (!batal) setMuat(false); });
    const buatModel = (l: LegHitung, j: JenisArmada) => {
      const g = new THREE.Group(); const m = siap.get(j);
      g.add(m ? m.clone(true) : modelKotak(l.moda));
      if (l.moda === 'laut') {   // buih di belakang kapal
        const buih = new THREE.Mesh(new THREE.PlaneGeometry(PANJANG.kapal * 1.4, 1.6), new THREE.MeshBasicMaterial({ map: tBuih, transparent: true, depthWrite: false }));
        buih.rotation.x = -Math.PI / 2; buih.position.set(-PANJANG.kapal * 1.05, 0.03, 0); g.add(buih);
      }
      return g;
    };
    const ro = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); lr.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); });
    ro.observe(el);
    let id = 0, lalu = performance.now(), tampilLalu = 0;
    const tadi = new THREE.Vector3();
    const loop = (kini: number) => {
      id = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (kini - lalu) / 1000); lalu = kini;
      const k = kontrol.current;
      if (k.jalan) { k.t += dt * k.kec; if (k.t > maksHari + 0.6) k.t = 0; }
      tLaut.offset.x = (tLaut.offset.x + dt * 0.004) % 1; tLaut.offset.y = (tLaut.offset.y + dt * 0.002) % 1;
      for (const a of armada) {
        let sisa = Math.min(k.t, a.r.total), leg = a.r.legs[0];
        for (const l of a.r.legs) { leg = l; if (sisa <= l.hari) break; sisa -= l.hari; }
        if (!leg) continue;
        const u = Math.max(0, Math.min(1, sisa / leg.hari));
        const kurva = (leg as LegHitung & { _k?: THREE.CatmullRomCurve3 })._k ??= new THREE.CatmullRomCurve3(leg.titik);
        const p = kurva.getPointAt(u), q = kurva.getPointAt(Math.min(1, u + 0.01)), q0 = kurva.getPointAt(Math.max(0, u - 0.01));
        const j = jenisArmada(leg.moda, leg.armada);
        const kunciM = `${leg.moda}-${j}-${siap.has(j) ? 'glb' : 'kotak'}`;
        if (a.obj.userData.model !== kunciM) { a.obj.clear(); a.obj.add(buatModel(leg, j)); a.obj.userData.model = kunciM; }
        a.obj.position.copy(p);
        const arah = u >= 1 ? new THREE.Vector3().subVectors(p, q0) : new THREE.Vector3().subVectors(q, p);
        a.obj.lookAt(p.x + arah.x, p.y + arah.y, p.z + arah.z); a.obj.rotateY(-Math.PI / 2);
        if (leg.moda === 'laut') a.obj.position.y += Math.sin(kini / 600 + p.x) * 0.02;   // ayunan ombak
        a.bayang.visible = leg.moda === 'udara';
        if (a.bayang.visible) { a.bayang.position.set(p.x, TANAH + 0.03, p.z); (a.bayang.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.max(0.25, 1 - (p.y - TANAH) / 14); }
      }
      if (k.ikuti && armada[0]?.obj.children.length) {
        const pos = armada[0].obj.position; tadi.copy(ctl.target);
        ctl.target.lerp(pos, 0.08); cam.position.add(new THREE.Vector3().subVectors(ctl.target, tadi));
      }
      if (kini - tampilLalu > 200) { tampilLalu = kini; setHari(k.t); }
      ctl.update(); renderer.render(scene, cam); lr.render(scene, cam);
    };
    id = requestAnimationFrame(loop);
    return () => {
      batal = true; cancelAnimationFrame(id); ro.disconnect(); ctl.dispose();
      scene.traverse(o => {
        if (o.userData.bersama) return;   // geometri & material model GLB dipakai ulang (cache)
        const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose());
      });
      renderer.dispose(); el.innerHTML = '';
    };
  }, [kunci]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtHari = (h: number) => `${h.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari`;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row small">
        <button type="button" onClick={() => setJalan(!jalan)}>{jalan ? '❚❚ Jeda' : '▶ Jalan'}</button>
        <button type="button" className="ghost" onClick={() => { kontrol.current.t = 0; setHari(0); }}>↺ Ulang</button>
        <div className="tabs" role="group" aria-label="Kecepatan">{[0.5, 1, 2, 5].map(x => <button key={x} type="button" className={kec === x ? 'on' : ''} onClick={() => setKec(x)}>{x} hari/dtk</button>)}</div>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={ikuti} onChange={e => setIkuti(e.target.checked)} /> Ikuti armada</label>
        <b>Hari ke-{Math.min(hari, maksHari).toLocaleString('id-ID', { maximumFractionDigits: 1 })}</b> <span className="muted">dari {fmtHari(maksHari)}</span>
        {muat && <span className="muted">memuat model 3D…</span>}
        <span className="row" style={{ gap: 10, marginLeft: 'auto' }}>{(Object.keys(WARNA) as Moda[]).map(m => <span key={m}><i style={{ display: 'inline-block', width: 14, height: 4, background: WARNA[m], verticalAlign: 'middle', marginRight: 4 }} />{LABEL_MODA[m]}</span>)}</span>
      </div>
      <div ref={wadah} className="rute3d-wadah" style={{ height: tinggi }} />
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Rute</th><th>Leg</th><th className="num">Jarak</th><th className="num">Lead time</th><th>Status saat ini</th></tr></thead>
        <tbody>{data.map(r => {
          let sisa = Math.min(hari, r.total); let aktif = -1;
          r.legs.forEach((l, i) => { if (aktif < 0 && sisa <= l.hari) aktif = i; else if (aktif < 0) sisa -= l.hari; });
          const selesai = hari >= r.total;
          return r.legs.length ? r.legs.map((l, i) => (
            <tr key={`${r.nama}-${i}`}>
              {i === 0 && <td rowSpan={r.legs.length}><b>{r.nama}</b><div className="small muted">{r.km.toLocaleString('id-ID')} km · {fmtHari(r.total)}</div>{r.gagal.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Lokasi belum dikenal: {r.gagal.join(', ')}</div>}</td>}
              <td><span style={{ color: WARNA[l.moda], fontWeight: 600 }}>{LABEL_MODA[l.moda]}</span> {l.label ? `${l.label} · ` : ''}{l.armada && l.armada !== l.label ? `${l.armada} · ` : ''}{l.a.nama} → {l.b.nama}</td>
              <td className="num">±{l.km.toLocaleString('id-ID')} km</td>
              <td className="num">{fmtHari(l.hari)}{l.perkiraan ? <span className="small muted"> (perkiraan)</span> : ''}</td>
              <td className="small">{selesai ? '✓ tiba' : i === aktif ? `● ${LABEL_MODA[l.moda]} dalam perjalanan (${Math.round((sisa / l.hari) * 100)}%)` : i < aktif ? '✓ selesai' : 'menunggu'}</td>
            </tr>)) : r.gagal.length ? <tr key={r.nama}><td><b>{r.nama}</b></td><td colSpan={4} className="small" style={{ color: 'var(--bad)' }}>Lokasi belum dikenal: {r.gagal.join(', ')} — pilih dari daftar kota / pelabuhan / bandara.</td></tr> : null;
        })}
        {data.every(r => !r.legs.length && !r.gagal.length) && <tr><td colSpan={5} className="muted">Isi origin & destination (kota / pelabuhan / bandara yang dikenal) untuk melihat simulasi.</td></tr>}
        </tbody>
      </table></div>
      <p className="small muted" style={{ margin: 0 }}>Model 3D armada dibuat dengan Meshy. Peta & jarak bergaya (garis pantai disederhanakan, jarak = garis lurus × faktor jalur). Lead time memakai isian vendor bila ada; bila kosong diperkirakan dari jarak (truk ±450 km/hari, kapal ±420 km/hari termasuk sandar, pesawat ±1 hari termasuk handling, kereta ±500 km/hari).</p>
    </div>);
}
