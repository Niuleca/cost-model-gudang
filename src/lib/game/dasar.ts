// Leca Game · RNG ber-seed & antrian event (min-heap berdasarkan waktu lalu urutan masuk) — deterministik.
import type { AntrianEvent, EventSim } from './tipe';

/** mulberry32: angka acak 0..1 yang sama untuk seed yang sama. */
export function buatRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buatAntrian(): AntrianEvent {
  const h: EventSim[] = [];
  const lebih = (a: EventSim, b: EventSim) => a.t < b.t || (a.t === b.t && a.seq < b.seq);
  const naik = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (!lebih(h[i], h[p])) break; [h[i], h[p]] = [h[p], h[i]]; i = p; } };
  const turun = (i: number) => {
    for (;;) {
      const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < h.length && lebih(h[l], h[m])) m = l;
      if (r < h.length && lebih(h[r], h[m])) m = r;
      if (m === i) return;
      [h[i], h[m]] = [h[m], h[i]]; i = m;
    }
  };
  return {
    push: e => { h.push(e); naik(h.length - 1); },
    pop: () => { if (!h.length) return undefined; const top = h[0]; const last = h.pop()!; if (h.length) { h[0] = last; turun(0); } return top; },
    peek: () => h[0],
    size: () => h.length,
  };
}

/** Pilih indeks berbobot. */
export function pilihBerbobot(rng: () => number, bobot: number[]) {
  const tot = bobot.reduce((a, b) => a + b, 0); let r = rng() * tot;
  for (let i = 0; i < bobot.length; i++) { r -= bobot[i]; if (r <= 0) return i; }
  return bobot.length - 1;
}

/** Bilangan bulat dengan rata-rata `rata` (pembulatan probabilistik, deterministik dari rng). */
export function bulatAcak(rng: () => number, rata: number) { const b = Math.floor(rata); return b + (rng() < rata - b ? 1 : 0); }

export const tanggalHari = (mulai: string, hari: number) => {
  const d = new Date(`${mulai}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + hari); return d.toISOString().slice(0, 10);
};
export const hariDalamBulan = (iso: string) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const hariMinggu = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** Min-heap umum (dipakai antrean tugas per jenis). */
export function buatHeap<T>(lebih: (a: T, b: T) => boolean) {
  const h: T[] = [];
  return {
    push(x: T) { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!lebih(h[i], h[p])) break; [h[i], h[p]] = [h[p], h[i]]; i = p; } },
    pop(): T | undefined {
      if (!h.length) return undefined; const top = h[0]; const last = h.pop()!;
      if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && lebih(h[l], h[m])) m = l; if (r < h.length && lebih(h[r], h[m])) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m; } }
      return top;
    },
    peek: (): T | undefined => h[0],
    get size() { return h.length; },
  };
}
