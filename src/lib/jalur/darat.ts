// Rute truk mengikuti jalan raya: OSRM (OpenStreetMap, router.project-osrm.org) dipanggil dari browser,
// hasil disederhanakan & disimpan di localStorage supaya tidak meminta ulang. Rute dengan penyeberangan ferry tetap diikuti.
import { kmHaversine, type LonLat } from './laut';

const KUNCI = 'leca-jalan:v1:';
const bulat = (p: LonLat) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;

/** Ramer–Douglas–Peucker sederhana (toleransi derajat). */
export function sederhanakan(ps: LonLat[], tol = 0.0015): LonLat[] {
  if (ps.length < 3) return ps;
  const tetap = new Uint8Array(ps.length); tetap[0] = tetap[ps.length - 1] = 1;
  const tumpuk: [number, number][] = [[0, ps.length - 1]];
  while (tumpuk.length) {
    const [a, b] = tumpuk.pop()!; let maks = 0, idx = -1;
    const [x1, y1] = ps[a], [x2, y2] = ps[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * ps[i][0] - dx * ps[i][1] + x2 * y1 - y2 * x1) / L; if (d > maks) { maks = d; idx = i; } }
    if (maks > tol && idx > 0) { tetap[idx] = 1; tumpuk.push([a, idx], [idx, b]); }
  }
  return ps.filter((_, i) => tetap[i]);
}

export interface JalurDarat { jalur: LonLat[]; km: number }
let antre: Promise<unknown> = Promise.resolve();

/** Rute jalan raya a → b; null bila tidak ada jalur darat (beda pulau tanpa ferry) atau layanan tidak bisa dihubungi. */
export function ruteDarat(a: LonLat, b: LonLat): Promise<JalurDarat | null> {
  const k = KUNCI + bulat(a) + ';' + bulat(b);
  try { const x = localStorage.getItem(k); if (x) return Promise.resolve(JSON.parse(x) as JalurDarat | null); } catch { /* storage tidak tersedia */ }
  // antre berurutan (kebijakan server demo OSRM: ±1 permintaan / detik)
  const kerja = antre.then(async () => {
    const ctl = new AbortController(); const waktu = setTimeout(() => ctl.abort(), 10000);
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=full&geometries=geojson&steps=false`;
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) return null;
      const j = await r.json() as { code: string; routes?: { distance: number; geometry: { coordinates: LonLat[] }; legs?: unknown[] }[] };
      const rt = j.code === 'Ok' ? j.routes?.[0] : undefined;
      let hasil: JalurDarat | null = null;
      if (rt) {
        const jalur = sederhanakan(rt.geometry.coordinates);
        hasil = { jalur: [a, ...jalur, b], km: Math.round(rt.distance / 1000) };
      } else if (j.code === 'NoRoute') hasil = null;
      try { localStorage.setItem(k, JSON.stringify(hasil)); } catch { /* penuh */ }
      return hasil;
    } catch { return null; } finally { clearTimeout(waktu); await new Promise(res => setTimeout(res, 350)); }
  });
  antre = kerja.catch(() => null);
  return kerja;
}
export { kmHaversine };
