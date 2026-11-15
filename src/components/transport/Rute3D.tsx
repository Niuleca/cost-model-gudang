'use client';
// Simulasi rute 3D per stage (transport & intermodal).
// - Peta: citra satelit (Esri World Imagery, dimuat di browser) di atas peta ilustrasi sebagai cadangan; lapisan detail
//   zoom tinggi otomatis untuk leg pendek (mis. pickup kota → bandara) supaya tetap tajam saat kamera mendekat.
// - Animasi satu per satu: Stage 1 truk origin → bandara / pelabuhan, Stage 2 pesawat / kapal / kereta port → port,
//   Stage 3 truk ke destination. Kamera otomatis membingkai stage aktif (top view default, bisa 3D miring),
//   panel HUD menampilkan stage, armada, rute, lead time & progres.
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

export interface Leg { moda: Moda; dari: string; ke: string; hari?: number | null; label?: string; armada?: string }
export interface RuteSim { nama: string; legs: Leg[] }

/** Kecepatan efektif (km/hari) termasuk bongkar muat / transit — untuk perkiraan bila lead time kosong. */
const KM_HARI: Record<Moda, number> = { darat: 450, laut: 420, udara: 2500, kereta: 500 };
const WARNA: Record<Moda, string> = { darat: '#f59e0b', laut: '#0ea5e9', udara: '#a855f7', kereta: '#10b981' };
const LABEL_MODA: Record<Moda, string> = { darat: 'Truk', laut: 'Kapal', udara: 'Pesawat', kereta: 'Kereta' };
const IKON_MODA: Record<Moda, string> = { darat: '🚚', laut: '🚢', udara: '✈️', kereta: '🚆' };
const IKON_LOKASI: Record<string, string> = { kota: '🏭', pelabuhan: '⚓', bandara: '✈' };
const DETIK_STAGE = 7;     // durasi animasi satu stage pada kecepatan 1×
const JEDA = 1.4;          // jeda di titik serah terima antar stage (detik)
const K = 4;               // unit per derajat
const G = 0.05;            // tinggi permukaan peta
const YJALUR = G + 0.03;
const ke3 = (lon: number, lat: number, y = 0) => new THREE.Vector3((lon - 118) * K, y, -(lat + 2) * K);
function acak(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const hashTeks = (t: string) => Array.from(t).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

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


// ---------------- Leg ----------------
interface LegHitung { idx: number; moda: Moda; a: Lokasi; b: Lokasi; km: number; hari: number; perkiraan: boolean; label?: string; armada?: string; titik: THREE.Vector3[]; kurva: THREE.CatmullRomCurve3 }

function hitungLeg(l: Leg, idx: number): LegHitung | null {
  const a = cariLokasi(l.dari), b = cariLokasi(l.ke);
  if (!a || !b || a.nama === b.nama) return null;
  const km = Math.round(jarakLurusKm(a, b) * FAKTOR_JALUR[l.moda]);
  const hari = l.hari && l.hari > 0 ? l.hari : Math.max(l.moda === 'udara' ? 1 : 0.25, km / KM_HARI[l.moda]);
  const p0 = ke3(a.lon, a.lat, YJALUR), p1 = ke3(b.lon, b.lat, YJALUR);
  const n = 80, titik: THREE.Vector3[] = [];
  const pj = p0.distanceTo(p1);
  const tinggi = l.moda === 'udara' ? Math.max(0.5, pj * 0.16) : 0;
  const tegak = new THREE.Vector3(-(p1.z - p0.z), 0, p1.x - p0.x).normalize();
  if (tegak.z > 0) tegak.negate();
  // laut: lengkung ke utara (alur pelayaran); darat / kereta: sedikit berkelok supaya terbaca sebagai jalan
  const r = acak(hashTeks(a.nama + b.nama));
  const kelok = l.moda === 'darat' || l.moda === 'kereta' ? [r() - 0.5, r() - 0.5].map(x => x * pj * 0.12) : [0, 0];
  for (let i = 0; i <= n; i++) {
    const u = i / n, s = Math.sin(Math.PI * u);
    const off = l.moda === 'laut' ? pj * 0.1 * s : kelok[0] * Math.sin(Math.PI * u) + kelok[1] * Math.sin(2 * Math.PI * u);
    titik.push(new THREE.Vector3().lerpVectors(p0, p1, u).addScaledVector(tegak, off).setY(YJALUR + tinggi * s));
  }
  return { idx, moda: l.moda, a, b, km, hari, perkiraan: !(l.hari && l.hari > 0), label: l.label, armada: l.armada, titik, kurva: new THREE.CatmullRomCurve3(titik) };
}

// ---------------- Citra satelit (tile XYZ Web Mercator) ----------------
const URL_TILE = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const tileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const tileY = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
const lonTile = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const latTile = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
interface Kotak { lon0: number; lat0: number; lon1: number; lat1: number }
const muatGambar = (src: string) => new Promise<HTMLImageElement>((ok, gagal) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => ok(im); im.onerror = gagal; im.src = src; });

/** Mesh peta satelit untuk kotak lon/lat: zoom tertinggi yang muat dalam maks×maks tile. null bila tile gagal dimuat. */
async function petaSatelit(k: Kotak, y: number, maks = 7, zMaks = 16): Promise<{ mesh: THREE.Mesh; z: number } | null> {
  let z = zMaks;
  for (; z > 2; z--) {
    const nx = Math.floor(tileX(k.lon1, z)) - Math.floor(tileX(k.lon0, z)) + 1, ny = Math.floor(tileY(k.lat0, z)) - Math.floor(tileY(k.lat1, z)) + 1;
    if (nx <= maks && ny <= maks) break;
  }
  const x0 = Math.floor(tileX(k.lon0, z)), x1 = Math.floor(tileX(k.lon1, z)), y0 = Math.floor(tileY(k.lat1, z)), y1 = Math.floor(tileY(k.lat0, z));
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1;
  const c = document.createElement('canvas'); c.width = nx * 256; c.height = ny * 256; const g = c.getContext('2d')!;
  g.fillStyle = '#1d3b5a'; g.fillRect(0, 0, c.width, c.height);
  const kerja: Promise<boolean>[] = [];
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++)
    kerja.push(muatGambar(URL_TILE(z, tx, ty)).then(im => { g.drawImage(im, (tx - x0) * 256, (ty - y0) * 256); return true; }).catch(() => false));
  const hasil = await Promise.all(kerja);
  if (!hasil.some(Boolean)) return null;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  // grid: u linear di lon, v linear di tile-y (Mercator) → lat dihitung per baris
  const seg = 40, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const lonA = lonTile(x0, z), lonB = lonTile(x1 + 1, z);
  for (let j = 0; j <= seg; j++) {
    const v = j / seg, lat = latTile(y0 + v * ny, z);
    for (let i = 0; i <= 1; i++) { const p = ke3(lonA + (lonB - lonA) * i, lat, y); pos.push(p.x, p.y, p.z); uv.push(i, 1 - v); }
    if (j < seg) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { mesh, z };
}
const kotakDari = (pts: { lon: number; lat: number }[], pad: number, minimum: number): Kotak => {
  const lon = pts.map(p => p.lon), lat = pts.map(p => p.lat);
  let lon0 = Math.min(...lon), lon1 = Math.max(...lon), lat0 = Math.min(...lat), lat1 = Math.max(...lat);
  const sx = Math.max(minimum, (lon1 - lon0) * (1 + pad * 2)), sy = Math.max(minimum, (lat1 - lat0) * (1 + pad * 2));
  const cx = (lon0 + lon1) / 2, cy = (lat0 + lat1) / 2;
  lon0 = cx - sx / 2; lon1 = cx + sx / 2; lat0 = cy - sy / 2; lat1 = cy + sy / 2;
  return { lon0, lat0, lon1, lat1 };
};

// ---------------- Garis rute tegas (lebar dalam piksel layar) ----------------
function garis(titik: THREE.Vector3[], warna: string, px: number, opsi: { putus?: number; opacity?: number } = {}) {
  const geo = new LineGeometry(); geo.setPositions(titik.flatMap(p => [p.x, p.y, p.z]));
  const mat = new LineMaterial({ color: warna, linewidth: px, worldUnits: false, transparent: true, opacity: opsi.opacity ?? 1, dashed: !!opsi.putus,
    dashSize: opsi.putus ?? 1, gapSize: (opsi.putus ?? 1) * 0.8, depthWrite: false });
  const l = new Line2(geo, mat); l.computeLineDistances(); l.renderOrder = 5;
  return l;
}

type Tampilan = 'atas' | 'miring';
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
  const [hud, setHud] = useState<StatusHud>({ t: 0, stage: 0, u: 0, hariRute: [] });
  const kontrol = useRef({ jalan: true, kec: 1, t: 0, fokus: -1, tampilan: 'atas' as Tampilan, kameraAuto: true, satelit: true, manualSampai: 0, lompat: true });
  Object.assign(kontrol.current, { jalan, kec, fokus, kameraAuto, satelit });
  if (kontrol.current.tampilan !== tampilan) { kontrol.current.tampilan = tampilan; kontrol.current.lompat = true; kontrol.current.manualSampai = 0; }

  const data = useMemo(() => rute.map(r => {
    const legs = r.legs.map((l, i) => hitungLeg(l, i));
    const ok = legs.filter((x): x is LegHitung => !!x);
    return { nama: r.nama, legs: ok, gagal: r.legs.filter((_, i) => !legs[i]).map(l => `${l.dari || '?'} → ${l.ke || '?'}`), total: ok.reduce((t, x) => t + x.hari, 0), km: ok.reduce((t, x) => t + x.km, 0) };
  }), [rute]);
  const nStage = Math.max(0, ...data.map(d => d.legs.length));
  const kunci = JSON.stringify(rute);
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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; el.appendChild(renderer.domElement);
    const lr = new CSS2DRenderer(); lr.setSize(el.clientWidth, el.clientHeight);
    Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' }); el.appendChild(lr.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#cfdcea');
    const cam = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.01, 4000);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.45; ctl.minDistance = 0.3; ctl.maxDistance = 600;
    ctl.addEventListener('start', () => { kontrol.current.manualSampai = performance.now() + 6000; });
    scene.add(new THREE.HemisphereLight('#f0f9ff', '#5a6b4a', 1.1));
    const sun = new THREE.DirectionalLight('#fff7e6', 2.4); sun.position.set(-60, 140, 60); scene.add(sun);

    // ---- peta ilustrasi (cadangan bila citra satelit gagal / dimatikan)
    const ilustrasi = new THREE.Group(); scene.add(ilustrasi);
    const tLaut = teksturLaut();
    const laut = new THREE.Mesh(new THREE.PlaneGeometry(330, 150), new THREE.MeshStandardMaterial({ map: tLaut, roughness: 0.32, metalness: 0.15 }));
    laut.rotation.x = -Math.PI / 2; laut.position.set(ke3(118, -2).x, 0, ke3(118, -2).z); ilustrasi.add(laut);
    const mDangkal = new THREE.MeshStandardMaterial({ color: '#5cb8d6', roughness: 0.4, transparent: true, opacity: 0.85 });
    const mPantai = new THREE.MeshStandardMaterial({ color: '#e6d6a3', roughness: 0.95 });
    const mDarat = new THREE.MeshStandardMaterial({ color: '#6a9e55', roughness: 0.95 });
    for (const p of PULAU) {
      const dangkal = new THREE.Mesh(new THREE.ShapeGeometry(bentuk(p, 0.22)), mDangkal); dangkal.rotation.x = -Math.PI / 2; dangkal.position.y = 0.006; ilustrasi.add(dangkal);
      const pantai = new THREE.Mesh(new THREE.ShapeGeometry(bentuk(p, 0.05)), mPantai); pantai.rotation.x = -Math.PI / 2; pantai.position.y = 0.012; ilustrasi.add(pantai);
      const darat = new THREE.Mesh(new THREE.ExtrudeGeometry(bentuk(p, -0.02), { depth: G - 0.015, bevelEnabled: false }), mDarat); darat.rotation.x = -Math.PI / 2; ilustrasi.add(darat);
    }

    // ---- citra satelit: dasar (seluruh rute) + detail per leg pendek
    const lapisSatelit = new THREE.Group(); scene.add(lapisSatelit);
    let batal = false;
    const semuaLok = data.flatMap(r => r.legs.flatMap(l => [l.a, l.b]));
    (async () => {
      if (!semuaLok.length) { setInfoPeta('gagal'); return; }
      const kb = kotakDari(semuaLok, 0.6, 1.6);
      const lebarMin = (kb.lat1 - kb.lat0) * 1.9;   // lebarkan supaya layar lebar (16:9) tertutup citra
      if (kb.lon1 - kb.lon0 < lebarMin) { const cx = (kb.lon0 + kb.lon1) / 2; kb.lon0 = cx - lebarMin / 2; kb.lon1 = cx + lebarMin / 2; }
      const dasar = await petaSatelit(kb, G + 0.001, 10, 9);
      if (batal) return;
      if (!dasar) { setInfoPeta('gagal'); return; }
      lapisSatelit.add(dasar.mesh); setInfoPeta('ok');
      let n = 0;
      const sudah = new Set<string>();
      for (const r of data) for (const l of r.legs) {
        const key = `${l.a.nama}|${l.b.nama}`; if (sudah.has(key)) continue; sudah.add(key);
        if (l.km > 400) continue;
        const det = await petaSatelit(kotakDari([l.a, l.b], 0.45, 0.12), G + 0.002 + 0.0005 * ++n, 7, 16);
        if (batal) return;
        if (det && det.z > dasar.z + 1) lapisSatelit.add(det.mesh); else det?.mesh.geometry.dispose();
      }
    })();

    // ---- lokasi: pin label (ikon + nama)
    const pin = (l: Lokasi) => {
      const d = document.createElement('div'); d.className = `rute3d-pin ${l.jenis}`;
      d.innerHTML = `<span class="ikon">${IKON_LOKASI[l.jenis] ?? '📍'}</span><span>${l.nama.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
      const o = new CSS2DObject(d); o.position.copy(ke3(l.lon, l.lat, YJALUR)); o.center.set(0.5, 1.15); return o;
    };
    const dipakai = new Map<string, Lokasi>();
    for (const r of data) for (const l of r.legs) { dipakai.set(l.a.nama, l.a); dipakai.set(l.b.nama, l.b); }
    const titikLok: THREE.Mesh[] = [];
    for (const l of dipakai.values()) {
      scene.add(pin(l));
      const warna = l.jenis === 'pelabuhan' ? '#1d4ed8' : l.jenis === 'bandara' ? '#7c3aed' : '#dc2626';
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 24), new THREE.MeshBasicMaterial({ color: warna, transparent: true, opacity: 0.9 }));
      m.position.copy(ke3(l.lon, l.lat, YJALUR)); scene.add(m); titikLok.push(m);
    }

    // ---- jalur: casing putih + garis warna moda (tegas), panah gerak putus-putus untuk laut & udara
    const jalur: { stage: number; mats: LineMaterial[]; dash?: LineMaterial }[] = [];
    for (const r of data) for (const l of r.legs) {
      const pj = l.kurva.getLength();
      const casing = garis(l.titik, '#ffffff', l.moda === 'udara' ? 12 : 9, { opacity: 0.95 });
      const inti = garis(l.titik, l.moda === 'udara' ? '#9333ea' : WARNA[l.moda], l.moda === 'udara' ? 8 : 6);
      scene.add(casing, inti);
      const ent: (typeof jalur)[number] = { stage: l.idx, mats: [casing.material, inti.material] };
      if (l.moda !== 'darat') {
        const d = garis(l.titik, '#ffffff', 2, { putus: pj / 50, opacity: 0.8 }); d.renderOrder = 6; scene.add(d);
        ent.dash = d.material; ent.mats.push(d.material);
      }
      jalur.push(ent);
    }

    // ---- armada
    const tBayang = teksturBayang(), tBuih = teksturBuih();
    const armada = data.map(r => {
      const obj = new THREE.Group(); scene.add(obj);
      const bayang = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: tBayang, transparent: true, opacity: 0.45, depthWrite: false }));
      bayang.rotation.x = -Math.PI / 2; bayang.visible = false; scene.add(bayang);
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
      // halo warna moda di bawah armada supaya tetap terlihat jelas di atas citra satelit (top view)
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

    // ---- kamera: bingkai stage aktif
    const bingkaiStage = (s: number) => {
      const box = new THREE.Box3();
      for (const r of data) for (const l of r.legs) if (l.idx === s || (s < 0)) for (const p of l.titik) box.expandByPoint(p.clone().setY(G));
      if (box.isEmpty()) for (const r of data) for (const l of r.legs) for (const p of l.titik) box.expandByPoint(p.clone().setY(G));
      if (box.isEmpty()) box.setFromCenterAndSize(ke3(113, -5), new THREE.Vector3(60, 0, 30));
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2;
      const jarak = Math.max(0.8, Math.max(sz.z / tan, sz.x / (tan * cam.aspect * 0.62)) * 1.3);
      const arah = kontrol.current.tampilan === 'atas' ? new THREE.Vector3(0, 1, 0.03).normalize() : new THREE.Vector3(-0.15, 0.78, 0.62).normalize();
      return { target: c, pos: c.clone().addScaledVector(arah, jarak) };
    };
    const b0 = bingkaiStage(-1); ctl.target.copy(b0.target); cam.position.copy(b0.pos); ctl.update();

    let lebar = el.clientWidth, tinggiEl = el.clientHeight;
    const semuaMat = () => jalur.flatMap(j => j.mats);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; lebar = w; tinggiEl = h;
      renderer.setSize(w, h); lr.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); for (const m of semuaMat()) m.resolution.set(w, h);
    });
    ro.observe(el); for (const m of semuaMat()) m.resolution.set(lebar, tinggiEl);

    const fmt = (x: number) => x.toLocaleString('id-ID', { maximumFractionDigits: 1 });
    let id = 0, lalu = performance.now(), tampilLalu = 0;
    const loop = (kini: number) => {
      id = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (kini - lalu) / 1000); lalu = kini;
      const k = kontrol.current;
      const panjangLoop = k.fokus >= 0 ? DETIK_STAGE + JEDA + 0.6 : nStage * (DETIK_STAGE + JEDA) + 1;
      if (k.jalan) { k.t += dt * k.kec; if (k.t > panjangLoop) k.t = 0; }
      const { stage, u } = faseRef.current(k.t, k.fokus);
      tLaut.offset.x = (tLaut.offset.x + dt * 0.004) % 1;
      lapisSatelit.visible = k.satelit;
      // jalur: stage aktif tegas, lainnya redup; putus-putus bergerak searah perjalanan
      for (const j of jalur) {
        const aktif = j.stage === stage;
        j.mats.forEach((m, i) => { m.opacity = (aktif ? 1 : 0.38) * (i === 0 ? 0.95 : 1); });
        if (j.dash) j.dash.dashOffset -= dt * j.dash.dashSize * 2.2;
      }
      const jarakKam = cam.position.distanceTo(ctl.target);
      for (const m of titikLok) m.scale.set(jarakKam * 0.008, 1, jarakKam * 0.008);
      const hariRute: number[] = [];
      for (const a of armada) {
        const legs = a.r.legs;
        if (!legs.length) { a.obj.visible = false; a.tag.visible = false; hariRute.push(0); continue; }
        // leg aktif rute ini: indeks stage asli yang paling dekat ≤ stage
        let li = legs.findIndex(l => l.idx === stage);
        let uu = u;
        if (li < 0) { li = Math.max(0, legs.filter(l => l.idx < stage).length - 1); uu = legs[li].idx < stage ? 1 : 0; }
        const leg = legs[li];
        hariRute.push(legs.slice(0, li).reduce((t, l) => t + l.hari, 0) + uu * leg.hari);
        const p = leg.kurva.getPointAt(uu), q = leg.kurva.getPointAt(Math.min(1, uu + 0.01)), q0 = leg.kurva.getPointAt(Math.max(0, uu - 0.01));
        const j = jenisArmada(leg.moda, leg.armada);
        const kunciM = `${leg.moda}-${j}-${siap.has(j) ? 'glb' : 'kotak'}`;
        if (a.obj.userData.model !== kunciM) { a.obj.clear(); a.obj.add(buatModel(leg, j)); a.obj.userData.model = kunciM; }
        a.obj.visible = true;
        a.obj.position.copy(p);
        const arah = uu >= 1 ? new THREE.Vector3().subVectors(p, q0) : new THREE.Vector3().subVectors(q, p);
        a.obj.lookAt(p.x + arah.x, p.y + arah.y, p.z + arah.z); a.obj.rotateY(-Math.PI / 2);
        const sk = THREE.MathUtils.clamp(cam.position.distanceTo(p) * (leg.moda === 'laut' ? 0.035 : leg.moda === 'udara' ? 0.05 : 0.065), 0.01, 6);
        a.obj.scale.setScalar(sk);
        if (leg.moda === 'laut') a.obj.position.y += Math.sin(kini / 600 + p.x) * 0.02 * sk;
        a.bayang.visible = leg.moda === 'udara';
        if (a.bayang.visible) { a.bayang.position.set(p.x, G + 0.004, p.z); a.bayang.scale.setScalar(sk); (a.bayang.material as THREE.MeshBasicMaterial).opacity = 0.4; }
        a.tag.position.copy(p); a.tag.visible = true;
        const status = uu >= 1 ? 'tiba' : uu <= 0 ? 'menunggu' : `${Math.round(uu * 100)}%`;
        const isi = `<b>${IKON_MODA[leg.moda]} Stage ${leg.idx + 1}${leg.label ? ` · ${leg.label}` : ''}</b><span>${leg.armada ?? LABEL_MODA[leg.moda]} · ${status}</span><span>Lead time ${fmt(uu * leg.hari)} / ${fmt(leg.hari)} hari${leg.perkiraan ? '*' : ''}</span>`;
        if (a.el.innerHTML !== isi) a.el.innerHTML = isi;
        a.el.style.opacity = data.length > 1 && armada.indexOf(a) > 0 ? '0.85' : '1';
      }
      // kamera otomatis: bingkai stage aktif (dijeda 6 detik setelah pengguna menggeser / zoom)
      if ((k.kameraAuto && kini > k.manualSampai) || k.lompat) {
        const b = bingkaiStage(stage);
        const f = k.lompat ? 1 : 1 - Math.exp(-dt * 2.2);
        ctl.target.lerp(b.target, f); cam.position.lerp(b.pos, f); k.lompat = false;
      }
      if (kini - tampilLalu > 150) { tampilLalu = kini; setHud({ t: k.t, stage, u, hariRute }); }
      ctl.update();
      const dk = cam.position.distanceTo(ctl.target);
      const near = Math.max(0.005, dk * 0.02), far = Math.max(50, dk * 40);
      if (Math.abs(cam.near - near) > near * 0.2 || Math.abs(cam.far - far) > far * 0.2) { cam.near = near; cam.far = far; cam.updateProjectionMatrix(); }
      renderer.render(scene, cam); lr.render(scene, cam);
    };
    id = requestAnimationFrame(loop);
    return () => {
      batal = true; cancelAnimationFrame(id); ro.disconnect(); ctl.dispose();
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
        </div>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={kameraAuto} onChange={e => { setKameraAuto(e.target.checked); kontrol.current.manualSampai = 0; }} /> Kamera ikut stage</label>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={satelit} onChange={e => setSatelit(e.target.checked)} /> Citra satelit</label>
        <button type="button" className="ghost" onClick={layarPenuh}>⛶ Layar penuh</button>
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
          {(infoPeta === 'muat' && satelit) && <span className="muted">memuat citra satelit…</span>}{muatModel && <span className="muted">memuat model 3D…</span>}</div>
        <div className="rute3d-atribusi">{satelit && infoPeta === 'ok' ? 'Citra © Esri, Maxar, Earthstar Geographics' : infoPeta === 'gagal' && satelit ? 'Citra satelit tidak dapat dimuat — peta ilustrasi' : 'Peta ilustrasi'} · Model 3D: Meshy</div>
      </div>
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Rute</th><th>Stage</th><th className="num">Jarak</th><th className="num">Lead time</th><th>Status saat ini</th></tr></thead>
        <tbody>{data.map((r, ri) => r.legs.length ? r.legs.map((l, i) => {
          const st = l.idx < hud.stage || (l.idx === hud.stage && hud.u >= 1) ? '✓ selesai' : l.idx === hud.stage ? `● ${LABEL_MODA[l.moda]} dalam perjalanan (${Math.round(hud.u * 100)}%)` : 'menunggu';
          return (
            <tr key={`${r.nama}-${i}`} className={l.idx === hud.stage ? 'aktif' : undefined}>
              {i === 0 && <td rowSpan={r.legs.length}><b>{r.nama}</b><div className="small muted">{r.km.toLocaleString('id-ID')} km · {fmtHari(r.total)} · hari ke-{(hud.hariRute[ri] ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 1 })}</div>{r.gagal.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Lokasi belum dikenal: {r.gagal.join(', ')}</div>}</td>}
              <td><span style={{ color: WARNA[l.moda], fontWeight: 600 }}>{IKON_MODA[l.moda]} {namaStage(l)}</span> · {l.armada ? `${l.armada} · ` : ''}{l.a.nama} → {l.b.nama}</td>
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
        Jarak = garis lurus × faktor jalur. Citra satelit dimuat langsung dari Esri World Imagery di browser; bila gagal, peta ilustrasi dipakai.</p>
    </div>);
}
