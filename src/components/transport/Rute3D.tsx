'use client';
// Simulasi rute 3D per stage di atas GLOBE bumi (transport & intermodal).
// - Peta: bola bumi bertekstur citra satelit Esri World Imagery menutup seluruh dunia. Tile dimuat dinamis
//   (quadtree Web Mercator, zoom 2–17) mengikuti posisi kamera: makin dekat makin tajam, seperti Google Earth.
// - Mode kamera: Top view & 3D miring (membingkai stage aktif) dan Globe (seluruh dunia, bisa diputar).
// - Animasi satu per satu: Stage 1 truk origin → bandara / pelabuhan, Stage 2 pesawat / kapal / kereta,
//   Stage 3 truk ke destination; HUD menampilkan stage, armada, rute, lead time & progres.
// - Model armada 3D dari Meshy (public/sim3d/model/*.glb), ukuran tetap terbaca di layar pada zoom berapa pun.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { cariLokasi, jarakLurusKm, FAKTOR_JALUR, type Lokasi } from '@/lib/lokasiIndonesia';
import type { Moda } from '@/lib/transport';
import { ruteDarat } from '@/lib/jalur/darat';
import { kmHaversine, muatMasker, ruteDaratGrid, ruteLaut, type LonLat, type MaskerDarat } from '@/lib/jalur/laut';

export interface Leg { moda: Moda; dari: string; ke: string; hari?: number | null; label?: string; armada?: string }
export interface RuteSim { nama: string; legs: Leg[] }

/** Kecepatan efektif (km/hari) termasuk bongkar muat / transit — untuk perkiraan bila lead time kosong. */
const KM_HARI: Record<Moda, number> = { darat: 450, laut: 420, udara: 2500, kereta: 500 };
const WARNA: Record<Moda, string> = { darat: '#f59e0b', laut: '#0ea5e9', udara: '#a855f7', kereta: '#10b981' };
const LABEL_MODA: Record<Moda, string> = { darat: 'Truk', laut: 'Kapal', udara: 'Pesawat', kereta: 'Kereta' };
const IKON_MODA: Record<Moda, string> = { darat: '🚚', laut: '🚢', udara: '✈️', kereta: '🚆' };
const IKON_LOKASI: Record<string, string> = { kota: '🏭', pelabuhan: '⚓', bandara: '✈' };
const LABEL_SUMBER: Record<SumberJalur, string> = {
  jalan: 'Jalur: jalan raya (OpenStreetMap / OSRM)', darat: 'Jalur: lintas daratan (perkiraan, rute jalan tidak tersedia)',
  rel: 'Jalur: koridor darat (perkiraan jalur rel mengikuti jalan utama)', laut: 'Jalur: alur laut (menghindari daratan)', udara: 'Jalur: udara (great circle)',
  lurus: 'Jalur: garis perkiraan', muat: 'Mencari jalur…', gagal: 'Tidak ada jalur darat antar titik ini (beda pulau) — perlu kapal / ferry atau ganti titik serah terima',
};
const DETIK_STAGE = 7;     // durasi animasi satu stage pada kecepatan 1×
const JEDA = 1.4;          // jeda di titik serah terima antar stage (detik)
const K = 4;               // unit per derajat di permukaan
const R = (180 / Math.PI) * K;   // jari-jari bumi dalam unit scene (1° busur = K unit)
const HJALUR = 0.08;       // tinggi jalur di atas permukaan
function acak(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const hashTeks = (t: string) => Array.from(t).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type Proyeksi = (lon: number, lat: number, h?: number) => THREE.Vector3;
/** Proyeksi lon/lat → titik di bola; diputar supaya pusat rute menghadap +Y dan arah utara ke −Z
 *  (kamera OrbitControls dengan up = Y tetap terasa seperti peta datar di sekitar rute). */
function buatProyeksi(lonP: number, latP: number): Proyeksi {
  const mentah = (lon: number, lat: number) => {
    const a = THREE.MathUtils.degToRad(lon), b = THREE.MathUtils.degToRad(lat);
    return new THREE.Vector3(Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a));
  };
  const P = mentah(lonP, latP);
  const N = mentah(lonP, latP + 0.01).sub(P).normalize();
  const E = new THREE.Vector3().crossVectors(N, P).normalize();
  const m = new THREE.Matrix3().set(E.x, E.y, E.z, P.x, P.y, P.z, -N.x, -N.y, -N.z);
  return (lon, lat, h = 0) => mentah(lon, lat).applyMatrix3(m).multiplyScalar(R + h);
}

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


// ---------------- Leg ----------------
type SumberJalur = 'jalan' | 'darat' | 'rel' | 'laut' | 'udara' | 'lurus' | 'muat' | 'gagal';
interface LegHitung { idx: number; moda: Moda; a: Lokasi; b: Lokasi; km: number; hari: number; perkiraan: boolean; label?: string; armada?: string; titik: THREE.Vector3[]; kurva: THREE.CatmullRomCurve3; sumber: SumberJalur; ferry?: boolean }
interface JalurNyata { jalur: LonLat[]; km: number; sumber: SumberJalur; ferry?: boolean }
const kunciJalur = (moda: Moda, a: Lokasi, b: Lokasi) => `${moda}|${a.lon},${a.lat}|${b.lon},${b.lat}`;

/** Titik 3D dari polyline lon/lat (jalan raya / alur laut), di-resample merata sepanjang jalur. */
function titikDariPolyline(ps: LonLat[], proj: Proyeksi, n: number) {
  const pts = ps.map(([lon, lat]) => proj(lon, lat, HJALUR));
  const kum = [0]; for (let i = 1; i < pts.length; i++) kum.push(kum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = kum[kum.length - 1] || 1, out: THREE.Vector3[] = [];
  let j = 1;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total;
    while (j < pts.length - 1 && kum[j] < s) j++;
    const seg = kum[j] - kum[j - 1] || 1, u = (s - kum[j - 1]) / seg;
    out.push(pts[j - 1].clone().lerp(pts[j], Math.min(1, Math.max(0, u))).normalize().multiplyScalar(R + HJALUR));
  }
  return out;
}

function hitungLeg(l: Leg, idx: number, proj: Proyeksi, nyata: Record<string, JalurNyata | null>): LegHitung | null {
  const a = cariLokasi(l.dari), b = cariLokasi(l.ke);
  if (!a || !b || a.nama === b.nama) return null;
  const kj = kunciJalur(l.moda, a, b);
  const jn = l.moda !== 'udara' ? nyata[kj] : undefined;
  if (jn) {
    const hari = l.hari && l.hari > 0 ? l.hari : Math.max(0.25, jn.km / KM_HARI[l.moda]);
    const titik = titikDariPolyline(jn.jalur, proj, Math.max(120, Math.min(900, jn.jalur.length * 3)));
    return { idx, moda: l.moda, a, b, km: jn.km, hari, perkiraan: !(l.hari && l.hari > 0), label: l.label, armada: l.armada, titik, kurva: new THREE.CatmullRomCurve3(titik, false, 'centripetal'), sumber: jn.sumber, ferry: jn.ferry };
  }
  const sumber: SumberJalur = l.moda === 'udara' ? 'udara' : kj in nyata ? (nyata[kj] === null ? 'gagal' : 'lurus') : 'muat';
  const km = Math.round(jarakLurusKm(a, b) * FAKTOR_JALUR[l.moda]);
  const hari = l.hari && l.hari > 0 ? l.hari : Math.max(l.moda === 'udara' ? 1 : 0.25, km / KM_HARI[l.moda]);
  const pa = proj(a.lon, a.lat), pb = proj(b.lon, b.lat);
  const na = pa.clone().normalize(), nb = pb.clone().normalize();
  const pj = pa.distanceTo(pb);
  const tinggi = l.moda === 'udara' ? Math.max(0.5, pj * 0.16) : 0;
  const t = new THREE.Vector3().subVectors(pb, pa).normalize();
  const tengah = na.clone().add(nb).normalize();
  const sisi = new THREE.Vector3().crossVectors(t, tengah).normalize();
  if (sisi.z > 0) sisi.negate();   // ke arah utara (−Z), alur pelayaran di utara pulau besar
  const r = acak(hashTeks(a.nama + b.nama));
  const kelok = l.moda === 'darat' || l.moda === 'kereta' ? [r() - 0.5, r() - 0.5].map(x => x * pj * 0.12) : [0, 0];
  const n = Math.max(80, Math.min(240, Math.round(pj * 2))), titik: THREE.Vector3[] = [];
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromUnitVectors(na, nb);
  for (let i = 0; i <= n; i++) {
    const u = i / n, s = Math.sin(Math.PI * u);
    const dasar = na.clone().applyQuaternion(q0.clone().slerp(q1, u));   // lintasan lingkaran besar
    const off = l.moda === 'laut' ? pj * 0.1 * s : kelok[0] * s + kelok[1] * Math.sin(2 * Math.PI * u);
    titik.push(dasar.multiplyScalar(R).addScaledVector(sisi, off).normalize().multiplyScalar(R + HJALUR + tinggi * s));
  }
  return { idx, moda: l.moda, a, b, km, hari, perkiraan: !(l.hari && l.hari > 0), label: l.label, armada: l.armada, titik, kurva: new THREE.CatmullRomCurve3(titik), sumber };
}

let maskerJanji: Promise<MaskerDarat> | null = null;
/** Ambil jalur nyata semua leg darat (jalan raya OSRM) dan laut (A* masker darat). */
async function ambilJalurNyata(rute: RuteSim[]): Promise<Record<string, JalurNyata | null>> {
  const out: Record<string, JalurNyata | null> = {};
  const kerja: Promise<void>[] = [];
  for (const r of rute) for (const l of r.legs) {
    const a = cariLokasi(l.dari), b = cariLokasi(l.ke);
    if (!a || !b || a.nama === b.nama) continue;
    const k = kunciJalur(l.moda, a, b); if (k in out) continue; out[k] = null;
    const masker = () => (maskerJanji ??= muatMasker().catch(e => { maskerJanji = null; throw e; }));
    if (l.moda === 'darat' || l.moda === 'kereta') kerja.push((async () => {
      // 1) jalan raya OSRM (kereta: koridor darat mengikuti jalan sebagai perkiraan jalur rel); 2) cadangan: A* di daratan
      const j = await ruteDarat([a.lon, a.lat], [b.lon, b.lat]);
      if (j) {
        // ruas panjang yang titik tengahnya di laut = penyeberangan ferry (RoRo)
        let ferry = false;
        if (l.moda === 'darat') try {
          const m = await masker();
          const diLaut = (p: LonLat, q: LonLat, u: number) => { const [c, r] = m.sel([q[0] + (p[0] - q[0]) * u, q[1] + (p[1] - q[1]) * u]); return m.laut(c, r); };
          ferry = j.jalur.some((p, i) => i > 0 && kmHaversine(p, j.jalur[i - 1]) > 20 && [0.25, 0.5, 0.75].every(u => diLaut(p, j.jalur[i - 1], u)));
        } catch { /* masker gagal */ }
        out[k] = { ...j, sumber: l.moda === 'kereta' ? 'rel' : 'jalan', ferry }; return;
      }
      try { const g = ruteDaratGrid(await masker(), [a.lon, a.lat], [b.lon, b.lat]); out[k] = g ? { ...g, sumber: l.moda === 'kereta' ? 'rel' : 'darat' } : null; } catch { out[k] = null; }
    })());
    else if (l.moda === 'laut') kerja.push(masker().then(m => { const g = ruteLaut(m, [a.lon, a.lat], [b.lon, b.lat]); out[k] = g ? { ...g, sumber: 'laut' } : null; }).catch(() => { out[k] = null; }));
    else delete out[k];
  }
  await Promise.all(kerja);
  return out;
}

// ---------------- Tile citra satelit dinamis di bola (quadtree Web Mercator) ----------------
const URL_TILE = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const lonTile = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latTile = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const Z_MIN = 2, Z_MAKS = 17;
interface Tile { z: number; x: number; y: number; status: 'muat' | 'ok' | 'gagal'; mesh?: THREE.Mesh; pakai: number; pusat: THREE.Vector3; ukuran: number }

function geometriTile(z: number, x: number, y: number, proj: Proyeksi) {
  const seg = z <= 3 ? 32 : z <= 6 ? 16 : 6;
  const lon0 = lonTile(x, z), lon1 = lonTile(x + 1, z);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= seg; j++) {
    const v = j / seg, lat = latTile(y + v, z);
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, p = proj(lon0 + (lon1 - lon0) * u, lat);
      pos.push(p.x, p.y, p.z); uv.push(u, 1 - v);
      if (i < seg && j < seg) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

/** Pengelola tile: pilih tile sesuai kamera (makin dekat makin detail), muat paralel, tampilkan induk sementara tile anak dimuat. */
function buatPengelolaTile(proj: Proyeksi, grup: THREE.Group, onDasar: (ok: boolean) => void) {
  const cache = new Map<string, Tile>();
  const antre: string[] = []; let jalan = 0; let batal = false; let dasarOk = 0, dasarSelesai = 0;
  const kunci = (z: number, x: number, y: number) => `${z}/${x}/${y}`;
  /** Data tile (dari cache atau baru); masuk antrean muat hanya bila diminta. */
  const ambil = (z: number, x: number, y: number, minta = true) => {
    const k = kunci(z, x, y); let t = cache.get(k);
    if (!t) {
      const lonC = lonTile(x + 0.5, z), latC = latTile(y + 0.5, z);
      const pusat = proj(lonC, latC), ujung = proj(lonTile(x, z), latTile(y, z)), ujung2 = proj(lonTile(x + 1, z), latTile(y + 1, z));
      t = { z, x, y, status: 'muat', pakai: 0, pusat, ukuran: Math.max(ujung.distanceTo(ujung2), 1e-3) };
      if (!minta) return t;
      cache.set(k, t); antre.push(k);
    } else if (minta && !cache.has(k)) cache.set(k, t);
    return t;
  };
  const pompa = () => {
    antre.sort((a, b) => Number(a.split('/')[0]) - Number(b.split('/')[0]));
    while (jalan < 12 && antre.length) {
      const k = antre.shift()!; const t = cache.get(k); if (!t || t.mesh) continue;
      jalan++;
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => {
        jalan--; if (batal) return;
        const tex = new THREE.Texture(im); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -t.z * 0.5, polygonOffsetUnits: -t.z * 4 });
        t.mesh = new THREE.Mesh(geometriTile(t.z, t.x, t.y, proj), mat); t.mesh.visible = false; t.mesh.renderOrder = t.z; t.status = 'ok'; grup.add(t.mesh);
        if (t.z === Z_MIN) { dasarOk++; dasarSelesai++; if (dasarSelesai === 16 || dasarOk === 1) onDasar(true); }
        pompa();
      };
      im.onerror = () => { jalan--; t.status = 'gagal'; if (t.z === Z_MIN && ++dasarSelesai === 16 && !dasarOk) onDasar(false); pompa(); };
      im.src = URL_TILE(t.z, t.x, t.y);
    }
  };
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) ambil(Z_MIN, x, y);
  pompa();
  const frustum = new THREE.Frustum(), m = new THREE.Matrix4(), bola = new THREE.Sphere();
  let detik = 0;
  /** Dipanggil per frame: pilih set tile yang tampil. */
  const perbarui = (cam: THREE.PerspectiveCamera, tinggiLayar: number) => {
    detik++;
    m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frustum.setFromProjectionMatrix(m);
    const C = cam.position, jarakPusat = C.length();
    const cosHorizon = Math.min(1, R / Math.max(R + 1e-3, jarakPusat));
    const ambang = 0.42 * (560 / Math.max(300, tinggiLayar));
    const ingin: Tile[] = [];
    const dikunjungi = new Set<string>();
    const kunjungi = (z: number, x: number, y: number) => {
      const t = ambil(z, x, y, false);
      // horizon: tile di balik bumi tidak perlu
      const n = t.pusat.clone().normalize();
      const sudut = Math.acos(THREE.MathUtils.clamp(n.dot(C) / jarakPusat, -1, 1)), batasSudut = Math.acos(cosHorizon) + t.ukuran / R;
      if (z > Z_MIN && sudut > batasSudut) return;
      bola.set(t.pusat, t.ukuran * 0.75);
      if (z > Z_MIN && !frustum.intersectsSphere(bola)) return;
      const d = Math.max(1e-3, C.distanceTo(t.pusat) - t.ukuran * 0.5);
      if (z < Z_MAKS && t.ukuran / d > ambang && ingin.length < 160) {
        if (z % 3 === 0) { ambil(z, x, y); dikunjungi.add(kunci(z, x, y)); }   // induk perantara: tampil sementara anak dimuat
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) kunjungi(z + 1, x * 2 + dx, y * 2 + dy);
      } else { ingin.push(ambil(z, x, y)); dikunjungi.add(kunci(z, x, y)); }
    };
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) kunjungi(Z_MIN, x, y);
    const tampil = new Set<Tile>();
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { const t = cache.get(kunci(Z_MIN, x, y)); if (t?.mesh) tampil.add(t); }
    for (let t of ingin) {
      if (!t.mesh) {   // belum dimuat: pakai induk terdekat yang sudah ada
        let z = t.z, x = t.x, y = t.y; let induk: Tile | undefined;
        while (z > Z_MIN && !induk?.mesh) { z--; x >>= 1; y >>= 1; induk = cache.get(kunci(z, x, y)); }
        if (!induk?.mesh) continue; t = induk;
      }
      tampil.add(t);
    }
    for (const t of cache.values()) if (t.mesh) { const v = tampil.has(t); t.mesh.visible = v; if (v) t.pakai = detik; }
    // antrean hanya tile yang masih relevan untuk posisi kamera sekarang
    for (let i = antre.length - 1; i >= 0; i--) if (!dikunjungi.has(antre[i]) && !antre[i].startsWith(`${Z_MIN}/`)) { cache.delete(antre[i]); antre.splice(i, 1); }
    pompa();
    // buang tile lama dari memori
    if (cache.size > 420) {
      const lama = [...cache.entries()].filter(([, t]) => t.z > Z_MIN && !tampil.has(t) && t.status !== 'muat').sort((a, b) => a[1].pakai - b[1].pakai).slice(0, cache.size - 360);
      for (const [k, t] of lama) { if (t.mesh) { grup.remove(t.mesh); t.mesh.geometry.dispose(); const mt = t.mesh.material as THREE.MeshBasicMaterial; mt.map?.dispose(); mt.dispose(); } cache.delete(k); }
    }
  };
  return { perbarui, hentikan: () => { batal = true; } };
}

// ---------------- Garis rute tegas (lebar dalam piksel layar) ----------------
function garis(titik: THREE.Vector3[], warna: string, px: number, opsi: { putus?: number; opacity?: number } = {}) {
  const geo = new LineGeometry(); geo.setPositions(titik.flatMap(p => [p.x, p.y, p.z]));
  const mat = new LineMaterial({ color: warna, linewidth: px, worldUnits: false, transparent: true, opacity: opsi.opacity ?? 1, dashed: !!opsi.putus,
    dashSize: opsi.putus ?? 1, gapSize: (opsi.putus ?? 1) * 0.8, depthWrite: false });
  const l = new Line2(geo, mat); l.computeLineDistances(); l.renderOrder = 50;
  return l;
}

type Tampilan = 'atas' | 'miring' | 'globe';
interface StatusHud { t: number; stage: number; u: number; hariRute: number[] }

export default function Rute3D({ rute, tinggi = 560 }: { rute: RuteSim[]; tinggi?: number }) {
  const bingkai = useRef<HTMLDivElement>(null);
  const wadah = useRef<HTMLDivElement>(null);
  const [jalan, setJalan] = useState(true);
  const [kec, setKec] = useState(1);
  const [fokus, setFokus] = useState(-1);            // -1 = semua stage berurutan
  const [tampilan, setTampilan] = useState<Tampilan>('atas');
  const [kameraAuto, setKameraAuto] = useState(true);
  const [satelit, setSatelit] = useState(true);
  const [infoPeta, setInfoPeta] = useState<'muat' | 'ok' | 'gagal'>('muat');
  const [muatModel, setMuatModel] = useState(true);
  const [fotoProses, setFotoProses] = useState(false);
  const [hud, setHud] = useState<StatusHud>({ t: 0, stage: 0, u: 0, hariRute: [] });
  const kontrol = useRef({ jalan: true, kec: 1, t: 0, fokus: -1, tampilan: 'atas' as Tampilan, kameraAuto: true, satelit: true, manualSampai: 0, lompat: true, terbang: 0, foto: 0 });
  Object.assign(kontrol.current, { jalan, kec, fokus, kameraAuto, satelit });
  if (kontrol.current.tampilan !== tampilan) { kontrol.current.tampilan = tampilan; kontrol.current.terbang = 1; kontrol.current.manualSampai = 0; }

  const [nyata, setNyata] = useState<Record<string, JalurNyata | null>>({});
  const [cariJalur, setCariJalur] = useState(false);
  const kunciRute = JSON.stringify(rute);
  useEffect(() => {
    let batal = false; setCariJalur(true);
    ambilJalurNyata(rute).then(x => { if (!batal) { setNyata(x); setCariJalur(false); } }).catch(() => { if (!batal) setCariJalur(false); });
    return () => { batal = true; };
  }, [kunciRute]); // eslint-disable-line react-hooks/exhaustive-deps
  const kamTerakhir = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; rute: string } | null>(null);
  const { data, proj } = useMemo(() => {
    const lok = rute.flatMap(r => r.legs.flatMap(l => [cariLokasi(l.dari), cariLokasi(l.ke)])).filter((x): x is Lokasi => !!x);
    const lonP = lok.length ? lok.reduce((t, l) => t + l.lon, 0) / lok.length : 118, latP = lok.length ? lok.reduce((t, l) => t + l.lat, 0) / lok.length : -2;
    const proj = buatProyeksi(lonP, latP);
    const data = rute.map(r => {
      const legs = r.legs.map((l, i) => hitungLeg(l, i, proj, nyata));
      const ok = legs.filter((x): x is LegHitung => !!x);
      return { nama: r.nama, legs: ok, gagal: r.legs.filter((_, i) => !legs[i]).map(l => `${l.dari || '?'} → ${l.ke || '?'}`), total: ok.reduce((t, x) => t + x.hari, 0), km: ok.reduce((t, x) => t + x.km, 0) };
    });
    return { data, proj };
  }, [rute, nyata]);
  const nStage = Math.max(0, ...data.map(d => d.legs.length));
  const kunci = `${kunciRute}#${Object.keys(nyata).filter(k => nyata[k]).length}`;
  /** Posisi waktu animasi → stage aktif & progres u (0..1). */
  const fase = (t: number, f: number) => {
    const per = DETIK_STAGE + JEDA;
    if (f >= 0) { const u = Math.min(1, t / DETIK_STAGE); return { stage: f, u }; }
    const stage = Math.min(nStage - 1, Math.floor(t / per));
    return { stage: Math.max(0, stage), u: Math.min(1, Math.max(0, (t - stage * per) / DETIK_STAGE)) };
  };
  const faseRef = useRef(fase); faseRef.current = fase;

  useEffect(() => {
    const el = wadah.current; if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; el.appendChild(renderer.domElement);
    const lr = new CSS2DRenderer(); lr.setSize(el.clientWidth, el.clientHeight);
    Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' }); el.appendChild(lr.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#050b18');
    const cam = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.05, 20000);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true;
    ctl.addEventListener('start', () => { kontrol.current.manualSampai = performance.now() + 6000; kontrol.current.terbang = 0; });
    scene.add(new THREE.HemisphereLight('#f0f9ff', '#5a6b4a', 1.1));
    const sun = new THREE.DirectionalLight('#fff7e6', 2.4); sun.position.set(-60, 600, 160); scene.add(sun);

    // ---- bintang
    const rb = acak(42), bintangPos: number[] = [];
    for (let i = 0; i < 2500; i++) { const v = new THREE.Vector3(rb() - 0.5, rb() - 0.5, rb() - 0.5).normalize().multiplyScalar(5000 + rb() * 2000); bintangPos.push(v.x, v.y, v.z); }
    const gB = new THREE.BufferGeometry(); gB.setAttribute('position', new THREE.Float32BufferAttribute(bintangPos, 3));
    scene.add(new THREE.Points(gB, new THREE.PointsMaterial({ color: '#cbd5e1', size: 1.4, sizeAttenuation: false })));

    // ---- bumi: bola dasar (laut) + garis pantai ilustrasi (cadangan) + tile satelit + atmosfer
    const bumi = new THREE.Mesh(new THREE.SphereGeometry(R - 0.03, 128, 96), new THREE.MeshStandardMaterial({ color: '#12456e', roughness: 0.6, metalness: 0.1 }));
    scene.add(bumi);
    const ilustrasi = new THREE.Group(); scene.add(ilustrasi);
    for (const p of PULAU) ilustrasi.add(garis([...p, p[0]].map(([lon, lat]) => proj(lon, lat, 0.01)), '#86efac', 1.6));
    const grupTile = new THREE.Group(); scene.add(grupTile);
    let batal = false, infoGagal = false;
    const tile = buatPengelolaTile(proj, grupTile, ok => { infoGagal = !ok; if (!batal) setInfoPeta(ok ? 'ok' : 'gagal'); });
    const atmosfer = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 64), new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0.0, 0.68 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(0.35, 0.62, 1.0, 1.0) * i; }',
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
    }));
    scene.add(atmosfer);

    // ---- lokasi: pin label (ikon + nama) + cakram di permukaan
    const SUMBU_Y = new THREE.Vector3(0, 1, 0);
    const dipakai = new Map<string, Lokasi>();
    for (const r of data) for (const l of r.legs) { dipakai.set(l.a.nama, l.a); dipakai.set(l.b.nama, l.b); }
    const pins: { o: CSS2DObject; p: THREE.Vector3; nama: string; jenis: string }[] = [];
    const titikLok: THREE.Mesh[] = [];
    for (const l of dipakai.values()) {
      const p = proj(l.lon, l.lat, HJALUR);
      const d = document.createElement('div'); d.className = `rute3d-pin ${l.jenis}`;
      d.innerHTML = `<span class="ikon">${IKON_LOKASI[l.jenis] ?? '📍'}</span><span>${l.nama.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
      const o = new CSS2DObject(d); o.position.copy(p); o.center.set(0.5, 1.15); scene.add(o); pins.push({ o, p, nama: l.nama, jenis: l.jenis });
      const warna = l.jenis === 'pelabuhan' ? '#1d4ed8' : l.jenis === 'bandara' ? '#7c3aed' : '#dc2626';
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 24), new THREE.MeshBasicMaterial({ color: warna, transparent: true, opacity: 0.9 }));
      m.position.copy(p); m.quaternion.setFromUnitVectors(SUMBU_Y, p.clone().normalize()); scene.add(m); titikLok.push(m);
    }

    // ---- jalur: casing putih + garis warna moda (tegas), putus-putus bergerak untuk laut & udara
    const jalur: { stage: number; mats: LineMaterial[]; dash?: LineMaterial }[] = [];
    for (const r of data) for (const l of r.legs) {
      const pj = l.kurva.getLength();
      const casing = garis(l.titik, '#ffffff', l.moda === 'udara' ? 12 : 9, { opacity: 0.95 });
      // darat / kereta tanpa jalur darat (beda pulau): garis merah putus-putus sebagai peringatan, bukan rute
      const mustahil = l.sumber === 'gagal' && (l.moda === 'darat' || l.moda === 'kereta');
      const inti = mustahil ? garis(l.titik, '#ef4444', 5, { putus: pj / 30 }) : garis(l.titik, l.moda === 'udara' ? '#9333ea' : WARNA[l.moda], l.moda === 'udara' ? 8 : 6);
      scene.add(casing, inti);
      const ent: (typeof jalur)[number] = { stage: l.idx, mats: [casing.material, inti.material] };
      if (l.moda !== 'darat') {
        const d = garis(l.titik, '#ffffff', 2, { putus: pj / 50, opacity: 0.8 }); d.renderOrder = 51; scene.add(d);
        ent.dash = d.material; ent.mats.push(d.material);
      }
      jalur.push(ent);
    }

    // ---- armada
    const tBayang = teksturBayang(), tBuih = teksturBuih();
    const armada = data.map(r => {
      const obj = new THREE.Group(); scene.add(obj);
      const bayang = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tBayang, transparent: true, opacity: 0.4, depthWrite: false }));
      bayang.visible = false; scene.add(bayang);
      const d = document.createElement('div'); d.className = 'rute3d-tag';
      const tag = new CSS2DObject(d); tag.center.set(0.5, 1.6); scene.add(tag);
      return { obj, bayang, tag, el: d, r };
    });
    const siap = new Map<JenisArmada, THREE.Object3D>();
    const perlu = new Set<JenisArmada>(); for (const r of data) for (const l of r.legs) perlu.add(jenisArmada(l.moda, l.armada));
    Promise.all([...perlu].map(j => muatArmada(j).then(m => { if (m && !batal) siap.set(j, m); }))).finally(() => { if (!batal) setMuatModel(false); });
    const buatModel = (l: LegHitung, j: JenisArmada) => {
      const g = new THREE.Group(); const m = siap.get(j);
      g.add(m ? m.clone(true) : modelKotak(l.moda));
      const halo = new THREE.Mesh(new THREE.CircleGeometry(PANJANG[j] * 0.5, 40), new THREE.MeshBasicMaterial({ color: WARNA[l.moda], transparent: true, opacity: 0.45, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.01; g.add(halo);
      const cincin = new THREE.Mesh(new THREE.RingGeometry(PANJANG[j] * 0.5, PANJANG[j] * 0.56, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      cincin.rotation.x = -Math.PI / 2; cincin.position.y = 0.012; g.add(cincin);
      if (l.moda === 'laut') {
        const buih = new THREE.Mesh(new THREE.PlaneGeometry(PANJANG.kapal * 1.4, 1.6), new THREE.MeshBasicMaterial({ map: tBuih, transparent: true, depthWrite: false }));
        buih.rotation.x = -Math.PI / 2; buih.position.set(-PANJANG.kapal * 1.05, 0.03, 0); g.add(buih);
      }
      return g;
    };

    // ---- kamera: bingkai stage aktif di permukaan, atau seluruh globe
    const semuaLegs = data.flatMap(r => r.legs);
    const bingkaiKam = (s: number) => {
      const mode = kontrol.current.tampilan;
      const legs = semuaLegs.filter(l => s < 0 || l.idx === s);
      const pakai = legs.length ? legs : semuaLegs;
      const ll = pakai.flatMap(l => [l.a, l.b]);
      const lonC = ll.length ? ll.reduce((t, x) => t + x.lon, 0) / ll.length : 118, latC = ll.length ? ll.reduce((t, x) => t + x.lat, 0) / ll.length : -2;
      const c = proj(lonC, latC), n = c.clone().normalize();
      const N = proj(lonC, latC + 0.01).sub(c).normalize(), E = new THREE.Vector3().crossVectors(N, n).normalize();
      if (mode === 'globe') return { target: new THREE.Vector3(), pos: n.clone().addScaledVector(N, -0.35).normalize().multiplyScalar(R * 2.9), up: N };
      let sx = 0, sz = 0;
      for (const l of pakai) for (const p of l.titik) { const v = p.clone().sub(c); sx = Math.max(sx, Math.abs(v.dot(E)) * 2); sz = Math.max(sz, Math.abs(v.dot(N)) * 2); }
      if (!pakai.length) { sx = 60; sz = 30; }
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2;
      const jarak = Math.max(0.8, Math.max(sz / tan, sx / (tan * cam.aspect * 0.62)) * 1.3);
      const arah = mode === 'atas' ? n.clone().addScaledVector(N, -0.03) : n.clone().multiplyScalar(0.78).addScaledVector(N, -0.62).addScaledVector(E, -0.15);
      // arah atas layar: utara untuk top view, vertikal lokal untuk tampilan miring (horizon datar)
      return { target: c, pos: c.clone().addScaledVector(arah.normalize(), jarak), up: mode === 'atas' ? N : n };
    };
    const lama = kamTerakhir.current?.rute === kunciRute ? kamTerakhir.current : null;
    if (lama) { ctl.target.copy(lama.target); cam.position.copy(lama.pos); cam.up.copy(lama.up); kontrol.current.lompat = false; }
    else { const b0 = bingkaiKam(-1); ctl.target.copy(b0.target); cam.position.copy(b0.pos); cam.up.copy(b0.up); }
    ctl.update();

    let lebar = el.clientWidth, tinggiEl = el.clientHeight;
    const semuaMat = () => [...jalur.flatMap(j => j.mats), ...ilustrasi.children.map(c => (c as Line2).material)];
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; lebar = w; tinggiEl = h;
      renderer.setSize(w, h); lr.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); for (const m of semuaMat()) m.resolution.set(w, h);
    });
    ro.observe(el); for (const m of semuaMat()) m.resolution.set(lebar, tinggiEl);

    const fmt = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    const tmp = new THREE.Vector3();
    let id = 0, lalu = performance.now(), tampilLalu = 0, tileLalu = 0;
    const loop = (kini: number) => {
      id = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (kini - lalu) / 1000); lalu = kini;
      const k = kontrol.current;
      const panjangLoop = k.fokus >= 0 ? DETIK_STAGE + JEDA + 0.6 : nStage * (DETIK_STAGE + JEDA) + 1;
      if (k.jalan) { k.t += dt * k.kec; if (k.t > panjangLoop) k.t = 0; }
      const { stage, u } = faseRef.current(k.t, k.fokus);
      const globe = k.tampilan === 'globe';
      grupTile.visible = k.satelit;
      ilustrasi.visible = !k.satelit || infoGagal;
      for (const j of jalur) {
        const aktif = j.stage === stage;
        j.mats.forEach((m, i) => { m.opacity = (aktif || k.foto ? 1 : 0.38) * (i === 0 ? 0.95 : 1); });
        if (j.dash) j.dash.dashOffset -= dt * j.dash.dashSize * 2.2;
      }
      const jarakKam = cam.position.distanceTo(ctl.target);
      for (const m of titikLok) m.scale.set(Math.min(3, jarakKam * 0.008), 1, Math.min(3, jarakKam * 0.008));
      // pin: sembunyikan di balik bumi; dari jauh hanya titik stage aktif supaya label tidak bertumpuk
      const jauh = cam.position.length() - R > R * 0.3;
      const ujungAktif = new Set(semuaLegs.filter(l => l.idx === stage).flatMap(l => [l.a.nama, l.b.nama]));
      for (const p of pins) p.o.visible = tmp.subVectors(cam.position, p.p).dot(p.p) > 0 && (!jauh || ujungAktif.has(p.nama));
      const hariRute: number[] = [];
      for (const a of armada) {
        const legs = a.r.legs;
        if (!legs.length) { a.obj.visible = false; a.tag.visible = false; hariRute.push(0); continue; }
        let li = legs.findIndex(l => l.idx === stage);
        let uu = u;
        if (li < 0) { li = Math.max(0, legs.filter(l => l.idx < stage).length - 1); uu = legs[li].idx < stage ? 1 : 0; }
        const leg = legs[li];
        hariRute.push(legs.slice(0, li).reduce((t, l) => t + l.hari, 0) + uu * leg.hari);
        const p = leg.kurva.getPointAt(uu), q = leg.kurva.getPointAt(Math.min(1, uu + 0.01)), q0 = leg.kurva.getPointAt(Math.max(0, uu - 0.01));
        const j = jenisArmada(leg.moda, leg.armada);
        const kunciM = `${leg.moda}-${j}-${siap.has(j) ? 'glb' : 'kotak'}`;
        if (a.obj.userData.model !== kunciM) { a.obj.clear(); a.obj.add(buatModel(leg, j)); a.obj.userData.model = kunciM; }
        const n = p.clone().normalize();
        a.obj.visible = !k.foto; a.obj.position.copy(p); a.obj.up.copy(n);
        const arah = uu >= 1 ? new THREE.Vector3().subVectors(p, q0) : new THREE.Vector3().subVectors(q, p);
        a.obj.lookAt(p.x + arah.x, p.y + arah.y, p.z + arah.z); a.obj.rotateY(-Math.PI / 2);
        const sk = THREE.MathUtils.clamp(cam.position.distanceTo(p) * (leg.moda === 'laut' ? 0.035 : leg.moda === 'udara' ? 0.05 : 0.065), 0.01, 6);
        a.obj.scale.setScalar(sk);
        if (leg.moda === 'laut') a.obj.position.addScaledVector(n, Math.sin(kini / 600 + p.x) * 0.02 * sk);
        a.bayang.visible = leg.moda === 'udara' && !k.foto;
        if (a.bayang.visible) { a.bayang.position.copy(n).multiplyScalar(R + 0.02); a.bayang.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); a.bayang.scale.setScalar(sk); }
        const terlihat = tmp.subVectors(cam.position, p).dot(n) > -R * 0.05;
        a.tag.position.copy(p); a.tag.visible = terlihat && !k.foto;
        const status = uu >= 1 ? 'tiba' : uu <= 0 ? 'menunggu' : `${Math.round(uu * 100)}%`;
        const isi = `<b>${IKON_MODA[leg.moda]} Stage ${leg.idx + 1}${leg.label ? ` · ${leg.label}` : ''}</b><span>${leg.armada ?? LABEL_MODA[leg.moda]} · ${status}</span><span>Lead time ${fmt(uu * leg.hari)} / ${fmt(leg.hari)} hari${leg.perkiraan ? '*' : ''}</span>`;
        if (a.el.innerHTML !== isi) a.el.innerHTML = isi;
        a.el.style.opacity = data.length > 1 && armada.indexOf(a) > 0 ? '0.85' : '1';
      }
      // kontrol orbit per mode
      if (globe) { ctl.minDistance = R * 1.08; ctl.maxDistance = R * 8; ctl.maxPolarAngle = Math.PI; }
      else { ctl.minDistance = 0.3; ctl.maxDistance = R * 3; ctl.maxPolarAngle = Math.PI * 0.47; }
      // kamera otomatis: bingkai stage aktif (dijeda 6 dtk setelah pengguna menggeser / zoom); pindah mode = terbang halus
      const ikut = (!globe && k.kameraAuto && kini > k.manualSampai) || k.terbang > 0 || k.lompat || (k.foto > 0 && !globe);
      if (ikut) {
        const b = bingkaiKam(globe || k.foto ? -1 : stage);
        const f = k.lompat ? 1 : 1 - Math.exp(-dt * (k.terbang > 0 ? 3 : 2.2));
        ctl.target.lerp(b.target, f); cam.position.lerp(b.pos, f); cam.up.lerp(b.up, f).normalize(); k.lompat = false;
        if (k.terbang > 0) { k.terbang -= dt / 1.8; if (cam.position.distanceTo(b.pos) < b.pos.distanceTo(b.target) * 0.02) k.terbang = 0; }
        // jaga kamera tidak masuk ke dalam bumi saat transisi
        const dk = cam.position.length(); if (dk < R + 0.2) cam.position.multiplyScalar((R + 0.2) / dk);
      }
      ctl.update();
      const tinggiKam = cam.position.length() - R;
      atmosfer.visible = tinggiKam > R * 0.25;
      const dk = cam.position.distanceTo(ctl.target);
      const near = Math.max(0.005, Math.min(tinggiKam * 0.3, dk * 0.02)), far = cam.position.length() > R * 1.6 ? 9000 : cam.position.length() + R * 1.2;
      if (Math.abs(cam.near - near) > near * 0.2 || cam.far !== far) { cam.near = near; cam.far = far; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      if (k.satelit && kini - tileLalu > 120) { tileLalu = kini; tile.perbarui(cam, tinggiEl); }
      if (kini - tampilLalu > 150) { tampilLalu = kini; setHud({ t: k.t, stage, u, hariRute }); }
      renderer.render(scene, cam); lr.render(scene, cam);
      // foto rute: tunggu kamera membingkai seluruh rute & citra termuat, lalu ambil gambar di frame yang sama dengan render
      if (k.foto && kini - k.foto > 3200) { k.foto = 0; buatFoto(renderer.domElement.toDataURL('image/png')); }
    };
    const buatFoto = (gl: string) => {
      const im = new Image();
      im.onload = () => {
        const W = renderer.domElement.width, H = renderer.domElement.height, sk = W / lebar;
        const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
        g.drawImage(im, 0, 0);
        const huruf = (px: number, tebal = 400) => `${tebal} ${Math.round(px * sk)}px "Noto Sans", system-ui, sans-serif`;
        const kotak = (x: number, y: number, w: number, h: number, r: number, isi: string, garisW = 0) => {
          g.beginPath(); g.roundRect(x, y, w, h, r * sk); g.fillStyle = isi; g.shadowColor = 'rgba(15,23,42,.28)'; g.shadowBlur = 10 * sk; g.fill(); g.shadowBlur = 0;
          if (garisW) { g.strokeStyle = 'rgba(15,23,42,.08)'; g.lineWidth = garisW; g.stroke(); }
        };
        // pin lokasi (lewati label yang bertumpuk)
        const terpakai: [number, number, number, number][] = [];
        for (const pn of pins) {
          if (tmp.subVectors(cam.position, pn.p).dot(pn.p) <= 0) continue;
          const v = pn.p.clone().project(cam); if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
          const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
          const teks = `${IKON_LOKASI[pn.jenis] ?? '📍'}  ${pn.nama}`; g.font = huruf(12, 700);
          const tw = g.measureText(teks).width + 16 * sk, th = 22 * sk;
          const bx: [number, number, number, number] = [x - tw / 2, y - th - 9 * sk, tw, th];
          if (terpakai.some(([ax, ay, aw, ah]) => bx[0] < ax + aw && bx[0] + bx[2] > ax && bx[1] < ay + ah && bx[1] + bx[3] > ay)) continue;
          terpakai.push(bx);
          g.fillStyle = pn.jenis === 'pelabuhan' ? '#1d4ed8' : pn.jenis === 'bandara' ? '#7c3aed' : '#dc2626';
          g.beginPath(); g.arc(x, y, 5 * sk, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2 * sk; g.stroke();
          kotak(x - tw / 2, y - th - 9 * sk, tw, th, 11, '#ffffff');
          g.fillStyle = '#0f172a'; g.textBaseline = 'middle'; g.fillText(teks, x - tw / 2 + 8 * sk, y - th / 2 - 9 * sk);
        }
        // panel ringkasan rute
        const r0 = data.find(d => d.legs.length); const pad = 14 * sk, x0 = 16 * sk, y0 = 16 * sk;
        if (r0) {
          const baris = r0.legs.length, pw = 380 * sk, ph = (78 + baris * 44) * sk;
          kotak(x0, y0, pw, ph, 14, 'rgba(255,255,255,0.96)', 1);
          g.textBaseline = 'alphabetic'; g.fillStyle = '#475569'; g.font = huruf(11, 700); g.fillText('RUTE DOOR TO DOOR', x0 + pad, y0 + pad + 10 * sk);
          g.fillStyle = '#0f172a'; g.font = huruf(17, 700); g.fillText(r0.nama, x0 + pad, y0 + pad + 32 * sk, pw - pad * 2);
          g.fillStyle = '#64748b'; g.font = huruf(12); g.fillText(`±${r0.km.toLocaleString('id-ID')} km · lead time ${fmt(r0.total)} hari`, x0 + pad, y0 + pad + 52 * sk);
          r0.legs.forEach((l, i) => {
            const y = y0 + (88 + i * 44) * sk;
            g.fillStyle = l.sumber === 'gagal' && l.moda !== 'laut' && l.moda !== 'udara' ? '#ef4444' : WARNA[l.moda];
            g.beginPath(); g.arc(x0 + pad + 10 * sk, y + 4 * sk, 10 * sk, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#fff'; g.font = huruf(11, 700); g.textAlign = 'center'; g.fillText(String(l.idx + 1), x0 + pad + 10 * sk, y + 8 * sk); g.textAlign = 'left';
            g.fillStyle = '#0f172a'; g.font = huruf(13, 700);
            g.fillText(`${IKON_MODA[l.moda]} Stage ${l.idx + 1}${l.label ? ` · ${l.label}` : ''} — ${l.armada ?? LABEL_MODA[l.moda]}`, x0 + pad + 28 * sk, y + 2 * sk, pw - pad * 2 - 28 * sk);
            g.fillStyle = '#64748b'; g.font = huruf(11.5);
            g.fillText(`${l.a.nama} → ${l.b.nama} · ±${l.km.toLocaleString('id-ID')} km · ${fmt(l.hari)} hari${l.perkiraan ? '*' : ''}${l.ferry ? ' · via ferry' : ''}`, x0 + pad + 28 * sk, y + 20 * sk, pw - pad * 2 - 28 * sk);
          });
        }
        // legenda & atribusi
        const leg = (Object.keys(WARNA) as Moda[]).filter(m => data.some(d => d.legs.some(l => l.moda === m)));
        g.font = huruf(12, 600); const lw = leg.reduce((t, m) => t + g.measureText(LABEL_MODA[m]).width + 34 * sk, 16 * sk);
        kotak(16 * sk, H - 44 * sk, lw, 28 * sk, 8, 'rgba(255,255,255,0.94)');
        let lx = 26 * sk; g.textBaseline = 'middle';
        for (const m of leg) { g.fillStyle = WARNA[m]; g.fillRect(lx, H - 32 * sk, 18 * sk, 5 * sk); g.fillStyle = '#0f172a'; g.fillText(LABEL_MODA[m], lx + 22 * sk, H - 30 * sk); lx += g.measureText(LABEL_MODA[m]).width + 34 * sk; }
        const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
        const atr = `Leca by esapanghegar · ${tgl} · Citra © Esri, Maxar, Earthstar Geographics · Jalan © OpenStreetMap`;
        g.font = huruf(10.5); const aw = g.measureText(atr).width + 14 * sk;
        g.fillStyle = 'rgba(15,23,42,.6)'; g.beginPath(); g.roundRect(W - aw - 10 * sk, H - 26 * sk, aw, 18 * sk, 4 * sk); g.fill();
        g.fillStyle = '#f8fafc'; g.fillText(atr, W - aw - 3 * sk, H - 17 * sk);
        c.toBlob(b => {
          if (!b) return;
          const a = document.createElement('a'); a.href = URL.createObjectURL(b);
          a.download = `Rute ${(r0?.nama ?? 'Leca').replace(/[^\w\- →]+/g, '').replace('→', '-')}.png`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          if (!batal) setFotoProses(false);
        }, 'image/png');
      };
      im.src = gl;
    };
    id = requestAnimationFrame(loop);
    return () => {
      kamTerakhir.current = { pos: cam.position.clone(), target: ctl.target.clone(), up: cam.up.clone(), rute: kunciRute };
      batal = true; tile.hentikan(); cancelAnimationFrame(id); ro.disconnect(); ctl.dispose();
      scene.traverse(o => {
        if (o.userData.bersama) return;
        const m = o as THREE.Mesh; m.geometry?.dispose?.();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); });
      });
      renderer.dispose(); el.innerHTML = '';
    };
  }, [kunci]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtHari = (h: number) => `${h.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari`;
  const utama = data.find(d => d.legs.length);
  const legAktif = utama?.legs.find(l => l.idx === hud.stage) ?? null;
  const pilihStage = (s: number) => { setFokus(s); kontrol.current.t = s >= 0 ? 0 : 0; kontrol.current.fokus = s; kontrol.current.manualSampai = 0; setJalan(true); };
  const ambilFoto = () => { setFotoProses(true); setJalan(false); kontrol.current.foto = performance.now(); kontrol.current.terbang = 1; kontrol.current.manualSampai = 0; };
  const layarPenuh = () => { const b = bingkai.current; if (!b) return; if (document.fullscreenElement) document.exitFullscreen(); else b.requestFullscreen?.(); };
  const namaStage = (l: LegHitung) => `Stage ${l.idx + 1}${l.label ? ` · ${l.label}` : ''}`;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="row small rute3d-kontrol">
        <button type="button" onClick={() => setJalan(!jalan)}>{jalan ? '❚❚ Jeda' : '▶ Jalan'}</button>
        <button type="button" className="ghost" onClick={() => { kontrol.current.t = 0; kontrol.current.manualSampai = 0; }}>↺ Ulang</button>
        <div className="tabs" role="group" aria-label="Stage">
          <button type="button" className={fokus === -1 ? 'on' : ''} onClick={() => pilihStage(-1)}>Semua stage</button>
          {Array.from({ length: nStage }, (_, s) => <button key={s} type="button" className={fokus === s ? 'on' : ''} onClick={() => pilihStage(s)}>Stage {s + 1}</button>)}
        </div>
        <div className="tabs" role="group" aria-label="Kecepatan">{[0.5, 1, 2, 4].map(x => <button key={x} type="button" className={kec === x ? 'on' : ''} onClick={() => setKec(x)}>{x.toLocaleString('id-ID')}×</button>)}</div>
        <div className="tabs" role="group" aria-label="Tampilan">
          <button type="button" className={tampilan === 'atas' ? 'on' : ''} onClick={() => setTampilan('atas')}>Top view</button>
          <button type="button" className={tampilan === 'miring' ? 'on' : ''} onClick={() => setTampilan('miring')}>3D miring</button>
          <button type="button" className={tampilan === 'globe' ? 'on' : ''} onClick={() => setTampilan('globe')} title="Lihat seluruh dunia; seret untuk memutar bumi, scroll untuk zoom">🌏 Globe</button>
        </div>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={kameraAuto} onChange={e => { setKameraAuto(e.target.checked); kontrol.current.manualSampai = 0; }} /> Kamera ikut stage</label>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={satelit} onChange={e => setSatelit(e.target.checked)} /> Citra satelit</label>
        <button type="button" className="ghost" onClick={layarPenuh}>⛶ Layar penuh</button>
        <button type="button" onClick={ambilFoto} disabled={fotoProses} title="Simpan gambar PNG seluruh rute: peta satelit, jalur per stage, lokasi, ringkasan lead time & legenda">{fotoProses ? 'Menyiapkan foto…' : '📷 Foto rute (PNG)'}</button>
      </div>
      <div ref={bingkai} className="rute3d-bingkai" style={{ height: tinggi }}>
        <div ref={wadah} className="rute3d-wadah" style={{ height: '100%' }} />
        {utama && legAktif && <div className="rute3d-hud kiri">
          <div className="hud-eyebrow">{IKON_MODA[legAktif.moda]} {namaStage(legAktif)}</div>
          <div className="hud-judul">{legAktif.a.nama} → {legAktif.b.nama}</div>
          <div className="hud-sub">{legAktif.armada ?? LABEL_MODA[legAktif.moda]} · ±{legAktif.km.toLocaleString('id-ID')} km</div>
          <div className="hud-bar"><i style={{ width: `${Math.round(hud.u * 100)}%`, background: WARNA[legAktif.moda] }} /></div>
          <div className="hud-grid">
            <span>Lead time stage</span><b>{fmtHari(legAktif.hari)}{legAktif.perkiraan ? ' *' : ''}</b>
            <span>Berjalan</span><b>{fmtHari(hud.u * legAktif.hari)}</b>
            <span>Door to door</span><b>hari ke-{(hud.hariRute[data.indexOf(utama)] ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })} / {fmtHari(utama.total)}</b>
          </div>
          {data.length > 1 && <div className="hud-sub">{utama.nama} · +{data.length - 1} rute lain bergerak bersamaan</div>}
        </div>}
        {utama && <div className="rute3d-hud kanan">
          <div className="hud-eyebrow">Alur {utama.nama}</div>
          {utama.legs.map(l => {
            const st = l.idx < hud.stage || (l.idx === hud.stage && hud.u >= 1) ? 'selesai' : l.idx === hud.stage ? 'aktif' : 'menunggu';
            return <button key={l.idx} type="button" className={`hud-step ${st}`} onClick={() => pilihStage(l.idx)}>
              <span className="titik" style={{ background: st === 'menunggu' ? '#cbd5e1' : WARNA[l.moda] }}>{st === 'selesai' ? '✓' : l.idx + 1}</span>
              <span><b>{namaStage(l)}</b><small>{IKON_MODA[l.moda]} {l.a.nama} → {l.b.nama}</small><small>{fmtHari(l.hari)}{l.perkiraan ? ' (perkiraan)' : ''} · ±{l.km.toLocaleString('id-ID')} km</small></span>
            </button>;
          })}
        </div>}
        <div className="rute3d-legenda">{(Object.keys(WARNA) as Moda[]).map(m => <span key={m}><i style={{ background: WARNA[m] }} />{LABEL_MODA[m]}</span>)}
          {(infoPeta === 'muat' && satelit) && <span className="muted">memuat citra satelit…</span>}{muatModel && <span className="muted">memuat model 3D…</span>}{cariJalur && <span className="muted">mencari jalur jalan & laut…</span>}</div>
        <div className="rute3d-atribusi">{satelit && infoPeta === 'ok' ? 'Citra © Esri, Maxar, Earthstar Geographics' : infoPeta === 'gagal' && satelit ? 'Citra satelit tidak dapat dimuat — peta ilustrasi' : 'Peta ilustrasi'} · Model 3D: Meshy</div>
      </div>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Rute</th><th>Stage</th><th className="num">Jarak</th><th className="num">Lead time</th><th>Status saat ini</th></tr></thead>
        <tbody>{data.map((r, ri) => r.legs.length ? r.legs.map((l, i) => {
          const st = l.idx < hud.stage || (l.idx === hud.stage && hud.u >= 1) ? '✓ selesai' : l.idx === hud.stage ? `● ${LABEL_MODA[l.moda]} dalam perjalanan (${Math.round(hud.u * 100)}%)` : 'menunggu';
          return (
            <tr key={`${r.nama}-${i}`} className={l.idx === hud.stage ? 'aktif' : undefined}>
              {i === 0 && <td rowSpan={r.legs.length}><b>{r.nama}</b><div className="small muted">{r.km.toLocaleString('id-ID')} km · {fmtHari(r.total)} · hari ke-{(hud.hariRute[ri] ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}</div>{r.gagal.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Lokasi belum dikenal: {r.gagal.join(', ')}</div>}</td>}
              <td><span style={{ color: WARNA[l.moda], fontWeight: 600 }}>{IKON_MODA[l.moda]} {namaStage(l)}</span> · {l.armada ? `${l.armada} · ` : ''}{l.a.nama} → {l.b.nama}
                <div className="small" style={{ color: l.sumber === 'gagal' ? 'var(--bad)' : undefined }}>{l.sumber === 'gagal' && l.moda === 'laut' ? 'Alur laut tidak ditemukan — garis perkiraan' : LABEL_SUMBER[l.sumber]}{l.ferry ? ' + penyeberangan ferry (RoRo) — ruas di atas laut adalah kapal ferry' : ''}</div></td>
              <td className="num">±{l.km.toLocaleString('id-ID')} km</td>
              <td className="num">{fmtHari(l.hari)}{l.perkiraan ? <span className="small muted"> (perkiraan)</span> : ''}</td>
              <td className="small">{st}</td>
            </tr>);
        }) : r.gagal.length ? <tr key={r.nama}><td><b>{r.nama}</b></td><td colSpan={4} className="small" style={{ color: 'var(--bad)' }}>Lokasi belum dikenal: {r.gagal.join(', ')} — pilih dari daftar kota / pelabuhan / bandara.</td></tr> : null)}
        {data.every(r => !r.legs.length && !r.gagal.length) && <tr><td colSpan={5} className="muted">Isi origin & destination (kota / pelabuhan / bandara yang dikenal) untuk melihat simulasi.</td></tr>}
        </tbody>
      </table></div>
      <p className="small muted" style={{ margin: 0 }}>Animasi per stage: setiap stage diputar ±{DETIK_STAGE} detik (1×) lalu berhenti di titik serah terima; angka lead time di layar = lead time vendor yang diisi.
        * Lead time kosong diperkirakan dari jarak (truk ±450 km/hari, kapal ±420 km/hari termasuk sandar, pesawat ±1 hari termasuk handling, kereta ±500 km/hari).
        Jarak truk = jarak jalan raya OpenStreetMap (OSRM), kapal = panjang alur laut yang menghindari daratan, pesawat = great circle; bila jalur belum ditemukan dipakai garis lurus × faktor jalur. Peta = globe bumi dengan citra satelit Esri World Imagery seluruh dunia; detail bertambah otomatis saat di-zoom (seret untuk memutar, scroll untuk zoom). Bila citra gagal dimuat, garis pantai ilustrasi dipakai.</p>
    </div>);
}
