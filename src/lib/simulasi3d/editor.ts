// Layout editor 2D ⇄ 3D: model data komponen gudang yang bisa diedit, konversi dari layout otomatis,
// hitung kapasitas, cek jarak / tabrakan, dan konversi ke LayoutGudang untuk viewer 3D.
// Satuan meter. X = panjang gudang (0 = dinding dock), Z = lebar gudang (kiri → kanan).
import type { BarisRak, Dock, Fasilitas, LayoutGudang, Lorong, Palet, ParamSim, Zona, JenisZona } from './layout';

export type JenisKomp = 'spr' | 'ddr' | 'block' | 'stagingIn' | 'stagingOut' | 'fasilitas' | 'dock' | 'kolom' | 'jalur' | 'zona';
export interface SpekRak {
  arah: 'x' | 'z';          // arah baris memanjang (bay berjejer di sumbu ini)
  hadap: 1 | -1;            // sisi muka lorong (+1 = ke arah sumbu tegak lurus yang lebih besar)
  bayW: number;             // lebar bay (m)
  ppl: number;              // palet per level per bay
  deep: number;             // 1 = SPR, 2 = DDR
  level: number;
  level1Mm: number;         // tinggi level lantai (palet + produk + clearance)
  levelNMm: number;         // tinggi per level di atasnya (beam + palet + produk + clearance)
  beamMm: number;
  lebarLorong: number;      // lebar lorong yang dibutuhkan di muka rak (m)
}
export interface Komponen {
  id: string; jenis: JenisKomp; label: string;
  x: number; z: number; w: number; d: number;   // kiri-atas (x, z) + ukuran sumbu X (w) & Z (d)
  tinggi: number;                               // m (rak dihitung dari level; lainnya isian)
  warna?: string;
  rak?: SpekRak;
  tumpuk?: number;                              // block / staging
  palet?: number;                               // staging: palet per sequence
  arus?: 'inbound' | 'outbound';                // dock
}
export interface Ukur { id: string; ax: number; az: number; bx: number; bz: number }
export interface LatarDenah {
  jenis: 'gambar' | 'dxf';
  url?: string;                                  // gambar (data URL, sudah diperkecil)
  garis?: [number, number, number, number][];    // DXF: segmen dalam meter
  x: number; z: number; w: number; d: number;    // posisi & ukuran latar (m)
  opasitas: number; nama: string;
}
export interface LayoutEdit {
  versi: 1;
  gedung: { L: number; W: number; sideMm: number; centerMm: number };
  komponen: Komponen[];
  ukur: Ukur[];
  latar?: LatarDenah | null;
  okupansi: number | null;                       // null = sesuai stok desain
  stokDesain: number;                            // palet (dari tender) — pembanding kapasitas
  tinggiPalet: number;                           // m (palet + produk)
}

export const uid = () => Math.random().toString(36).slice(2, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

export const tinggiRak = (r: SpekRak) => (r.level1Mm + Math.max(0, r.level - 1) * r.levelNMm) / 1000;
export const levelDariTinggi = (r: SpekRak, tinggiM: number) => Math.max(1, 1 + Math.floor((tinggiM * 1000 - r.level1Mm) / Math.max(1, r.levelNMm) + 1e-9));
/** Panjang & kedalaman rak menurut arah. */
export const dimRak = (k: Komponen) => (k.rak?.arah === 'z' ? { panjang: k.d, dalam: k.w } : { panjang: k.w, dalam: k.d });
export const nBay = (k: Komponen) => (k.rak ? Math.max(0, Math.floor(dimRak(k).panjang / k.rak.bayW + 1e-6)) : 0);
export const kapasitasRak = (k: Komponen) => (k.rak ? nBay(k) * k.rak.ppl * k.rak.deep * k.rak.level : 0);
export const tapakBlok = (k: Komponen) => Math.max(0, Math.floor(k.w / 1.3 + 1e-6)) * Math.max(0, Math.floor(k.d / 1.1 + 1e-6));

export const DEFAULT_RAK = (p: ParamSim, ddr: boolean): SpekRak => {
  const d = ddr ? p.ddr : p.spr;
  const level1 = p.palletMm + p.productMm + p.clearanceMm, levelN = p.beamMm + level1;
  const lvAuto = p.sideMm >= level1 ? 1 + Math.floor((p.sideMm - level1) / levelN + 1e-9) : 1;
  return { arah: 'x', hadap: 1, bayW: d.width, ppl: Math.round(d.ppl), deep: ddr ? Math.max(1, Math.round(p.ddr.deep)) : 1,
    level: p.levelManual && p.levelManual > 0 ? p.levelManual : lvAuto, level1Mm: level1, levelNMm: levelN, beamMm: p.beamMm, lebarLorong: r2(2 * d.koridor) };
};

/** Titik awal: layout otomatis (dari data tender) → komponen yang bisa diedit. */
export function dariOtomatis(L: LayoutGudang, p: ParamSim, stokDesain: number): LayoutEdit {
  const k: Komponen[] = [];
  for (const z of L.zona) {
    if (z.jenis === 'stagingIn' || z.jenis === 'stagingOut') {
      const n = L.palet.filter(pl => pl.jenis === z.jenis && pl.y === 0).length;
      k.push({ id: uid(), jenis: z.jenis, label: z.label, x: r2(z.x0 + 3.5), z: r2(z.z0), w: r2(z.x1 - z.x0 - 3.5), d: r2(z.z1 - z.z0), tinggi: 0, palet: n, tumpuk: 1 });
    } else if (z.jenis === 'jalur') k.push({ id: uid(), jenis: 'jalur', label: z.label, x: r2(z.x0), z: 0, w: r2(z.x1 - z.x0), d: r2(L.W), tinggi: 0 });
    else if (z.jenis === 'block' || z.jenis === 'floor') {
      const tumpuk = z.jenis === 'block' ? Math.max(1, Math.round(p.blockTumpuk)) : 1;
      k.push({ id: uid(), jenis: 'block', label: z.label, x: r2(z.x0 + 1), z: 1, w: r2(z.x1 - z.x0 - 2), d: r2(L.W - 2), tinggi: r2(tumpuk * L.tinggiPalet), tumpuk });
    }
  }
  for (const r of L.rak) {
    const spek = DEFAULT_RAK(p, r.jenis === 'ddr'); spek.hadap = r.hadap; spek.level = r.level;
    const lor = L.lorong.find(lo => Math.abs(lo.z0 - (r.hadap === 1 ? r.z0 + r.depth : r.z0)) < (spek.lebarLorong / 2 + 0.6));
    if (lor) spek.lebarLorong = r2(spek.lebarLorong);
    k.push({ id: uid(), jenis: r.jenis, label: r.jenis === 'spr' ? 'Rak SPR' : 'Rak DDR', x: r2(r.x0), z: r2(r.z0), w: r2(r.nBay * r.bayW), d: r2(r.depth), tinggi: r2(tinggiRak(spek)), rak: spek });
  }
  for (const f of L.fasilitas) k.push({ id: uid(), jenis: 'fasilitas', label: f.nama, x: r2(f.x0), z: r2(f.z0), w: r2(f.x1 - f.x0), d: r2(f.z1 - f.z0), tinggi: 3 });
  for (const d of L.dock) k.push({ id: uid(), jenis: 'dock', label: d.arus === 'inbound' ? 'Dock IN' : 'Dock OUT', x: 0, z: r2(Math.min(Math.max(0, d.z - 1.6), L.W - 3.2)), w: 0.3, d: 3.2, tinggi: 4.2, arus: d.arus });
  return { versi: 1, gedung: { L: r2(L.L), W: r2(L.W), sideMm: p.sideMm, centerMm: p.centerMm }, komponen: k, ukur: [], latar: null, okupansi: null, stokDesain, tinggiPalet: L.tinggiPalet };
}

/** Komponen baru dari palet alat. */
export function komponenBaru(jenis: JenisKomp, p: ParamSim, pusat: { x: number; z: number }, tinggiPalet: number): Komponen[] {
  const dasar = { id: uid(), x: r2(pusat.x), z: r2(pusat.z) };
  switch (jenis) {
    case 'spr': case 'ddr': {
      const s = DEFAULT_RAK(p, jenis === 'ddr'); const depth = jenis === 'ddr' ? p.ddr.depth : p.spr.depth;
      return [{ ...dasar, jenis, label: jenis === 'spr' ? 'Rak SPR' : 'Rak DDR', w: r2(10 * s.bayW), d: depth, tinggi: r2(tinggiRak(s)), rak: s }];
    }
    case 'block': return [{ ...dasar, jenis, label: 'Block stack', w: 7.8, d: 6.6, tumpuk: Math.max(1, Math.round(p.blockTumpuk)), tinggi: r2(Math.max(1, Math.round(p.blockTumpuk)) * tinggiPalet) }];
    case 'stagingIn': return [{ ...dasar, jenis, label: 'Staging inbound', w: 8, d: 8, palet: 20, tumpuk: 1, tinggi: 0 }];
    case 'stagingOut': return [{ ...dasar, jenis, label: 'Staging outbound', w: 8, d: 8, palet: 20, tumpuk: 1, tinggi: 0 }];
    case 'fasilitas': return [{ ...dasar, jenis, label: 'Office', w: 6, d: 5, tinggi: 3 }];
    case 'dock': return [{ ...dasar, x: 0, jenis, label: 'Dock', w: 0.3, d: 3.2, tinggi: 4.2, arus: 'inbound' }];
    case 'kolom': return [{ ...dasar, jenis, label: 'Kolom', w: 0.4, d: 0.4, tinggi: p.sideMm / 1000 }];
    case 'jalur': return [{ ...dasar, jenis, label: 'Jalur', w: 10, d: 3.5, tinggi: 0 }];
    default: return [{ ...dasar, jenis: 'zona', label: 'Zona', w: 6, d: 6, tinggi: 0, warna: '#0ea5e9' }];
  }
}

/** Pasangan rak back-to-back (dua baris saling membelakangi). */
export function pasanganRak(p: ParamSim, ddr: boolean, pusat: { x: number; z: number }): Komponen[] {
  const [a] = komponenBaru(ddr ? 'ddr' : 'spr', p, pusat, 1.4);
  const b: Komponen = { ...a, id: uid(), z: r2(a.z + a.d), rak: { ...a.rak!, hadap: 1 } };
  a.rak = { ...a.rak!, hadap: -1 };
  return [a, b];
}

/** Putar 90°: tukar ukuran X/Z; rak ganti arah baris. */
export function putar(k: Komponen): Komponen {
  const n: Komponen = { ...k, w: k.d, d: k.w };
  if (k.rak) n.rak = { ...k.rak, arah: k.rak.arah === 'x' ? 'z' : 'x' };
  return n;
}

/**
 * Tarik rak otomatis: setiap baris rak dipanjangkan (atau dipendekkan) searah barisnya sampai rintangan terdekat
 * (komponen lain yang sejajar: jalur, staging, block, office, rak lain, kolom, zona) atau dinding dikurangi jarak bebas,
 * lalu dibulatkan ke kelipatan bay penuh. Rak arah X (memanjang menjauhi dock) tetap di titik awalnya dan ditarik ke dinding belakang;
 * rak arah Z ditarik ke dua sisi. Rak diproses berurutan sehingga rak segaris tidak saling tumpang.
 */
export function tarikRak(e: LayoutEdit, opsi: { ids?: string[]; jarakDinding: number }): { edit: LayoutEdit; n: number; bayAwal: number; bayAkhir: number; posAwal: number; posAkhir: number } {
  const g = e.gedung; const m = Math.max(0, opsi.jarakDinding);
  const komp = e.komponen.map(k => ({ ...k }));
  let n = 0, bayAwal = 0, bayAkhir = 0, posAwal = 0, posAkhir = 0;
  for (const k of komp) {
    if (!k.rak || (opsi.ids && !opsi.ids.includes(k.id))) continue;
    const s = k.rak; const ax = s.arah === 'x';
    // sumbu sepanjang baris (a) & melintang (b)
    const a0 = ax ? k.x : k.z, b0 = ax ? k.z : k.x, lb = ax ? k.d : k.w, batas = ax ? g.L : g.W;
    let mulai = m, akhir = batas - m;
    for (const o of komp) {
      if (o.id === k.id || o.jenis === 'dock') continue;
      const oa = ax ? o.x : o.z, op = ax ? o.w : o.d, ob = ax ? o.z : o.x, ol = ax ? o.d : o.w;
      if (!(ob < b0 + lb - EPS && b0 < ob + ol - EPS)) continue;      // tidak sejajar dengan baris ini
      if (oa + op <= a0 + EPS) mulai = Math.max(mulai, oa + op);      // di belakang titik awal
      else if (oa > a0 + EPS) akhir = Math.min(akhir, oa);             // di depan (termasuk yang sekarang tertabrak)
      else akhir = Math.min(akhir, a0);                                 // tumpang di titik awal → tidak bisa ditarik
    }
    const awal = ax ? a0 : mulai;                                       // arah X: tetap di titik awal
    const nb = Math.floor((akhir - awal) / s.bayW + 1e-6);
    const nbLama = nBay(k), kapLama = kapasitasRak(k);
    if (nb < 1) continue;
    const pjBaru = r2(nb * s.bayW);
    if (ax) { k.x = r2(awal); k.w = pjBaru; } else { k.z = r2(awal); k.d = pjBaru; }
    n++; bayAwal += nbLama; bayAkhir += nb; posAwal += kapLama; posAkhir += kapasitasRak(k);
  }
  return { edit: { ...e, komponen: komp }, n, bayAwal, bayAkhir, posAwal, posAkhir };
}

const solid = (k: Komponen) => ['spr', 'ddr', 'block', 'fasilitas', 'kolom'].includes(k.jenis);
const EPS = 0.02;   // toleransi pembulatan (cm)
const tumpang = (a: Komponen, b: Komponen) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;

/** Jarak bebas dari tepi komponen ke rintangan terdekat (atau dinding) di 4 arah — dipakai garis ukur otomatis & cek lorong. */
export function jarakBebas(e: LayoutEdit, k: Komponen) {
  const lain = e.komponen.filter(o => o.id !== k.id && solid(o));
  const g = e.gedung;
  const ke = (arah: 'x-' | 'x+' | 'z-' | 'z+') => {
    let jarak = arah === 'x-' ? k.x : arah === 'x+' ? g.L - (k.x + k.w) : arah === 'z-' ? k.z : g.W - (k.z + k.d);
    let oleh: Komponen | null = null;
    for (const o of lain) {
      const overlapZ = o.z < k.z + k.d && k.z < o.z + o.d, overlapX = o.x < k.x + k.w && k.x < o.x + o.w;
      if ((arah === 'x-' || arah === 'x+') && !overlapZ) continue;
      if ((arah === 'z-' || arah === 'z+') && !overlapX) continue;
      const j = arah === 'x-' ? k.x - (o.x + o.w) : arah === 'x+' ? o.x - (k.x + k.w) : arah === 'z-' ? k.z - (o.z + o.d) : o.z - (k.z + k.d);
      if (j >= -1e-6 && j < jarak) { jarak = j; oleh = o; }
    }
    return { jarak: Math.max(0, jarak), oleh };
  };
  return { kiri: ke('z-'), kanan: ke('z+'), depan: ke('x-'), belakang: ke('x+') };
}

export interface Ringkasan {
  posisiSpr: number; posisiDdr: number; posisiBlock: number; posisiStaging: number; totalRak: number;
  luasGedung: number; luasRak: number; luasBlock: number; luasStaging: number; luasFasilitas: number; luasJalur: number;
  okupansi: number; paletDitampilkan: number;
  peringatan: { level: 'kritis' | 'peringatan'; pesan: string; id?: string }[];
}

export function ringkas(e: LayoutEdit): Ringkasan {
  const ks = e.komponen; const g = e.gedung;
  const posisiSpr = ks.filter(k => k.jenis === 'spr').reduce((s, k) => s + kapasitasRak(k), 0);
  const posisiDdr = ks.filter(k => k.jenis === 'ddr').reduce((s, k) => s + kapasitasRak(k), 0);
  const posisiBlock = ks.filter(k => k.jenis === 'block').reduce((s, k) => s + tapakBlok(k) * Math.max(1, k.tumpuk ?? 1), 0);
  const posisiStaging = ks.filter(k => k.jenis === 'stagingIn' || k.jenis === 'stagingOut').reduce((s, k) => s + (k.palet ?? 0), 0);
  const luas = (f: (k: Komponen) => boolean) => ks.filter(f).reduce((s, k) => s + k.w * k.d, 0);
  const totalRak = posisiSpr + posisiDdr + posisiBlock;
  const okupansi = e.okupansi != null ? e.okupansi : totalRak > 0 ? Math.min(1, e.stokDesain / totalRak) : 0;
  const peringatan: Ringkasan['peringatan'] = [];
  const sideM = g.sideMm / 1000;
  for (const k of ks) {
    if (k.x < -EPS || k.z < -EPS || k.x + k.w > g.L + EPS || k.z + k.d > g.W + EPS) peringatan.push({ level: 'kritis', pesan: `${k.label} keluar dari batas gedung.`, id: k.id });
    if (k.rak && tinggiRak(k.rak) > sideM + 1e-6) peringatan.push({ level: 'kritis', pesan: `${k.label}: tinggi rak ${r2(tinggiRak(k.rak))} m melebihi side height ${r2(sideM)} m.`, id: k.id });
    if (k.rak) {
      const jb = jarakBebas(e, k);
      const muka = k.rak.arah === 'x' ? (k.rak.hadap === 1 ? jb.kanan : jb.kiri) : (k.rak.hadap === 1 ? jb.belakang : jb.depan);
      if (muka.jarak + 1e-6 < k.rak.lebarLorong) peringatan.push({ level: 'peringatan', pesan: `${k.label}: lorong di muka rak ${r2(muka.jarak)} m < kebutuhan ${r2(k.rak.lebarLorong)} m.`, id: k.id });
      const sisa = dimRak(k).panjang - nBay(k) * k.rak.bayW;
      if (sisa > 0.05) peringatan.push({ level: 'peringatan', pesan: `${k.label}: panjang tidak pas kelipatan bay (sisa ${r2(sisa)} m).`, id: k.id });
    }
  }
  const pad = ks.filter(solid);
  for (let i = 0; i < pad.length; i++) for (let j = i + 1; j < pad.length; j++)
    if (tumpang(pad[i], pad[j])) peringatan.push({ level: 'kritis', pesan: `${pad[i].label} bertabrakan dengan ${pad[j].label}.`, id: pad[i].id });
  if (totalRak > 0 && e.stokDesain > totalRak) peringatan.push({ level: 'kritis', pesan: `Kapasitas ${totalRak.toLocaleString('id-ID')} posisi < stok desain ${e.stokDesain.toLocaleString('id-ID')} palet.` });
  return { posisiSpr, posisiDdr, posisiBlock, posisiStaging, totalRak, luasGedung: g.L * g.W, luasRak: luas(k => !!k.rak), luasBlock: luas(k => k.jenis === 'block'),
    luasStaging: luas(k => k.jenis === 'stagingIn' || k.jenis === 'stagingOut'), luasFasilitas: luas(k => k.jenis === 'fasilitas'), luasJalur: luas(k => k.jenis === 'jalur'),
    okupansi, paletDitampilkan: Math.round(okupansi * totalRak), peringatan };
}

function acak(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Layout edit → LayoutGudang untuk viewer 3D (MHE, manpower, aktivitas diambil dari layout otomatis). */
export function keLayoutGudang(e: LayoutEdit, dasar: LayoutGudang): LayoutGudang & { kolom: { x: number; z: number; w: number; d: number; tinggi: number }[] } {
  const g = e.gedung; const ks = e.komponen; const rk = ringkas(e);
  const zona: Zona[] = []; const rak: BarisRak[] = []; const palet: Palet[] = []; const lorong: Lorong[] = []; const dock: Dock[] = []; const fasilitas: Fasilitas[] = [];
  const kolom: { x: number; z: number; w: number; d: number; tinggi: number }[] = [];
  const tp = e.tinggiPalet || 1.4;
  const slot: Palet[] = [];
  let maxTinggi = 0;
  for (const k of ks) {
    const box = { x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d };
    if (k.rak) {
      const s = k.rak; const { dalam } = dimRak(k); const nb = nBay(k);
      const levelY = [0]; for (let l = 1; l < s.level; l++) levelY.push((s.level1Mm + (l - 1) * s.levelNMm + s.beamMm) / 1000);
      const tinggi = tinggiRak(s); maxTinggi = Math.max(maxTinggi, tinggi);
      rak.push({ jenis: k.jenis as 'spr' | 'ddr', x0: k.x, z0: k.z, depth: dalam, hadap: s.hadap, nBay: nb, bayW: s.bayW, level: s.level, deep: s.deep, ppl: s.ppl, arah: s.arah, levelY, tinggi });
      zona.push({ id: k.id, jenis: k.jenis as JenisZona, label: k.label, ...box, ket: `${nb} bay · ${s.level} level · ${kapasitasRak(k)} posisi` });
      for (let b = 0; b < nb; b++) for (let l = 0; l < s.level; l++) for (let j = 0; j < s.ppl; j++) for (let q = 0; q < s.deep; q++) {
        const sepanjang = b * s.bayW + (j + 0.5) * (s.bayW / s.ppl);
        const dPos = (q + 0.5) * (dalam / s.deep);
        const melintang = s.hadap === 1 ? dalam - dPos : dPos;
        slot.push(s.arah === 'x' ? { x: k.x + sepanjang, y: levelY[l], z: k.z + melintang, jenis: k.jenis as 'spr', rot: true } : { x: k.x + melintang, y: levelY[l], z: k.z + sepanjang, jenis: k.jenis as 'spr', rot: false });
      }
      // lorong di muka rak
      const L2 = s.lebarLorong / 2;
      if (s.arah === 'x') { const zc = s.hadap === 1 ? k.z + k.d + L2 : k.z - L2; lorong.push({ x0: k.x - 1.5, z0: zc, x1: k.x + k.w, z1: zc, zona: k.jenis as 'spr' }); }
      else { const xc = s.hadap === 1 ? k.x + k.w + L2 : k.x - L2; lorong.push({ x0: xc, z0: k.z - 1.5, x1: xc, z1: k.z + k.d, zona: k.jenis as 'spr' }); }
    } else if (k.jenis === 'block') {
      const tumpuk = Math.max(1, k.tumpuk ?? 1);
      const nx = Math.floor(k.w / 1.3 + 1e-6), nz = Math.floor(k.d / 1.1 + 1e-6);
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) for (let u = 0; u < tumpuk; u++) slot.push({ x: k.x + a * 1.3 + 0.65, y: u * tp, z: k.z + b * 1.1 + 0.55, jenis: 'block' });
      zona.push({ id: k.id, jenis: 'block', label: k.label, ...box, ket: `${nx * nz} tapak × ${tumpuk}` });
    } else if (k.jenis === 'stagingIn' || k.jenis === 'stagingOut') {
      const nk = Math.max(1, Math.floor(k.d / 1.1 + 1e-6)); const tumpuk = Math.max(1, k.tumpuk ?? 1);
      const tapak = Math.ceil((k.palet ?? 0) / tumpuk);
      for (let i = 0; i < tapak; i++) {
        const baris = Math.floor(i / nk), kk = i % nk; const x = k.x + k.w - 0.8 - baris * 1.3; if (x < k.x + 0.5) break;
        for (let u = 0; u < tumpuk; u++) palet.push({ x, y: u * tp, z: k.z + 0.55 + kk * 1.1, jenis: k.jenis });
      }
      zona.push({ id: k.id, jenis: k.jenis, label: k.label, ...box, ket: `${k.palet ?? 0} palet` });
    } else if (k.jenis === 'fasilitas') { fasilitas.push({ nama: k.label, x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d, tinggi: k.tinggi }); }
    else if (k.jenis === 'dock') dock.push({ z: k.z + k.d / 2, arus: k.arus ?? 'inbound' });
    else if (k.jenis === 'kolom') kolom.push({ x: k.x, z: k.z, w: k.w, d: k.d, tinggi: k.tinggi || g.sideMm / 1000 });
    else zona.push({ id: k.id, jenis: k.jenis === 'jalur' ? 'jalur' : 'custom', label: k.label, ...box, ket: `${r2(k.w)} × ${r2(k.d)} m`, warna: k.warna });
  }
  const rnd = acak(7); for (let i = slot.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slot[i], slot[j]] = [slot[j], slot[i]]; }
  palet.push(...slot.slice(0, rk.paletDitampilkan));
  const stagingIn = (() => { const k = ks.find(c => c.jenis === 'stagingIn'); return k ? { x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d } : { x0: 0, x1: 6, z0: 0, z1: g.W / 2 }; })();
  const stagingOut = (() => { const k = ks.find(c => c.jenis === 'stagingOut'); return k ? { x0: k.x, x1: k.x + k.w, z0: k.z, z1: k.z + k.d } : { x0: 0, x1: 6, z0: g.W / 2, z1: g.W }; })();
  const ringkasan = [
    { label: 'Gedung', nilai: `${r2(g.L)} × ${r2(g.W)} m = ${Math.round(g.L * g.W).toLocaleString('id-ID')} m²` },
    { label: 'Posisi SPR / DDR / block', nilai: `${rk.posisiSpr} / ${rk.posisiDdr} / ${rk.posisiBlock}` },
    { label: 'Okupansi', nilai: `${Math.round(rk.okupansi * 100)}%` },
  ];
  return { ...dasar, L: g.L, W: g.W, H: g.sideMm / 1000, puncak: Math.max(g.sideMm, g.centerMm) / 1000, luasLayout: g.L * g.W,
    zona, rak, palet, lorong, dock, fasilitas, kolom, tinggiPalet: tp, tinggiRak: Math.max(maxTinggi, 1), stagingIn, stagingOut,
    ringkas: ringkasan, asumsi: rk.peringatan.map(p => p.pesan) };
}
