// Area MHE (parkir & charging forklift CB / reach truck / hand pallet) dan grid tapak staging yang menghindarinya.
// Dipakai bersama oleh lapisan 3D & kanvas 2D supaya posisi MHE siaga dan palet staging selalu sama.
import type { LayoutGudang } from '@/lib/simulasi3d/layout';

export interface Kotak { x0: number; x1: number; z0: number; z1: number }
export interface AreaMhe extends Kotak {
  sumber: 'layout' | 'otomatis';
  /** posisi parkir per unit (pusat) + arah hadap (rad, rotation.y model: garpu menghadap dinding) */
  slot: { x: number; z: number; rot: number }[];
  /** panel listrik / charging di dinding */
  panel: { x: number; z: number; rot: number };
}

const POLA_AREA = /\b(mhe|charging|charger|parkir|parking|baterai|battery|forklift)\b/i;
const LEBAR_SLOT = 1.9, DALAM_SLOT = 3.6;

/** Area MHE: zona dari layout editor (label "Area MHE", "Charging", "Parkir forklift", …) atau otomatis di depan,
 *  menempel dinding samping setelah lajur dock, tidak menghalangi pintu dock & gate. */
export function areaMhe(L: LayoutGudang, unit: number | string[]): AreaMhe {
  const jenis = typeof unit === 'number' ? Array.from({ length: Math.max(1, unit) }, () => 'forklift') : unit.length ? unit : ['forklift'];
  const n = jenis.length;
  const z0 = L.zona.find(z => (z.jenis === 'custom' || z.jenis === 'fasilitas') && POLA_AREA.test(z.label) && !/toilet|office|locker/i.test(z.label));
  if (z0) {
    const sx = z0.x1 - z0.x0, sz = z0.z1 - z0.z0, sepanjangX = sx >= sz;
    const pj = sepanjangX ? sx : sz, dl = sepanjangX ? sz : sx;
    const perBaris = Math.max(1, Math.floor(pj / LEBAR_SLOT)), nBaris = Math.max(1, Math.floor(dl / DALAM_SLOT));
    const slot: AreaMhe['slot'] = [];
    for (let i = 0; i < n; i++) {
      const a = i % perBaris, b = Math.floor(i / perBaris) % nBaris;
      const u = (a + 0.5) * (pj / perBaris), w = (b + 0.5) * (dl / nBaris);
      slot.push(sepanjangX ? { x: z0.x0 + u, z: z0.z0 + w, rot: -Math.PI / 2 } : { x: z0.x0 + w, z: z0.z0 + u, rot: 0 });
    }
    return { x0: z0.x0, x1: z0.x1, z0: z0.z0, z1: z0.z1, sumber: 'layout', slot, panel: sepanjangX ? { x: z0.x0 + 0.6, z: z0.z1 - 0.2, rot: 0 } : { x: z0.x1 - 0.2, z: z0.z0 + 0.6, rot: Math.PI / 2 } };
  }
  // otomatis: lajur dock (3,4 m dari dinding depan) dibiarkan bebas; unit berjajar sejajar dinding samping.
  // forklift CB / reach truck: slot 1,9 × 3,6 m · hand pallet: slot 1,0 × 1,9 m
  const xAwal = 3.4, ruang = Math.max(LEBAR_SLOT * 2, Math.min(L.L - 1, L.stagingIn.x1) - xAwal - 0.4);
  const ukuran = jenis.map(j => (j === 'hpt' ? { w: 1.0, d: 1.9 } : { w: LEBAR_SLOT, d: DALAM_SLOT }));
  const urut = jenis.map((_, i) => i).sort((p, q) => ukuran[q].d - ukuran[p].d);   // unit besar di baris menempel dinding
  const baris: { idx: number[]; pj: number; d: number }[] = [];
  for (const i of urut) {
    let b = baris[baris.length - 1];
    if (!b || b.pj + ukuran[i].w > ruang) { b = { idx: [], pj: 0, d: 0 }; baris.push(b); }
    b.idx.push(i); b.pj += ukuran[i].w; b.d = Math.max(b.d, ukuran[i].d);
  }
  const panjang = Math.max(...baris.map(b => b.pj)) + 0.4, dalam = baris.reduce((t, b) => t + b.d, 0);
  const gate = L.gate ?? [];
  const pilihan = (['kanan', 'kiri'] as const).map(sisi => {
    // geser menjauhi gate di dinding samping ini (gate sepanjang X, pos = jarak dari dinding depan)
    let x0 = xAwal;
    for (let k = 0; k < 6; k++) {
      const tabrak = gate.find(g => g.sisi === sisi && g.pos < x0 + panjang + 1 && g.pos + g.lebar > x0 - 1);
      if (!tabrak) break; x0 = tabrak.pos + tabrak.lebar + 1;
    }
    // jalur masuk dari dinding depan: pintu dock & gate depan yang lebarnya berimpit dengan area (gate dihindari paling kuat)
    const zA = sisi === 'kanan' ? L.W - dalam : 0, zB = sisi === 'kanan' ? L.W : dalam;
    const impit = (a: number, b: number) => Math.max(0, Math.min(zB, b + 0.5) - Math.max(zA, a - 0.5));
    const skor = gate.filter(g => g.sisi === 'depan').reduce((t, g) => t + impit(g.pos, g.pos + g.lebar) * 10, 0)
      + L.dock.reduce((t, dk) => t + impit(dk.z - 1.6, dk.z + 1.6), 0) + (x0 - xAwal) * 0.1;
    return { sisi, x0, skor };
  }).sort((a, b) => a.skor - b.skor);
  const { sisi, x0 } = pilihan[0];
  const zDinding = sisi === 'kanan' ? L.W : 0, arah = sisi === 'kanan' ? -1 : 1;
  const zA = sisi === 'kanan' ? L.W - dalam : 0, zB = sisi === 'kanan' ? L.W : dalam;
  const slot: AreaMhe['slot'] = new Array(n);
  let dz = 0;
  for (const b of baris) {
    let x = x0 + 0.2;
    for (const i of b.idx) { slot[i] = { x: x + ukuran[i].w / 2, z: zDinding + arah * (dz + b.d / 2), rot: sisi === 'kanan' ? -Math.PI / 2 : Math.PI / 2 }; x += ukuran[i].w; }
    dz += b.d;
  }
  return { x0, x1: x0 + panjang, z0: zA, z1: zB, sumber: 'otomatis', slot, panel: { x: x0 + panjang + 0.5, z: zDinding + arah * 0.2, rot: sisi === 'kanan' ? Math.PI : 0 } };
}

const bertumpuk = (x: number, z: number, h: Kotak, m = 0) => x + 0.65 + m > h.x0 && x - 0.65 - m < h.x1 && z + 0.55 + m > h.z0 && z - 0.55 - m < h.z1;

/** Grid tapak palet staging (kolom 1,3 m, baris 1,2 m; lajur 3,2 m di sisi dock dibiarkan) tanpa tapak yang masuk area MHE. */
export function gridStaging(a: Kotak, hindari: Kotak[] = []) {
  const xs: number[] = [], zs: number[] = [];
  for (let x = a.x1 - 0.9; x >= a.x0 + 3.2; x -= 1.3) xs.push(x);
  for (let z = a.z0 + 0.9; z <= a.z1 - 0.9; z += 1.2) zs.push(z);
  if (!xs.length) xs.push((a.x0 + a.x1) / 2); if (!zs.length) zs.push((a.z0 + a.z1) / 2);
  const pos: { x: number; z: number }[] = [];
  for (const z of zs) for (const x of xs) if (!hindari.some(h => bertumpuk(x, z, h, 0.3))) pos.push({ x, z });
  if (!pos.length) pos.push({ x: xs[0], z: zs[0] });
  return { xs, zs, pos, kap: pos.length };
}
