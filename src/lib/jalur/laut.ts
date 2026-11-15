// Rute kapal yang selalu lewat laut: A* di grid masker darat/laut Indonesia
// (public/sim3d/darat-indonesia.bin; Natural Earth 1:10m via world-atlas, sel 0,04° ≈ 4,4 km; dibuat dengan scripts/masker-darat-*).
// Sel di dekat pantai diberi biaya tambahan supaya alur menjauhi garis pantai; jalur akhir dihaluskan (line of sight).
export type LonLat = [number, number];
export const MASKER = { lon0: 88, lat1: 14, step: 0.04, w: 1475, h: 775 };

export function kmHaversine(a: LonLat, b: LonLat) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class MaskerDarat {
  /** 1 = sel laut yang tersambung ke laut lepas (bukan danau / sungai terkurung). */
  private lautUtama: Uint8Array;
  constructor(private bit: Uint8Array) {
    const { w, h } = MASKER; this.lautUtama = new Uint8Array(w * h);
    const [c0, r0] = this.sel([110, -5]);   // Laut Jawa
    const tumpuk = [r0 * w + c0]; this.lautUtama[tumpuk[0]] = 1;
    while (tumpuk.length) {
      const u = tumpuk.pop()!, c = u % w, r = (u - c) / w;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
        const v = nr * w + nc; if (this.lautUtama[v] || this.darat(nc, nr)) continue;
        this.lautUtama[v] = 1; tumpuk.push(v);
      }
    }
  }
  laut(c: number, r: number) { const { w, h } = MASKER; return c >= 0 && r >= 0 && c < w && r < h && this.lautUtama[r * w + c] === 1; }
  darat(c: number, r: number) {
    const { w, h } = MASKER; if (c < 0 || r < 0 || c >= w || r >= h) return false;   // di luar masker dianggap laut
    const i = r * w + c; return ((this.bit[i >> 3] >> (7 - (i & 7))) & 1) === 1;
  }
  sel(p: LonLat): [number, number] { return [Math.floor((p[0] - MASKER.lon0) / MASKER.step), Math.floor((MASKER.lat1 - p[1]) / MASKER.step)]; }
  titik(c: number, r: number): LonLat { return [MASKER.lon0 + (c + 0.5) * MASKER.step, MASKER.lat1 - (r + 0.5) * MASKER.step]; }
  dalam(p: LonLat) { const [c, r] = this.sel(p); return c >= 0 && r >= 0 && c < MASKER.w && r < MASKER.h; }
  /** Sel laut terdekat (spiral sampai ±60 sel ≈ 260 km). */
  lautTerdekat(p: LonLat): [number, number] | null {
    const [c0, r0] = this.sel(p);
    if (this.laut(c0, r0)) return [c0, r0];
    for (let d = 1; d <= 80; d++) {
      let best: [number, number] | null = null, bd = Infinity;
      for (let dc = -d; dc <= d; dc++) for (const dr of [-d, d]) for (const [c, r] of [[c0 + dc, r0 + dr], [c0 + dr, r0 + dc]]) {
        if (this.laut(c, r)) { const x = dc * dc + dr * dr; if (x < bd) { bd = x; best = [c, r]; } }
      }
      if (best) return best;
    }
    return null;
  }
  /** Garis lurus antar sel seluruhnya laut? */
  bebas(a: [number, number], b: [number, number]) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
    for (let i = 0; i <= n; i++) { const u = n ? i / n : 0; if (this.darat(Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u))) return false; }
    return true;
  }
}

export async function muatMasker(url = '/sim3d/darat-indonesia.bin') {
  const r = await fetch(url); if (!r.ok) throw new Error(`masker ${r.status}`);
  return new MaskerDarat(new Uint8Array(await r.arrayBuffer()));
}

/** Jalur laut pelabuhan → pelabuhan yang tidak memotong daratan; null bila tidak ketemu. */
export function ruteLaut(m: MaskerDarat, a: LonLat, b: LonLat): { jalur: LonLat[]; km: number } | null {
  if (!m.dalam(a) || !m.dalam(b)) return null;
  const s = m.lautTerdekat(a), t = m.lautTerdekat(b); if (!s || !t) return null;
  const { w, h } = MASKER, N = w * h;
  const idx = (c: number, r: number) => r * w + c;
  const g = new Float32Array(N).fill(Infinity), asal = new Int32Array(N).fill(-1), tutup = new Uint8Array(N);
  const latRad = (r: number) => ((MASKER.lat1 - (r + 0.5) * MASKER.step) * Math.PI) / 180;
  const kx = (r: number) => Math.cos(latRad(r));
  const hEst = (c: number, r: number) => Math.hypot((c - t[0]) * kx(r), r - t[1]);
  const dekatPantai = (c: number, r: number) => { for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (m.darat(c + dc, r + dr)) return true; return false; };
  // heap biner [f, idx]
  const hf: number[] = [], hi: number[] = [];
  const dorong = (f: number, i: number) => { hf.push(f); hi.push(i); let k = hf.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; } };
  const ambil = () => { const i = hi[0]; const lf = hf.pop()!, li = hi.pop()!; if (hf.length) { hf[0] = lf; hi[0] = li; let k = 0; for (;;) { const l = 2 * k + 1, rr = l + 1; let q = k; if (l < hf.length && hf[l] < hf[q]) q = l; if (rr < hf.length && hf[rr] < hf[q]) q = rr; if (q === k) break; [hf[q], hf[k]] = [hf[k], hf[q]]; [hi[q], hi[k]] = [hi[k], hi[q]]; k = q; } } return i; };
  const si = idx(s[0], s[1]), ti = idx(t[0], t[1]);
  g[si] = 0; dorong(hEst(s[0], s[1]), si);
  const ARAH = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let langkah = 0;
  while (hf.length) {
    const u = ambil(); if (tutup[u]) continue; tutup[u] = 1;
    if (u === ti || ++langkah > 900_000) break;
    const c = u % w, r = (u - c) / w;
    for (const [dc, dr] of ARAH) {
      const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= w || nr >= h || m.darat(nc, nr)) continue;
      if (dc && dr && (m.darat(c + dc, r) || m.darat(c, r + dr))) continue;   // jangan potong sudut daratan
      const v = idx(nc, nr); if (tutup[v]) continue;
      const biaya = Math.hypot(dc * kx(r), dr) * (dekatPantai(nc, nr) ? 1.6 : 1);
      const ng = g[u] + biaya;
      if (ng < g[v]) { g[v] = ng; asal[v] = u; dorong(ng + hEst(nc, nr), v); }
    }
  }
  if (!tutup[ti]) return null;
  const sel: [number, number][] = [];
  for (let u = ti; u >= 0; u = asal[u]) { const c = u % w; sel.push([c, (u - c) / w]); }
  sel.reverse();
  // haluskan: lompat sejauh mungkin selama garis lurus tetap di laut
  const halus: [number, number][] = [sel[0]];
  for (let i = 0; i < sel.length - 1;) {
    let j = i + 1;
    while (j + 1 < sel.length && m.bebas(sel[i], sel[j + 1])) j++;
    halus.push(sel[j]); i = j;
  }
  const jalur: LonLat[] = [a, ...halus.map(([c, r]) => m.titik(c, r)), b];
  let km = 0; for (let i = 1; i < jalur.length; i++) km += kmHaversine(jalur[i - 1], jalur[i]);
  return { jalur, km: Math.round(km) };
}
