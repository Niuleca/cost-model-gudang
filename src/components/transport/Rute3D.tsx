'use client';
// Simulasi rute 3D (UAT D4): peta Indonesia bergaya (pulau disederhanakan), kota/pelabuhan/bandara, jalur per moda,
// dan armada bergerak dari origin ke destination: truk (darat), kapal (laut), pesawat (udara), kereta (kereta).
// Waktu simulasi dalam hari; durasi tiap leg = lead time (bila diisi) atau perkiraan dari jarak.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { cariLokasi, jarakLurusKm, FAKTOR_JALUR, type Lokasi } from '@/lib/lokasiIndonesia';
import type { Moda } from '@/lib/transport';

export interface Leg { moda: Moda; dari: string; ke: string; hari?: number | null; label?: string }
export interface RuteSim { nama: string; legs: Leg[] }

/** Kecepatan efektif (km/hari) termasuk bongkar muat / transit — untuk perkiraan bila lead time kosong. */
const KM_HARI: Record<Moda, number> = { darat: 450, laut: 420, udara: 2500, kereta: 500 };
const WARNA: Record<Moda, string> = { darat: '#f59e0b', laut: '#2563eb', udara: '#7c3aed', kereta: '#059669' };
const LABEL_MODA: Record<Moda, string> = { darat: 'Truk', laut: 'Kapal', udara: 'Pesawat', kereta: 'Kereta' };

// Garis pantai pulau utama (lon, lat) — sangat disederhanakan, hanya untuk orientasi.
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
const K = 4;   // unit per derajat
const ke3 = (lon: number, lat: number, y = 0) => new THREE.Vector3((lon - 118) * K, y, -(lat + 2) * K);

interface LegHitung { moda: Moda; a: Lokasi; b: Lokasi; km: number; hari: number; perkiraan: boolean; label?: string; titik: THREE.Vector3[] }

function hitungLeg(l: Leg): LegHitung | null {
  const a = cariLokasi(l.dari), b = cariLokasi(l.ke);
  if (!a || !b) return null;
  const km = Math.round(jarakLurusKm(a, b) * FAKTOR_JALUR[l.moda]);
  const hari = l.hari && l.hari > 0 ? l.hari : Math.max(l.moda === 'udara' ? 1 : 0.25, km / KM_HARI[l.moda]);
  const p0 = ke3(a.lon, a.lat, 0.25), p1 = ke3(b.lon, b.lat, 0.25);
  const n = 40, titik: THREE.Vector3[] = [];
  const pj = p0.distanceTo(p1);
  const tinggi = l.moda === 'udara' ? Math.max(3, pj * 0.25) : 0;
  // laut: lengkung sedikit menjauhi daratan (tegak lurus arah), udara: busur tinggi
  // laut: lengkung ke arah utara (Laut Jawa / jalur pelayaran di utara pulau-pulau besar), bukan memotong daratan
  const tegak = new THREE.Vector3(-(p1.z - p0.z), 0, p1.x - p0.x).normalize();
  if (tegak.z > 0) tegak.negate();
  tegak.multiplyScalar(l.moda === 'laut' ? pj * 0.1 : 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n, s = Math.sin(Math.PI * u);
    titik.push(new THREE.Vector3().lerpVectors(p0, p1, u).addScaledVector(tegak, s).setY(0.25 + tinggi * s));
  }
  return { moda: l.moda, a, b, km, hari, perkiraan: !(l.hari && l.hari > 0), label: l.label, titik };
}

function modelArmada(m: Moda) {
  const g = new THREE.Group();
  const mt = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const kotak = (sx: number, sy: number, sz: number, c: string, x = 0, y = 0, z = 0) => { const k = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mt(c)); k.position.set(x, y, z); g.add(k); return k; };
  if (m === 'darat') { kotak(1.4, 0.7, 0.6, '#f8fafc', -0.2, 0.45, 0); kotak(0.45, 0.55, 0.58, WARNA.darat, 0.75, 0.38, 0); }
  else if (m === 'kereta') { kotak(1.0, 0.4, 0.5, WARNA.kereta, 0.7, 0.3, 0); kotak(1.0, 0.5, 0.5, '#e5e7eb', -0.4, 0.35, 0); kotak(1.0, 0.5, 0.5, '#e5e7eb', -1.5, 0.35, 0); }
  else if (m === 'laut') { kotak(2.6, 0.45, 0.9, '#1e3a8a', 0, 0.2, 0); kotak(0.5, 0.6, 0.7, '#f8fafc', -0.9, 0.7, 0); kotak(1.2, 0.4, 0.7, '#f97316', 0.4, 0.62, 0); }
  else { kotak(2.0, 0.35, 0.35, '#f8fafc', 0, 0, 0); kotak(0.5, 0.06, 2.4, WARNA.udara, 0.1, 0, 0); kotak(0.3, 0.5, 0.06, WARNA.udara, -0.9, 0.25, 0); }
  return g;
}

export default function Rute3D({ rute, tinggi = 460 }: { rute: RuteSim[]; tinggi?: number }) {
  const wadah = useRef<HTMLDivElement>(null);
  const [jalan, setJalan] = useState(true);
  const [kec, setKec] = useState(1);        // hari simulasi per detik
  const [hari, setHari] = useState(0);
  const kontrol = useRef({ jalan: true, kec: 1, t: 0 });
  kontrol.current.jalan = jalan; kontrol.current.kec = kec;
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
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement);
    const lr = new CSS2DRenderer(); lr.setSize(el.clientWidth, el.clientHeight);
    Object.assign(lr.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' }); el.appendChild(lr.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#dbeafe');
    const cam = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 2000);
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.47;
    scene.add(new THREE.HemisphereLight('#ffffff', '#93c5fd', 1.1));
    const sun = new THREE.DirectionalLight('#ffffff', 1.2); sun.position.set(-40, 80, 40); scene.add(sun);
    // laut
    const laut = new THREE.Mesh(new THREE.PlaneGeometry(260, 110), new THREE.MeshStandardMaterial({ color: '#7dd3fc', roughness: 0.8 }));
    laut.rotation.x = -Math.PI / 2; laut.position.set(ke3(118, -2).x, 0, ke3(118, -2).z); scene.add(laut);
    // pulau (ekstrusi tipis)
    const mPulau = new THREE.MeshStandardMaterial({ color: '#86efac', roughness: 0.9 });
    for (const p of PULAU) {
      const sh = new THREE.Shape(p.map(([lon, lat]) => new THREE.Vector2((lon - 118) * K, (lat + 2) * K)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
      const m = new THREE.Mesh(geo, mPulau); m.rotation.x = -Math.PI / 2; scene.add(m);
    }
    const label = (teks: string, kelas: string) => { const d = document.createElement('div'); d.className = `rute3d-label ${kelas}`; d.textContent = teks; return new CSS2DObject(d); };
    // titik lokasi yang dipakai rute
    const dipakai = new Map<string, Lokasi>();
    for (const r of data) for (const l of r.legs) { dipakai.set(l.a.nama, l.a); dipakai.set(l.b.nama, l.b); }
    for (const l of dipakai.values()) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 16), new THREE.MeshStandardMaterial({ color: l.jenis === 'pelabuhan' ? '#1d4ed8' : l.jenis === 'bandara' ? '#7c3aed' : '#dc2626' }));
      pin.position.copy(ke3(l.lon, l.lat, 0.8)); scene.add(pin);
      const lb = label(l.nama, l.jenis); lb.position.copy(ke3(l.lon, l.lat, 2.2)); scene.add(lb);
    }
    // jalur & armada
    const armada: { obj: THREE.Group; r: (typeof data)[number] }[] = [];
    for (const r of data) {
      for (const l of r.legs) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(l.titik), 60, 0.12, 6), new THREE.MeshStandardMaterial({ color: WARNA[l.moda], transparent: true, opacity: 0.85 }));
        scene.add(tube);
      }
      const obj = new THREE.Group(); scene.add(obj);
      armada.push({ obj, r });
    }
    // kamera: muat semua titik
    const box = new THREE.Box3();
    for (const r of data) for (const l of r.legs) for (const p of l.titik) box.expandByPoint(p);
    if (box.isEmpty()) box.setFromCenterAndSize(ke3(113, -5), new THREE.Vector3(60, 1, 30));
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const jarak = Math.max(25, Math.max(s.x, s.z) * 1.1);
    ctl.target.copy(c); cam.position.set(c.x - jarak * 0.15, jarak * 0.8, c.z + jarak * 0.75); ctl.update();
    const skala = Math.max(1, jarak / 30);   // armada tetap terlihat saat peta di-zoom jauh
    for (const a of armada) a.obj.scale.setScalar(skala);
    const ro = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); lr.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); });
    ro.observe(el);
    let id = 0, lalu = performance.now(), tampilLalu = 0;
    const modelCache = new Map<string, THREE.Group>();
    const loop = (kini: number) => {
      id = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (kini - lalu) / 1000); lalu = kini;
      const k = kontrol.current;
      if (k.jalan) { k.t += dt * k.kec; if (k.t > maksHari + 0.6) k.t = 0; }
      for (const a of armada) {
        let sisa = Math.min(k.t, a.r.total), leg = a.r.legs[0];
        for (const l of a.r.legs) { leg = l; if (sisa <= l.hari) break; sisa -= l.hari; }
        if (!leg) continue;
        const u = Math.max(0, Math.min(1, sisa / leg.hari));
        const kurva = (leg as LegHitung & { _k?: THREE.CatmullRomCurve3 })._k ??= new THREE.CatmullRomCurve3(leg.titik);
        const p = kurva.getPointAt(u), q = kurva.getPointAt(Math.min(1, u + 0.01));
        const kunciM = `${a.r.nama}-${leg.moda}`;
        if (a.obj.userData.moda !== kunciM) { const mdl = modelCache.get(leg.moda) ?? modelArmada(leg.moda); modelCache.set(leg.moda, mdl); a.obj.clear(); a.obj.add(mdl.clone()); a.obj.userData.moda = kunciM; }
        a.obj.position.copy(p).setY(p.y + (leg.moda === 'udara' ? 0.3 : 0.15));
        a.obj.lookAt(q.x, a.obj.position.y + (q.y - p.y), q.z); a.obj.rotateY(-Math.PI / 2);
      }
      if (kini - tampilLalu > 200) { tampilLalu = kini; setHari(k.t); }
      ctl.update(); renderer.render(scene, cam); lr.render(scene, cam);
    };
    id = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(id); ro.disconnect(); ctl.dispose();
      scene.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => x.dispose()); });
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
        <b>Hari ke-{Math.min(hari, maksHari).toLocaleString('id-ID', { maximumFractionDigits: 1 })}</b> <span className="muted">dari {fmtHari(maksHari)}</span>
        <span className="row" style={{ gap: 10, marginLeft: 'auto' }}>{(Object.keys(WARNA) as Moda[]).map(m => <span key={m}><i style={{ display: 'inline-block', width: 14, height: 4, background: WARNA[m], verticalAlign: 'middle', marginRight: 4 }} />{LABEL_MODA[m]}</span>)}</span>
      </div>
      <div ref={wadah} className="rute3d-wadah" style={{ height: tinggi }} />
      <div className="tablewrap fit"><table className="tabel-fit">
        <thead><tr><th>Rute</th><th>Leg</th><th className="num">Jarak</th><th className="num">Lead time</th><th>Status saat ini</th></tr></thead>
        <tbody>{data.map(r => {
          let sisa = Math.min(hari, r.total); let aktif = -1;
          r.legs.forEach((l, i) => { if (aktif < 0 && sisa <= l.hari) aktif = i; else if (aktif < 0) sisa -= l.hari; });
          const selesai = hari >= r.total;
          return r.legs.map((l, i) => (
            <tr key={`${r.nama}-${i}`}>
              {i === 0 && <td rowSpan={r.legs.length}><b>{r.nama}</b><div className="small muted">{r.km.toLocaleString('id-ID')} km · {fmtHari(r.total)}</div>{r.gagal.length > 0 && <div className="small" style={{ color: 'var(--bad)' }}>Lokasi belum dikenal: {r.gagal.join(', ')}</div>}</td>}
              <td><span style={{ color: WARNA[l.moda], fontWeight: 600 }}>{LABEL_MODA[l.moda]}</span> {l.label ? `${l.label} · ` : ''}{l.a.nama} → {l.b.nama}</td>
              <td className="num">±{l.km.toLocaleString('id-ID')} km</td>
              <td className="num">{fmtHari(l.hari)}{l.perkiraan ? <span className="small muted"> (perkiraan)</span> : ''}</td>
              <td className="small">{selesai ? '✓ tiba' : i === aktif ? `● ${LABEL_MODA[l.moda]} dalam perjalanan (${Math.round((sisa / l.hari) * 100)}%)` : i < aktif ? '✓ selesai' : 'menunggu'}</td>
            </tr>));
        })}
        {data.every(r => !r.legs.length) && <tr><td colSpan={5} className="muted">Isi origin & destination (kota / pelabuhan / bandara yang dikenal) untuk melihat simulasi.</td></tr>}
        </tbody>
      </table></div>
      <p className="small muted" style={{ margin: 0 }}>Peta & jarak bergaya (garis pantai disederhanakan, jarak = garis lurus × faktor jalur). Lead time memakai isian vendor bila ada; bila kosong diperkirakan dari jarak (truk ±450 km/hari, kapal ±420 km/hari termasuk sandar, pesawat ±1 hari termasuk handling, kereta ±500 km/hari).</p>
    </div>);
}
